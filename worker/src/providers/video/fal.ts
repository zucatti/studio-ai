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

// Model mapping: short names to fal.ai endpoints
const MODEL_ENDPOINTS: Record<string, string> = {
  'omnihuman': 'fal-ai/omnihuman',
  'kling-omni': 'fal-ai/kling-video/v2/master/image-to-video',
  'sora-2': 'fal-ai/sora/v2/image-to-video',
  'veo-3': 'fal-ai/veo3/image-to-video',
  'wan-2.1': 'fal-ai/wan/v2.1/image-to-video',
  'wan-2.6': 'fal-ai/wan/v2.1/image-to-video', // Same endpoint
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
    name: 'Kling Omni',
    description: 'High quality video via fal.ai',
    maxDuration: 10,
    minDuration: 5,
    supportsEndFrame: true,
    supportsDialogue: false,
    supportsAudio: false,
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
    const endpoint = MODEL_ENDPOINTS[model] || model;
    const modelInfo = MODELS.find(m => m.id === model);

    console.log(`[Fal] Generating with ${endpoint}`);
    await onProgress?.(10, `Génération ${modelInfo?.name || model}...`);

    // Handle OmniHuman separately (different API)
    if (model === 'omnihuman') {
      return this.generateOmniHuman(request, onProgress);
    }

    // Standard image-to-video generation
    const input: Record<string, unknown> = {
      prompt: request.prompt,
      image_url: request.firstFrameUrl,
    };

    // Add aspect ratio for models that support it
    if (model === 'sora-2' || model === 'veo-3') {
      input.aspect_ratio = request.aspectRatio === '1:1' ? '16:9' : request.aspectRatio;
    }

    // Add duration for models that support it
    if (model === 'kling-omni') {
      input.duration = request.duration <= 5 ? '5' : '10';
    }

    // Add end frame if supported
    if (request.lastFrameUrl && modelInfo?.supportsEndFrame) {
      input.tail_image_url = request.lastFrameUrl;
    }

    console.log(`[Fal] Input:`, JSON.stringify(input, null, 2));

    const result = await fal.subscribe(endpoint, {
      input,
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          const logs = update.logs || [];
          const lastLog = logs[logs.length - 1];
          if (lastLog?.message) {
            onProgress?.(50, lastLog.message);
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
