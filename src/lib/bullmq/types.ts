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
  firstFrameUrl: string;
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
  // For music overlay
  shotId?: string;
  videoUrl?: string;
  audioUrl?: string;
  audioStart?: number;
  audioEnd?: number;
  volume?: number;
}

// Union type for all job data
export type JobData =
  | VideoGenJobData
  | ImageGenJobData
  | AudioGenJobData
  | FFmpegJobData;

// Video models supported
// Includes fal.ai short names and WaveSpeed full paths
export type VideoModel =
  // fal.ai models (short names)
  | 'kling-omni'
  | 'sora-2'
  | 'veo-3'
  | 'omnihuman'
  | 'wan-2.1'
  | 'wan-2.6'
  // WaveSpeed models (full paths)
  | 'kwaivgi/kling-video-o3-pro/image-to-video'
  | 'kwaivgi/kling-v3.0-pro/image-to-video'
  | 'google/veo3.1/image-to-video'
  | 'bytedance/seedance-v1.5-pro/image-to-video'
  | 'alibaba/wan-2.6/image-to-video'
  | 'bytedance/avatar-omni-human-1.5'
  // Allow any string for flexibility
  | (string & {});

// Video providers
export type VideoProvider = 'fal' | 'wavespeed' | 'modelslab';

// Aspect ratios
export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5' | '2:3' | '21:9';

// FFmpeg operations
export type FFmpegOperation = 'assemble' | 'music-overlay' | 'extract-frame';

// Queue names
export const QUEUE_NAMES = {
  VIDEO_GEN: 'video-gen',
  IMAGE_GEN: 'image-gen',
  AUDIO_GEN: 'audio-gen',
  FFMPEG: 'ffmpeg',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// Queue configuration
export const QUEUE_CONFIG: Record<QueueName, { concurrency: number; timeout: number }> = {
  [QUEUE_NAMES.VIDEO_GEN]: { concurrency: 3, timeout: 420000 }, // 7 min (WaveSpeed can take up to 6 min)
  [QUEUE_NAMES.IMAGE_GEN]: { concurrency: 5, timeout: 90000 }, // 90s
  [QUEUE_NAMES.AUDIO_GEN]: { concurrency: 5, timeout: 30000 }, // 30s
  [QUEUE_NAMES.FFMPEG]: { concurrency: 2, timeout: 120000 }, // 2 min
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

// Job status in Supabase
export type JobStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

// Progress update callback
export type ProgressCallback = (progress: number, message: string) => Promise<void>;
