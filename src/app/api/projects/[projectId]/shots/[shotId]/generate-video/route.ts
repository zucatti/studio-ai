import { createHash } from 'crypto';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getPublicImageUrl } from '@/lib/fal-utils';

// Generate MD5 hash for dialogue text caching
function hashDialogueText(text: string): string {
  return createHash('md5').update(text).digest('hex');
}
import {
  createFalWrapper,
  generateKlingVideoFal,
  generateKlingLipSyncFal,
  generateOmniHumanVideoFal,
  generateSora2VideoFal,
  generateVeo31VideoFal,
} from '@/lib/ai/fal-wrapper';
import { createElevenLabsWrapper } from '@/lib/ai/elevenlabs-wrapper';
import {
  VideoProvider,
  generateVideo as generateVideoUnified,
  isProviderAvailable,
  PROVIDER_INFO,
} from '@/lib/ai/video-provider';
import { getSignedFileUrl } from '@/lib/storage';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

interface RouteParams {
  params: Promise<{ projectId: string; shotId: string }>;
}

// S3/B2 client - uses S3_* env vars
const s3Client = new S3Client({
  endpoint: `https://${process.env.S3_ENDPOINT}`,
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_KEY || '',
    secretAccessKey: process.env.S3_SECRET || '',
  },
});

const B2_BUCKET = process.env.S3_BUCKET || 'studio-assets';

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

// Build optimized video prompt for motion/camera
// For kling-dialog: includes dialogue text so Kling generates appropriate expressions
function buildVideoPrompt(opts: {
  animation?: string | null;
  description?: string | null;
  shotType?: string | null;
  cameraAngle?: string | null;
  cameraMovement?: string | null;
  dialogueText?: string | null;  // For kling-dialog: inject dialogue for expression context
}): string {
  const parts: string[] = [];

  // Add camera settings if provided
  if (opts.shotType && SHOT_TYPE_PROMPTS[opts.shotType]) {
    parts.push(SHOT_TYPE_PROMPTS[opts.shotType]);
  }
  if (opts.cameraAngle && CAMERA_ANGLE_PROMPTS[opts.cameraAngle]) {
    parts.push(CAMERA_ANGLE_PROMPTS[opts.cameraAngle]);
  }
  if (opts.cameraMovement && CAMERA_MOVEMENT_PROMPTS[opts.cameraMovement]) {
    parts.push(CAMERA_MOVEMENT_PROMPTS[opts.cameraMovement]);
  }

  // Add animation prompt or description
  let mainPrompt = opts.animation || opts.description || '';

  // Replace &in and &out with descriptive references
  mainPrompt = mainPrompt.replace(/&in\b/gi, 'the starting frame');
  mainPrompt = mainPrompt.replace(/&out\b/gi, 'the ending frame');

  // Remove any old dialogue text format
  mainPrompt = mainPrompt.replace(/Character speaks:.*$/i, '').trim();

  if (mainPrompt) {
    parts.push(mainPrompt);
  }

  // For kling-dialog: add ONLY emotional context, not the full dialogue
  // (full text confuses Kling and makes it ignore the input image)
  if (opts.dialogueText) {
    // Simple emotion detection based on keywords/punctuation
    const text = opts.dialogueText.toLowerCase();
    let emotion = 'speaking naturally';

    if (text.includes('!') || text.includes('incroyable') || text.includes('génial') || text.includes('super')) {
      emotion = 'excited, enthusiastic expression while speaking';
    } else if (text.includes('?')) {
      emotion = 'curious, questioning expression while speaking';
    } else if (text.includes('triste') || text.includes('désolé') || text.includes('perdu') || text.includes('mort') || text.includes('parti')) {
      emotion = 'sad, melancholic expression while speaking';
    } else if (text.includes('colère') || text.includes('furieux') || text.includes('énervé') || text.includes('marre')) {
      emotion = 'angry, frustrated expression while speaking';
    } else if (text.includes('peur') || text.includes('terrifié') || text.includes('effrayé')) {
      emotion = 'fearful, worried expression while speaking';
    } else if (text.includes('amour') || text.includes('aime') || text.includes('heureux') || text.includes('content')) {
      emotion = 'happy, loving expression while speaking';
    } else if (text.includes('...') || text.includes('hmm') || text.includes('peut-être')) {
      emotion = 'thoughtful, contemplative expression while speaking';
    }

    parts.push(emotion);
  }

  // Fallback if nothing specified
  if (parts.length === 0) {
    return 'Smooth cinematic motion';
  }

  return parts.join(', ');
}

