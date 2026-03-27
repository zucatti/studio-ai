/**
 * Unified Video Provider Abstraction
 *
 * Routes video generation requests to different providers:
 * - WaveSpeed (primary for img2video)
 * - ModelsLab (backup)
 * - fal.ai (backup - Kling, Sora, Veo)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { createWavespeedWrapper, WavespeedModel } from './wavespeed-wrapper';
import { createModelslabWrapper } from './modelslab-wrapper';
import { createFalWrapper, generateKlingVideoFal } from './fal-wrapper';

// Supported video providers
export type VideoProvider = 'wavespeed' | 'modelslab' | 'fal';

// Provider-specific model mappings (2026 catalog)
// WaveSpeed: https://wavespeed.ai/docs
export const VIDEO_PROVIDER_MODELS: Record<VideoProvider, { value: string; label: string; duration: number[] }[]> = {
  wavespeed: [
    { value: 'kwaivgi/kling-video-o3-pro/image-to-video', label: 'Kling O3 Pro', duration: [5, 10] },
    { value: 'kwaivgi/kling-v3.0-pro/image-to-video', label: 'Kling 3.0 Pro', duration: [5, 10] },
    { value: 'google/veo3.1/image-to-video', label: 'Veo 3.1', duration: [4, 6, 8] },
    { value: 'bytedance/seedance-v1.5-pro/image-to-video', label: 'Seedance 1.5 Pro', duration: [5, 10] },
    { value: 'alibaba/wan-2.6/image-to-video', label: 'WAN 2.6', duration: [5] },
    { value: 'bytedance/avatar-omni-human-1.5', label: 'OmniHuman 1.5', duration: [5, 10, 15] },
  ],
  modelslab: [
    { value: 'kling-v3-i2v', label: 'Kling 3.0', duration: [5, 10] },
    { value: 'veo-3-i2v', label: 'Veo 3', duration: [4, 6, 8] },
    // OmniHuman 1.5 requires audio - use fal.ai with dialogue enabled instead
  ],
  fal: [
    { value: 'kling-omni', label: 'Kling 3.0 Omni', duration: [5, 10] },
    { value: 'veo-3', label: 'Veo 3.1', duration: [4, 6, 8] },
    { value: 'omnihuman', label: 'OmniHuman 1.5', duration: [5, 10] },
  ],
};

// Models specifically for dialogue (require audio)
// OmniHuman 1.5 via fal.ai is the only quality option
// WaveSpeed's version is degraded/fake - removed
export const DIALOGUE_VIDEO_MODELS: { value: string; label: string; duration: number[]; provider: VideoProvider; supportsFrameOut: boolean }[] = [
  { value: 'omnihuman', label: 'OmniHuman 1.5', duration: [5, 10, 15, 30], provider: 'fal', supportsFrameOut: false },
];

// Check if a model is dialogue-only
export function isDialogueOnlyModel(model: string): boolean {
  return DIALOGUE_VIDEO_MODELS.some(m => m.value === model);
}

// Check if a model supports Frame Out
export function modelSupportsFrameOut(model: string): boolean {
  const dialogueModel = DIALOGUE_VIDEO_MODELS.find(m => m.value === model);
  if (dialogueModel) {
    return dialogueModel.supportsFrameOut;
  }
  // Non-dialogue models support Frame Out by default
  return true;
}

// Default models per provider (Kling O3 Pro is best quality)
export const DEFAULT_PROVIDER_MODEL: Record<VideoProvider, string> = {
  wavespeed: 'kwaivgi/kling-video-o3-pro/image-to-video',
  modelslab: 'kling-v3-i2v',
  fal: 'kling-omni',
};

// Unified input for video generation
export interface VideoGenerationInput {
  prompt: string;
  firstFrameUrl: string;
  lastFrameUrl?: string;
  duration: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
  model?: string; // Provider-specific model
  audioUrl?: string; // For OmniHuman and other talking head models
}

// Unified output for video generation
export interface VideoGenerationOutput {
  videoUrl: string;
  provider: VideoProvider;
  model: string;
  cost: number;
  taskId?: string;
}

// Progress callback for SSE streaming
export type ProgressCallback = (step: string, message: string, progress: number) => void;

// Provider configuration
interface ProviderConfig {
  userId: string;
  projectId: string;
  supabase: SupabaseClient;
  operation: string;
}

/**
 * Generate video using the specified provider
 */
