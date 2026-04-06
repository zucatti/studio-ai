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

    // Update shot in database
    await updateJobProgress(jobId, 92, 'Mise à jour de la base de données...');

    await supabase
      .from('shots')
      .update({
        generated_video_url: b2Url,
        generation_status: 'completed',
        video_provider: model,
        video_duration: result.duration,
        video_generation_progress: JSON.stringify({ status: 'completed', progress: 100 }),
      })
      .eq('id', shotId);

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
