import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getPublicImageUrl } from '@/lib/fal-utils';
import { createPiapiWrapper, type VideoModel } from '@/lib/ai/piapi-wrapper';

interface RouteParams {
  params: Promise<{ projectId: string; shotId: string }>;
}

// Video models available through PiAPI
const VIDEO_MODELS: VideoModel[] = [
  'kling-omni',
  'seedance-2',
  'sora-2',
  'veo-3',
  'kling-2',
  'wan-2.1',
  'hunyuan',
];

// Generate video for a shot using PiAPI (Kling Omni, Seedance 2, Sora 2, Veo 3, etc.)
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shotId } = await params;
    const body = await request.json();
    const { duration, model: requestedModel } = body;

    // Get video model (default to kling-omni)
    let videoModel: VideoModel = 'kling-omni';
    if (requestedModel && VIDEO_MODELS.includes(requestedModel as VideoModel)) {
      videoModel = requestedModel as VideoModel;
    }

    const supabase = createServerSupabaseClient();

    // Check PiAPI key
    if (!process.env.AI_PIAPI_KEY) {
      return NextResponse.json({ error: 'PiAPI not configured (AI_PIAPI_KEY)' }, { status: 500 });
    }

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, aspect_ratio')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      console.error('Project not found. Error:', projectError);
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get shot
    const { data: shot, error: shotError } = await supabase
      .from('shots')
      .select('*')
      .eq('id', shotId)
      .single();

    if (!shot) {
      console.error('Shot not found. Error:', shotError);
      return NextResponse.json({ error: 'Shot not found' }, { status: 404 });
    }

    // Validate frames exist
    if (!shot.first_frame_url) {
      return NextResponse.json(
        { error: 'First frame is required' },
        { status: 400 }
      );
    }

    // For video interpolation, we need both frames
    if (!shot.last_frame_url) {
      return NextResponse.json(
        { error: 'Last frame is required for video interpolation' },
        { status: 400 }
      );
    }

    const videoDuration = duration || shot.suggested_duration || 5;

    // Update status
    await supabase
      .from('shots')
      .update({
        generation_status: 'generating',
        video_provider: videoModel,
        video_duration: videoDuration,
        video_generation_progress: JSON.stringify({
          status: 'starting',
          progress: 0,
          model: videoModel,
        }),
      })
      .eq('id', shotId);

    // Get public URLs for the images
    const firstFrameUrl = await getPublicImageUrl(shot.first_frame_url);
    const lastFrameUrl = await getPublicImageUrl(shot.last_frame_url);

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

    // Create PiAPI wrapper
    const piapi = createPiapiWrapper({
      userId: session.user.sub,
      projectId,
      supabase,
      operation: 'generate-video',
    });

    // Generate video with PiAPI
    console.log(`[generate-video] Starting with model: ${videoModel}`);
    console.log(`[generate-video] First frame: ${firstFrameUrl}`);
    console.log(`[generate-video] Last frame: ${lastFrameUrl}`);
    console.log(`[generate-video] Duration: ${videoDuration}s, Aspect ratio: ${aspectRatio}`);

    const result = await piapi.generateVideo({
      model: videoModel,
      prompt: shot.description || 'Smooth cinematic motion',
      first_frame_url: firstFrameUrl,
      last_frame_url: lastFrameUrl,
      duration: videoDuration,
      aspect_ratio: aspectRatio,
    });

    // Check if task was created (PiAPI is async)
    if (!result.taskId) {
      await supabase
        .from('shots')
        .update({
          generation_status: 'failed',
          generation_error: 'No task ID returned from PiAPI',
        })
        .eq('id', shotId);

      return NextResponse.json({ error: 'Failed to start video generation' }, { status: 500 });
    }

    // Update with task ID - video will be polled for completion
    await supabase
      .from('shots')
      .update({
        video_generation_id: result.taskId,
        video_generation_progress: JSON.stringify({
          status: 'processing',
          progress: 10,
          model: videoModel,
          taskId: result.taskId,
        }),
      })
      .eq('id', shotId);

    // If the result already has video URL (synchronous response)
    if (result.result.video_url) {
      await supabase
        .from('shots')
        .update({
          generated_video_url: result.result.video_url,
          generation_status: 'completed',
          video_generation_progress: JSON.stringify({ status: 'completed', progress: 100 }),
        })
        .eq('id', shotId);

      return NextResponse.json({
        success: true,
        videoUrl: result.result.video_url,
        model: videoModel,
        duration: videoDuration,
        cost: result.cost,
      });
    }

    // Video generation is async - return task ID for polling
    return NextResponse.json({
      success: true,
      taskId: result.taskId,
      model: videoModel,
      duration: videoDuration,
      cost: result.cost,
      status: 'processing',
      message: 'Video generation started. Poll /api/projects/{projectId}/shots/{shotId}/generate-video for status.',
    });
  } catch (error) {
    console.error('Error generating video:', error);
    return NextResponse.json(
      { error: 'Failed to generate video: ' + String(error) },
      { status: 500 }
    );
  }
}

// GET - Check video generation status
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shotId } = await params;
    const supabase = createServerSupabaseClient();

    const { data: shot } = await supabase
      .from('shots')
      .select('generation_status, video_generation_progress, generated_video_url, generation_error, video_generation_id')
      .eq('id', shotId)
      .single();

    if (!shot) {
      return NextResponse.json({ error: 'Shot not found' }, { status: 404 });
    }

    // If video is already completed or failed, return status
    if (shot.generation_status === 'completed' || shot.generation_status === 'failed') {
      return NextResponse.json(shot);
    }

    // If we have a task ID, poll PiAPI for status
    if (shot.video_generation_id && process.env.AI_PIAPI_KEY) {
      try {
        const piapi = createPiapiWrapper({
          userId: session.user.sub,
          projectId,
          supabase,
          operation: 'check-video-status',
        });

        const taskResult = await piapi.getVideoTask(shot.video_generation_id);

        if (taskResult.status === 'completed' && taskResult.video_url) {
          // Update shot with completed video
          await supabase
            .from('shots')
            .update({
              generated_video_url: taskResult.video_url,
              generation_status: 'completed',
              video_generation_progress: JSON.stringify({ status: 'completed', progress: 100 }),
            })
            .eq('id', shotId);

          return NextResponse.json({
            generation_status: 'completed',
            generated_video_url: taskResult.video_url,
            video_generation_progress: JSON.stringify({ status: 'completed', progress: 100 }),
          });
        } else if (taskResult.status === 'failed') {
          await supabase
            .from('shots')
            .update({
              generation_status: 'failed',
              generation_error: taskResult.error || 'Video generation failed',
            })
            .eq('id', shotId);

          return NextResponse.json({
            generation_status: 'failed',
            generation_error: taskResult.error || 'Video generation failed',
          });
        }

        // Still processing
        const progress = taskResult.progress || 50;
        return NextResponse.json({
          generation_status: 'generating',
          video_generation_progress: JSON.stringify({
            status: 'processing',
            progress,
            taskId: shot.video_generation_id,
          }),
        });
      } catch (pollError) {
        console.error('Error polling PiAPI:', pollError);
        // Return current status without updating
      }
    }

    return NextResponse.json(shot);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
