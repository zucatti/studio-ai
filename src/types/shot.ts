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

export type CameraAngle = 'eye_level' | 'low_angle' | 'high_angle' | 'dutch_angle' | 'birds_eye' | 'worms_eye';
export type ShotType = 'wide' | 'medium' | 'close_up' | 'extreme_close_up' | 'over_shoulder' | 'two_shot' | 'pov';

// All 38 camera movements
export type CameraMovement =
  | 'static'
  // Dolly movements
  | 'slow_dolly_in'
  | 'slow_dolly_out'
  | 'fast_dolly_in'
  | 'dolly_zoom'
  // Zoom movements
  | 'macro_zoom'
  | 'hyper_zoom'
  | 'smooth_zoom_in'
  | 'smooth_zoom_out'
  | 'snap_zoom'
  // Special shots
  | 'over_the_shoulder'
  | 'fisheye'
  | 'reveal_wipe'
  | 'fly_through'
  | 'reveal_blur'
  | 'rack_focus'
  // Tilt movements
  | 'tilt_up'
  | 'tilt_down'
  // Truck movements
  | 'truck_left'
  | 'truck_right'
  // Orbit movements
  | 'orbit_180'
  | 'orbit_360_fast'
  | 'slow_arc'
  // Pedestal movements
  | 'pedestal_down'
  | 'pedestal_up'
  // Crane movements
  | 'crane_up'
  | 'crane_down'
  // Drone movements
  | 'drone_flyover'
  | 'drone_reveal'
  | 'drone_orbit'
  | 'drone_topdown'
  | 'fpv_dive'
  // Handheld & special
  | 'handheld'
  | 'whip_pan'
  | 'dutch_roll'
  // Tracking movements
  | 'tracking_backward'
  | 'tracking_forward'
  | 'tracking_side'
  | 'pov_walk';

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

// Camera movement categories
export type CameraMovementCategory =
  | 'dolly'
  | 'zoom'
  | 'special'
  | 'tilt'
  | 'truck'
  | 'orbit'
  | 'pedestal'
  | 'crane'
  | 'drone'
  | 'tracking'
  | 'other';

export interface CameraMovementDefinition {
  value: CameraMovement;
  label: string;
  category: CameraMovementCategory;
  description: string;
  promptTemplate: string;
  previewUrl?: string;
}

export const CAMERA_MOVEMENT_CATEGORIES: { value: CameraMovementCategory; label: string }[] = [
  { value: 'dolly', label: 'Dolly / Travelling' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'tilt', label: 'Tilt' },
  { value: 'truck', label: 'Truck / Latéral' },
  { value: 'orbit', label: 'Orbite / Arc' },
  { value: 'pedestal', label: 'Pedestal' },
  { value: 'crane', label: 'Grue' },
  { value: 'drone', label: 'Drone' },
  { value: 'tracking', label: 'Tracking / Suivi' },
  { value: 'special', label: 'Effets spéciaux' },
  { value: 'other', label: 'Autres' },
];

