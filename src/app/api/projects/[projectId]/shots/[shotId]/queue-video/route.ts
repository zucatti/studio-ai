/**
 * Queue Video Generation API Route
 *
 * New async endpoint that uses BullMQ for background processing.
 * Returns immediately with a job ID that can be polled via /api/jobs.
 */

import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { enqueueVideoGen, type VideoGenJobData } from '@/lib/bullmq';

interface RouteParams {
  params: Promise<{ projectId: string; shotId: string }>;
}

// Camera settings mappings for prompt generation
const SHOT_TYPE_PROMPTS: Record<string, string> = {
  wide: 'wide shot',
  medium: 'medium shot',
  close_up: 'close-up shot',
  extreme_close_up: 'extreme close-up',
  over_shoulder: 'over-the-shoulder shot',
  pov: 'POV shot',
};

const CAMERA_ANGLE_PROMPTS: Record<string, string> = {
  eye_level: 'eye level angle',
  low_angle: 'low angle looking up',
  high_angle: 'high angle looking down',
  dutch_angle: 'dutch angle tilted',
  birds_eye: 'birds eye view from above',
  worms_eye: 'worms eye view from below',
};

const CAMERA_MOVEMENT_PROMPTS: Record<string, string> = {
  static: 'static camera',
  slow_dolly_in: 'slow dolly in towards subject',
  slow_dolly_out: 'slow dolly out from subject',
  tracking_forward: 'tracking forward movement',
  tracking_backward: 'tracking backward movement',
  orbit_180: 'orbiting 180 degrees around subject',
  handheld: 'handheld camera subtle movement',
  smooth_zoom_in: 'smooth zoom in',
  smooth_zoom_out: 'smooth zoom out',
};

// Build optimized video prompt
function buildVideoPrompt(opts: {
  animation?: string | null;
  description?: string | null;
  shotType?: string | null;
  cameraAngle?: string | null;
  cameraMovement?: string | null;
}): string {
  const parts: string[] = [];

  if (opts.shotType && SHOT_TYPE_PROMPTS[opts.shotType]) {
    parts.push(SHOT_TYPE_PROMPTS[opts.shotType]);
  }
  if (opts.cameraAngle && CAMERA_ANGLE_PROMPTS[opts.cameraAngle]) {
    parts.push(CAMERA_ANGLE_PROMPTS[opts.cameraAngle]);
  }
  if (opts.cameraMovement && CAMERA_MOVEMENT_PROMPTS[opts.cameraMovement]) {
    parts.push(CAMERA_MOVEMENT_PROMPTS[opts.cameraMovement]);
  }

  let mainPrompt = opts.animation || opts.description || '';
  mainPrompt = mainPrompt.replace(/&in\b/gi, 'the starting frame');
  mainPrompt = mainPrompt.replace(/&out\b/gi, 'the ending frame');
  mainPrompt = mainPrompt.replace(/Character speaks:.*$/i, '').trim();

  if (mainPrompt) {
    parts.push(mainPrompt);
  }

  if (parts.length === 0) {
    return 'Smooth cinematic motion';
  }

  return parts.join(', ');
}

