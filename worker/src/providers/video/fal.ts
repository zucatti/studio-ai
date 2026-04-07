/**
 * fal.ai Video Provider
 * Supports: OmniHuman 1.5, Seedance 2.0, Kling, Sora 2, Veo 3, Wan
 *
 * Seedance 2.0 Endpoints:
 * - reference-to-video: Character references via images_list + @image1/@image2 syntax
 * - image-to-video: Starting frame only
 * - text-to-video: Prompt only
 * - fast/* variants: 20% cheaper, faster
 *
 * Pricing:
 * - Standard: $0.30/s (720p)
 * - Fast: $0.24/s (720p)
 */

import { fal } from '@fal-ai/client';
import type {
  VideoProvider,
  VideoModel,
  VideoGenerationRequest,
  VideoGenerationResult,
  ProgressCallback,
} from './types.js';
import { aiConfig } from '../../config.js';

// Model mapping: short names to fal.ai endpoints (image-to-video)
// Note: Seedance 2.0 uses bytedance/ prefix, not fal-ai/bytedance/
const MODEL_ENDPOINTS: Record<string, string> = {
  'omnihuman': 'fal-ai/omnihuman',
  // Seedance 2.0 - use reference-to-video when we have character refs
  'seedance-2': 'bytedance/seedance-2.0/image-to-video',
  'seedance-2-fast': 'bytedance/seedance-2.0/fast/image-to-video',
  // Kling
  'kling-omni': 'fal-ai/kling-video/o3/pro/image-to-video',
  'kling-2.6': 'fal-ai/kling-video/v2.6/pro/image-to-video',
  'kling-v2-master': 'fal-ai/kling-video/v2/master/image-to-video',
  // Grok Imagine (xAI) - cheap preview at 480p ($0.05/s)
  'grok-480p': 'xai/grok-imagine-video/image-to-video',
  'grok-720p': 'xai/grok-imagine-video/image-to-video',
  // Others
  'sora-2': 'fal-ai/sora/v2/image-to-video',
  'veo-3': 'fal-ai/veo3/image-to-video',
  'wan-2.1': 'fal-ai/wan/v2.1/image-to-video',
  'wan-2.6': 'fal-ai/wan/v2.1/image-to-video',
};

// Reference-to-video endpoints (character consistency with reference images)
// Note: Seedance 2.0 uses bytedance/ prefix, not fal-ai/bytedance/
const REFERENCE_TO_VIDEO_ENDPOINTS: Record<string, string> = {
  'seedance-2': 'bytedance/seedance-2.0/reference-to-video',
  'seedance-2-fast': 'bytedance/seedance-2.0/fast/reference-to-video',
  // Grok supports up to 7 reference images
  'grok-480p': 'xai/grok-imagine-video/reference-to-video',
  'grok-720p': 'xai/grok-imagine-video/reference-to-video',
  // Kling O3 reference-to-video (requires start_image_url + elements)
  'kling-omni': 'fal-ai/kling-video/o3/pro/reference-to-video',
};

// Text-to-video endpoints (no starting image required)
// Note: Seedance 2.0 uses bytedance/ prefix, not fal-ai/bytedance/
const TEXT_TO_VIDEO_ENDPOINTS: Record<string, string> = {
  'seedance-2': 'bytedance/seedance-2.0/text-to-video',
  'seedance-2-fast': 'bytedance/seedance-2.0/fast/text-to-video',
  'kling-omni': 'fal-ai/kling-video/o3/pro/text-to-video',
  'kling-2.6': 'fal-ai/kling-video/v2.6/pro/text-to-video',
  'sora-2': 'fal-ai/sora/v2/text-to-video',
  'veo-3': 'fal-ai/veo3/text-to-video',
  'grok-480p': 'xai/grok-imagine-video/text-to-video',
  'grok-720p': 'xai/grok-imagine-video/text-to-video',
};

