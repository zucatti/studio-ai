/**
 * BullMQ Job Types
 * Shared between Next.js API routes and worker processes
 */

// Base job data that all jobs share
export interface BaseJobData {
  userId: string;
  jobId: string; // generation_jobs.id in Supabase
  createdAt: string;
}

// Video generation job data
export interface VideoGenJobData extends BaseJobData {
  type: 'video-gen';
  projectId: string;
  shotId: string;
  shotNumber: number;
  model: VideoModel;
  provider: VideoProvider;
  duration: number;
  aspectRatio: AspectRatio;
  prompt: string;
  firstFrameUrl?: string;  // Optional for text-to-video (Kling Omni)
  lastFrameUrl?: string;
  characterReferenceImages?: string[];
  // Dialogue settings
  hasDialogue: boolean;
  dialogueText?: string;
  dialogueCharacterId?: string;
  dialogueAudioUrl?: string;
  // Music settings
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
    voiceId: string;  // fal_voice_id for Kling
  }>;
  // Seedance audio references (@Audio1, @Audio2)
  cinematicAudios?: Array<{
    characterId: string;
    audioUrl: string;  // Pre-rendered dialogue audio
  }>;
  // Dry run mode - generate prompt but don't execute
  dryRun?: boolean;
  // Preview mode - don't update shot with generated video, just return URL
  isPreview?: boolean;
}

// Image generation job data (character refs, etc.)
export interface ImageGenJobData extends BaseJobData {
  type: 'image-gen';
  assetId: string;
  assetType: 'character' | 'location' | 'prop';
  assetName: string;
  // Generation mode
  mode: 'generate_single' | 'generate_all' | 'generate_variations' | 'generate_look';
  imageType?: 'front' | 'profile' | 'back' | 'three_quarter' | 'custom';
  // Prompt (already optimized by API route)
  prompt: string;
  fullPrompt: string; // With style prefix/suffix
  // Style config
  style: string;
  styleConfig: {
    promptPrefix: string;
    promptSuffix: string;
    renderingSpeed: 'TURBO' | 'BALANCED' | 'QUALITY';
    ideogramStyle: 'AUTO' | 'REALISTIC' | 'FICTION';
    resolution: '1K' | '2K' | '4K';
  };
  // Model config
  model: string;
  falEndpoint: string;
  // Reference images (for variations or character consistency)
  frontReferenceUrl?: string;
  sourceImageUrl?: string;
  inspirationImageUrls?: string[]; // For image-to-image generation (locations)
  // For generate_look
  lookId?: string;
  lookName?: string;
  lookDescription?: string;
  // Generation options
  aspectRatio?: string;
  resolution?: string;
  negativePrompt?: string;
}

// Audio generation job data (TTS + optional merge with video)
export interface AudioGenJobData extends BaseJobData {
  type: 'audio-gen';
  projectId: string;
  shotId: string;
  voiceId: string;
  text: string;
  modelId?: string;
  // For merging dialogue with video
  videoUrl?: string; // b2:// URL of the video to merge with
  mergeWithVideo?: boolean; // If true, merge generated audio with video
}

// FFmpeg processing job data
export interface FFmpegJobData extends BaseJobData {
  type: 'ffmpeg';
  operation: FFmpegOperation;
  projectId: string;
  // For assembly
  shortId?: string;
  shotIds?: string[];
  // For sequence assembly
  sequenceId?: string;
  planHash?: string;
  // For music overlay
  shotId?: string;
  videoUrl?: string;
  audioUrl?: string;
  audioStart?: number;
  audioEnd?: number;
  volume?: number;
  // For montage render
  montageData?: {
    aspectRatio: string;
    duration: number;
    tracks: Array<{
      id: string;
      type: 'video' | 'audio' | 'text';
      name: string;
      muted: boolean;
    }>;
    clips: Array<{
      id: string;
      type: 'video' | 'image' | 'audio' | 'text';
      trackId: string;
      start: number;
      duration: number;
      sourceStart?: number;
      sourceEnd?: number;
      assetUrl: string;
      name: string;
    }>;
  };
}

// Reference image with metadata for character/location consistency
export interface ReferenceImageData {
  url: string;           // Signed HTTPS URL
  label: string;         // e.g., "@Morgana", "#Castle", "!MedievalDress"
  type: 'character' | 'location' | 'prop' | 'look';
  description?: string;  // Visual description for context
}

