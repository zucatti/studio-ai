import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { logFalUsage } from '@/lib/ai/log-api-usage';

interface RouteParams {
  params: Promise<{ projectId: string; shotId: string }>;
}

interface Dialogue {
  id: string;
  character_name: string;
  content: string;
  parenthetical: string | null;
  sort_order: number;
}

// Video providers available through fal.ai
const VIDEO_PROVIDERS = ['kling', 'wan', 'sora', 'veo', 'avatar'] as const;
type VideoProvider = typeof VIDEO_PROVIDERS[number];

// Lip sync model for vocal shots
const KLING_AVATAR_MODEL = 'fal-ai/kling-avatar/v2/pro';

// Generate video for a shot using Higgsfield (Kling, WAN, Sora, Veo)
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shotId } = await params;
    const body = await request.json();
    const { duration, enableAudio = true } = body;

    // Map legacy providers to new ones
    let provider = body.provider || 'kling';
    const legacyProviderMap: Record<string, string> = {
      'runway': 'kling',
      'runwayml': 'kling',
    };
    if (legacyProviderMap[provider]) {
      provider = legacyProviderMap[provider];
    }

    // Validate provider
    if (!VIDEO_PROVIDERS.includes(provider as any)) {
      return NextResponse.json({ error: 'Invalid provider. Use: kling, wan, sora, or veo' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Check fal.ai API key
    if (!process.env.AI_FAL_KEY) {
      return NextResponse.json({ error: 'fal.ai API not configured (AI_FAL_KEY)' }, { status: 500 });
    }

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, audio_url')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      console.error('Project not found. Error:', projectError);
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get shot (simplified query - removed singing_character join that may not exist)
    const { data: shot, error: shotError } = await supabase
      .from('shots')
      .select('*')
      .eq('id', shotId)
      .single();

    if (!shot) {
      console.error('Shot not found. Error:', shotError);
      return NextResponse.json({ error: 'Shot not found' }, { status: 404 });
    }

    // Lip sync is disabled until audio_url column is added to projects table
    const isLipSyncShot = false; // shot.has_vocals && shot.lip_sync_enabled;

    // Validate frames exist
    if (!shot.first_frame_url) {
      return NextResponse.json(
        { error: 'First frame is required' },
        { status: 400 }
      );
    }

    // For non-lip sync shots, we need both frames for interpolation
    if (!isLipSyncShot && !shot.last_frame_url) {
      return NextResponse.json(
        { error: 'Last frame is required for video interpolation' },
        { status: 400 }
      );
    }

    // Fetch dialogues for this shot (for Kling native audio)
    const { data: dialogues } = await supabase
      .from('dialogues')
      .select('id, character_name, content, parenthetical, sort_order')
      .eq('shot_id', shotId)
      .order('sort_order');

    const videoDuration = duration || shot.suggested_duration || 5;

    // Determine effective provider based on lip sync
    const effectiveProvider = isLipSyncShot ? 'avatar' : (provider as VideoProvider);

    // Update status
    await supabase
      .from('shots')
      .update({
        generation_status: 'generating',
        video_provider: effectiveProvider,
        video_duration: videoDuration,
        video_generation_progress: JSON.stringify({
          status: 'starting',
          progress: 0,
          mode: isLipSyncShot ? 'lip_sync' : 'interpolation',
        }),
      })
      .eq('id', shotId);

    // Generate video using appropriate model
    let result;

    if (isLipSyncShot) {
      // Use Kling Avatar for lip sync
      result = await generateWithLipSync(
        shot,
        project.audio_url,
        videoDuration,
        supabase,
        shotId
      );
    } else {
      // Use standard interpolation (Kling v3)
      result = await generateWithFal(
        shot,
        videoDuration,
        provider as VideoProvider,
        supabase,
        shotId,
        (dialogues as Dialogue[]) || []
      );
    }

    if (result.error) {
      await supabase
        .from('shots')
        .update({
          generation_status: 'failed',
          generation_error: result.error,
        })
        .eq('id', shotId);

      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Update with video URL
    await supabase
      .from('shots')
      .update({
        generated_video_url: result.videoUrl,
        generation_status: 'completed',
        video_generation_id: result.generationId,
        video_generation_progress: JSON.stringify({ status: 'completed', progress: 100 }),
      })
      .eq('id', shotId);

    // Log fal.ai usage for video generation
    const falModel = isLipSyncShot
      ? KLING_AVATAR_MODEL
      : `fal-ai/kling-video/v3/${provider === 'kling' || provider === 'veo' ? 'pro' : 'standard'}/image-to-video`;
    logFalUsage({
      operation: 'generate-video',
      model: falModel,
      videoDuration: videoDuration,
      projectId,
    }).catch(console.error);

    return NextResponse.json({
      success: true,
      videoUrl: result.videoUrl,
      provider: effectiveProvider,
      duration: videoDuration,
      mode: isLipSyncShot ? 'lip_sync' : 'interpolation',
      lipSync: isLipSyncShot ? {
        characterId: shot.singing_character_id,
        characterName: shot.singing_character?.name,
      } : null,
      audioEnabled: enableAudio && provider === 'kling' && (dialogues?.length || 0) > 0,
      dialoguesCount: dialogues?.length || 0,
    });
  } catch (error) {
    console.error('Error generating video:', error);
    return NextResponse.json(
      { error: 'Failed to generate video: ' + String(error) },
      { status: 500 }
    );
  }
}

// Build prompt with dialogue and voice markers for Kling native audio
function buildPromptWithDialogues(
  baseDescription: string,
  dialogues: Dialogue[],
  enableAudio: boolean
): string {
  if (!enableAudio || dialogues.length === 0) {
    return baseDescription || 'Smooth cinematic motion';
  }

  // Create unique voice mapping for each character
  const characterVoiceMap = new Map<string, number>();
  let voiceIndex = 1;

  dialogues.forEach(d => {
    if (!characterVoiceMap.has(d.character_name)) {
      characterVoiceMap.set(d.character_name, voiceIndex++);
    }
  });

  // Build prompt with dialogue and voice markers
  // Format: "Description. CHARACTER_NAME says: <<<voice_N>>>"dialogue"<<<voice_N>>>"
  let prompt = baseDescription || '';

  const dialogueLines = dialogues.map(d => {
    const voiceId = characterVoiceMap.get(d.character_name) || 1;
    const voiceMarker = `<<<voice_${voiceId}>>>`;
    const parenthetical = d.parenthetical ? ` (${d.parenthetical})` : '';
    return `${d.character_name}${parenthetical} says: ${voiceMarker}"${d.content}"${voiceMarker}`;
  });

  if (dialogueLines.length > 0) {
    prompt += '. ' + dialogueLines.join('. ');
  }

  return prompt;
}

// Helper to upload image to fal.ai storage if it's a local URL
async function uploadToFalStorage(imageUrl: string, fal: any): Promise<string> {
  // Check if it's a local URL (localhost, 127.0.0.1, or internal)
  const isLocalUrl = imageUrl.includes('localhost') ||
                     imageUrl.includes('127.0.0.1') ||
                     imageUrl.includes('0.0.0.0');

  if (!isLocalUrl) {
    // Already a public URL, use as-is
    return imageUrl;
  }

  console.log(`Uploading local image to fal.ai storage: ${imageUrl}`);

  // Fetch the image
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const blob = await response.blob();

  // Upload to fal.ai storage
  const uploadedUrl = await fal.storage.upload(blob);
  console.log(`Uploaded to fal.ai: ${uploadedUrl}`);

  return uploadedUrl;
}

// Generate video with lip sync using Kling Avatar v2 Pro
async function generateWithLipSync(
  shot: any,
  audioUrl: string,
  duration: number,
  supabase: any,
  shotId: string
): Promise<{ videoUrl?: string; generationId?: string; error?: string }> {
  try {
    const { fal } = await import('@fal-ai/client');

    fal.config({
      credentials: process.env.AI_FAL_KEY,
    });

    console.log(`Generating lip sync video with Kling Avatar v2 Pro...`);
    console.log(`Image: ${shot.first_frame_url}`);
    console.log(`Audio: ${audioUrl}`);

    // Upload image to fal.ai storage if needed
    const imageUrl = await uploadToFalStorage(shot.first_frame_url, fal);

    // Build input for Kling Avatar
    // Note: The model expects a face image and audio, and generates a talking head video
    const input: Record<string, any> = {
      face_image_url: imageUrl,
      audio_url: audioUrl,
    };

    // If shot has specific time range, we could add timestamps
    // For now, we use the full audio (model will handle it)
    // In the future, we could extract audio segments using ffmpeg

    console.log('Kling Avatar input:', JSON.stringify(input, null, 2));

    // Subscribe to Kling Avatar generation
    const result = await fal.subscribe(KLING_AVATAR_MODEL, {
      input,
      logs: true,
      onQueueUpdate: async (update) => {
        if (update.status === 'IN_PROGRESS') {
          await supabase
            .from('shots')
            .update({
              video_generation_progress: JSON.stringify({
                status: 'generating',
                progress: 50,
                mode: 'lip_sync',
              }),
            })
            .eq('id', shotId);
        }
      },
    });

    const generationId = result.requestId;

    // Update progress
    await supabase
      .from('shots')
      .update({
        video_generation_progress: JSON.stringify({
          status: 'completed',
          progress: 100,
          mode: 'lip_sync',
        }),
      })
      .eq('id', shotId);

    // Get video URL from result
    const videoUrl = result.data?.video?.url;
    if (!videoUrl) {
      return { error: 'No video URL in lip sync response' };
    }

    return {
      videoUrl,
      generationId,
    };
  } catch (error: any) {
    console.error('Kling Avatar lip sync error:', {
      message: error.message,
      body: error.body,
      status: error.status,
      detail: error.detail,
    });
    const errorMsg = error.body?.detail || error.message || String(error);
    return { error: `Lip sync failed: ${errorMsg}` };
  }
}

async function generateWithFal(
  shot: any,
  duration: number,
  provider: VideoProvider,
  supabase: any,
  shotId: string,
  dialogues: Dialogue[]
): Promise<{ videoUrl?: string; generationId?: string; error?: string }> {
  try {
    const { fal } = await import('@fal-ai/client');

    // Configure fal.ai with API key
    fal.config({
      credentials: process.env.AI_FAL_KEY,
    });

    // Map provider to fal.ai Kling model versions (upgraded to v3)
    const modelMap: Record<VideoProvider, string> = {
      kling: 'fal-ai/kling-video/v3/pro/image-to-video',        // Pro quality (Kling 3)
      sora: 'fal-ai/kling-video/v3/standard/image-to-video',    // Standard (Kling 3)
      wan: 'fal-ai/kling-video/v3/standard/image-to-video',     // Standard (Kling 3)
      veo: 'fal-ai/kling-video/v3/pro/image-to-video',          // Pro quality (Kling 3)
      avatar: KLING_AVATAR_MODEL,                                // Lip sync (Avatar v2 Pro)
    };

    const model = modelMap[provider];

    console.log(`Generating video with fal.ai (${provider} → ${model})...`);
    console.log(`First frame: ${shot.first_frame_url}`);
    console.log(`Last frame: ${shot.last_frame_url}`);

    // Upload images to fal.ai storage if they're local URLs
    const firstFrameUrl = await uploadToFalStorage(shot.first_frame_url, fal);
    const lastFrameUrl = shot.last_frame_url
      ? await uploadToFalStorage(shot.last_frame_url, fal)
      : null;

    // Build prompt with dialogues
    const prompt = buildPromptWithDialogues(shot.description, dialogues, false);

    // Ensure duration is valid ("5" or "10")
    const videoDuration = duration >= 7.5 ? '10' : '5';

    // Build input object for Kling v3
    const input: Record<string, any> = {
      prompt: prompt || 'Smooth cinematic motion between frames',
      start_image_url: firstFrameUrl, // Kling 3 uses start_image_url
      duration: videoDuration,
      aspect_ratio: '16:9',
      generate_audio: false, // Disable audio generation
    };

    // Add end image only if available (Kling 3 uses end_image_url)
    if (lastFrameUrl) {
      input.end_image_url = lastFrameUrl;
    }

    console.log('fal.ai input:', JSON.stringify(input, null, 2));

    // Subscribe to fal.ai Kling with start and end frames
    const result = await fal.subscribe(model, {
      input,
      logs: true,
      onQueueUpdate: async (update) => {
        if (update.status === 'IN_PROGRESS') {
          await supabase
            .from('shots')
            .update({
              video_generation_progress: JSON.stringify({
                status: 'generating',
                progress: 50,
              }),
            })
            .eq('id', shotId);
        }
      },
    });

    const generationId = result.requestId;

    // Update progress
    await supabase
      .from('shots')
      .update({
        video_generation_progress: JSON.stringify({
          status: 'completed',
          progress: 100,
        }),
      })
      .eq('id', shotId);

    // Get video URL from result
    const videoUrl = result.data?.video?.url;
    if (!videoUrl) {
      return { error: 'No video URL in response' };
    }

    return {
      videoUrl,
      generationId,
    };
  } catch (error: any) {
    console.error('fal.ai video generation error:', {
      message: error.message,
      body: error.body,
      status: error.status,
      detail: error.detail,
    });
    const errorMsg = error.body?.detail || error.message || String(error);
    return { error: errorMsg };
  }
}

// GET - Check video generation status
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { shotId } = await params;
    const supabase = createServerSupabaseClient();

    const { data: shot } = await supabase
      .from('shots')
      .select('generation_status, video_generation_progress, generated_video_url, generation_error')
      .eq('id', shotId)
      .single();

    if (!shot) {
      return NextResponse.json({ error: 'Shot not found' }, { status: 404 });
    }

    return NextResponse.json(shot);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