const MODELS: VideoModel[] = [
  {
    id: 'omnihuman',
    name: 'OmniHuman 1.5',
    description: 'Best for talking head and dialogue videos',
    maxDuration: 10,
    minDuration: 3,
    supportsEndFrame: false,
    supportsDialogue: true,
    supportsAudio: true,
    defaultForDialogue: true,
  },
  {
    id: 'seedance-2',
    name: 'Seedance 2.0',
    description: 'ByteDance Pro - native audio, refs via @Image1 syntax ($0.30/s)',
    maxDuration: 15, // Pro supports up to 15s
    minDuration: 2,
    supportsEndFrame: false,
    supportsDialogue: false, // No voice_ids like Kling, but native audio from prompt
    supportsAudio: true, // Native audio generation (music, dialogue, SFX)
    supportsTextToVideo: true,
    supportsReferences: true, // Supports reference-to-video with reference_image_urls
  },
  {
    id: 'seedance-2-fast',
    name: 'Seedance 2.0 Fast',
    description: 'ByteDance Fast - 20% cheaper, faster ($0.24/s)',
    maxDuration: 12,
    minDuration: 2,
    supportsEndFrame: false,
    supportsDialogue: false,
    supportsAudio: true,
    supportsTextToVideo: true,
    supportsReferences: true,
  },
  {
    id: 'kling-omni',
    name: 'Kling O3 Pro',
    description: 'Kling 3.0 Omni - elements + voice synthesis ($0.34/s)',
    maxDuration: 15,
    minDuration: 3,
    supportsEndFrame: true,
    supportsDialogue: true,
    supportsAudio: true,
    supportsTextToVideo: true,
    defaultForVideo: true,
  },
  {
    id: 'sora-2',
    name: 'Sora 2',
    description: 'OpenAI Sora video generation',
    maxDuration: 10,
    minDuration: 5,
    supportsEndFrame: false,
    supportsDialogue: false,
    supportsAudio: false,
  },
  {
    id: 'veo-3',
    name: 'Veo 3',
    description: 'Google Veo video generation',
    maxDuration: 10,
    minDuration: 5,
    supportsEndFrame: false,
    supportsDialogue: false,
    supportsAudio: false,
  },
  {
    id: 'wan-2.1',
    name: 'Wan 2.1',
    description: 'Alibaba Wan video generation',
    maxDuration: 10,
    minDuration: 3,
    supportsEndFrame: false,
    supportsDialogue: false,
    supportsAudio: false,
  },
  {
    id: 'grok-480p',
    name: 'Grok 480p',
    description: 'xAI Grok Imagine - cheap preview ($0.05/s) with refs',
    maxDuration: 10,
    minDuration: 2,
    supportsEndFrame: false,
    supportsDialogue: false,
    supportsAudio: false,
    supportsTextToVideo: true,
    supportsReferences: true,
    isPreview: true,
  },
  {
    id: 'grok-720p',
    name: 'Grok 720p',
    description: 'xAI Grok Imagine - mid-tier ($0.07/s) with refs',
    maxDuration: 10,
    minDuration: 2,
    supportsEndFrame: false,
    supportsDialogue: false,
    supportsAudio: false,
    supportsTextToVideo: true,
    supportsReferences: true,
  },
];

export class FalProvider implements VideoProvider {
  readonly name = 'fal';
  readonly displayName = 'fal.ai';

  constructor() {
    // Configure fal client
    if (aiConfig.fal) {
      fal.config({ credentials: aiConfig.fal });
    }
  }

  supportsModel(model: string): boolean {
    return model in MODEL_ENDPOINTS || MODELS.some(m => m.id === model);
  }

  getSupportedModels(): VideoModel[] {
    return MODELS;
  }