// Video models - all via fal.ai now
// Standard models (no dialogue)
type FalVideoModel = 'kling-omni' | 'sora-2' | 'veo-3' | 'omnihuman' | 'kling-dialog';
const VIDEO_MODELS: FalVideoModel[] = [
  'kling-omni',     // Kling 3.0 Omni via fal.ai (no dialogue)
  'sora-2',         // Sora 2 via fal.ai (no dialogue)
  'veo-3',          // Veo 3.1 via fal.ai (no dialogue)
  'omnihuman',      // OmniHuman 1.5 via fal.ai (dialogue only, lip-sync)
  'kling-dialog',   // Kling → Kling LipSync (dialogue only, preserves first/last frame)
];

// Check if a model is Kling-based
function isKlingModel(model: string): boolean {
  return model.startsWith('kling');
}

// Check if a model uses fal.ai
function isFalModel(model: string): boolean {
  return VIDEO_MODELS.includes(model as FalVideoModel);
}

// SSE helper to send progress events
function createSSEStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  const send = (event: string, data: Record<string, unknown>) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    controller.enqueue(encoder.encode(message));
  };

  const close = () => {
    controller.close();
  };

  return { stream, send, close };
}

/**
 * Upload a video from a temporary URL to B2 storage
 * Returns the permanent B2 URL
 */
async function uploadVideoToB2(
  videoUrl: string,
  userId: string,
  projectId: string,
  shotId: string
): Promise<string> {
  // Download the video
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`);
  }

  const videoBuffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || 'video/mp4';
  const extension = contentType.includes('webm') ? 'webm' : 'mp4';

  // Generate B2 key
  const timestamp = Date.now();
  const key = `videos/${userId.replace(/\|/g, '_')}/${projectId}/${shotId}_${timestamp}.${extension}`;

  // Upload to B2
  await s3Client.send(new PutObjectCommand({
    Bucket: B2_BUCKET,
    Key: key,
    Body: Buffer.from(videoBuffer),
    ContentType: contentType,
  }));

  // Return B2 URL
  return `b2://${B2_BUCKET}/${key}`;
}

// Extract storage key from b2:// URL for signing
function extractStorageKey(b2Url: string): string | null {
  const match = b2Url.match(/^b2:\/\/[^/]+\/(.+)$/);
  return match ? match[1] : null;
}

// Get signed audio URL for external services
async function getSignedAudioUrl(b2Url: string): Promise<string> {
  const key = extractStorageKey(b2Url);
  if (!key) {
    return b2Url; // Return as-is if not a b2:// URL
  }
  return await getSignedFileUrl(key, 3600); // 1 hour expiry
}

// Upload audio buffer to B2
async function uploadAudioToB2(
  audioBuffer: ArrayBuffer,
  userId: string,
  projectId: string,
  shotId: string
): Promise<string> {
  const sanitizedUserId = userId.replace(/[|]/g, '_');
  const timestamp = Date.now();
  const key = `audio/${sanitizedUserId}/${projectId}/${shotId}_dialogue_${timestamp}.mp3`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: B2_BUCKET,
      Key: key,
      Body: Buffer.from(audioBuffer),
      ContentType: 'audio/mpeg',
    })
  );

  return `b2://${B2_BUCKET}/${key}`;
}

