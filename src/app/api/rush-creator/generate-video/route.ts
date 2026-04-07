/**
 * Rush Creator - Generate Video API
 *
 * Queue a text-to-video generation job that saves to rush_media table.
 * Supports standalone video generation without requiring a shot or first frame.
 */

import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { enqueueVideoGen } from '@/lib/bullmq';
import type { AspectRatio } from '@/types/database';
import type { VideoGenJobData } from '@/lib/bullmq/types';

export async function POST(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      projectId,
      prompt,
      aspectRatio = '9:16',
      model = 'kling-omni',
      duration = 5,
    } = body;

    if (!projectId) {
      return Response.json({ error: 'projectId is required' }, { status: 400 });
    }

    if (!prompt?.trim()) {
      return Response.json({ error: 'Prompt is required' }, { status: 400 });
    }

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

    // Determine provider based on model
    const provider = model.startsWith('gen4') ? 'runway' : 'fal';

    // Map aspect ratio to supported values
    const aspectRatioMap: Record<string, '9:16' | '16:9' | '1:1'> = {
      '9:16': '9:16',
      '16:9': '16:9',
      '1:1': '1:1',
      '4:5': '9:16',
      '2:3': '9:16',
      '21:9': '16:9',
    };
    const mappedAspectRatio = aspectRatioMap[aspectRatio] || '16:9';

    console.log(`[RushCreator/GenerateVideo] Generating video with ${model}`);
    console.log(`[RushCreator/GenerateVideo] Prompt: ${prompt.substring(0, 100)}...`);
    console.log(`[RushCreator/GenerateVideo] Aspect: ${mappedAspectRatio}, Duration: ${duration}s`);

    // Create job record
    // Note: asset_id is FK to global_assets, so we set it to null for project-level jobs
    const { data: job, error: jobError } = await supabase
      .from('generation_jobs')
      .insert({
        user_id: session.user.sub,
        asset_type: 'project',
        asset_id: null,
        asset_name: `Rush Video - ${prompt.slice(0, 30)}${prompt.length > 30 ? '...' : ''}`,
        job_type: 'video',
        job_subtype: 'rush-creator-video',
        status: 'queued',
        progress: 0,
        message: 'En file d\'attente...',
        fal_endpoint: provider,
        input_data: {
          projectId,
          prompt,
          aspectRatio: mappedAspectRatio,
          model,
          duration,
          targetTable: 'rush_media', // Signal to worker to store in rush_media
        },
        queued_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error('[RushCreator/GenerateVideo] Failed to create job:', jobError);
      return Response.json(
        { error: 'Failed to create job', details: jobError },
        { status: 500 }
      );
    }

    // Build job data for video queue
    // Note: This is a text-to-video request (no firstFrameUrl)
    const jobData: Omit<VideoGenJobData, 'type'> = {
      userId: session.user.sub,
      jobId: job.id,
      createdAt: new Date().toISOString(),
      projectId,
      shotId: `rush-video-${job.id}`, // Virtual shot ID for tracking
      shotNumber: 0,
      model: model,
      provider: provider as 'fal' | 'runway',
      duration,
      aspectRatio: mappedAspectRatio,
      prompt: prompt.trim(),
      // No firstFrameUrl = text-to-video mode
      hasDialogue: false,
      // Mark this as a rush creator video (worker will save to rush_media)
      isPreview: false,
    };

    // Enqueue the job
    try {
      await enqueueVideoGen(jobData);
      console.log(`[RushCreator/GenerateVideo] Job ${job.id} enqueued`);
    } catch (queueError) {
      console.error('[RushCreator/GenerateVideo] Failed to enqueue:', queueError);

      await supabase
        .from('generation_jobs')
        .update({
          status: 'failed',
          error_message: queueError instanceof Error ? queueError.message : 'Failed to enqueue',
        })
        .eq('id', job.id);

      return Response.json(
        { error: 'Failed to enqueue job' },
        { status: 500 }
      );
    }

    return Response.json({
      jobId: job.id,
      status: 'queued',
      message: 'Video generation queued',
      model,
      duration,
    });

  } catch (error) {
    console.error('[RushCreator/GenerateVideo] Error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
