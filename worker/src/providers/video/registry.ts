/**
 * Video Provider Registry
 * Central management of all video generation providers
 */

import type { VideoProvider, VideoProviderRegistry, VideoModel } from './types.js';
import { FalProvider } from './fal.js';
import { WaveSpeedProvider } from './wavespeed.js';

class VideoProviderRegistryImpl implements VideoProviderRegistry {
  private providers: Map<string, VideoProvider> = new Map();

  constructor() {
    // Register all providers
    this.register(new FalProvider());
    this.register(new WaveSpeedProvider());
  }

  private register(provider: VideoProvider): void {
    this.providers.set(provider.name, provider);
  }

  getProvider(name: string): VideoProvider | undefined {
    return this.providers.get(name);
  }

  getProviderForModel(model: string): VideoProvider | undefined {
    for (const provider of this.providers.values()) {
      if (provider.supportsModel(model)) {
        return provider;
      }
    }
    return undefined;
  }

  getAllProviders(): VideoProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get the default provider and model based on content type
   * - With dialogue: OmniHuman via fal.ai (real talking head quality)
   * - Without dialogue: Kling O3 Pro via WaveSpeed (best video quality)
   */
  getDefaultProvider(hasDialogue: boolean): { provider: VideoProvider; model: string } {
    if (hasDialogue) {
      const fal = this.getProvider('fal');
      if (fal) {
        return { provider: fal, model: 'omnihuman' };
      }
    }

    // Default: WaveSpeed Kling O3 Pro for best video quality
    const wavespeed = this.getProvider('wavespeed');
    if (wavespeed) {
      return { provider: wavespeed, model: 'kwaivgi/kling-video-o3-pro/image-to-video' };
    }

    // Fallback to fal.ai
    const fal = this.getProvider('fal');
    if (fal) {
      return { provider: fal, model: 'kling-omni' };
    }

    throw new Error('No video providers available');
  }

  /**
   * Get all available models across all providers
   */
  getAllModels(): VideoModel[] {
    const models: VideoModel[] = [];
    for (const provider of this.providers.values()) {
      models.push(...provider.getSupportedModels());
    }
    return models;
  }

  /**
   * Find the best model for a given use case
   */
  getBestModel(options: {
    hasDialogue?: boolean;
    needsEndFrame?: boolean;
    preferredProvider?: string;
  }): { provider: VideoProvider; model: VideoModel } | undefined {
    const { hasDialogue, needsEndFrame, preferredProvider } = options;

    // If preferred provider specified, try that first
    if (preferredProvider) {
      const provider = this.getProvider(preferredProvider);
      if (provider) {
        const models = provider.getSupportedModels();
        const model = models.find(m => {
          if (hasDialogue && !m.supportsDialogue) return false;
          if (needsEndFrame && !m.supportsEndFrame) return false;
          return true;
        });
        if (model) {
          return { provider, model };
        }
      }
    }

    // Search all providers for the best match
    for (const provider of this.providers.values()) {
      const models = provider.getSupportedModels();
      for (const model of models) {
        if (hasDialogue && model.defaultForDialogue) {
          return { provider, model };
        }
        if (!hasDialogue && model.defaultForVideo) {
          return { provider, model };
        }
      }
    }

    // Fallback to default
    const defaultChoice = this.getDefaultProvider(hasDialogue || false);
    const model = defaultChoice.provider.getSupportedModels().find(m => m.id === defaultChoice.model);
    if (model) {
      return { provider: defaultChoice.provider, model };
    }

    return undefined;
  }
}

// Singleton instance
export const videoProviders = new VideoProviderRegistryImpl();
