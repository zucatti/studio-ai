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
  params: Promise<{ projectId: string; shortId: string }>;
}

/**
 * POST /api/projects/[projectId]/shorts/[shortId]/montage/render
 *
 * Start rendering the montage timeline to MP4.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shortId } = await params;

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id, aspect_ratio')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.user_id !== session.user.sub) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get short with montage data
    const { data: short, error: shortError } = await supabase
      .from('scenes')
      .select('id, title, montage_data')
      .eq('id', shortId)
      .eq('project_id', projectId)
      .single();

    if (shortError || !short) {
      return NextResponse.json({ error: 'Short not found' }, { status: 404 });
    }

    const montageData = short.montage_data as MontageExport | null;
    if (!montageData || !montageData.clips || Object.keys(montageData.clips).length === 0) {
      return NextResponse.json({ error: 'No clips in montage' }, { status: 400 });
    }

    // Create job record
    const { data: job, error: jobError } = await supabase
      .from('generation_jobs')
      .insert({
        user_id: session.user.sub,
        asset_type: 'short',
        asset_name: short.title || 'Montage',
        job_type: 'video',
        job_subtype: 'montage-render',
        status: 'queued',
        progress: 0,
        message: 'En file d\'attente...',
        fal_endpoint: 'ffmpeg',
        input_data: {
          projectId,
          shortId,
          clipCount: Object.keys(montageData.clips).length,
          trackCount: montageData.tracks?.length || 0,
          duration: montageData.duration || 0,
        },
        queued_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error('[MontageRender] Failed to create job:', jobError);
      return NextResponse.json(
        { error: 'Failed to create job' },
        { status: 500 }
      );
    }

    // Prepare clips array (sorted by track priority and start time)
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
    }));

    // Enqueue FFmpeg job for montage render
    await enqueueFFmpeg({
      userId: session.user.sub,
      jobId: job.id,
      createdAt: new Date().toISOString(),
      operation: 'montage-render',
      projectId,
      shortId,
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

    console.log(`[MontageRender] Job ${job.id} enqueued for short ${shortId}`);

    return NextResponse.json({
      jobId: job.id,
      status: 'queued',
      message: 'Render job started',
    });

  } catch (error) {
    console.error('[MontageRender] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