  async generate(
    model: string,
    request: VideoGenerationRequest,
    onProgress?: ProgressCallback
  ): Promise<VideoGenerationResult> {
    // VERSION MARKER - Update this to confirm worker reload
    console.log(`[Fal] === WORKER VERSION: 2026-04-07-v2 ===`);

    const modelInfo = MODELS.find(m => m.id === model);

    // Handle OmniHuman separately (different API)
    if (model === 'omnihuman') {
      return this.generateOmniHuman(request, onProgress);
    }

    // Determine endpoint based on inputs
    const hasStartingFrame = !!request.firstFrameUrl;
    const hasCharacterRefs = request.isCinematicMode && request.cinematicElements && request.cinematicElements.length > 0;
    const isSeedance = model.startsWith('seedance-2');
    let endpoint: string;
    let endpointType: 'text-to-video' | 'image-to-video' | 'reference-to-video';

    // DEBUG: Log all conditions for endpoint selection
    console.log(`[Fal] ========== ENDPOINT SELECTION DEBUG ==========`);
    console.log(`[Fal] Model: ${model}`);
    console.log(`[Fal] hasStartingFrame: ${hasStartingFrame} (firstFrameUrl: ${request.firstFrameUrl ? 'present' : 'missing'})`);
    console.log(`[Fal] isCinematicMode: ${request.isCinematicMode}`);
    console.log(`[Fal] cinematicElements count: ${request.cinematicElements?.length || 0}`);
    console.log(`[Fal] hasCharacterRefs: ${hasCharacterRefs}`);

    const isGrok = model.startsWith('grok-');
    const isKling = model.startsWith('kling');
    console.log(`[Fal] isKling: ${isKling}, isGrok: ${isGrok}, isSeedance: ${isSeedance}`);
    console.log(`[Fal] Condition check: (isSeedance || isGrok || isKling) && hasCharacterRefs && hasStartingFrame`);
    console.log(`[Fal]   = (${isSeedance} || ${isGrok} || ${isKling}) && ${hasCharacterRefs} && ${hasStartingFrame}`);
    console.log(`[Fal]   = ${(isSeedance || isGrok || isKling)} && ${hasCharacterRefs} && ${hasStartingFrame}`);
    console.log(`[Fal]   = ${(isSeedance || isGrok || isKling) && hasCharacterRefs && hasStartingFrame}`);
    console.log(`[Fal] =================================================`);

    if ((isSeedance || isGrok || isKling) && hasCharacterRefs && hasStartingFrame) {
      // Seedance, Grok, or Kling with character references -> reference-to-video
      // Note: Kling reference-to-video REQUIRES a start_image_url
      endpoint = REFERENCE_TO_VIDEO_ENDPOINTS[model] || MODEL_ENDPOINTS[model];
      endpointType = 'reference-to-video';
      console.log(`[Fal] >>> SELECTED: reference-to-video (has refs + start frame)`);
    } else if ((isSeedance || isGrok) && hasCharacterRefs) {
      // Seedance/Grok can do reference-to-video without start frame
      endpoint = REFERENCE_TO_VIDEO_ENDPOINTS[model] || MODEL_ENDPOINTS[model];
      endpointType = 'reference-to-video';
      console.log(`[Fal] >>> SELECTED: reference-to-video (Seedance/Grok without start frame)`);
    } else if (hasStartingFrame) {
      endpoint = MODEL_ENDPOINTS[model] || model;
      endpointType = 'image-to-video';
      console.log(`[Fal] >>> SELECTED: image-to-video (has start frame, no refs or not Kling/Seedance/Grok)`);
    } else {
      // No starting frame - use text-to-video endpoint
      endpoint = TEXT_TO_VIDEO_ENDPOINTS[model];
      if (!endpoint) {
        throw new Error(`Model ${model} does not support text-to-video (no starting frame provided)`);
      }
      endpointType = 'text-to-video';
      console.log(`[Fal] >>> SELECTED: text-to-video (no start frame)`);
    }

    console.log(`[Fal] Generating with ${endpoint} (${endpointType})`);
    await onProgress?.(10, `Génération ${modelInfo?.name || model}...`);

    // Build input parameters
    const input: Record<string, unknown> = {
      prompt: request.prompt,
    };

    // Add image_url only for image-to-video (NOT reference-to-video)
    if (hasStartingFrame && endpointType === 'image-to-video') {
      input.image_url = request.firstFrameUrl;
    }

    // Add aspect ratio
    if (request.aspectRatio) {
      input.aspect_ratio = request.aspectRatio === '1:1' ? '16:9' : request.aspectRatio;
    }

    // Seedance 2.0 configuration
    if (isSeedance) {
      // Seedance Pro supports 2-15 seconds, Fast supports 2-12 seconds
      const maxDuration = model === 'seedance-2' ? 15 : 12;
      const durationNum = Math.min(Math.max(request.duration, 2), maxDuration);
      input.duration = String(durationNum);

      // Reference-to-video: pass character images via reference_image_urls
      // Seedance uses @Image1, @Image2 syntax in prompt (handled by prompt builder)
      if (endpointType === 'reference-to-video' && request.cinematicElements?.length) {
        // Collect all reference images (frontal + additional)
        const imagesList: string[] = [];
        for (const el of request.cinematicElements) {
          if (el.frontalImageUrl) {
            imagesList.push(el.frontalImageUrl);
          }
          if (el.referenceImageUrls?.length) {
            imagesList.push(...el.referenceImageUrls);
          }
        }
        // Max 4 images for Seedance reference-to-video (doc says 1-4)
        const limitedImages = imagesList.slice(0, 4);
        // Seedance API expects "image_urls" not "reference_image_urls"
        input.image_urls = limitedImages;
        console.log(`[Fal] Seedance 2.0 reference-to-video with ${limitedImages.length} images`);
      }

      // Seedance 2.0 audio references (@Audio1, @Audio2, etc.)
      // Pre-rendered audio files for character lip-sync (max 3, combined max 15s)
      if (request.cinematicAudios?.length) {
        const audioUrls = request.cinematicAudios.map(a => a.audioUrl).slice(0, 3);
        input.audio_urls = audioUrls;
        console.log(`[Fal] Seedance 2.0 with ${audioUrls.length} audio references`);
      }

      console.log(`[Fal] Seedance 2.0 (${model}), duration: ${input.duration}s`);
    }

    // Kling Omni (O3) configuration
    if (model === 'kling-omni') {
      // O3 supports duration 3-15 seconds
      input.duration = Math.min(Math.max(request.duration, 3), 15);

      // Reference-to-video: use start_image_url instead of image_url
      if (endpointType === 'reference-to-video' && hasStartingFrame) {
        // Kling reference-to-video uses start_image_url (NOT image_url!)
        input.start_image_url = request.firstFrameUrl;
        console.log(`[Fal] Kling O3 using start_image_url for reference-to-video`);

        // Add elements for character consistency - THIS IS CRITICAL
        // Kling API requires BOTH frontal_image_url AND reference_image_urls with at least 1 URL
        // If no additional refs, duplicate frontal image into reference_image_urls
        if (request.cinematicElements?.length) {
          input.elements = request.cinematicElements.map(el => ({
            frontal_image_url: el.frontalImageUrl,
            // IMPORTANT: reference_image_urls needs at least 1 URL - use frontal as fallback
            reference_image_urls: el.referenceImageUrls?.length
              ? el.referenceImageUrls
              : [el.frontalImageUrl],
          }));
          console.log(`[Fal] Kling O3 reference-to-video with ${request.cinematicElements.length} elements`);
          console.log(`[Fal] Elements:`, JSON.stringify(input.elements, null, 2));
        } else {
          console.log(`[Fal] WARNING: Kling reference-to-video but NO cinematicElements!`);
        }

        // Add end frame if provided
        if (request.lastFrameUrl) {
          input.end_image_url = request.lastFrameUrl;
        }
      } else if (hasStartingFrame && request.isCinematicMode && request.cinematicElements?.length) {
        // Fallback: image-to-video with elements (less reliable)
        input.elements = request.cinematicElements.map(el => ({
          frontal_image_url: el.frontalImageUrl,
          reference_image_urls: el.referenceImageUrls,
        }));
        console.log(`[Fal] Kling O3 image-to-video elements:`, input.elements);
      }

      // Enable audio generation (ambient sounds, music, speech based on prompt)
      // Kling Omni generates contextual audio from the prompt content
      input.generate_audio = true;

      // Add voice_ids for cinematic mode with character voices
      // The <<<voice_1>>> syntax in prompt references voice_ids
      if (request.isCinematicMode && request.cinematicVoices?.length) {
        input.voice_ids = request.cinematicVoices.map(v => v.voiceId);
        console.log(`[Fal] Kling O3 voice_ids:`, input.voice_ids);
      }
      console.log(`[Fal] Kling O3 generate_audio: true, endpointType: ${endpointType}`);
    }

    // Grok Imagine (xAI) configuration
    if (isGrok) {
      // Grok supports 2-10 seconds
      input.duration = Math.min(Math.max(request.duration, 2), 10);

      // Set resolution based on model variant
      input.resolution = model === 'grok-480p' ? '480p' : '720p';

      // Reference-to-video: pass character images via reference_image_urls
      // Grok supports up to 7 reference images
      if (endpointType === 'reference-to-video' && request.cinematicElements?.length) {
        const imagesList: string[] = [];
        for (const el of request.cinematicElements) {
          if (el.frontalImageUrl) {
            imagesList.push(el.frontalImageUrl);
          }
          if (el.referenceImageUrls?.length) {
            imagesList.push(...el.referenceImageUrls);
          }
        }
        // Max 7 images for Grok reference-to-video
        const limitedImages = imagesList.slice(0, 7);
        input.reference_image_urls = limitedImages;
        console.log(`[Fal] Grok reference-to-video with ${limitedImages.length} images`);
      }

      console.log(`[Fal] Grok (${model}), duration: ${input.duration}s, resolution: ${input.resolution}`);
    }

    // Add end frame if supported (image-to-video only)
    if (hasStartingFrame && request.lastFrameUrl && modelInfo?.supportsEndFrame) {
      input.tail_image_url = request.lastFrameUrl;
    }

    // === LOG FULL PAYLOAD ===
    console.log(`\n========== FAL.AI REQUEST ==========`);
    console.log(`[Fal] Model: ${model}`);
    console.log(`[Fal] Endpoint: ${endpoint}`);
    console.log(`[Fal] Endpoint Type: ${endpointType}`);
    console.log(`[Fal] FULL PAYLOAD:`);
    console.log(JSON.stringify(input, null, 2));
    console.log(`====================================\n`);

    // === DRY RUN MODE ===
    const dryRun = process.env.FAL_DRY_RUN === 'true';
    if (dryRun) {
      throw new Error('DRY RUN MODE - No API call made. Set FAL_DRY_RUN=false to actually generate.');
    }

    let result;
    try {
      result = await fal.subscribe(endpoint, {
        input,
        logs: true,
        onQueueUpdate: (update) => {
          console.log(`[Fal] Queue update:`, JSON.stringify(update, null, 2));
          if (update.status === 'IN_QUEUE') {
            const position = (update as { position?: number }).position;
            onProgress?.(15, position ? `File d'attente (position ${position})...` : 'En file d\'attente...');
          } else if (update.status === 'IN_PROGRESS') {
            const logs = update.logs || [];
            const lastLog = logs[logs.length - 1];
            // Try to extract percentage from log message if available
            const percentMatch = lastLog?.message?.match(/(\d+)%/);
            if (percentMatch) {
              const percent = parseInt(percentMatch[1], 10);
              // Map 0-100% to 20-85% of our progress bar
              const mappedProgress = 20 + Math.floor(percent * 0.65);
              onProgress?.(mappedProgress, lastLog.message);
            } else if (lastLog?.message) {
              onProgress?.(50, lastLog.message);
            } else {
              onProgress?.(50, 'Génération en cours...');
            }
          }
        },
      });
    } catch (error: unknown) {
      // Log detailed error for debugging
      const falError = error as { status?: number; body?: unknown; requestId?: string };
      console.error(`[Fal] API Error:`, {
        status: falError.status,
        body: JSON.stringify(falError.body, null, 2),
        requestId: falError.requestId,
      });
      throw error;
    }

    await onProgress?.(90, 'Génération terminée');

    const videoUrl = (result.data as { video?: { url: string } })?.video?.url;
    if (!videoUrl) {
      throw new Error('fal.ai did not return a video URL');
    }

    return {
      videoUrl,
      duration: request.duration,
      cost: 0,
    };
  }