/**
 * POST - Queue a video generation job
 * Returns immediately with the job ID for polling
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shotId } = await params;
    const body = await request.json();
    const { duration, model: requestedModel, provider: requestedProvider } = body;

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

    // Get shot data
    const { data: shot, error: shotError } = await supabase
      .from('shots')
      .select(`
        *,
        animation_prompt,
        has_dialogue,
        dialogue_text,
        dialogue_character_id,
        dialogue_audio_url,
        dialogue_text_hash,
        audio_mode,
        audio_asset_id,
        audio_start,
        audio_end
      `)
      .eq('id', shotId)
      .single();

    if (!shot) {
      return Response.json(
        { error: 'Shot not found', details: shotError },
        { status: 404 }
      );
    }

    // Validate first frame exists
    if (!shot.first_frame_url && !shot.storyboard_image_url) {
      return Response.json(
        { error: 'Frame In requise pour générer la vidéo' },
        { status: 400 }
      );
    }

    // Determine provider and model
    const videoProvider = (requestedProvider && ['fal', 'runway'].includes(requestedProvider))
      ? requestedProvider
      : 'fal';
    const videoModel = requestedModel || (videoProvider === 'runway' ? 'gen4' : 'kling-omni');
    const videoDuration = duration || shot.suggested_duration || 5;

    // Map aspect ratio
    const aspectRatioMap: Record<string, '9:16' | '16:9' | '1:1'> = {
      '9:16': '9:16',
      '16:9': '16:9',
      '1:1': '1:1',
      '4:5': '9:16',
      '2:3': '9:16',
      '21:9': '16:9',
    };
    const aspectRatio = aspectRatioMap[project.aspect_ratio] || '16:9';

    // Build prompt
    const prompt = buildVideoPrompt({
      animation: shot.animation_prompt,
      description: shot.description,
      shotType: shot.shot_type,
      cameraAngle: shot.camera_angle,
      cameraMovement: shot.camera_movement,
    });

    // Create job record in Supabase
    const { data: job, error: jobError } = await supabase
      .from('generation_jobs')
      .insert({
        user_id: session.user.sub,
        // Note: asset_id is FK to global_assets, not shots - shotId is in input_data
        asset_type: 'shot',
        asset_name: `Plan ${shot.shot_number || 1}`,
        job_type: 'video',
        job_subtype: videoModel,
        status: 'queued',
        progress: 0,
        message: 'En file d\'attente...',
        fal_endpoint: videoProvider,
        input_data: {
          projectId,
          shotId,
          videoModel,
          duration: videoDuration,
          aspectRatio,
          prompt,
        },
        queued_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error('[QueueVideo] Failed to create job:', jobError);
      return Response.json(
        { error: 'Failed to create job', details: jobError },
        { status: 500 }
      );
    }

    // Get character reference images if needed
    let characterReferenceImages: string[] = [];
    if (shot.dialogue_character_id) {
      const { data: character } = await supabase
        .from('global_assets')
        .select('reference_images')
        .eq('id', shot.dialogue_character_id)
        .single();

      if (character?.reference_images && character.reference_images.length > 0) {
        characterReferenceImages = character.reference_images.slice(0, 4);
      }
    }

    // Build job data for BullMQ
    const jobData: Omit<VideoGenJobData, 'type'> = {
      userId: session.user.sub,
      jobId: job.id,
      createdAt: new Date().toISOString(),
      projectId,
      shotId,
      shotNumber: shot.shot_number || 1,
      model: videoModel as VideoGenJobData['model'],
      provider: videoProvider as VideoGenJobData['provider'],
      duration: videoDuration,
      aspectRatio: aspectRatio as VideoGenJobData['aspectRatio'],
      prompt,
      firstFrameUrl: shot.first_frame_url || shot.storyboard_image_url,
      lastFrameUrl: shot.last_frame_url || undefined,
      characterReferenceImages,
      hasDialogue: !!shot.has_dialogue,
      dialogueText: shot.dialogue_text || undefined,
      dialogueCharacterId: shot.dialogue_character_id || undefined,
      dialogueAudioUrl: shot.dialogue_audio_url || undefined,
      audioMode: shot.audio_mode || undefined,
      audioAssetId: shot.audio_asset_id || undefined,
      audioStart: shot.audio_start || undefined,
      audioEnd: shot.audio_end || undefined,
    };

    // Enqueue the job
    try {
      await enqueueVideoGen(jobData);
      console.log(`[QueueVideo] Job ${job.id} enqueued for shot ${shotId}`);
    } catch (queueError) {
      // If queuing fails, update job status
      console.error('[QueueVideo] Failed to enqueue:', queueError);

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

    // Update shot status
    // Note: video_prompt will be saved once migration 20260328000001_video_prompt.sql is run
    await supabase
      .from('shots')
      .update({
        generation_status: 'queued',
        video_provider: videoModel,
        video_duration: videoDuration,
      })
      .eq('id', shotId);

    // Return job ID for polling
    return Response.json({
      jobId: job.id,
      status: 'queued',
      message: 'Job enqueued successfully',
    });

  } catch (error) {
    console.error('[QueueVideo] Unexpected error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