// Generate video for a shot using fal.ai with SSE progress streaming
export async function POST(request: Request, { params }: RouteParams) {
  const { stream, send, close } = createSSEStream();

  // Start async processing
  (async () => {
    try {
      const session = await auth0.getSession();
      if (!session?.user) {
        send('error', { error: 'Unauthorized', step: 'auth' });
        close();
        return;
      }

      const { projectId, shotId } = await params;
      const body = await request.json();
      const { duration, model: requestedModel, provider: requestedProvider } = body;

      send('progress', { step: 'init', message: 'Initialisation...', progress: 0 });

      // Get video provider (default to wavespeed)
      const videoProvider: VideoProvider = (requestedProvider && ['wavespeed', 'modelslab', 'fal'].includes(requestedProvider))
        ? requestedProvider as VideoProvider
        : 'wavespeed';

      // Get video model (default based on provider)
      let videoModel: string = requestedModel || (videoProvider === 'fal' ? 'kling-omni' : 'wan-2.1');

      const supabase = createServerSupabaseClient();

      // Check if provider is available
      if (!isProviderAvailable(videoProvider)) {
        const providerName = PROVIDER_INFO[videoProvider]?.name || videoProvider;
        send('error', { error: `${providerName} non configuré`, step: 'config' });
        close();
        return;
      }

      // Verify project ownership
      send('progress', { step: 'verify', message: 'Vérification du projet...', progress: 5 });

      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id, aspect_ratio')
        .eq('id', projectId)
        .eq('user_id', session.user.sub)
        .single();

      if (!project) {
        send('error', { error: 'Project not found', step: 'verify', details: projectError });
        close();
        return;
      }

      // Get shot with all fields including animation_prompt and dialogue
      const { data: shot, error: shotError } = await supabase
        .from('shots')
        .select('*, animation_prompt, has_dialogue, dialogue_text, dialogue_character_id, generated_video_url, dialogue_audio_url, dialogue_text_hash')
        .eq('id', shotId)
        .single();

      if (!shot) {
        send('error', { error: 'Shot not found', step: 'verify', details: shotError });
        close();
        return;
      }

      // Validate first frame exists (required)
      if (!shot.first_frame_url && !shot.storyboard_image_url) {
        send('error', { error: 'Frame In requise pour générer la vidéo', step: 'validate' });
        close();
        return;
      }

      // Archive old video to rush_images before regenerating (keep for gallery)
      if (shot.generated_video_url) {
        send('progress', { step: 'archive', message: 'Archivage de la version précédente...', progress: 3 });

        try {
          // Save old video to rush_images for gallery access
          await supabase
            .from('rush_images')
            .insert({
              project_id: projectId,
              user_id: session.user.sub,
              url: shot.generated_video_url,
              prompt: shot.animation_prompt || shot.description || 'Video generation',
              aspect_ratio: shot.aspect_ratio || project?.aspect_ratio,
              model: 'archived-video',
            });
          console.log(`[Video Gen] Archived old video to rush: ${shot.generated_video_url}`);
        } catch (archiveError) {
          // Log but don't fail - continue with generation
          console.error('[Video Gen] Archive error:', archiveError);
        }
      }

      const videoDuration = duration || shot.suggested_duration || 5;
      let dialogueAudioUrl: string | null = null;

      // Step 1: Generate dialogue audio if enabled
      // Skip for Sora 2 - it generates audio natively from the prompt
      const skipElevenLabsAudio = videoModel === 'sora-2';

      if (skipElevenLabsAudio && shot.has_dialogue) {
        send('progress', {
          step: 'audio_skip',
          message: 'Sora 2 génère l\'audio directement (pas besoin d\'ElevenLabs)',
          progress: 10
        });
      }

      if (shot.has_dialogue && shot.dialogue_text && shot.dialogue_character_id && !skipElevenLabsAudio) {
        // Calculate hash of dialogue text for caching
        const currentDialogueHash = hashDialogueText(shot.dialogue_text);
        const existingHash = shot.dialogue_text_hash;
        const existingAudioUrl = shot.dialogue_audio_url;

        // Check if we can reuse existing audio (same text = same hash)
        if (existingHash === currentDialogueHash && existingAudioUrl) {
          send('progress', {
            step: 'audio_cached',
            message: 'Audio déjà généré (texte inchangé), réutilisation...',
            progress: 25,
            details: { hash: currentDialogueHash.substring(0, 8), cached: true }
          });
          dialogueAudioUrl = existingAudioUrl;
          console.log(`[Audio] Reusing cached audio (hash: ${currentDialogueHash.substring(0, 8)})`);
        } else {
          // Need to generate new audio
          send('progress', {
            step: 'audio_init',
            message: existingHash ? 'Texte modifié, regénération audio...' : 'Génération audio...',
            progress: 10
          });

          // Get character's voice_id
          const { data: character } = await supabase
            .from('global_assets')
            .select('data')
            .eq('id', shot.dialogue_character_id)
            .single();

          const voiceId = (character?.data as Record<string, unknown>)?.voice_id as string;

          if (voiceId && process.env.AI_ELEVEN_LABS) {
            send('progress', {
              step: 'audio_generate',
              message: `Génération audio: "${shot.dialogue_text.substring(0, 50)}..."`,
              progress: 15,
              details: { voiceId, textLength: shot.dialogue_text.length }
            });

            try {
              const elevenlabs = createElevenLabsWrapper({
                userId: session.user.sub,
                projectId,
                supabase,
                operation: 'generate-video-dialogue',
              });

              // Use v3 model for audio tags support ([laughs], [sad], [whispers], etc.)
              // Clean dialogue text - remove @mentions, #locations, !looks, &in/&out
              const cleanedDialogue = shot.dialogue_text
                .replace(/@\w+/g, '')
                .replace(/#\w+/g, '')
                .replace(/!\w+/g, '')
                .replace(/&in\b/gi, '')
                .replace(/&out\b/gi, '')
                .replace(/\s+/g, ' ')
                .trim();

              const audioResult = await elevenlabs.textToSpeech({
                voiceId,
                text: cleanedDialogue,
                modelId: 'eleven_v3',
              });

              send('progress', {
                step: 'audio_upload',
                message: 'Upload audio vers S3...',
                progress: 25,
                details: { audioSize: audioResult.audio.byteLength, cost: audioResult.cost }
              });

              // Upload to B2
              dialogueAudioUrl = await uploadAudioToB2(
                audioResult.audio,
                session.user.sub,
                projectId,
                shotId
              );

              send('progress', {
                step: 'audio_complete',
                message: 'Audio généré et uploadé',
                progress: 30,
                details: { audioUrl: dialogueAudioUrl, hash: currentDialogueHash.substring(0, 8) }
              });

              // Update shot with audio URL AND hash for future caching
              await supabase
                .from('shots')
                .update({
                  dialogue_audio_url: dialogueAudioUrl,
                  dialogue_text_hash: currentDialogueHash,
                })
                .eq('id', shotId);

              console.log(`[Audio] Generated new audio (hash: ${currentDialogueHash.substring(0, 8)})`);

            } catch (audioError) {
              send('warning', {
                step: 'audio_error',
                message: 'Erreur génération audio, continuation sans audio',
                error: audioError instanceof Error ? audioError.message : 'Unknown error'
              });
            }
          } else {
            send('warning', {
              step: 'audio_skip',
              message: 'Pas de voice_id configuré ou ElevenLabs non configuré',
              details: { hasVoiceId: !!voiceId, hasElevenLabs: !!process.env.AI_ELEVEN_LABS }
            });
          }
        }
      }

      // Step 2: Update status to generating
      send('progress', {
        step: 'video_init',
        message: 'Préparation de la génération vidéo...',
        progress: 35
      });

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

      // Step 3: Get public URLs for the images
      send('progress', {
        step: 'video_urls',
        message: 'Récupération des URLs des frames...',
        progress: 40
      });

      const firstFrameSource = shot.first_frame_url || shot.storyboard_image_url;
      const firstFrameUrl = await getPublicImageUrl(firstFrameSource);
      const lastFrameUrl = shot.last_frame_url ? await getPublicImageUrl(shot.last_frame_url) : undefined;

      send('progress', {
        step: 'video_urls_ready',
        message: lastFrameUrl ? 'URLs prêtes (first + last frame)' : 'URLs prêtes (first frame seulement)',
        progress: 45,
        details: {
          firstFrame: firstFrameUrl.substring(0, 50) + '...',
          lastFrame: lastFrameUrl ? lastFrameUrl.substring(0, 50) + '...' : null,
          hasLastFrame: !!lastFrameUrl
        }
      });

      console.log(`[Video Gen] First frame: ${firstFrameUrl}`);
      if (lastFrameUrl) {
        console.log(`[Video Gen] Last frame: ${lastFrameUrl}`);
      }

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

      // Build video prompt for motion/camera only (dialogue is in audio, not text)
      const videoPrompt = buildVideoPrompt({
        animation: shot.animation_prompt,
        description: shot.description,
        shotType: shot.shot_type,
        cameraAngle: shot.camera_angle,
        cameraMovement: shot.camera_movement,
      });

      console.log(`[Video Gen] Prompt: ${videoPrompt}`);

      let result: { taskId?: string; cost?: number; videoUrl?: string };

      // WaveSpeed and ModelsLab: use unified provider abstraction
      if (videoProvider === 'wavespeed' || videoProvider === 'modelslab') {
        const providerName = PROVIDER_INFO[videoProvider].name;

        send('progress', {
          step: 'video_request',
          message: `Génération via ${providerName} (${videoModel})...`,
          progress: 50,
          details: {
            provider: videoProvider,
            model: videoModel,
            duration: videoDuration,
            aspectRatio,
          }
        });

        // Get signed audio URL if available (for OmniHuman)
        let audioUrlForProvider: string | undefined;
        if (dialogueAudioUrl) {
          audioUrlForProvider = await getSignedAudioUrl(dialogueAudioUrl);
        }

        try {
          const unifiedResult = await generateVideoUnified(
            videoProvider,
            {
              prompt: videoPrompt,
              firstFrameUrl,
              lastFrameUrl,
              duration: videoDuration,
              aspectRatio,
              model: videoModel,
              audioUrl: audioUrlForProvider,
            },
            {
              userId: session.user.sub,
              projectId,
              supabase,
              operation: `generate-video-${videoProvider}`,
            },
            (step, message, progress) => {
              send('progress', { step, message, progress: 50 + Math.round(progress * 0.4) });
            }
          );

          console.log(`[Video Gen] ${providerName} result:`, JSON.stringify(unifiedResult, null, 2));
          result = { videoUrl: unifiedResult.videoUrl, cost: unifiedResult.cost, taskId: unifiedResult.taskId };

        } catch (providerError) {
          send('error', {
            error: providerError instanceof Error ? providerError.message : 'Unknown error',
            step: 'video_generation',
            provider: videoProvider,
          });
          close();
          return;
        }

      // Sora 2 flow via fal.ai
      } else if (videoModel === 'sora-2') {
        send('progress', {
          step: 'video_request',
          message: 'Génération Sora 2 via fal.ai...',
          progress: 50,
          details: {
            model: 'sora-2',
            duration: videoDuration,
            aspectRatio,
          }
        });

        const falWrapper = createFalWrapper({
          userId: session.user.sub,
          projectId,
          supabase,
          operation: 'generate-video-sora2',
        });

        // Map duration to Sora 2 allowed values (4, 8, 12, 16, 20)
        const soraDuration = videoDuration <= 4 ? 4 : videoDuration <= 8 ? 8 : videoDuration <= 12 ? 12 : videoDuration <= 16 ? 16 : 20;

        const soraResult = await generateSora2VideoFal(falWrapper, {
          prompt: videoPrompt,
          imageUrl: firstFrameUrl,
          duration: soraDuration as 4 | 8 | 12 | 16 | 20,
          aspectRatio: aspectRatio === '1:1' ? '16:9' : aspectRatio,
        });

        console.log(`[Video Gen] Sora 2 fal.ai result:`, JSON.stringify(soraResult, null, 2));

        result = { videoUrl: soraResult.videoUrl, cost: soraResult.cost };

      // Veo 3.1 flow via fal.ai
      } else if (videoModel === 'veo-3') {
        send('progress', {
          step: 'video_request',
          message: 'Génération Veo 3.1 via fal.ai...',
          progress: 50,
          details: {
            model: 'veo-3.1',
            duration: videoDuration,
            aspectRatio,
          }
        });

        const falWrapper = createFalWrapper({
          userId: session.user.sub,
          projectId,
          supabase,
          operation: 'generate-video-veo31',
        });

        // Map duration to Veo 3.1 allowed values (4s, 6s, 8s)
        const veoDuration = videoDuration <= 4 ? '4s' : videoDuration <= 6 ? '6s' : '8s';

        const veoResult = await generateVeo31VideoFal(falWrapper, {
          prompt: videoPrompt,
          imageUrl: firstFrameUrl,
          duration: veoDuration as '4s' | '6s' | '8s',
          aspectRatio: aspectRatio === '1:1' ? '16:9' : aspectRatio,
          resolution: '720p',
          generateAudio: false,
        });

        console.log(`[Video Gen] Veo 3.1 fal.ai result:`, JSON.stringify(veoResult, null, 2));

        result = { videoUrl: veoResult.videoUrl, cost: veoResult.cost };

      // Kling Dialog flow: Kling → Kling LipSync (preserves first/last frame + lip-sync)
      } else if (videoModel === 'kling-dialog') {
        if (!dialogueAudioUrl) {
          send('error', {
            error: 'Kling Dialog nécessite un dialogue avec audio. Configure le dialogue et un personnage avec voice_id.',
            step: 'kling_dialog_validate'
          });
          close();
          return;
        }

        send('progress', {
          step: 'video_refs',
          message: 'Récupération des références personnage...',
          progress: 48,
        });

        // Fetch character reference images for consistency
        let characterReferenceImages: string[] = [];
        if (shot.dialogue_character_id) {
          const { data: character } = await supabase
            .from('global_assets')
            .select('reference_images')
            .eq('id', shot.dialogue_character_id)
            .single();

          const refImages = character?.reference_images;
          if (refImages && refImages.length > 0) {
            for (const refImg of refImages.slice(0, 4)) {
              try {
                const publicUrl = await getPublicImageUrl(refImg);
                characterReferenceImages.push(publicUrl);
              } catch (e) {
                console.warn(`[Video Gen] Failed to get public URL for ref image:`, e);
              }
            }
            console.log(`[Video Gen] Character references: ${characterReferenceImages.length} images`);
          }
        }

        // Step 1: Generate Kling video with first/last frame
        send('progress', {
          step: 'video_request',
          message: 'Étape 1/2: Génération Kling v3 via fal.ai...',
          progress: 50,
          details: {
            model: 'kling-dialog',
            duration: videoDuration,
            aspectRatio,
            characterRefs: characterReferenceImages.length,
            hasEndFrame: !!lastFrameUrl,
          }
        });

        const falWrapper = createFalWrapper({
          userId: session.user.sub,
          projectId,
          supabase,
          operation: 'generate-video-kling-dialog',
        });

        // Build prompt WITH dialogue text so Kling generates matching expressions
        const klingDialogPrompt = buildVideoPrompt({
          animation: shot.animation_prompt,
          description: shot.description,
          shotType: shot.shot_type,
          cameraAngle: shot.camera_angle,
          cameraMovement: shot.camera_movement,
          dialogueText: shot.dialogue_text,  // Include dialogue for expression context
        });

        console.log(`[Video Gen] Kling Dialog prompt (with dialogue): ${klingDialogPrompt}`);

        const klingResult = await generateKlingVideoFal(falWrapper, {
          prompt: klingDialogPrompt,
          imageUrl: firstFrameUrl,
          endImageUrl: lastFrameUrl,
          referenceImages: characterReferenceImages,
          duration: videoDuration,
          generateAudio: false,
          negativePrompt: 'blur, distort, low quality, watermark, text',
        });

        console.log(`[Video Gen] Kling v3 result:`, JSON.stringify(klingResult, null, 2));

        if (!klingResult.videoUrl) {
          throw new Error('Kling v3 returned no video URL');
        }

        // Step 2: Apply Kling LipSync to the generated video
        send('progress', {
          step: 'video_lip_sync',
          message: 'Étape 2/2: Application du lip-sync Kling...',
          progress: 75,
        });

        const publicAudioUrl = await getSignedAudioUrl(dialogueAudioUrl);
        console.log(`[Video Gen] Kling LipSync audio: ${publicAudioUrl.substring(0, 80)}...`);

        const lipSyncWrapper = createFalWrapper({
          userId: session.user.sub,
          projectId,
          supabase,
          operation: 'kling-dialog-lipsync',
        });

        const lipSyncResult = await generateKlingLipSyncFal(lipSyncWrapper, {
          videoUrl: klingResult.videoUrl,
          audioUrl: publicAudioUrl,
        });

        console.log(`[Video Gen] Kling LipSync done: ${lipSyncResult.videoUrl}`);

        send('progress', {
          step: 'lip_sync_complete',
          message: 'Lip-sync Kling terminé!',
          progress: 90,
        });

        result = { videoUrl: lipSyncResult.videoUrl, cost: klingResult.cost + lipSyncResult.cost };

      // Kling 3.0 Omni flow via fal.ai (NO dialogue - pure video generation)
      } else if (isKlingModel(videoModel)) {
        send('progress', {
          step: 'video_refs',
          message: 'Récupération des références personnage...',
          progress: 48,
        });

        // Fetch character reference images for consistency
        let characterReferenceImages: string[] = [];
        if (shot.dialogue_character_id) {
          const { data: character } = await supabase
            .from('global_assets')
            .select('reference_images')
            .eq('id', shot.dialogue_character_id)
            .single();

          const refImages = character?.reference_images;
          if (refImages && refImages.length > 0) {
            for (const refImg of refImages.slice(0, 4)) {
              try {
                const publicUrl = await getPublicImageUrl(refImg);
                characterReferenceImages.push(publicUrl);
              } catch (e) {
                console.warn(`[Video Gen] Failed to get public URL for ref image:`, e);
              }
            }
            console.log(`[Video Gen] Character references: ${characterReferenceImages.length} images`);
          }
        }

        send('progress', {
          step: 'video_request',
          message: 'Génération Kling v3 via fal.ai...',
          progress: 50,
          details: {
            model: 'kling-v3',
            duration: videoDuration,
            aspectRatio,
            characterRefs: characterReferenceImages.length,
            hasEndFrame: !!lastFrameUrl,
          }
        });

        const falWrapper = createFalWrapper({
          userId: session.user.sub,
          projectId,
          supabase,
          operation: 'generate-video-kling-v3',
        });

        const klingResult = await generateKlingVideoFal(falWrapper, {
          prompt: videoPrompt,
          imageUrl: firstFrameUrl,
          endImageUrl: lastFrameUrl,
          referenceImages: characterReferenceImages,
          duration: videoDuration,
          generateAudio: false,
          negativePrompt: 'blur, distort, low quality, watermark, text',
        });

        console.log(`[Video Gen] Kling v3 result:`, JSON.stringify(klingResult, null, 2));

        if (!klingResult.videoUrl) {
          throw new Error('Kling v3 returned no video URL');
        }

        result = { videoUrl: klingResult.videoUrl, cost: klingResult.cost };

      // OmniHuman 1.5 flow: image + audio → video with lip-sync via fal.ai
      } else if (videoModel === 'omnihuman') {
        if (!dialogueAudioUrl) {
          send('error', {
            error: 'OmniHuman 1.5 nécessite un dialogue avec audio. Configure le dialogue et un personnage avec voice_id.',
            step: 'omnihuman_validate'
          });
          close();
          return;
        }

        send('progress', {
          step: 'video_request',
          message: 'Génération OmniHuman 1.5 via fal.ai (lip-sync natif, turbo mode)...',
          progress: 50,
          details: {
            model: 'omnihuman-1.5',
            imageUrl: firstFrameUrl.substring(0, 50) + '...',
            turboMode: true,
          }
        });

        const falWrapper = createFalWrapper({
          userId: session.user.sub,
          projectId,
          supabase,
          operation: 'generate-video-omnihuman-1.5',
        });

        // Get signed audio URL for external access
        const publicAudioUrl = await getSignedAudioUrl(dialogueAudioUrl);
        console.log(`[Video Gen] OmniHuman 1.5 fal.ai - Image: ${firstFrameUrl.substring(0, 50)}...`);
        console.log(`[Video Gen] OmniHuman 1.5 fal.ai - Audio: ${publicAudioUrl.substring(0, 50)}...`);

        const omniResult = await generateOmniHumanVideoFal(falWrapper, {
          imageUrl: firstFrameUrl,
          audioUrl: publicAudioUrl,
          prompt: shot.animation_prompt || undefined,
          resolution: '720p',
          turboMode: true,  // Faster generation
        });

        console.log(`[Video Gen] OmniHuman 1.5 fal.ai result:`, JSON.stringify(omniResult, null, 2));

        if (!omniResult.videoUrl) {
          throw new Error(`OmniHuman 1.5 returned no video URL`);
        }

        result = { videoUrl: omniResult.videoUrl, cost: omniResult.cost };
      } else {
        // Unsupported model - should never happen since we default to kling-omni
        send('error', {
          error: `Modèle vidéo non supporté: ${videoModel}`,
          step: 'model_error'
        });
        close();
        return;
      }

      // All providers return video URL directly
      if (result.videoUrl) {
        const modelNames: Record<string, string> = {
          // WaveSpeed models (2026)
          'kwaivgi/kling-video-o3-pro/image-to-video': 'Kling O3 Pro',
          'kwaivgi/kling-v3.0-pro/image-to-video': 'Kling 3.0 Pro',
          'openai/sora-2/image-to-video-pro': 'Sora 2 Pro',
          'google/veo3.1/image-to-video': 'Veo 3.1',
          'bytedance/seedance-v1.5-pro/image-to-video': 'Seedance 1.5 Pro',
          'alibaba/wan-2.6/image-to-video': 'WAN 2.6',
          'bytedance/avatar-omni-human-1.5': 'OmniHuman 1.5',
          // ModelsLab models (2026)
          'kling-v3-i2v': 'Kling 3.0',
          'sora-2-i2v': 'Sora 2',
          'veo-3-i2v': 'Veo 3',
          // fal.ai models
          'kling-omni': 'Kling 3.0 Omni',
          'kling-dialog': 'Kling Dialog',
          'sora-2': 'Sora 2',
          'veo-3': 'Veo 3.1',
          'omnihuman': 'OmniHuman 1.5',
        };
        const modelName = modelNames[videoModel] || videoModel;

        send('progress', {
          step: 'video_complete',
          message: `Vidéo ${modelName} générée, upload vers stockage...`,
          progress: 90,
        });

        // Upload video to B2 for permanent storage
        let finalVideoUrl = result.videoUrl;
        try {
          send('progress', {
            step: 'uploading',
            message: 'Sauvegarde de la vidéo...',
            progress: 93,
          });

          finalVideoUrl = await uploadVideoToB2(
            result.videoUrl,
            session.user.sub,
            projectId,
            shotId
          );
          console.log(`[Video Gen] Uploaded to B2: ${finalVideoUrl}`);
        } catch (uploadError) {
          // Log error but continue with original URL
          console.error('[Video Gen] Failed to upload to B2, using original URL:', uploadError);
        }

        send('progress', {
          step: 'saving',
          message: 'Finalisation...',
          progress: 97,
        });

        // Save to database
        await supabase
          .from('shots')
          .update({
            generated_video_url: finalVideoUrl,
            generation_status: 'completed',
            video_generation_progress: JSON.stringify({ status: 'completed', progress: 100 }),
          })
          .eq('id', shotId);

        // Get signed URL for immediate playback if it's a B2 URL
        let playbackUrl = finalVideoUrl;
        if (finalVideoUrl.startsWith('b2://')) {
          const key = finalVideoUrl.replace(`b2://${B2_BUCKET}/`, '');
          playbackUrl = await getSignedFileUrl(key);
        }

        send('complete', {
          step: 'done',
          message: `Vidéo ${modelName} générée avec succès!`,
          progress: 100,
          videoUrl: playbackUrl,
          model: videoModel,
          duration: videoDuration,
          cost: result.cost,
        });
        close();
        return;
      }

      // This should never happen - all fal.ai models return videoUrl directly
      send('error', {
        error: 'No video URL returned',
        step: 'video_error',
        details: result
      });

      await supabase
        .from('shots')
        .update({
          generation_status: 'failed',
          generation_error: 'No video URL returned from fal.ai',
        })
        .eq('id', shotId);

      close();

    } catch (error) {
      send('error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        step: 'unexpected'
      });
      close();
    }
  })();

  // Return SSE response
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// GET - Check video generation status (non-SSE, for polling)
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shotId } = await params;
    const supabase = createServerSupabaseClient();

    const { data: shot } = await supabase
      .from('shots')
      .select('generation_status, video_generation_progress, generated_video_url, generation_error, video_generation_id')
      .eq('id', shotId)
      .single();

    if (!shot) {
      return Response.json({ error: 'Shot not found' }, { status: 404 });
    }

    // Return current status (all fal.ai models return results synchronously via SSE)
    return Response.json(shot);
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