// Quick-shot generation job data (frame generation for shots)
export interface QuickShotGenJobData extends BaseJobData {
  type: 'quick-shot-gen';
  projectId: string;
  shotId?: string; // Optional - if updating an existing shot
  storyboardFrameId?: string; // Optional - if updating a storyboard frame
  // Generation parameters
  prompt: string;
  aspectRatio: AspectRatio;
  resolution: '1K' | '2K' | '4K';
  // Model to use (optional - if not provided, auto-selects based on references)
  model?: 'fal-ai/nano-banana-2' | 'seedream-5' | 'kling-o1';
  // Reference images with metadata for consistency
  referenceImages: ReferenceImageData[];
  // Style prefix for storyboard frames (pencil sketch)
  stylePrefix?: string;
}

// Union type for all job data
export type JobData =
  | VideoGenJobData
  | ImageGenJobData
  | AudioGenJobData
  | FFmpegJobData
  | QuickShotGenJobData
  | EditlyJobData
  | MontageRenderJobData;

// Video models supported
export type VideoModel =
  // fal.ai models
  | 'kling-omni'
  | 'veo-3'
  | 'seedance-2'
  | 'seedance-2-fast'
  | 'grok-480p'
  | 'grok-720p'
  | 'omnihuman'
  // Runway models
  | 'gen4'
  | 'gen4.5'
  // Allow any string for flexibility
  | (string & {});

// Video providers
export type VideoProvider = 'fal' | 'runway';

// Aspect ratios
export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5' | '2:3' | '21:9';

// FFmpeg operations
export type FFmpegOperation = 'assemble' | 'assemble-sequence' | 'music-overlay' | 'extract-frame' | 'montage-render';

// Editly video assembly job data
export interface EditlyJobData extends BaseJobData {
  type: 'editly';
  operation: 'assemble-short';
  projectId: string;
  shortId: string;
  // Sequences with their plans
  sequences: Array<{
    id: string;
    title: string | null;
    sort_order: number;
    transition_in: string | null;
    transition_out: string | null;
    transition_duration: number;
    plans: Array<{
      id: string;
      video_url: string;
      duration: number;
      sort_order: number;
    }>;
  }>;
  // Optional background music
  music?: {
    asset_url: string;
    volume: number;
    fade_in: number;
    fade_out: number;
  };
}

// Montage timeline render job data
export interface MontageRenderJobData extends BaseJobData {
  type: 'montage-render';
  projectId: string;
  shortId: string;
  aspectRatio: string;
  duration: number;
  // Tracks and clips from the timeline
  tracks: Array<{
    id: string;
    type: 'video' | 'audio' | 'text';
    name: string;
    muted: boolean;
  }>;
  clips: Array<{
    id: string;
    type: 'video' | 'image' | 'audio' | 'text';
    trackId: string;
    start: number;
    duration: number;
    sourceStart?: number;
    sourceEnd?: number;
    assetUrl: string;
    name: string;
    // For text clips
    text?: string;
    fontSize?: number;
    fontColor?: string;
  }>;
}

// Queue names
export const QUEUE_NAMES = {
  VIDEO_GEN: 'video-gen',
  IMAGE_GEN: 'image-gen',
  AUDIO_GEN: 'audio-gen',
  FFMPEG: 'ffmpeg',
  QUICK_SHOT_GEN: 'quick-shot-gen',
  EDITLY: 'editly',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// Queue configuration
export const QUEUE_CONFIG: Record<QueueName, { concurrency: number; timeout: number }> = {
  [QUEUE_NAMES.VIDEO_GEN]: { concurrency: 3, timeout: 420000 }, // 7 min
  [QUEUE_NAMES.IMAGE_GEN]: { concurrency: 5, timeout: 90000 }, // 90s
  [QUEUE_NAMES.AUDIO_GEN]: { concurrency: 5, timeout: 30000 }, // 30s
  [QUEUE_NAMES.FFMPEG]: { concurrency: 2, timeout: 120000 }, // 2 min
  [QUEUE_NAMES.QUICK_SHOT_GEN]: { concurrency: 4, timeout: 120000 }, // 2 min
  [QUEUE_NAMES.EDITLY]: { concurrency: 1, timeout: 300000 }, // 5 min (memory intensive)
};

// Job result types
export interface VideoGenResult {
  videoUrl: string;
  duration: number;
  model: string;
  cost?: number;
  hasMusic?: boolean;
}

export interface ImageGenResult {
  imageUrl: string;
  imageType: string;
  cost?: number;
}

export interface AudioGenResult {
  audioUrl: string;
  duration: number;
  cost?: number;
}

export interface FFmpegResult {
  outputUrl: string;
  duration?: number;
}

export interface QuickShotGenResult {
  imageUrl: string;
  shotId?: string;
  cost?: number;
}

// Job status in Supabase
export type JobStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

// Progress update callback
export type ProgressCallback = (progress: number, message: string) => Promise<void>;
