/**
 * fal.ai Video Provider
 * Supports: OmniHuman 1.5, Kling, Sora 2, Veo 3, Wan
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
const MODEL_ENDPOINTS: Record<string, string> = {
  'omnihuman': 'fal-ai/omnihuman',
  'kling-omni': 'fal-ai/kling-video/o3/pro/image-to-video', // Kling 3.0 Omni - elements + audio
  'kling-2.6': 'fal-ai/kling-video/v2.6/pro/image-to-video', // Voice IDs only
  'kling-v2-master': 'fal-ai/kling-video/v2/master/image-to-video', // Legacy
  'sora-2': 'fal-ai/sora/v2/image-to-video',
  'veo-3': 'fal-ai/veo3/image-to-video',
  'wan-2.1': 'fal-ai/wan/v2.1/image-to-video',
  'wan-2.6': 'fal-ai/wan/v2.1/image-to-video', // Same endpoint
};

// Text-to-video endpoints (no starting image required)
const TEXT_TO_VIDEO_ENDPOINTS: Record<string, string> = {
  'kling-omni': 'fal-ai/kling-video/o3/pro/text-to-video',
  'kling-2.6': 'fal-ai/kling-video/v2.6/pro/text-to-video',
  'sora-2': 'fal-ai/sora/v2/text-to-video',
  'veo-3': 'fal-ai/veo3/text-to-video',
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
    id: 'kling-omni',
    name: 'Kling O3 Pro',
    description: 'Kling 3.0 Omni - elements + voice synthesis',
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
    const modelInfo = MODELS.find(m => m.id === model);

    // Handle OmniHuman separately (different API)
    if (model === 'omnihuman') {
      return this.generateOmniHuman(request, onProgress);
    }

    // Determine if we use text-to-video or image-to-video
    const hasStartingFrame = !!request.firstFrameUrl;
    let endpoint: string;

    if (hasStartingFrame) {
      endpoint = MODEL_ENDPOINTS[model] || model;
    } else {
      // No starting frame - use text-to-video endpoint
      endpoint = TEXT_TO_VIDEO_ENDPOINTS[model];
      if (!endpoint) {
        throw new Error(`Model ${model} does not support text-to-video (no starting frame provided)`);
      }
    }

    const isTextToVideo = !hasStartingFrame;
    console.log(`[Fal] Generating with ${endpoint} (${isTextToVideo ? 'text-to-video' : 'image-to-video'})`);
    await onProgress?.(10, `Génération ${modelInfo?.name || model}...`);

    // Build input parameters
    const input: Record<string, unknown> = {
      prompt: request.prompt,
    };

    // Add image_url only for image-to-video
    if (hasStartingFrame) {
      input.image_url = request.firstFrameUrl;
    }

    // Add aspect ratio
    if (request.aspectRatio) {
      input.aspect_ratio = request.aspectRatio === '1:1' ? '16:9' : request.aspectRatio;
    }

    // Kling Omni (O3) configuration
    if (model === 'kling-omni') {
      // O3 supports duration 3-15 seconds
      input.duration = Math.min(Math.max(request.duration, 3), 15);

      // Character elements for consistency (only for image-to-video with refs)
      if (hasStartingFrame && request.isCinematicMode && request.cinematicElements?.length) {
        input.elements = request.cinematicElements.map(el => ({
          frontal_image_url: el.frontalImageUrl,
          reference_image_urls: el.referenceImageUrls,
        }));
        console.log(`[Fal] Kling O3 elements:`, input.elements);
      }

      // Enable audio generation for voice synthesis
      // The <<<voice_1>>> syntax in prompt references voice_ids
      if (request.isCinematicMode && request.cinematicVoices?.length) {
        input.generate_audio = true;
        input.voice_ids = request.cinematicVoices.map(v => v.voiceId);
        console.log(`[Fal] Kling O3 voice_ids:`, input.voice_ids);
      } else if (isTextToVideo) {
        // For text-to-video, enable audio by default for natural speech
        input.generate_audio = true;
        console.log(`[Fal] Kling O3 text-to-video: generate_audio enabled`);
      }
    }

    // Add end frame if supported (image-to-video only)
    if (hasStartingFrame && request.lastFrameUrl && modelInfo?.supportsEndFrame) {
      input.tail_image_url = request.lastFrameUrl;
    }

    // === DRY RUN MODE ===
    const dryRun = process.env.FAL_DRY_RUN === 'true';
    console.log(`[Fal] Input:`, JSON.stringify(input, null, 2));

    if (dryRun) {
      console.log(`\n========== FAL.AI DRY RUN ==========`);
      console.log(`[Fal] Endpoint: ${endpoint}`);
      console.log(`[Fal] FULL PAYLOAD:`);
      console.log(JSON.stringify(input, null, 2));
      console.log(`====================================\n`);
      throw new Error('DRY RUN MODE - No API call made. Set FAL_DRY_RUN=false to actually generate.');
    }

    const result = await fal.subscribe(endpoint, {
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

    console.log(`[Fal] OmniHuman input:`, JSON.stringify(input, null, 2));

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