export const CAMERA_MOVEMENTS: CameraMovementDefinition[] = [
  // Static
  {
    value: 'static',
    label: 'Statique',
    category: 'other',
    description: 'Caméra fixe, sans mouvement.',
    promptTemplate: 'Static camera shot, locked off, no movement.',
  },

  // === DOLLY MOVEMENTS ===
  {
    value: 'slow_dolly_in',
    label: 'Dolly In Lent',
    category: 'dolly',
    description: 'La caméra avance lentement vers le sujet.',
    promptTemplate: 'Camera slowly pushes forward, moving closer to {subject}. The camera approaches the subject, getting nearer with each frame. Push in, move forward, approach.',
  },
  {
    value: 'slow_dolly_out',
    label: 'Dolly Out Lent',
    category: 'dolly',
    description: 'La caméra recule doucement, révélant l\'environnement.',
    promptTemplate: 'Camera slowly pulls backward, moving away from {subject}. The camera retreats, getting farther with each frame, revealing more of the environment. Pull back, move backward, retreat.',
  },
  {
    value: 'fast_dolly_in',
    label: 'Dolly Rush',
    category: 'dolly',
    description: 'Mouvement rapide vers le sujet.',
    promptTemplate: 'Camera rushes forward quickly toward {subject}. Fast push in, rapid approach, camera races closer to the subject.',
  },
  {
    value: 'dolly_zoom',
    label: 'Dolly Zoom (Vertigo)',
    category: 'dolly',
    description: 'Effet "Vertigo" - la caméra recule pendant que le zoom avance, distorsion violente de la perspective.',
    promptTemplate: 'Dolly zoom (zolly): the camera moves backward while zooming in, violently warping the background. {subject} stays the same size despite extreme perspective distortion.',
  },

  // === ZOOM MOVEMENTS ===
  {
    value: 'macro_zoom',
    label: 'Macro Zoom',
    category: 'zoom',
    description: 'Zoom extrême vers le détail microscopique.',
    promptTemplate: 'Extreme zoom in, camera lens zooms closer and closer into extreme detail, macro close-up.',
  },
  {
    value: 'hyper_zoom',
    label: 'Hyper Zoom Cosmique',
    category: 'zoom',
    description: 'Zoom ininterrompu depuis l\'espace jusqu\'au niveau de la rue.',
    promptTemplate: 'Continuous zoom in from far away to close up, unbroken zoom getting closer and closer to {subject}.',
  },
  {
    value: 'smooth_zoom_in',
    label: 'Zoom In Fluide',
    category: 'zoom',
    description: 'Zoom optique fluide vers le sujet, caméra fixe.',
    promptTemplate: 'Camera lens zooms in, {subject} grows larger in frame, zoom closer, magnify, get nearer optically.',
  },
  {
    value: 'smooth_zoom_out',
    label: 'Zoom Out Fluide',
    category: 'zoom',
    description: 'Zoom optique fluide s\'éloignant, révélant le contexte spatial.',
    promptTemplate: 'Camera lens zooms out, {subject} grows smaller in frame, zoom wider, reveal more environment, pull back optically.',
  },
  {
    value: 'snap_zoom',
    label: 'Snap Zoom (Crash)',
    category: 'zoom',
    description: 'Zoom instantané et agressif vers les yeux du sujet.',
    promptTemplate: 'Snap zoom straight into {subject}\'s eyes mid-realization, jarring high-impact framing shift.',
  },

  // === SPECIAL SHOTS ===
  {
    value: 'over_the_shoulder',
    label: 'Par-dessus l\'épaule (OTS)',
    category: 'special',
    description: 'Caméra derrière l\'épaule d\'un personnage secondaire, cadrant le sujet principal.',
    promptTemplate: 'Over-the-shoulder shot from a blurred figure\'s shoulder, framing {subject}, shallow depth of field.',
  },
  {
    value: 'fisheye',
    label: 'Fisheye / Judas',
    category: 'special',
    description: 'Objectif ultra-grand angle avec distorsion prononcée, style caméra de surveillance.',
    promptTemplate: 'Fisheye lens view of {subject}, walls curving unnaturally toward the edges, security-camera mood.',
  },
  {
    value: 'reveal_wipe',
    label: 'Révélation Latérale',
    category: 'special',
    description: 'Le cadre commence obscurci et glisse pour révéler le sujet.',
    promptTemplate: 'Cinematic lateral wipe reveal from behind a foreground element, sliding sideways to reveal {subject}.',
  },
  {
    value: 'fly_through',
    label: 'Vol À Travers',
    category: 'special',
    description: 'La caméra traverse une ouverture étroite pour révéler le sujet.',
    promptTemplate: 'Cinematic fly-through as the camera passes through a narrow opening, revealing {subject} beyond.',
  },
  {
    value: 'reveal_blur',
    label: 'Révélation du Flou',
    category: 'special',
    description: 'Plan entièrement flou qui fait progressivement le point sur le sujet.',
    promptTemplate: 'Focus-pull reveal from full bokeh to sharp focus on {subject}, circular bokeh lights glowing.',
  },
  {
    value: 'rack_focus',
    label: 'Rack Focus',
    category: 'special',
    description: 'Transfert de mise au point de l\'avant-plan vers l\'arrière-plan.',
    promptTemplate: 'Rack focus shot: foreground in sharp focus with soft background, then focus shifts as foreground softens and background snaps sharp on {subject}.',
  },

  // === TILT MOVEMENTS ===
  {
    value: 'tilt_up',
    label: 'Tilt Haut',
    category: 'tilt',
    description: 'La caméra pivote vers le haut, des pieds vers le visage.',
    promptTemplate: 'Camera tilts upward, panning up vertically from bottom to top, revealing {subject} from feet to face, vertical pan up.',
  },
  {
    value: 'tilt_down',
    label: 'Tilt Bas',
    category: 'tilt',
    description: 'La caméra pivote vers le bas, du visage vers les pieds.',
    promptTemplate: 'Camera tilts downward, panning down vertically from top to bottom, revealing {subject} from face to feet, vertical pan down.',
  },

  // === TRUCK MOVEMENTS ===
  {
    value: 'truck_left',
    label: 'Travelling Gauche',
    category: 'truck',
    description: 'Caméra glisse vers la gauche.',
    promptTemplate: 'Camera moves left, sliding sideways to the left, lateral tracking left, {subject} shifts right in frame.',
  },
  {
    value: 'truck_right',
    label: 'Travelling Droit',
    category: 'truck',
    description: 'Caméra glisse vers la droite.',
    promptTemplate: 'Camera moves right, sliding sideways to the right, lateral tracking right, {subject} shifts left in frame.',
  },

  // === ORBIT MOVEMENTS ===
  {
    value: 'orbit_180',
    label: 'Orbite 180°',
    category: 'orbit',
    description: 'La caméra tourne autour du sujet (demi-cercle).',
    promptTemplate: 'Camera orbits around {subject}, circling halfway around, rotating 180 degrees, arc movement around the subject.',
  },
  {
    value: 'orbit_360_fast',
    label: 'Orbite 360° Rapide',
    category: 'orbit',
    description: 'Rotation rapide complète autour du sujet.',
    promptTemplate: 'Camera spins rapidly around {subject}, fast 360 degree rotation, spinning orbit, whirling around.',
  },
  {
    value: 'slow_arc',
    label: 'Arc Cinématique',
    category: 'orbit',
    description: 'La caméra glisse en arc autour du sujet.',
    promptTemplate: 'Camera slowly arcs around {subject}, gentle curved movement, smooth orbit, circling gracefully.',
  },

  // === PEDESTAL MOVEMENTS ===
  {
    value: 'pedestal_down',
    label: 'Pedestal Bas',
    category: 'pedestal',
    description: 'La caméra descend verticalement du niveau des yeux à la taille.',
    promptTemplate: 'Pedestal down on {subject}, camera lowering smoothly from eye level to waist level.',
  },
  {
    value: 'pedestal_up',
    label: 'Pedestal Haut',
    category: 'pedestal',
    description: 'La caméra monte verticalement de la taille au niveau des yeux.',
    promptTemplate: 'Pedestal up on {subject} rising emotionally as the environment opens up.',
  },

  // === CRANE MOVEMENTS ===
  {
    value: 'crane_up',
    label: 'Grue Montante',
    category: 'crane',
    description: 'La caméra s\'élève vers le haut.',
    promptTemplate: 'Camera rises upward, ascending, moving up vertically, crane shot going up, elevating above {subject}, bird\'s eye view.',
  },
  {
    value: 'crane_down',
    label: 'Grue Descendante',
    category: 'crane',
    description: 'La caméra descend vers le bas.',
    promptTemplate: 'Camera descends downward, lowering, moving down vertically, crane shot going down toward {subject}, landing.',
  },

  // === DRONE MOVEMENTS ===
  {
    value: 'drone_flyover',
    label: 'Survol Drone',
    category: 'drone',
    description: 'Survol haute altitude, mouvement fluide au-dessus du sujet.',
    promptTemplate: 'High-altitude drone flyover of {subject}, gliding smoothly above and sweeping across the landscape.',
  },
  {
    value: 'drone_reveal',
    label: 'Révélation Drone',
    category: 'drone',
    description: 'Le drone s\'élève derrière un obstacle puis révèle le sujet et l\'horizon.',
    promptTemplate: 'Epic drone reveal rising from behind an obstacle to expose {subject} and the horizon.',
  },
  {
    value: 'drone_orbit',
    label: 'Orbite Drone',
    category: 'drone',
    description: 'Cercle aérien continu autour du sujet, montrant l\'ampleur de l\'environnement.',
    promptTemplate: 'Wide drone orbit circling {subject}, maintaining distance to showcase environmental magnitude.',
  },
  {
    value: 'drone_topdown',
    label: 'Vue du Ciel (God\'s Eye)',
    category: 'drone',
    description: 'Caméra directement au-dessus à 90°, rotation lente.',
    promptTemplate: 'Top-down rotating drone shot of {subject} centered below, shifting light.',
  },
  {
    value: 'fpv_dive',
    label: 'Plongée FPV',
    category: 'drone',
    description: 'Descente rapide et agressive style FPV le long d\'une structure.',
    promptTemplate: 'Aggressive FPV drone dive racing down tall architecture toward {subject} at the base.',
  },

  // === TRACKING MOVEMENTS ===
  {
    value: 'tracking_backward',
    label: 'Suivi Arrière',
    category: 'tracking',
    description: 'La caméra recule devant le sujet qui avance.',
    promptTemplate: 'Camera moves backward while facing {subject} who walks forward, leading shot, camera retreats as subject approaches.',
  },
  {
    value: 'tracking_forward',
    label: 'Suivi Avant',
    category: 'tracking',
    description: 'La caméra suit le sujet de dos.',
    promptTemplate: 'Camera follows behind {subject} who walks away, following shot, camera moves forward behind the subject.',
  },
  {
    value: 'tracking_side',
    label: 'Suivi Latéral',
    category: 'tracking',
    description: 'La caméra accompagne le sujet de profil.',
    promptTemplate: 'Camera moves sideways, tracking left to right parallel to {subject}, side tracking, lateral movement.',
  },
  {
    value: 'pov_walk',
    label: 'POV Marche',
    category: 'tracking',
    description: 'Vue à la première personne avec léger balancement de marche.',
    promptTemplate: 'First-person POV camera advances with gentle walking sway, {subject} implied by shadow or edge in frame.',
  },

  // === OTHER MOVEMENTS ===
  {
    value: 'handheld',
    label: 'Caméra Portée',
    category: 'other',
    description: 'Style documentaire avec micro-tremblements naturels.',
    promptTemplate: 'Handheld camera follows {subject} with natural micro-jitters and human breathing drift.',
  },
  {
    value: 'whip_pan',
    label: 'Whip Pan',
    category: 'other',
    description: 'Panoramique rapide avec flou de mouvement intense.',
    promptTemplate: 'Whip pan reveals {subject} across two connected spaces fused by streaking motion blur.',
  },
  {
    value: 'dutch_roll',
    label: 'Angle Hollandais (Roll)',
    category: 'other',
    description: 'Rotation de la caméra sur l\'axe Z, horizon en diagonale.',
    promptTemplate: 'Dutch angle with Z-axis roll frames {subject} in a tilted, unsettling composition.',
  },
];

