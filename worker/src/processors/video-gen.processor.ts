/**
 * Video Generation Processor (Refactored)
 * Uses the VideoProvider abstraction for clean provider switching
 */

import type { Job } from 'bullmq';
import { getSupabase } from '../supabase.js';
import { uploadFile, getPublicUrl, generateStorageKey } from '../storage.js';
import { startJob, updateJobProgress, completeJob, failJob } from '../utils/job-status.js';
import { enqueueFFmpegJob } from '../config.js';
import { videoProviders, type VideoGenerationRequest, type AspectRatio } from '../providers/video/index.js';
import { logFalUsage } from '../utils/api-usage-logger.js';

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
  firstFrameUrl?: string;  // Optional for text-to-video (Kling Omni)
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
  // Cinematic mode settings (Kling Omni elements + voices)
  isCinematicMode?: boolean;
  cinematicElements?: Array<{
    characterId: string;
    characterName: string;
    frontalImageUrl: string;
    referenceImageUrls?: string[];
  }>;
  cinematicVoices?: Array<{
    characterId: string;
    voiceId: string;
  }>;
  // Seedance audio references
  cinematicAudios?: Array<{
    characterId: string;
    audioUrl: string;
  }>;
  // Dry run mode - generate prompt but don't execute
  dryRun?: boolean;
  // Preview mode - don't update shot with generated video
  isPreview?: boolean;
}

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
    provider: providerName,
    duration,
    aspectRatio,
    prompt,
    firstFrameUrl,
    lastFrameUrl,
    characterReferenceImages,
    hasDialogue,
    dialogueAudioUrl,
    audioMode,
    audioAssetId,
    audioStart,
    audioEnd,
    isCinematicMode,
    cinematicElements,
    cinematicVoices,
    cinematicAudios,
  } = data;

  console.log(`[VideoGen] Processing job ${jobId} for shot ${shotId}`);
  console.log(`[VideoGen] Provider: ${providerName}, Model: ${model}, Duration: ${duration}s`);
  console.log(`[VideoGen] Cinematic mode: ${isCinematicMode ? 'YES' : 'NO'}`);
  if (isCinematicMode) {
    console.log(`[VideoGen] Cinematic elements received:`, cinematicElements?.length || 0);
    console.log(`[VideoGen] Cinematic voices received:`, cinematicVoices?.map(v => v.voiceId) || 'none');
  }

  const supabase = getSupabase();

  try {
    // Mark job as running
    await startJob(jobId, 'Préparation de la génération vidéo...');

    // Get the appropriate provider
    let provider = videoProviders.getProvider(providerName);

    // If no provider specified or not found, auto-select based on content
    if (!provider) {
      const defaultChoice = videoProviders.getDefaultProvider(hasDialogue);
      provider = defaultChoice.provider;
      console.log(`[VideoGen] Auto-selected provider: ${provider.name}`);
    }

    // Verify model is supported
    if (!provider.supportsModel(model)) {
      // Try to find a provider that supports this model
      const altProvider = videoProviders.getProviderForModel(model);
      if (altProvider) {
        provider = altProvider;
        console.log(`[VideoGen] Switched to ${provider.name} for model ${model}`);
      } else {
        throw new Error(`No provider supports model: ${model}`);
      }
    }

    // Get public URLs for all b2:// URLs (frames, audio, character refs)
    await updateJobProgress(jobId, 10, 'Récupération des URLs...');
    // firstFrameUrl is optional for text-to-video mode
    const firstFramePublicUrl = firstFrameUrl ? await getPublicUrl(firstFrameUrl) : undefined;
    const lastFramePublicUrl = lastFrameUrl ? await getPublicUrl(lastFrameUrl) : undefined;

    // Convert character reference images to public URLs
    let characterReferencePublicUrls: string[] | undefined;
    if (characterReferenceImages && characterReferenceImages.length > 0) {
      characterReferencePublicUrls = await Promise.all(
        characterReferenceImages.map(url => getPublicUrl(url))
      );
      console.log(`[VideoGen] Converted ${characterReferencePublicUrls.length} character reference URLs`);
    }

    // Get public URL for dialogue audio if present
    let dialogueAudioPublicUrl: string | undefined;
    if (dialogueAudioUrl) {
      dialogueAudioPublicUrl = await getPublicUrl(dialogueAudioUrl);
    }

    // Get audio URL for OmniHuman if using music mode
    let audioPublicUrl: string | undefined;
    let omnihumanUsedMusicAudio = false;

    if (hasDialogue && audioMode && audioMode !== 'mute' && audioMode !== 'none' && audioAssetId) {
      // Get audio asset for OmniHuman
      const { data: audioAsset } = await supabase
        .from('global_assets')
        .select('data')
        .eq('id', audioAssetId)
        .single();

      const assetData = audioAsset?.data as Record<string, unknown> | null;
      const audioFileUrl = assetData?.fileUrl as string | undefined;

      if (audioFileUrl) {
        audioPublicUrl = await getPublicUrl(audioFileUrl);
        omnihumanUsedMusicAudio = true;
      }
    }

    // Convert cinematic elements URLs to public URLs
    let cinematicElementsPublic: typeof cinematicElements = undefined;
    if (isCinematicMode && cinematicElements && cinematicElements.length > 0) {
      console.log(`[VideoGen] Cinematic mode: converting ${cinematicElements.length} elements to public URLs`);
      cinematicElementsPublic = await Promise.all(
        cinematicElements.map(async (el) => ({
          characterId: el.characterId,
          characterName: el.characterName,
          frontalImageUrl: await getPublicUrl(el.frontalImageUrl),
          referenceImageUrls: el.referenceImageUrls
            ? await Promise.all(el.referenceImageUrls.map(url => getPublicUrl(url)))
            : undefined,
        }))
      );
      console.log(`[VideoGen] Cinematic elements ready:`, cinematicElementsPublic.map(e => e.characterName));
      console.log(`[VideoGen] Cinematic voices:`, cinematicVoices?.map(v => v.voiceId) || 'none');
    }

    // Convert cinematic audio URLs to public URLs (for lip-sync)
    let cinematicAudiosPublic: typeof cinematicAudios = undefined;
    if (isCinematicMode && cinematicAudios && cinematicAudios.length > 0) {
      console.log(`[VideoGen] Cinematic mode: converting ${cinematicAudios.length} audio files to public URLs`);
      cinematicAudiosPublic = await Promise.all(
        cinematicAudios.map(async (a) => ({
          characterId: a.characterId,
          audioUrl: await getPublicUrl(a.audioUrl),
        }))
      );
      console.log(`[VideoGen] Cinematic audios ready (@Audio1-@Audio${cinematicAudiosPublic.length})`);
    }

    // Get previous plan's video URL for continuity (@Video1)
    let previousVideoPublicUrl: string | undefined;
    if (isCinematicMode) {
      // Get current shot's sort_order to find the previous one
      const { data: currentShot } = await supabase
        .from('shots')
        .select('sort_order, scene_id')
        .eq('id', shotId)
        .single();

      if (currentShot && currentShot.sort_order > 0) {
        // Find the previous shot (by sort_order)
        const { data: previousShot } = await supabase
          .from('shots')
          .select('generated_video_url')
          .eq('scene_id', currentShot.scene_id)
          .lt('sort_order', currentShot.sort_order)
          .order('sort_order', { ascending: false })
          .limit(1)
          .single();

        if (previousShot?.generated_video_url) {
          previousVideoPublicUrl = await getPublicUrl(previousShot.generated_video_url);
          console.log(`[VideoGen] Previous video for continuity (@Video1): ${previousVideoPublicUrl.substring(0, 50)}...`);
        }
      }
    }

    // Build generation request with all public URLs
    const request: VideoGenerationRequest = {
      prompt,
      firstFrameUrl: firstFramePublicUrl,
      duration,
      aspectRatio: aspectRatio as AspectRatio,
      lastFrameUrl: lastFramePublicUrl,
      characterReferenceImages: characterReferencePublicUrls,
      hasDialogue,
      dialogueAudioUrl: dialogueAudioPublicUrl,
      audioMode,
      audioUrl: audioPublicUrl,
      audioStart,
      audioEnd,
      jobId, // For cancellation support
      // Cinematic mode
      isCinematicMode,
      cinematicElements: cinematicElementsPublic,
      cinematicVoices,
      cinematicAudios: cinematicAudiosPublic,
      previousVideoUrl: previousVideoPublicUrl,
    };

    // DRY RUN MODE - Log everything but don't execute
    // Set DRYRUN=true env var to enable
    if (data.dryRun || process.env.DRYRUN === 'true') {
      console.log(`[VideoGen] ========== DRY RUN MODE ==========`);
      console.log(`[VideoGen] Provider: ${provider.displayName}, Model: ${model}`);
      console.log(`[VideoGen] Duration: ${duration}s, Aspect: ${aspectRatio}`);
      console.log(`[VideoGen] First frame: ${firstFramePublicUrl || 'NONE (text-to-video)'}`);
      console.log(`[VideoGen] Cinematic mode: ${isCinematicMode}`);
      if (cinematicElementsPublic) {
        console.log(`[VideoGen] Elements (${cinematicElementsPublic.length}):`);
        cinematicElementsPublic.forEach((el, i) => {
          console.log(`  ${i + 1}. ${el.characterName}: ${el.frontalImageUrl}`);
        });
      }
      if (cinematicVoices) {
        console.log(`[VideoGen] Voices (${cinematicVoices.length}):`);
        cinematicVoices.forEach((v, i) => {
          console.log(`  ${i + 1}. ${v.characterId}: ${v.voiceId}`);
        });
      }
      console.log(`[VideoGen] ========== FULL REQUEST JSON ==========`);
      console.log(JSON.stringify(request, null, 2));
      console.log(`[VideoGen] ========== PROMPT ==========`);
      console.log(prompt);
      console.log(`[VideoGen] ========== END DRY RUN ==========`);

      // Mark job as complete with prompt info
      await completeJob(jobId, {
        dryRun: true,
        prompt,
        model,
        provider: provider.displayName,
        duration,
        aspectRatio,
        firstFrameUrl: firstFramePublicUrl,
        cinematicElements: cinematicElementsPublic?.length || 0,
        cinematicVoices: cinematicVoices?.length || 0,
      });

      // Update shot status
      await supabase
        .from('shots')
        .update({
          generation_status: 'dry_run',
          video_generation_progress: JSON.stringify({
            status: 'dry_run',
            progress: 100,
            prompt,
          }),
        })
        .eq('id', shotId);

      return;
    }

    // Generate video
    console.log(`[VideoGen] Generating with ${provider.displayName}...`);
    const result = await provider.generate(model, request, async (progress, message) => {
      await updateJobProgress(jobId, progress, message);
    });

    console.log(`[VideoGen] Generation complete: ${result.videoUrl}`);

    // Upload video to B2
    await updateJobProgress(jobId, 85, 'Sauvegarde de la vidéo...');

    const videoResponse = await fetch(result.videoUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status}`);
    }

    const videoBuffer = await videoResponse.arrayBuffer();
    const contentType = videoResponse.headers.get('content-type') || 'video/mp4';
    const extension = contentType.includes('webm') ? 'webm' : 'mp4';

    const storageKey = generateStorageKey('videos', userId, projectId, shotId, extension);
    const b2Url = await uploadFile(storageKey, Buffer.from(videoBuffer), contentType);

    console.log(`[VideoGen] Uploaded to B2: ${b2Url}`);

    // Log API usage for fal.ai
    await logFalUsage(userId, {
      operation: 'video-generation',
      model: model,
      projectId,
      videoDuration: result.duration || duration,
      estimatedCost: result.cost,
    });

    // Preview mode: don't update shot, just complete the job with video URL
    if (data.isPreview) {
      console.log(`[VideoGen] Preview mode - skipping shot update`);
      await completeJob(jobId, {
        videoUrl: b2Url,
        duration: result.duration,
        model,
        isPreview: true,
      });
      console.log(`[VideoGen] Preview job ${jobId} completed`);
      return;
    }

    // Rush Creator mode: save to rush_media table instead of updating a shot
    // Detected by shotId starting with 'rush-video-'
    const isRushCreatorVideo = shotId.startsWith('rush-video-');
    if (isRushCreatorVideo) {
      console.log(`[VideoGen] Rush Creator mode - saving to rush_media table`);

      // Save to rush_media table
      const { data: rushMedia, error: rushError } = await supabase
        .from('rush_media')
        .insert({
          project_id: projectId,
          user_id: userId,
          url: b2Url,
          media_type: 'video',
          prompt: prompt.substring(0, 1000),
          aspect_ratio: aspectRatio,
          model,
          provider: providerName,
          duration: result.duration,
          status: 'pending',
          metadata: {
            generatedAt: new Date().toISOString(),
            cost: result.cost,
          },
        })
        .select('id')
        .single();

      if (rushError) {
        console.error(`[VideoGen] Failed to save rush media:`, rushError);
      } else {
        console.log(`[VideoGen] Rush media saved: ${rushMedia?.id}`);
      }

      await completeJob(jobId, {
        videoUrl: b2Url,
        duration: result.duration,
        model,
        rushMediaId: rushMedia?.id,
        cost: result.cost,
      });

      console.log(`[VideoGen] Rush Creator job ${jobId} completed`);
      return;
    }

    // Update shot in database with video rushes
    await updateJobProgress(jobId, 92, 'Mise à jour de la base de données...');

    // Fetch current rushes
    const { data: currentShot } = await supabase
      .from('shots')
      .select('video_rushes')
      .eq('id', shotId)
      .single();

    // Create new rush entry
    const newRush = {
      id: crypto.randomUUID(),
      url: b2Url,
      model,
      provider: providerName,
      duration: result.duration,
      prompt: prompt.substring(0, 500), // Truncate long prompts
      createdAt: new Date().toISOString(),
      isSelected: true,
    };

    // Get existing rushes and mark all as not selected
    const existingRushes = (currentShot?.video_rushes || []) as Array<{
      id: string;
      url: string;
      model: string;
      provider: string;
      duration: number;
      prompt?: string;
      createdAt: string;
      isSelected: boolean;
    }>;
    const updatedRushes = existingRushes.map(r => ({ ...r, isSelected: false }));
    updatedRushes.push(newRush);

    await supabase
      .from('shots')
      .update({
        generated_video_url: b2Url,
        video_rushes: updatedRushes,
        generation_status: 'completed',
        video_provider: model,
        video_duration: result.duration,
        video_generation_progress: JSON.stringify({ status: 'completed', progress: 100 }),
      })
      .eq('id', shotId);

    console.log(`[VideoGen] Added rush #${updatedRushes.length} for shot ${shotId}`);

    // Check if we need to add music overlay
    // Skip if OmniHuman already used the music audio
    if (audioMode && audioMode !== 'mute' && audioMode !== 'none' && audioAssetId && !omnihumanUsedMusicAudio) {
      console.log(`[VideoGen] Music overlay needed (mode: ${audioMode}, asset: ${audioAssetId})`);

      const { data: audioAsset } = await supabase
        .from('global_assets')
        .select('data, name')
        .eq('id', audioAssetId)
        .single();

      const assetData = audioAsset?.data as Record<string, unknown> | null;
      const audioFileUrl = assetData?.fileUrl as string | undefined;

      if (audioFileUrl) {
        // Create FFmpeg job for music overlay
        const { data: ffmpegJob } = await supabase
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
              audioEnd,
            },
            queued_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (ffmpegJob) {
          await enqueueFFmpegJob(ffmpegJob.id, {
            userId,
            jobId: ffmpegJob.id,
            createdAt: new Date().toISOString(),
            projectId,
            shotId,
            operation: 'music-overlay',
            videoUrl: b2Url,
            audioUrl: audioFileUrl,
            audioStart: audioStart || 0,
            audioEnd,
          });
          console.log(`[VideoGen] Enqueued FFmpeg music overlay job: ${ffmpegJob.id}`);
        }
      }
    }

    // Complete the job
    await completeJob(jobId, {
      videoUrl: b2Url,
      duration: result.duration,
      model,
      cost: result.cost,
      hasMusic: !!(audioMode && audioMode !== 'mute' && audioAssetId && !omnihumanUsedMusicAudio),
    });

    console.log(`[VideoGen] Job ${jobId} completed successfully`);

  } catch (error) {
    console.error(`[VideoGen] Job ${jobId} failed:`, error);

    // Update shot generation status
    await supabase
      .from('shots')
      .update({
        generation_status: 'failed',
        video_generation_progress: JSON.stringify({
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      })
      .eq('id', shotId);

    // Fail the job
    await failJob(jobId, error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}
