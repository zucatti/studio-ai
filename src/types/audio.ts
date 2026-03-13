// Audio Timeline Types

export type ProjectType = 'film' | 'music_video' | 'commercial' | 'short' | 'other';
export type AudioAssetType = 'music' | 'voice' | 'sfx' | 'ambiance' | 'dialogue';

export interface AudioAsset {
  id: string;
  project_id: string;
  name: string;
  type: AudioAssetType;
  file_url: string;
  duration: number; // seconds
  waveform_data: number[] | null; // peaks array for visualization
  is_master: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface VocalSegment {
  id: string;
  audio_asset_id: string;
  start_time: number; // seconds
  end_time: number; // seconds
  confidence: number | null; // 0-1, null if manual
  lyrics: string | null;
  character_id: string | null;
  created_at: string;
}

export interface ShotAudio {
  id: string;
  shot_id: string;
  audio_asset_id: string;
  start_time: number; // seconds
  end_time: number; // seconds
  created_at: string;
}

// Extended Shot with audio info
export interface ShotWithAudio {
  id: string;
  scene_id: string;
  shot_number: number;
  description: string;
  shot_type: string;
  camera_angle: string;
  camera_movement: string;
  // Timeline
  start_time: number | null;
  end_time: number | null;
  // Lip sync
  has_vocals: boolean;
  lip_sync_enabled: boolean;
  singing_character_id: string | null;
  // Audio assignment
  audio?: ShotAudio;
}

// Extended Scene with timeline
export interface SceneWithTimeline {
  id: string;
  project_id: string;
  scene_number: number;
  int_ext: string;
  location: string;
  time_of_day: string;
  description: string | null;
  // Timeline
  start_time: number | null;
  end_time: number | null;
  // Nested
  shots?: ShotWithAudio[];
}

// Waveform data structure for UI
export interface WaveformData {
  peaks: number[]; // Normalized peaks 0-1
  duration: number; // Total duration in seconds
  sampleRate: number;
  samplesPerPeak: number;
}

// Timeline marker for UI (used by WaveformTimeline component)
export interface TimelineMarker {
  id: string;
  start: number;
  end: number;
  color?: string;
  label?: string;
  type?: 'scene' | 'shot' | 'vocal' | 'selection' | 'beat';
}

// Selection range for UI
export interface TimelineSelection {
  start: number;
  end: number;
}
