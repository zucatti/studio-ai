/**
 * Queue Assembly API Route
 *
 * Async endpoint that uses BullMQ for background FFmpeg processing.
 * Returns immediately with a job ID that can be polled via /api/jobs.
 */

import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { enqueueFFmpeg, type FFmpegJobData } from '@/lib/bullmq';

interface RouteParams {
  params: Promise<{ projectId: string; shortId: string }>;
}

/**
 * POST - Queue a short assembly job
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shortId } = await params;
    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, aspect_ratio')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return Response.json(
        { error: 'Project not found', details: projectError },
        { status: 404 }
      );
    }

    // Get the short (scene) with its shots
    const { data: scene, error: sceneError } = await supabase
      .from('scenes')
      .select(`
        id,
        title,
        shots (
          id,
          shot_number,
          generated_video_url,
          sort_order
        )
      `)
      .eq('id', shortId)
      .eq('project_id', projectId)
      .single();

    if (sceneError || !scene) {
      return Response.json(
        { error: 'Short not found', details: sceneError },
        { status: 404 }
      );
    }

    // Get shots with videos in order
    interface Shot {
      id: string;
      generated_video_url?: string;
      sort_order: number;
    }

    const sortedShots = ((scene.shots || []) as Shot[])
      .filter((s) => s.generated_video_url)
      .sort((a, b) => a.sort_order - b.sort_order);

    if (sortedShots.length === 0) {
      return Response.json(
        { error: 'Aucune vidéo à assembler' },
        { status: 400 }
      );
    }

    const shotIds = sortedShots.map((s) => s.id);

    // Create job record in Supabase
    const { data: job, error: jobError } = await supabase
      .from('generation_jobs')
      .insert({
        user_id: session.user.sub,
        asset_type: 'short',
        asset_name: scene.title || `Short ${shortId.substring(0, 8)}`,
        job_type: 'video',
        job_subtype: 'assembly',
        status: 'queued',
        progress: 0,
        message: 'En file d\'attente...',
        input_data: {
          projectId,
          shortId,
          shotIds,
          shotCount: shotIds.length,
        },
        queued_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error('[QueueAssemble] Failed to create job:', jobError);
      return Response.json(
        { error: 'Failed to create job', details: jobError },
        { status: 500 }
      );
    }

    // Build job data for BullMQ
    const jobData: Omit<FFmpegJobData, 'type'> = {
      userId: session.user.sub,
      jobId: job.id,
      createdAt: new Date().toISOString(),
      operation: 'assemble',
      projectId,
      shortId,
      shotIds,
    };

    // Enqueue the job
    try {
      await enqueueFFmpeg(jobData);
      console.log(`[QueueAssemble] Job ${job.id} enqueued for short ${shortId}`);
    } catch (queueError) {
      console.error('[QueueAssemble] Failed to enqueue:', queueError);

      await supabase
        .from('generation_jobs')
        .update({
          status: 'failed',
          error_message: queueError instanceof Error ? queueError.message : 'Failed to enqueue',
        })
        .eq('id', job.id);

      return Response.json(
        { error: 'Failed to enqueue job', details: queueError instanceof Error ? queueError.message : 'Unknown' },
        { status: 500 }
      );
    }

    // Update scene status
    await supabase
      .from('scenes')
      .update({
        assembled_video_url: null, // Clear any old assembled video
      })
      .eq('id', shortId);

    // Return job ID for polling
    return Response.json({
      jobId: job.id,
      status: 'queued',
      message: 'Assembly job enqueued successfully',
      shotCount: shotIds.length,
    });

  } catch (error) {
    console.error('[QueueAssemble] Unexpected error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