export async function generateVideo(
  provider: VideoProvider,
  input: VideoGenerationInput,
  config: ProviderConfig,
  onProgress?: ProgressCallback
): Promise<VideoGenerationOutput> {
  switch (provider) {
    case 'wavespeed':
      return generateWithWavespeed(input, config, onProgress);
    case 'modelslab':
      return generateWithModelslab(input, config, onProgress);
    case 'fal':
      return generateWithFal(input, config, onProgress);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Generate video with WaveSpeed
 */
async function generateWithWavespeed(
  input: VideoGenerationInput,
  config: ProviderConfig,
  onProgress?: ProgressCallback
): Promise<VideoGenerationOutput> {
  const wrapper = createWavespeedWrapper({
    userId: config.userId,
    projectId: config.projectId,
    supabase: config.supabase,
    operation: config.operation,
  });

  const model = (input.model || 'wan-2.1') as WavespeedModel;

  onProgress?.('wavespeed_submit', `Envoi à WaveSpeed (${model})...`, 10);

  // Submit video generation
  const { result, cost, taskId } = await wrapper.generateVideo({
    model,
    prompt: input.prompt,
    image_url: input.firstFrameUrl,
    image_end_url: input.lastFrameUrl,
    duration: input.duration,
    aspect_ratio: input.aspectRatio,
    audio_url: input.audioUrl,
  });

  if (!taskId) {
    throw new Error('WaveSpeed did not return a task ID');
  }

  onProgress?.('wavespeed_processing', 'Génération en cours...', 30);

  // Poll for completion
  let attempts = 0;
  const maxAttempts = 120; // 4 minutes max
  const pollInterval = 2000;

  while (attempts < maxAttempts) {
    const status = await wrapper.getTask(taskId);

    if (status.status === 'completed' && status.outputs && status.outputs.length > 0) {
      onProgress?.('wavespeed_complete', 'Vidéo générée!', 100);
      return {
        videoUrl: status.outputs[0],
        provider: 'wavespeed',
        model,
        cost,
        taskId,
      };
    }

    if (status.status === 'failed') {
      throw new Error(`WaveSpeed generation failed: ${status.error || 'Unknown error'}`);
    }

    // Update progress
    const progressPercent = 30 + Math.min(60, (attempts / maxAttempts) * 60);
    onProgress?.('wavespeed_processing', 'Génération en cours...', Math.round(progressPercent));

    await new Promise(resolve => setTimeout(resolve, pollInterval));
    attempts++;
  }

  throw new Error('WaveSpeed generation timed out');
}

/**
 * Generate video with ModelsLab
 */
async function generateWithModelslab(
  input: VideoGenerationInput,
  config: ProviderConfig,
  onProgress?: ProgressCallback
): Promise<VideoGenerationOutput> {
  const wrapper = createModelslabWrapper({
    userId: config.userId,
    projectId: config.projectId,
    supabase: config.supabase,
    operation: config.operation,
  });

  const model = input.model || 'img2video';

  onProgress?.('modelslab_submit', `Envoi à ModelsLab (${model})...`, 10);

  // ModelsLab uses num_frames instead of duration
  // ~8 fps, so duration * 8 = num_frames
  const numFrames = input.duration * 8;

  // Parse dimensions from aspect ratio
  let width = 512;
  let height = 512;
  if (input.aspectRatio === '16:9') {
    width = 768;
    height = 432;
  } else if (input.aspectRatio === '9:16') {
    width = 432;
    height = 768;
  }

  const { result, cost, taskId } = await wrapper.generateVideo({
    model: model as 'img2video' | 'text2video' | 'video2video',
    prompt: input.prompt,
    init_image: input.firstFrameUrl,
    width,
    height,
    num_frames: numFrames,
    fps: 8,
  });

  if (!taskId) {
    throw new Error('ModelsLab did not return a task ID');
  }

  onProgress?.('modelslab_processing', 'Génération en cours...', 30);

  // Poll for completion using waitForResult
  try {
    const completed = await wrapper.waitForResult(taskId, 'video', 240000); // 4 min timeout

    if (completed.output && completed.output.length > 0) {
      onProgress?.('modelslab_complete', 'Vidéo générée!', 100);
      return {
        videoUrl: completed.output[0],
        provider: 'modelslab',
        model,
        cost,
        taskId,
      };
    }

    throw new Error('ModelsLab returned no output');
  } catch (error) {
    throw new Error(`ModelsLab generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate video with fal.ai (Kling, Sora, Veo)
 */
async function generateWithFal(
  input: VideoGenerationInput,
  config: ProviderConfig,
  onProgress?: ProgressCallback
): Promise<VideoGenerationOutput> {
  const falWrapper = createFalWrapper({
    userId: config.userId,
    projectId: config.projectId,
    supabase: config.supabase,
    operation: config.operation,
  });

  const model = input.model || 'kling-omni';

  onProgress?.('fal_submit', `Envoi à fal.ai (${model})...`, 10);

  // For now, we use Kling via fal.ai (most common case)
  // Other models (sora-2, veo-3) have different APIs
  if (model === 'kling-omni' || model.startsWith('kling')) {
    const result = await generateKlingVideoFal(falWrapper, {
      prompt: input.prompt,
      imageUrl: input.firstFrameUrl,
      endImageUrl: input.lastFrameUrl,
      duration: input.duration as 5 | 10,
      aspectRatio: input.aspectRatio,
    });

    onProgress?.('fal_complete', 'Vidéo générée!', 100);

    return {
      videoUrl: result.videoUrl,
      provider: 'fal',
      model,
      cost: result.cost || 0,
    };
  }

  // For other fal.ai models, throw for now (can be extended)
  throw new Error(`fal.ai model ${model} not yet implemented in unified provider`);
}

/**
 * Check if a provider is available (API key configured)
 */
export function isProviderAvailable(provider: VideoProvider): boolean {
  switch (provider) {
    case 'wavespeed':
      return !!process.env.AI_WAVESPEED;
    case 'modelslab':
      return !!process.env.AI_MODELS_LAB;
    case 'fal':
      return !!process.env.AI_FAL_KEY;
    default:
      return false;
  }
}

/**
 * Get available providers (those with API keys configured)
 */
export function getAvailableProviders(): VideoProvider[] {
  const providers: VideoProvider[] = ['wavespeed', 'modelslab', 'fal'];
  return providers.filter(isProviderAvailable);
}

/**
 * Provider display info
 */
export const PROVIDER_INFO: Record<VideoProvider, { name: string; color: string }> = {
  wavespeed: { name: 'WaveSpeed', color: '#3B82F6' },
  modelslab: { name: 'ModelsLab', color: '#8B5CF6' },
  fal: { name: 'fal.ai', color: '#F59E0B' },
};
