export interface Shot {
  id: string;
  sceneId: string;
  shotNumber: number;
  description: string;
  dialogues: Dialogue[];
  actions: Action[];
  cameraAnnotation?: CameraAnnotation;
  storyboardImage?: string;
  firstFrame?: Frame;
  lastFrame?: Frame;
  generatedVideoUrl?: string;
  generationStatus: GenerationStatus;
  order: number;
}

export interface Dialogue {
  id: string;
  characterName: string;
  text: string;
  parenthetical?: string;
  order: number;
}

export interface Action {
  id: string;
  description: string;
  order: number;
}

export interface CameraAnnotation {
  angle: CameraAngle;
  movement?: CameraMovement;
  shotType: ShotType;
  notes?: string;
}

export type CameraAngle = 'eye_level' | 'low_angle' | 'high_angle' | 'dutch_angle';
export type CameraMovement = 'static' | 'pan_left' | 'pan_right' | 'dolly_in' | 'dolly_out' | 'tracking' | 'crane_up' | 'crane_down';
export type ShotType = 'wide' | 'medium' | 'close_up' | 'extreme_close_up' | 'over_shoulder' | 'two_shot';

export interface Frame {
  id: string;
  imageUrl?: string;
  prompt?: string;
  validated: boolean;
}

export type GenerationStatus =
  | 'not_started'
  | 'pending'
  | 'generating'
  | 'completed'
  | 'failed';

export const CAMERA_ANGLES: { value: CameraAngle; label: string }[] = [
  { value: 'eye_level', label: 'Niveau des yeux' },
  { value: 'low_angle', label: 'Contre-plongée' },
  { value: 'high_angle', label: 'Plongée' },
  { value: 'dutch_angle', label: 'Angle hollandais' },
];

export const CAMERA_MOVEMENTS: { value: CameraMovement; label: string }[] = [
  { value: 'static', label: 'Statique' },
  { value: 'pan_left', label: 'Panoramique gauche' },
  { value: 'pan_right', label: 'Panoramique droite' },
  { value: 'dolly_in', label: 'Travelling avant' },
  { value: 'dolly_out', label: 'Travelling arrière' },
  { value: 'tracking', label: 'Tracking' },
  { value: 'crane_up', label: 'Grue montante' },
  { value: 'crane_down', label: 'Grue descendante' },
];

export const SHOT_TYPES: { value: ShotType; label: string }[] = [
  { value: 'wide', label: 'Plan large' },
  { value: 'medium', label: 'Plan moyen' },
  { value: 'close_up', label: 'Gros plan' },
  { value: 'extreme_close_up', label: 'Très gros plan' },
  { value: 'over_shoulder', label: 'Par-dessus l\'épaule' },
  { value: 'two_shot', label: 'Plan à deux' },
];
