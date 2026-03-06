export type PipelineStep =
  | 'brainstorming'
  | 'script'
  | 'storyboard'
  | 'library'
  | 'preprod'
  | 'production';

export interface Project {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  status: 'draft' | 'in_progress' | 'completed';
  currentStep: PipelineStep;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export const PIPELINE_STEPS: { step: PipelineStep; label: string; description: string }[] = [
  { step: 'brainstorming', label: 'Brainstorming', description: 'Idées et concepts initiaux' },
  { step: 'script', label: 'Script', description: 'Écriture du scénario' },
  { step: 'storyboard', label: 'Storyboard', description: 'Visualisation des plans' },
  { step: 'library', label: 'Bibliothèque', description: 'Personnages et décors' },
  { step: 'preprod', label: 'Préprod', description: 'Préparation des frames' },
  { step: 'production', label: 'Production', description: 'Génération vidéo' },
];
