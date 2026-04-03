/**
 * Editly Types for Video Assembly
 *
 * Based on the Editly JSON spec: https://github.com/mifi/editly
 */

// Transition types supported by Editly
export type EditlyTransition =
  | 'fade'
  | 'fadeblack'
  | 'fadewhite'
  | 'fadegreylight'
  | 'fadegreydark'
  | 'directional-left'
  | 'directional-right'
  | 'directional-up'
  | 'directional-down'
  | 'random'
  | 'dummy';

// Map our transition types to Editly's supported transitions
export const TRANSITION_MAP: Record<string, EditlyTransition> = {
  // Basic
  dissolve: 'fade',
  fade: 'fade',
  // Fade to/from color
  fadeblack: 'fadeblack',
  fadewhite: 'fadewhite',
  // Slide
  slideleft: 'directional-left',
  slideright: 'directional-right',
  slideup: 'directional-up',
  slidedown: 'directional-down',
  // Default fallback for unsupported transitions
  crosszoom: 'fade',
  zoomin: 'fade',
  zoomout: 'fade',
  directionalwipe: 'directional-right',
  circleopen: 'fade',
  circleclose: 'fade',
  radial: 'fade',
  cube: 'fade',
};

// Layer types for Editly clips
export type EditlyLayerType =
  | 'video'
  | 'audio'
  | 'image'
  | 'title'
  | 'subtitle'
  | 'news-title'
  | 'fill-color'
  | 'pause'
  | 'rainbow-colors';

// Video layer
export interface EditlyVideoLayer {
  type: 'video';
  path: string;
  cutFrom?: number;
  cutTo?: number;
  resizeMode?: 'contain' | 'cover' | 'stretch';
  width?: number;
  height?: number;
  left?: number;
  top?: number;
  mixVolume?: number | string | [number, number];
}

// Audio layer
export interface EditlyAudioLayer {
  type: 'audio';
  path: string;
  cutFrom?: number;
  cutTo?: number;
  mixVolume?: number | string | [number, number];
  start?: number;
}

// Image layer with Ken Burns effect
export interface EditlyImageLayer {
  type: 'image';
  path: string;
  duration?: number;
  resizeMode?: 'contain' | 'cover' | 'stretch';
  zoomDirection?: 'in' | 'out' | 'left' | 'right';
  zoomAmount?: number;
}

// Title layer
export interface EditlyTitleLayer {
  type: 'title';
  text: string;
  textColor?: string;
  fontPath?: string;
  fontSize?: number;
  position?: 'top' | 'bottom' | 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

// Subtitle layer
export interface EditlySubtitleLayer {
  type: 'subtitle';
  text: string;
  textColor?: string;
  backgroundColor?: string;
}

// Union of all layer types
export type EditlyLayer =
  | EditlyVideoLayer
  | EditlyAudioLayer
  | EditlyImageLayer
  | EditlyTitleLayer
  | EditlySubtitleLayer;

// Clip configuration
export interface EditlyClip {
  duration?: number;
  layers: EditlyLayer[];
  transition?: {
    name: EditlyTransition;
    duration?: number;
    audioOutCurve?: string;
    audioInCurve?: string;
  };
}

// Audio track for background music
export interface EditlyAudioTrack {
  path: string;
  mixVolume?: number | string | [number, number];
  cutFrom?: number;
  cutTo?: number;
  start?: number;
}

// Full Editly spec
export interface EditlySpec {
  outPath: string;
  width?: number;
  height?: number;
  fps?: number;
  defaults?: {
    duration?: number;
    transition?: {
      name?: EditlyTransition;
      duration?: number;
    };
    layer?: Partial<EditlyLayer>;
  };
  clips: EditlyClip[];
  audioNorm?: {
    enable?: boolean;
    gaussSize?: number;
    maxGain?: number;
  };
  clipsAudioVolume?: number | string;
  audioTracks?: EditlyAudioTrack[];
  loopAudio?: boolean;
  keepSourceAudio?: boolean;
  allowRemoteRequests?: boolean;
  ffmpegPath?: string;
  ffprobePath?: string;
  enableFfmpegLog?: boolean;
  verbose?: boolean;
  fast?: boolean;
}

// Input types for our spec builder
export interface SequenceClip {
  videoUrl: string;
  duration: number;
}

export interface SequenceInput {
  id: string;
  title: string | null;
  clips: SequenceClip[];
  transition_in: string | null;
  transition_out: string | null;
  transition_duration: number;
}

export interface ShortMusicInput {
  audioUrl: string;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export interface AssemblyInput {
  sequences: SequenceInput[];
  music?: ShortMusicInput;
  outputPath: string;
  width?: number;
  height?: number;
  fps?: number;
}
