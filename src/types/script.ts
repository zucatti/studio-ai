// ============================================================================
// Script Types - Structured screenplay elements
// ============================================================================

export type ScriptElementType = 'action' | 'dialogue' | 'transition' | 'note';

export type DialogueExtension = 'V.O.' | 'O.S.' | "CONT'D" | 'FILTERED' | 'PRE-LAP';

export interface ScriptElement {
  id: string;
  scene_id: string;
  type: ScriptElementType;
  content: string;
  // For dialogues
  character_id?: string | null;
  character_name?: string | null;
  parenthetical?: string | null;
  extension?: DialogueExtension | null;
  // Ordering
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// Insert/Update types
export interface ScriptElementInsert {
  scene_id: string;
  type: ScriptElementType;
  content?: string;
  character_id?: string | null;
  character_name?: string | null;
  parenthetical?: string | null;
  extension?: DialogueExtension | null;
  sort_order?: number;
}

export interface ScriptElementUpdate {
  type?: ScriptElementType;
  content?: string;
  character_id?: string | null;
  character_name?: string | null;
  parenthetical?: string | null;
  extension?: DialogueExtension | null;
  sort_order?: number;
}

// Standard US transitions
export const TRANSITIONS_US = [
  'CUT TO:',
  'DISSOLVE TO:',
  'FADE IN:',
  'FADE OUT.',
  'FADE TO BLACK.',
  'SMASH CUT TO:',
  'MATCH CUT TO:',
  'JUMP CUT TO:',
  'WIPE TO:',
  'IRIS IN:',
  'IRIS OUT:',
  'TIME CUT:',
  'FLASHBACK:',
  'END FLASHBACK.',
  'INTERCUT WITH:',
  'BACK TO:',
  'CONTINUOUS:',
  'LATER:',
  'MOMENTS LATER:',
] as const;

// French transitions
export const TRANSITIONS_FR = [
  'COUPE FRANCHE',
  'FONDU ENCHAINE',
  'OUVERTURE AU NOIR',
  'FERMETURE AU NOIR',
  'FONDU AU NOIR',
  'COUPE BRUSQUE',
  'RACCORD MOUVEMENT',
  'JUMP CUT',
  'VOLET',
  'IRIS OUVERTURE',
  'IRIS FERMETURE',
  'ELLIPSE',
  'FLASH-BACK',
  'FIN FLASH-BACK',
  'MONTAGE PARALLELE',
  'RETOUR A',
  'CONTINU',
  'PLUS TARD',
  'PEU APRES',
] as const;

export type TransitionUS = typeof TRANSITIONS_US[number];
export type TransitionFR = typeof TRANSITIONS_FR[number];
export type Transition = TransitionUS | TransitionFR;

// Dialogue extension labels
export const DIALOGUE_EXTENSIONS: { value: DialogueExtension; label: string; description: string }[] = [
  { value: 'V.O.', label: 'V.O.', description: 'Voice Over - personnage narrateur' },
  { value: 'O.S.', label: 'O.S.', description: 'Off Screen - hors champ' },
  { value: "CONT'D", label: "CONT'D", description: 'Continued - dialogue qui continue' },
  { value: 'FILTERED', label: 'FILTERED', description: 'Voix modifiee (telephone, radio)' },
  { value: 'PRE-LAP', label: 'PRE-LAP', description: 'Audio avant la scene visuelle' },
];

// Helper to check if a string is a valid transition
export function isTransition(text: string): boolean {
  const normalizedText = text.trim().toUpperCase();
  return (
    TRANSITIONS_US.some(t => t.toUpperCase() === normalizedText) ||
    TRANSITIONS_FR.some(t => t.toUpperCase() === normalizedText)
  );
}

// Helper to format element type label
export function getElementTypeLabel(type: ScriptElementType): string {
  switch (type) {
    case 'action':
      return 'Action';
    case 'dialogue':
      return 'Dialogue';
    case 'transition':
      return 'Transition';
    case 'note':
      return 'Note';
    default:
      return type;
  }
}

// Helper to get element type color
export function getElementTypeColor(type: ScriptElementType): string {
  switch (type) {
    case 'action':
      return 'text-green-400 bg-green-500/20';
    case 'dialogue':
      return 'text-blue-400 bg-blue-500/20';
    case 'transition':
      return 'text-purple-400 bg-purple-500/20';
    case 'note':
      return 'text-yellow-400 bg-yellow-500/20';
    default:
      return 'text-slate-400 bg-slate-500/20';
  }
}
