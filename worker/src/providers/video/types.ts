/**
 * Video Provider Abstraction Types
 */

export type AspectRatio = '16:9' | '9:16' | '1:1';

export interface VideoGenerationRequest {
  // Required
  prompt: string;
  duration: number; // seconds
  aspectRatio: AspectRatio;

  // Starting frame (optional for text-to-video)
  firstFrameUrl?: string;

  // Optional
  lastFrameUrl?: string;
  characterReferenceImages?: string[];

  // For talking head / dialogue videos
  hasDialogue?: boolean;
  dialogueAudioUrl?: string;

  // For audio overlay
  audioMode?: 'mute' | 'none' | 'dialogue' | 'audio' | 'instrumental' | 'vocal';
  audioUrl?: string;
  audioStart?: number;
  audioEnd?: number;

  // For cancellation support
  jobId?: string;

  // Cinematic mode (Kling Omni elements + voices)
  isCinematicMode?: boolean;
  cinematicElements?: Array<{
    characterId: string;
    characterName: string;
    frontalImageUrl: string;
    referenceImageUrls?: string[];
  }>;
  cinematicVoices?: Array<{
    characterId: string;
    voiceId: string;  // fal_voice_id
  }>;
}

export interface VideoGenerationResult {
  videoUrl: string;
  duration: number;
  cost?: number;
  hasAudio?: boolean;
}

export type ProgressCallback = (progress: number, message: string) => Promise<void>;

export interface VideoProvider {
  readonly name: string;
  readonly displayName: string;

  /**
   * Check if this provider supports the given model
   */
  supportsModel(model: string): boolean;

  /**
   * Get the list of supported models
   */
  getSupportedModels(): VideoModel[];

  /**
   * Generate a video
   */
  generate(
    model: string,
    request: VideoGenerationRequest,
    onProgress?: ProgressCallback
  ): Promise<VideoGenerationResult>;
}

export interface VideoModel {
  id: string;
  name: string;
  description: string;
  maxDuration: number;
  minDuration: number;
  supportsEndFrame: boolean;
  supportsDialogue: boolean;
  supportsAudio: boolean;
  supportsTextToVideo?: boolean; // Can generate without starting frame
  defaultForDialogue?: boolean;
  defaultForVideo?: boolean;
}

/**
 * Provider registry
 */
export interface VideoProviderRegistry {
  getProvider(name: string): VideoProvider | undefined;
  getProviderForModel(model: string): VideoProvider | undefined;
  getAllProviders(): VideoProvider[];
  getDefaultProvider(hasDialogue: boolean): { provider: VideoProvider; model: string };
}
