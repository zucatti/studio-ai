/**
 * Unified Video Provider Abstraction
 *
 * Routes video generation requests to different providers:
 * - fal.ai (Kling, Sora, Veo, OmniHuman)
 * - Runway ML (Gen-4, Gen-4.5)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { createFalWrapper, generateKlingVideoFal } from './fal-wrapper';

// Supported video providers
export type VideoProvider = 'fal' | 'runway';

// Provider-specific model mappings (2026 catalog)
export const VIDEO_PROVIDER_MODELS: Record<VideoProvider, { value: string; label: string; duration: number[] }[]> = {
  fal: [
    { value: 'kling-omni', label: 'Kling 3.0 Omni', duration: [5, 10, 15] },
    { value: 'seedance-2', label: 'Seedance 2.0', duration: [5, 10, 12] },
    { value: 'seedance-2-fast', label: 'Seedance 2.0 Fast', duration: [5, 10, 12] },
    { value: 'veo-3', label: 'Veo 3.1', duration: [4, 6, 8] },
    { value: 'omnihuman', label: 'OmniHuman 1.5', duration: [5, 10] },
  ],
  runway: [
    { value: 'gen4', label: 'Gen-4 Turbo', duration: [5, 10] },
    { value: 'gen4.5', label: 'Gen-4.5', duration: [5, 10] },
  ],
};

// Models specifically for dialogue (require audio)
// OmniHuman 1.5 via fal.ai is the only quality option
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

// Default models per provider
export const DEFAULT_PROVIDER_MODEL: Record<VideoProvider, string> = {
  fal: 'kling-omni',
  runway: 'gen4',
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
    case 'fal':
      return generateWithFal(input, config, onProgress);
    case 'runway':
      throw new Error('Runway video generation should use runway-wrapper directly');
    default:
      throw new Error(`Unknown provider: ${provider}`);
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
    case 'fal':
      return !!process.env.AI_FAL_KEY;
    case 'runway':
      return !!process.env.AI_RUNWAY_ML;
    default:
      return false;
  }
}

/**
 * Get available providers (those with API keys configured)
 */
export function getAvailableProviders(): VideoProvider[] {
  const providers: VideoProvider[] = ['fal', 'runway'];
  return providers.filter(isProviderAvailable);
}

/**
 * Provider display info
 */
export const PROVIDER_INFO: Record<VideoProvider, { name: string; color: string }> = {
  fal: { name: 'fal.ai', color: '#F59E0B' },
  runway: { name: 'Runway ML', color: '#EC4899' },
};
