/**
 * Video Generation Processor
 * Handles video generation jobs from the queue
 */

import type { Job } from 'bullmq';
import { fal } from '@fal-ai/client';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { getSupabase } from '../supabase.js';
import { uploadFile, getPublicUrl, generateStorageKey, getSignedFileUrl } from '../storage.js';
import { startJob, updateJobProgress, completeJob, failJob } from '../utils/job-status.js';
import { aiConfig, storageConfig, enqueueFFmpegJob } from '../config.js';

const execAsync = promisify(exec);
const TEMP_DIR = path.join(os.tmpdir(), 'studio-worker');

async function ensureTempDir() {
  if (!existsSync(TEMP_DIR)) {
    await mkdir(TEMP_DIR, { recursive: true });
  }
}

/**
 * Get audio duration using ffprobe
 */
async function getAudioDuration(audioUrl: string): Promise<number> {
  await ensureTempDir();

  // Download audio to temp file
  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const tempPath = path.join(TEMP_DIR, `audio_${Date.now()}.mp3`);

  try {
    await writeFile(tempPath, buffer);

    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempPath}"`,
      { timeout: 30000 }
    );

    return parseFloat(stdout.trim()) || 0;
  } finally {
    try {
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Trim audio to a specific segment using FFmpeg
 * Returns the public URL of the trimmed audio
 */
async function trimAudioSegment(
  audioUrl: string,
  startTime: number,
  endTime: number | undefined,
  userId: string,
  projectId: string,
  shotId: string
): Promise<string> {
  await ensureTempDir();

  // Download audio
  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to download audio for trimming: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const inputPath = path.join(TEMP_DIR, `trim_input_${Date.now()}.mp3`);
  const outputPath = path.join(TEMP_DIR, `trim_output_${Date.now()}.mp3`);

  try {
    await writeFile(inputPath, buffer);

    // Build FFmpeg command
    const args = ['-i', inputPath, '-ss', startTime.toString()];
    if (endTime !== undefined) {
      const duration = endTime - startTime;
      args.push('-t', duration.toString());
    }
    args.push('-c', 'copy', '-y', outputPath);

    // Run FFmpeg
    const ffmpegCmd = `ffmpeg ${args.map(a => `"${a}"`).join(' ')}`;
    await execAsync(ffmpegCmd, { timeout: 30000 });

    // Read trimmed file
    const { readFile } = await import('fs/promises');
    const trimmedBuffer = await readFile(outputPath);

    // Upload to B2
    const storageKey = generateStorageKey('audio', userId, projectId, `${shotId}_trimmed`, 'mp3');
    const b2Url = await uploadFile(storageKey, trimmedBuffer, 'audio/mpeg');

    // Return public URL
    return await getPublicUrl(b2Url);
  } finally {
    // Cleanup
    try {
      await unlink(inputPath);
    } catch { /* ignore */ }
    try {
      await unlink(outputPath);
    } catch { /* ignore */ }
  }
}

/**
 * Get video duration using ffprobe
 */
async function getVideoDuration(videoUrl: string): Promise<number> {
  await ensureTempDir();

  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const tempPath = path.join(TEMP_DIR, `video_${Date.now()}.mp4`);

  try {
    await writeFile(tempPath, buffer);

    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempPath}"`,
      { timeout: 30000 }
    );

    return parseFloat(stdout.trim()) || 0;
  } finally {
    try {
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Configure fal.ai
fal.config({
  credentials: aiConfig.fal,
});

// Job data type
export interface VideoGenJobData {
  type: 'video-gen';
  userId: string;
  jobId: string;
  createdAt: string;
  projectId: string;
  shotId: string;
  shotNumber: number;
  model: string;
  provider: string;
  duration: number;
  aspectRatio: string;
  prompt: string;
  firstFrameUrl: string;
  lastFrameUrl?: string;
  characterReferenceImages?: string[];
  hasDialogue: boolean;
  dialogueText?: string;
  dialogueCharacterId?: string;
  dialogueAudioUrl?: string;
  audioMode?: 'mute' | 'none' | 'dialogue' | 'audio' | 'instrumental' | 'vocal';
  audioAssetId?: string;
  audioStart?: number;
  audioEnd?: number;
}

// fal.ai endpoint constants
const FAL_KLING_ENDPOINT = 'fal-ai/kling-video/v3/standard/image-to-video';
const FAL_OMNIHUMAN_ENDPOINT = 'fal-ai/bytedance/omnihuman/v1.5';
const FAL_SORA2_ENDPOINT = 'fal-ai/sora-2/image-to-video';
const FAL_VEO31_ENDPOINT = 'fal-ai/veo3.1/fast/image-to-video';

/**
 * Process a video generation job
 */
export async function processVideoGenJob(job: Job<VideoGenJobData>): Promise<void> {
  const { data } = job;
  const {
    jobId,
    userId,
    projectId,
    shotId,
    model,
    duration,
    aspectRatio,
    prompt,
    firstFrameUrl,
    lastFrameUrl,
    characterReferenceImages,
    dialogueAudioUrl,
    audioMode,
    audioAssetId,
    audioStart,
    audioEnd,
  } = data;

  console.log(`[VideoGen] Processing job ${jobId} for shot ${shotId}`);
  console.log(`[VideoGen] Model: ${model}, Duration: ${duration}s, Provider: ${data.provider}`);

  const supabase = getSupabase();

  try {
    // Mark job as running
    await startJob(jobId, 'Préparation de la génération vidéo...');

    // Get public URLs for frames
    await updateJobProgress(jobId, 10, 'Récupération des URLs...');
    const firstFramePublicUrl = await getPublicUrl(firstFrameUrl);
    const lastFramePublicUrl = lastFrameUrl ? await getPublicUrl(lastFrameUrl) : undefined;

    let videoUrl: string;
    let cost = 0;

    // Track actual video duration for DB update
    let actualVideoDuration = duration;

    // Track if OmniHuman used the music audio (so we skip FFmpeg overlay)
    let omnihumanUsedMusicAudio = false;

    // Check if this is an OmniHuman model (fal.ai or WaveSpeed versions)
    const isOmniHumanModel = model === 'omnihuman' || model.includes('omnihuman') || model.includes('omni-human');

    // Route to appropriate model
    if (isOmniHumanModel) {
      // OmniHuman can use dialogue audio OR instrumental/vocal audio
      let audioPublicUrl: string | null = null;
      let audioSource = '';

      // Priority 1: Dialogue audio
      if (dialogueAudioUrl) {
        await updateJobProgress(jobId, 15, 'Analyse de l\'audio dialogue...');
        audioPublicUrl = await getPublicUrl(dialogueAudioUrl);
        audioSource = 'dialogue';
      }
      // Priority 2: Instrumental/vocal audio from global asset
      else if (audioMode && audioMode !== 'mute' && audioMode !== 'none' && audioAssetId) {
        await updateJobProgress(jobId, 15, 'Récupération de l\'audio instrumental...');

        // Get audio asset file URL from JSONB data column
        const { data: audioAsset, error: audioError } = await supabase
          .from('global_assets')
          .select('data, name')
          .eq('id', audioAssetId)
          .single();

        const assetData = audioAsset?.data as Record<string, unknown> | null;
        const audioFileUrl = assetData?.fileUrl as string | undefined;

        if (audioError || !audioFileUrl) {
          throw new Error(`OmniHuman: impossible de récupérer l'audio: ${audioError?.message || 'No fileUrl'}`);
        }

        const fullAudioUrl = await getPublicUrl(audioFileUrl);
        console.log(`[VideoGen] OmniHuman using instrumental audio: ${audioAsset?.name}`);

        // Trim audio to selected segment if audioStart/audioEnd are set
        if (audioStart !== undefined || audioEnd !== undefined) {
          await updateJobProgress(jobId, 18, 'Découpe du segment audio...');
          const trimmedAudioUrl = await trimAudioSegment(
            fullAudioUrl,
            audioStart || 0,
            audioEnd,
            userId,
            projectId,
            shotId
          );
          audioPublicUrl = trimmedAudioUrl;
          console.log(`[VideoGen] Trimmed audio: ${audioStart || 0}s - ${audioEnd || 'end'}s`);
        } else {
          audioPublicUrl = fullAudioUrl;
        }

        audioSource = 'instrumental';
        omnihumanUsedMusicAudio = true;
      }

      if (!audioPublicUrl) {
        throw new Error('OmniHuman nécessite un audio (dialogue ou instrumental)');
      }

      // Get audio duration - OmniHuman will generate video matching this duration
      const audioDuration = await getAudioDuration(audioPublicUrl);
      console.log(`[VideoGen] OmniHuman audio duration (${audioSource}): ${audioDuration.toFixed(2)}s`);

      await updateJobProgress(jobId, 20, `Génération OmniHuman (~${Math.ceil(audioDuration)}s)...`);

      const result = await fal.subscribe(FAL_OMNIHUMAN_ENDPOINT, {
        input: {
          image_url: firstFramePublicUrl,
          audio_url: audioPublicUrl,
          prompt: prompt || undefined,
          turbo_mode: true,
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === 'IN_PROGRESS') {
            updateJobProgress(jobId, 50, `Génération en cours (~${Math.ceil(audioDuration)}s)...`);
          }
        },
      }) as { data: { video?: { url: string } } };

      // Set actual duration from audio (OmniHuman syncs to audio)
      actualVideoDuration = audioDuration;

      if (!result.data.video?.url) {
        throw new Error('OmniHuman returned no video URL');
      }
      videoUrl = result.data.video.url;
      cost = 0.15; // Estimated cost

    } else if (model === 'sora-2') {
      await updateJobProgress(jobId, 20, 'Génération Sora 2...');

      // Map duration to Sora 2 allowed values
      const soraDuration = (duration <= 4 ? '4' : duration <= 8 ? '8' : duration <= 12 ? '12' : '16') as '4' | '8' | '12';
      const soraAspect = (aspectRatio === '1:1' ? '16:9' : aspectRatio) as '16:9' | '9:16';

      const result = await fal.subscribe(FAL_SORA2_ENDPOINT, {
        input: {
          prompt,
          image_url: firstFramePublicUrl,
          duration: soraDuration,
          aspect_ratio: soraAspect,
          resolution: '720p',
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === 'IN_PROGRESS') {
            updateJobProgress(jobId, 50, 'Génération en cours...');
          }
        },
      }) as { data: { video?: { url: string } } };

      if (!result.data.video?.url) {
        throw new Error('Sora 2 returned no video URL');
      }
      videoUrl = result.data.video.url;
      cost = 0.20;

    } else if (model === 'veo-3') {
      await updateJobProgress(jobId, 20, 'Génération Veo 3.1...');

      // Map duration to Veo 3.1 allowed values
      const veoDuration = (duration <= 4 ? '4s' : duration <= 6 ? '6s' : '8s') as '4s' | '6s' | '8s';
      const veoAspect = (aspectRatio === '1:1' ? '16:9' : aspectRatio) as '16:9' | '9:16';

      const result = await fal.subscribe(FAL_VEO31_ENDPOINT, {
        input: {
          prompt,
          image_url: firstFramePublicUrl,
          duration: veoDuration,
          aspect_ratio: veoAspect,
          generate_audio: false,
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === 'IN_PROGRESS') {
            updateJobProgress(jobId, 50, 'Génération en cours...');
          }
        },
      }) as { data: { video?: { url: string } } };

      if (!result.data.video?.url) {
        throw new Error('Veo 3.1 returned no video URL');
      }
      videoUrl = result.data.video.url;
      cost = 0.25;

    } else {
      // Default: Kling v3
      await updateJobProgress(jobId, 20, 'Génération Kling v3...');

      // Build elements for character consistency
      const elements: Array<{ frontal_image_url: string; reference_image_urls?: string[] }> = [];
      if (characterReferenceImages && characterReferenceImages.length > 0) {
        const publicRefs = await Promise.all(
          characterReferenceImages.slice(0, 5).map((url) => getPublicUrl(url))
        );
        elements.push({
          frontal_image_url: publicRefs[0],
          reference_image_urls: publicRefs.slice(1),
        });
      }

      // Build prompt with element reference if needed
      let finalPrompt = prompt;
      if (elements.length > 0 && !prompt.includes('@Element1')) {
        finalPrompt = `@Element1 ${prompt}`;
      }

      const input: Record<string, unknown> = {
        prompt: finalPrompt,
        start_image_url: firstFramePublicUrl,
        duration: Math.max(3, Math.min(15, duration)),
        generate_audio: false,
        negative_prompt: 'blur, distort, low quality, watermark, text',
        cfg_scale: 0.5,
      };

      if (lastFramePublicUrl) {
        input.end_image_url = lastFramePublicUrl;
      }

      if (elements.length > 0) {
        input.elements = elements;
      }

      const result = await fal.subscribe(FAL_KLING_ENDPOINT, {
        input,
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === 'IN_PROGRESS') {
            updateJobProgress(jobId, 50, 'Génération en cours...');
          }
        },
      });

      const output = result.data as { video?: { url: string } };
      if (!output.video?.url) {
        throw new Error('Kling v3 returned no video URL');
      }
      videoUrl = output.video.url;
      cost = 0.10;
    }

    // Upload video to B2
    await updateJobProgress(jobId, 80, 'Sauvegarde de la vidéo...');

    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status}`);
    }

    const videoBuffer = await videoResponse.arrayBuffer();
    const contentType = videoResponse.headers.get('content-type') || 'video/mp4';
    const extension = contentType.includes('webm') ? 'webm' : 'mp4';

    const storageKey = generateStorageKey('videos', userId, projectId, shotId, extension);
    const b2Url = await uploadFile(storageKey, Buffer.from(videoBuffer), contentType);

    console.log(`[VideoGen] Uploaded to B2: ${b2Url}`);

    // Update shot in database
    await updateJobProgress(jobId, 90, 'Mise à jour de la base de données...');

    await supabase
      .from('shots')
      .update({
        generated_video_url: b2Url,
        generation_status: 'completed',
        video_provider: model,
        video_duration: actualVideoDuration,
        video_generation_progress: JSON.stringify({ status: 'completed', progress: 100 }),
      })
      .eq('id', shotId);

    // Check if we need to add music overlay
    // audioMode values: 'mute' (default), 'instrumental', 'vocal', 'dialogue', 'audio'
    // We add music overlay for instrumental or vocal modes
    // BUT skip if OmniHuman already used the music audio (it's already in the video)
    if (audioMode && audioMode !== 'mute' && audioMode !== 'none' && audioAssetId && !omnihumanUsedMusicAudio) {
      console.log(`[VideoGen] Music overlay needed (mode: ${audioMode}, asset: ${audioAssetId})`);

      // Get audio asset file URL from JSONB data column
      const { data: audioAsset, error: audioError } = await supabase
        .from('global_assets')
        .select('data, name')
        .eq('id', audioAssetId)
        .single();

      const assetData = audioAsset?.data as Record<string, unknown> | null;
      const audioFileUrl = assetData?.fileUrl as string | undefined;

      if (audioError || !audioFileUrl) {
        console.error(`[VideoGen] Failed to get audio asset: ${audioError?.message || 'No fileUrl in asset data'}`);
      } else {
        // Create a new job record for FFmpeg music overlay
        const { data: ffmpegJob, error: ffmpegJobError } = await supabase
          .from('generation_jobs')
          .insert({
            user_id: userId,
            asset_type: 'shot',
            asset_name: `Plan ${data.shotNumber || 1} - Musique`,
            job_type: 'video',
            job_subtype: 'music-overlay',
            status: 'queued',
            progress: 0,
            message: 'Application de la musique...',
            fal_endpoint: 'ffmpeg',
            input_data: {
              projectId,
              shotId,
              videoUrl: b2Url,
              audioUrl: audioFileUrl,
              audioStart: audioStart || 0,
              audioEnd: audioEnd,
            },
            queued_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (ffmpegJobError || !ffmpegJob) {
          console.error(`[VideoGen] Failed to create FFmpeg job: ${ffmpegJobError?.message}`);
        } else {
          // Enqueue the FFmpeg job
          await enqueueFFmpegJob(ffmpegJob.id, {
            userId,
            jobId: ffmpegJob.id,
            createdAt: new Date().toISOString(),
            operation: 'music-overlay',
            projectId,
            shotId,
            videoUrl: b2Url,
            audioUrl: audioFileUrl,
            audioStart: audioStart || 0,
            audioEnd: audioEnd,
          });
          console.log(`[VideoGen] Enqueued FFmpeg music overlay job ${ffmpegJob.id}`);
        }
      }
    }

    // Complete the job
    await completeJob(jobId, {
      videoUrl: b2Url,
      model,
      duration: actualVideoDuration,
    }, cost);

    console.log(`[VideoGen] Job ${jobId} completed successfully`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[VideoGen] Job ${jobId} failed:`, errorMessage);

    // Update shot status
    await supabase
      .from('shots')
      .update({
        generation_status: 'failed',
        generation_error: errorMessage,
      })
      .eq('id', shotId);

    // Fail the job
    await failJob(jobId, errorMessage);

    throw error;
  }
}
