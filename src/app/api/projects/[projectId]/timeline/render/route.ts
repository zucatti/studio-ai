import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createClient } from '@supabase/supabase-js';
import { enqueueFFmpeg } from '@/lib/bullmq';
import type { MontageExport } from '@/store/montage-store';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/timeline/render
 *
 * Start rendering the project-level timeline to MP4.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;

    // Get project with timeline data
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id, title, aspect_ratio, timeline_data')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.user_id !== session.user.sub) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const montageData = project.timeline_data as MontageExport | null;
    if (!montageData || !montageData.clips || Object.keys(montageData.clips).length === 0) {
      return NextResponse.json({ error: 'No clips in timeline' }, { status: 400 });
    }

    // Create job record
    const { data: job, error: jobError } = await supabase
      .from('generation_jobs')
      .insert({
        user_id: session.user.sub,
        asset_type: 'project',
        asset_name: project.title || 'Timeline Render',
        job_type: 'video',
        job_subtype: 'timeline-render',
        status: 'queued',
        progress: 0,
        message: 'En file d\'attente...',
        fal_endpoint: 'ffmpeg',
        input_data: {
          projectId,
          clipCount: Object.keys(montageData.clips).length,
          trackCount: montageData.tracks?.length || 0,
          duration: montageData.duration || 0,
        },
        queued_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error('[TimelineRender] Failed to create job:', jobError);
      return NextResponse.json(
        { error: 'Failed to create job' },
        { status: 500 }
      );
    }

    // Prepare clips array
    const tracks = montageData.tracks || [];
    const clips = Object.values(montageData.clips).map((clip) => ({
      id: clip.id,
      type: clip.type,
      trackId: clip.trackId,
      start: clip.start,
      duration: clip.duration,
      sourceStart: clip.sourceStart,
      sourceEnd: clip.sourceEnd,
      assetUrl: clip.assetUrl || '',
      name: clip.name,
      transitionType: clip.transitionType,
    }));

    // Enqueue FFmpeg job for timeline render
    await enqueueFFmpeg({
      userId: session.user.sub,
      jobId: job.id,
      createdAt: new Date().toISOString(),
      operation: 'montage-render',
      projectId,
      // Pass montage data
      montageData: {
        aspectRatio: project.aspect_ratio || '9:16',
        duration: montageData.duration || 0,
        tracks: tracks.map((t) => ({
          id: t.id,
          type: t.type,
          name: t.name,
          muted: t.muted,
        })),
        clips,
      },
    });

    console.log(`[TimelineRender] Job ${job.id} enqueued for project ${projectId}`);

    return NextResponse.json({
      jobId: job.id,
      status: 'queued',
      message: 'Render job started',
    });

  } catch (error) {
    console.error('[TimelineRender] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