// Helper to get movements by category
export function getMovementsByCategory(category: CameraMovementCategory): CameraMovementDefinition[] {
  return CAMERA_MOVEMENTS.filter(m => m.category === category);
}

// Helper to get movement definition
export function getMovementDefinition(value: CameraMovement): CameraMovementDefinition | undefined {
  return CAMERA_MOVEMENTS.find(m => m.value === value);
}

// Simple array for backwards compatibility
export const CAMERA_MOVEMENTS_SIMPLE: { value: CameraMovement; label: string }[] =
  CAMERA_MOVEMENTS.map(m => ({ value: m.value, label: m.label }));

export const CAMERA_ANGLES: { value: CameraAngle; label: string }[] = [
  { value: 'eye_level', label: 'Niveau des yeux' },
  { value: 'low_angle', label: 'Contre-plongée' },
  { value: 'high_angle', label: 'Plongée' },
  { value: 'dutch_angle', label: 'Angle hollandais' },
  { value: 'birds_eye', label: 'Vue plongeante' },
  { value: 'worms_eye', label: 'Contre-plongée extrême' },
];

export const SHOT_TYPES: { value: ShotType; label: string }[] = [
  { value: 'wide', label: 'Plan large' },
  { value: 'medium', label: 'Plan moyen' },
  { value: 'close_up', label: 'Gros plan' },
  { value: 'extreme_close_up', label: 'Très gros plan' },
  { value: 'over_shoulder', label: 'Par-dessus l\'épaule' },
  { value: 'two_shot', label: 'Plan à deux' },
  { value: 'pov', label: 'Point de vue (POV)' },
];
