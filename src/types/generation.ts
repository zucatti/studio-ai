export interface GenerationJob {
  id: string;
  shotId: string;
  projectId: string;
  status: GenerationJobStatus;
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  outputUrl?: string;
}

export type GenerationJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface GenerationSettings {
  model: string;
  duration: number;
  fps: number;
  resolution: VideoResolution;
  style?: string;
}

export type VideoResolution = '720p' | '1080p' | '4k';

export const VIDEO_RESOLUTIONS: { value: VideoResolution; label: string }[] = [
  { value: '720p', label: '720p (HD)' },
  { value: '1080p', label: '1080p (Full HD)' },
  { value: '4k', label: '4K (Ultra HD)' },
];
