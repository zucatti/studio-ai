export type PipelineStep =
  | 'brainstorming'
  | 'script'
  | 'decoupage'
  | 'storyboard'
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
  { step: 'brainstorming', label: 'Brainstorming', description: 'Idees et concepts initiaux' },
  { step: 'script', label: 'Script', description: 'Scenario complet avec dialogues' },
  { step: 'decoupage', label: 'Decoupage', description: 'Decomposition technique en plans' },
  { step: 'storyboard', label: 'Storyboard', description: 'Visualisation des plans' },
  { step: 'preprod', label: 'Preprod', description: 'Preparation des frames' },
  { step: 'production', label: 'Production', description: 'Generation video' },
];
