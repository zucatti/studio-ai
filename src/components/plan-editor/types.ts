import type { AspectRatio, ShotType, CameraAngle, CameraMovement } from '@/types/database';

/**
 * Mode du PlanEditor:
 * - 'image': QuickShot - génère une image, pas de Frame Out, pas de durée
 * - 'video-fixed': Music Video - durée fixe (vient de la timeline), pas de dialogue
 * - 'video-free': Short/Film - durée éditable, dialogue possible
 */
export type PlanEditorMode = 'image' | 'video-fixed' | 'video-free';

/**
 * Données génériques d'un plan
 * Compatible avec Shot (clip) et Plan (shorts)
 */
export interface PlanData {
  id: string;

  // Identifiant visuel (numéro du plan)
  number?: number;

  // Durée du plan en secondes
  duration: number;

  // Images
  storyboard_image_url?: string | null;
  first_frame_url?: string | null;
  last_frame_url?: string | null;

  // Prompt d'animation
  animation_prompt?: string | null;
  description?: string | null; // Fallback legacy

  // Paramètres caméra (optionnels)
  shot_type?: ShotType | null;
  camera_angle?: CameraAngle | null;
  camera_movement?: CameraMovement | null;

  // Dialogue (optionnel)
  has_dialogue?: boolean;
  dialogue_text?: string | null;
  dialogue_character_id?: string | null;

  // Audio (optionnel)
  audio_mode?: 'mute' | 'dialogue' | 'audio' | 'instrumental' | 'vocal';
  audio_asset_id?: string | null;
  audio_start?: number;
  audio_end?: number | null;

  // Vidéo générée (optionnel)
  generated_video_url?: string | null;
}

/**
 * Options de génération vidéo
 */
export interface VideoGenerationOptions {
  videoModel: string;
  duration: number;
  videoProvider: 'wavespeed' | 'modelslab' | 'fal';
}

/**
 * Progression de génération vidéo
 */
export interface VideoGenerationProgress {
  planId: string;
  progress: number;
  step: string;
  message: string;
  status: 'generating' | 'completed' | 'error' | 'failed';
}

/**
 * Props du composant PlanEditor
 */
export interface PlanEditorProps {
  // Mode de fonctionnement
  mode: PlanEditorMode;

  // Données du plan
  plan: PlanData;

  // Plan précédent (pour lier Frame In)
  previousPlan?: PlanData | null;

  // Contexte projet
  projectId: string;
  aspectRatio: AspectRatio;

  // Callbacks
  onUpdate: (updates: Partial<PlanData>) => void;
  onClose?: () => void;

  // Génération vidéo (modes video-*)
  onGenerateVideo?: (planId: string, options: VideoGenerationOptions) => Promise<void>;
  isGeneratingVideo?: boolean;
  videoGenerationProgress?: VideoGenerationProgress | null;

  // Génération image (mode image)
  onGenerateImage?: (planId: string) => Promise<void>;
  isGeneratingImage?: boolean;
}

/**
 * Configuration par mode
 */
export const MODE_CONFIG: Record<PlanEditorMode, {
  showFrameOut: boolean;
  showDuration: boolean;
  durationEditable: boolean;
  showDialogue: boolean;
  showCameraSettings: boolean;
  showAudioMode: boolean;
  showVideoGeneration: boolean;
  generateLabel: string;
}> = {
  'image': {
    showFrameOut: false,
    showDuration: false,
    durationEditable: false,
    showDialogue: false,
    showCameraSettings: true,
    showAudioMode: false,
    showVideoGeneration: false,
    generateLabel: 'Générer image',
  },
  'video-fixed': {
    showFrameOut: true,
    showDuration: true,
    durationEditable: false,
    showDialogue: false,
    showCameraSettings: true,
    showAudioMode: false, // Audio vient de la timeline
    showVideoGeneration: true,
    generateLabel: 'Générer vidéo',
  },
  'video-free': {
    showFrameOut: true,
    showDuration: true,
    durationEditable: true,
    showDialogue: true,
    showCameraSettings: true,
    showAudioMode: true,
    showVideoGeneration: true,
    generateLabel: 'Générer vidéo',
  },
};

/**
 * Configuration des ratios d'aspect
 */
export const ASPECT_RATIO_CONFIG: Record<AspectRatio, {
  width: number;
  height: number;
  label: string;
  isPortrait: boolean;
}> = {
  '9:16': { width: 9, height: 16, label: 'Vertical', isPortrait: true },
  '16:9': { width: 16, height: 9, label: 'Horizontal', isPortrait: false },
  '1:1': { width: 1, height: 1, label: 'Carré', isPortrait: false },
  '4:5': { width: 4, height: 5, label: 'Portrait', isPortrait: true },
  '2:3': { width: 2, height: 3, label: 'Photo', isPortrait: true },
  '21:9': { width: 21, height: 9, label: 'Cinéma', isPortrait: false },
};
