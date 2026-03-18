// Pose Library - Curated poses with visual icons and tested prompts

export interface PoseEntry {
  id: string;
  name: string;
  category: 'standing' | 'sitting' | 'action' | 'dramatic' | 'casual' | 'emotional';
  icon: string; // Emoji or SVG path
  prompt: string;
}

export const POSE_CATEGORIES = [
  { id: 'standing', label: 'Debout', icon: '🧍' },
  { id: 'sitting', label: 'Assis', icon: '🪑' },
  { id: 'action', label: 'Action', icon: '💃' },
  { id: 'dramatic', label: 'Dramatique', icon: '🎭' },
  { id: 'casual', label: 'Décontracté', icon: '😎' },
  { id: 'emotional', label: 'Émotionnel', icon: '💫' },
] as const;

export const POSE_LIBRARY: PoseEntry[] = [
  // Standing poses
  {
    id: 'standing-confident',
    name: 'Confiant',
    category: 'standing',
    icon: '🧍',
    prompt: 'standing tall with confident posture, shoulders back, chin slightly raised, hands at sides, powerful stance',
  },
  {
    id: 'standing-arms-crossed',
    name: 'Bras croisés',
    category: 'standing',
    icon: '🙅',
    prompt: 'standing with arms crossed over chest, weight on one leg, slightly tilted head, assertive expression',
  },
  {
    id: 'standing-hands-hips',
    name: 'Mains hanches',
    category: 'standing',
    icon: '🦸',
    prompt: 'standing with hands on hips, legs shoulder-width apart, confident superhero pose, looking forward',
  },
  {
    id: 'standing-leaning',
    name: 'Appuyé',
    category: 'standing',
    icon: '🚶',
    prompt: 'leaning casually against wall, one foot up, arms folded, relaxed cool attitude',
  },
  {
    id: 'standing-looking-up',
    name: 'Regard vers le ciel',
    category: 'standing',
    icon: '🙄',
    prompt: 'standing still, head tilted back looking up at the sky, arms relaxed at sides, contemplative pose',
  },
  {
    id: 'standing-back-turned',
    name: 'Dos tourné',
    category: 'standing',
    icon: '🚶‍♂️',
    prompt: 'standing with back to camera, looking over shoulder, mysterious silhouette pose',
  },

  // Sitting poses
  {
    id: 'sitting-cross-legged',
    name: 'Jambes croisées',
    category: 'sitting',
    icon: '🧘',
    prompt: 'sitting cross-legged on the ground, hands resting on knees, peaceful meditative pose, straight back',
  },
  {
    id: 'sitting-chair-relaxed',
    name: 'Chaise détendu',
    category: 'sitting',
    icon: '🪑',
    prompt: 'sitting in chair, leaning back casually, one arm on armrest, relaxed confident posture',
  },
  {
    id: 'sitting-forward-lean',
    name: 'Penché en avant',
    category: 'sitting',
    icon: '🤔',
    prompt: 'sitting and leaning forward with elbows on knees, hands clasped, intense focused expression',
  },
  {
    id: 'sitting-floor-knees-up',
    name: 'Sol genoux relevés',
    category: 'sitting',
    icon: '🧎',
    prompt: 'sitting on floor with knees drawn up to chest, arms wrapped around legs, vulnerable contemplative pose',
  },
  {
    id: 'sitting-side-elegant',
    name: 'Assis élégant',
    category: 'sitting',
    icon: '💺',
    prompt: 'sitting elegantly with legs crossed to one side, one hand on knee, poised graceful posture',
  },

  // Action poses
  {
    id: 'action-running',
    name: 'Course',
    category: 'action',
    icon: '🏃',
    prompt: 'running in motion, one leg forward mid-stride, arms pumping, dynamic movement, hair flowing back',
  },
  {
    id: 'action-jumping',
    name: 'Saut',
    category: 'action',
    icon: '🤸',
    prompt: 'jumping in the air, legs bent, arms spread wide, joyful leap, suspended mid-air',
  },
  {
    id: 'action-dancing',
    name: 'Danse',
    category: 'action',
    icon: '💃',
    prompt: 'dancing gracefully, one arm extended upward, body twisting elegantly, flowing movement',
  },
  {
    id: 'action-fighting',
    name: 'Combat',
    category: 'action',
    icon: '🥋',
    prompt: 'martial arts fighting stance, fists raised, weight on back leg, ready to strike, intense focus',
  },
  {
    id: 'action-reaching',
    name: 'Tendre la main',
    category: 'action',
    icon: '🤲',
    prompt: 'reaching out with one arm extended forward, fingers spread, desperate or hopeful reaching gesture',
  },

  // Dramatic poses
  {
    id: 'dramatic-singing',
    name: 'Chant passionné',
    category: 'dramatic',
    icon: '🎤',
    prompt: 'standing dramatically with head thrown back, one arm raised holding microphone to lips, other arm extended outward, passionate singing pose',
  },
  {
    id: 'dramatic-kneeling',
    name: 'À genoux',
    category: 'dramatic',
    icon: '🧎',
    prompt: 'kneeling on one knee, head bowed, hands clasped in front, solemn dramatic moment',
  },
  {
    id: 'dramatic-arms-wide',
    name: 'Bras ouverts',
    category: 'dramatic',
    icon: '🙆',
    prompt: 'standing with arms spread wide open, head tilted back, embracing the moment, theatrical triumphant pose',
  },
  {
    id: 'dramatic-fallen',
    name: 'Au sol',
    category: 'dramatic',
    icon: '😵',
    prompt: 'lying on the ground, reaching up with one arm, dramatic fallen pose, defeated or exhausted',
  },
  {
    id: 'dramatic-silhouette',
    name: 'Silhouette héroïque',
    category: 'dramatic',
    icon: '🦹',
    prompt: 'standing heroically in silhouette, cape or coat flowing, powerful dramatic stance against the light',
  },

  // Casual poses
  {
    id: 'casual-hands-pockets',
    name: 'Mains poches',
    category: 'casual',
    icon: '🧑',
    prompt: 'standing casually with hands in pockets, relaxed shoulders, easy-going natural pose',
  },
  {
    id: 'casual-phone',
    name: 'Téléphone',
    category: 'casual',
    icon: '📱',
    prompt: 'looking down at phone held in both hands, casual modern pose, slightly hunched shoulders',
  },
  {
    id: 'casual-walking',
    name: 'Marche tranquille',
    category: 'casual',
    icon: '🚶‍♀️',
    prompt: 'walking casually, mid-step, relaxed gait, natural arm swing, everyday movement',
  },
  {
    id: 'casual-coffee',
    name: 'Café en main',
    category: 'casual',
    icon: '☕',
    prompt: 'holding coffee cup with both hands near chest, cozy comfortable pose, slight smile',
  },

  // Emotional poses
  {
    id: 'emotional-crying',
    name: 'Pleurs',
    category: 'emotional',
    icon: '😢',
    prompt: 'head bowed, hands covering face, shoulders shaking, crying emotional pose, vulnerable moment',
  },
  {
    id: 'emotional-joy',
    name: 'Joie',
    category: 'emotional',
    icon: '🎉',
    prompt: 'jumping with joy, arms raised in celebration, huge smile, pure happiness pose',
  },
  {
    id: 'emotional-contemplative',
    name: 'Contemplatif',
    category: 'emotional',
    icon: '🤔',
    prompt: 'sitting quietly, chin resting on hand, gazing into distance, deep in thought, contemplative mood',
  },
  {
    id: 'emotional-longing',
    name: 'Nostalgie',
    category: 'emotional',
    icon: '💭',
    prompt: 'standing by window, one hand on glass, looking out wistfully, longing melancholic pose',
  },
  {
    id: 'emotional-embrace',
    name: 'Auto-étreinte',
    category: 'emotional',
    icon: '🤗',
    prompt: 'arms wrapped around self in self-embrace, eyes closed, seeking comfort, vulnerable protective pose',
  },
];

export function getPosesByCategory(category: string): PoseEntry[] {
  return POSE_LIBRARY.filter(pose => pose.category === category);
}

export function getPoseById(id: string): PoseEntry | undefined {
  return POSE_LIBRARY.find(pose => pose.id === id);
}