  private async generateOmniHuman(
    request: VideoGenerationRequest,
    onProgress?: ProgressCallback
  ): Promise<VideoGenerationResult> {
    console.log(`[Fal] OmniHuman generation`);

    const input: Record<string, unknown> = {
      image_url: request.firstFrameUrl,
      prompt: request.prompt,
    };

    // OmniHuman requires audio for talking head
    if (request.dialogueAudioUrl) {
      input.audio_url = request.dialogueAudioUrl;
    } else if (request.audioUrl) {
      input.audio_url = request.audioUrl;
    }

    // Add character references if available
    if (request.characterReferenceImages?.length) {
      input.reference_images = request.characterReferenceImages;
    }

    // === LOG FULL PAYLOAD ===
    console.log(`\n========== FAL.AI REQUEST ==========`);
    console.log(`[Fal] Model: omnihuman`);
    console.log(`[Fal] Endpoint: fal-ai/omnihuman`);
    console.log(`[Fal] FULL PAYLOAD:`);
    console.log(JSON.stringify(input, null, 2));
    console.log(`====================================\n`);

    const result = await fal.subscribe('fal-ai/omnihuman', {
      input,
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          onProgress?.(50, 'Génération OmniHuman...');
        }
      },
    });

    await onProgress?.(90, 'Génération terminée');

    const videoUrl = (result.data as { video?: { url: string } })?.video?.url;
    if (!videoUrl) {
      throw new Error('OmniHuman did not return a video URL');
    }

    return {
      videoUrl,
      duration: request.duration,
      cost: 0,
      hasAudio: !!(request.dialogueAudioUrl || request.audioUrl),
    };
  }
}
