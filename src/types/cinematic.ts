/**
 * Cinematic Types for Extended Shorts Generation
 *
 * These types support the cinematic mega-prompt workflow for Kling Omni generation.
 */

// ============================================================================
// Cinematic Header Configuration (Wizard-based)
// ============================================================================

// Scene setting (INT/EXT)
export type SceneSetting = 'int' | 'ext' | 'int_ext';

export type LightingType = 'natural' | 'artificial' | 'mixed';
export type LightingStyle = 'high_key' | 'low_key' | 'dramatic' | 'soft' | 'harsh' | 'silhouette';
export type LightingSource = 'single_source' | 'three_point' | 'practical' | 'ambient';
export type LightingModifier = 'diffused' | 'direct' | 'bounced' | 'colored';

export type TimeOfDayCinematic = 'dawn' | 'morning' | 'midday' | 'afternoon' | 'golden_hour' | 'dusk' | 'night' | 'blue_hour';
export type Weather = 'clear' | 'cloudy' | 'overcast' | 'rain' | 'fog' | 'storm';

export type CameraTypeCinematic = 'handheld' | 'steadicam' | 'tripod' | 'drone' | 'gimbal' | 'crane' | 'dolly';
export type LensType = 'wide' | 'standard' | 'telephoto' | 'macro' | 'anamorphic';
export type ApertureStyle = 'shallow_dof' | 'medium_dof' | 'deep_dof';
export type FocusStyle = 'rack_focus' | 'pull_focus' | 'soft_focus' | 'sharp';

export type ColorTemperature = 'warm' | 'neutral' | 'cold';
export type ColorSaturation = 'vibrant' | 'natural' | 'desaturated' | 'monochrome';
export type ColorContrast = 'low' | 'medium' | 'high';
export type ColorStyle = 'cinematic' | 'vintage' | 'modern' | 'noir' | 'pastel' | 'teal_orange' | 'black_white' | 'saturated';

// ============================================================================
// Cinematic Style Presets (Kling AI 3.0 optimized)
// ============================================================================

export type CinematicStyle =
  | 'cinematic_realism'
  | 'hollywood_blockbuster'
  | 'film_noir'
  | 'wes_anderson'
  | 'christopher_nolan'
  | 'blade_runner'
  | 'studio_ghibli'
  | 'vintage_vhs'
  | 'documentary'
  | 'epic_fantasy'
  | 'custom';

export type ToneGenre = 'action' | 'comedy' | 'documentary' | 'horror' | 'intimate' | 'spectacle' | 'suspense' | 'western';
export type ToneMood = 'tense' | 'intimate' | 'epic' | 'melancholic' | 'joyful' | 'mysterious' | 'peaceful';
export type TonePacing = 'slow' | 'moderate' | 'fast' | 'frenetic';

export interface CinematicHeaderConfig {
  // Preset ID for reuse
  preset_id?: string;
  preset_name?: string;

  // Cinematic Style Preset (Kling AI optimized)
  cinematic_style?: CinematicStyle;
  // Custom style bible (only used when cinematic_style is 'custom')
  custom_style_bible?: string;

  // Scene (slugline)
  scene?: {
    setting: SceneSetting;           // INT / EXT / INT-EXT
    location_id?: string;            // Reference to Bible location
    location_custom?: string;        // Or custom text like "Dark, moody kitchen"
  };

  // Lighting
  lighting: {
    type: LightingType;
    style: LightingStyle;
    source?: LightingSource;
    modifiers?: LightingModifier[];
  };

  // Time (can come from scene in film mode)
  time_of_day: TimeOfDayCinematic;
  weather?: Weather;

  // Camera
  camera: {
    type: CameraTypeCinematic;
    depth_of_field?: ApertureStyle;
  };

  // Color Grading
  color_grade: {
    style: ColorStyle;
  };

  // Tone & Mood (legacy - now using CinematicStyle presets)
  tone?: {
    genre: ToneGenre;
  };

  // Cast (auto-detected from short's characters)
  cast?: {
    count: number;
    age_range?: string; // "late 20s-early 30s"
    relationship?: string; // "romantic couple", "rivals", "strangers"
  };

  // Additional text (for what's not covered)
  additional_notes?: string;
}

// ============================================================================
// Character Mapping for Kling Elements
// ============================================================================

export interface CharacterMapping {
  character_id: string;
  element_index: number; // 1-4 (for @Element1, @Element2, etc.)
  voice_index: number;   // 1-2 (for <<<voice_1>>>, <<<voice_2>>>)
}

// ============================================================================
// Extended Short Fields (to be added to Short interface)
// ============================================================================

export type GenerationMode = 'standard' | 'cinematic';
export type DialogueLanguage = 'en' | 'fr' | 'es' | 'de' | 'it' | 'pt' | 'zh' | 'ja' | 'ko';

// ============================================================================
// Shot Types (segment within a plan)
// ============================================================================

// Shot Framing (size/distance)
export type ShotFraming =
  | 'extreme_wide'
  | 'wide'
  | 'medium_wide'
  | 'medium'
  | 'medium_close_up'
  | 'close_up'
  | 'extreme_close_up';

// Shot Composition (who/what in frame)
export type ShotComposition =
  | 'single'
  | 'two_shot'
  | 'group'
  | 'over_shoulder'
  | 'pov'
  | 'insert';

// Legacy - kept for backward compatibility
export type ShotType =
  | 'extreme_wide'
  | 'wide'
  | 'medium_wide'
  | 'medium'
  | 'medium_close_up'
  | 'close_up'
  | 'extreme_close_up'
  | 'over_shoulder'
  | 'pov'
  | 'insert'
  | 'two_shot';

export type DialogueTone =
  // Neutral/Descriptive
  | 'neutral'
  | 'flatly'
  | 'coldly'
  | 'calmly'
  | 'quietly'
  | 'thoughtfully'
  | 'curiously'
  | 'cautiously'
  | 'suspiciously'
  // Positive emotions
  | 'warmly'
  | 'happily'
  | 'excitedly'
  | 'enthusiastically'
  | 'lovingly'
  | 'tenderly'
  | 'gently'
  | 'playfully'
  | 'cheerfully'
  | 'proudly'
  | 'confidently'
  | 'hopefully'
  | 'gratefully'
  | 'relieved'
  // Negative emotions
  | 'angrily'
  | 'furiously'
  | 'bitterly'
  | 'sadly'
  | 'mournfully'
  | 'desperately'
  | 'fearfully'
  | 'anxiously'
  | 'nervously'
  | 'hesitantly'
  | 'reluctantly'
  | 'resentfully'
  | 'disgustedly'
  | 'contemptuously'
  // Intensity/Volume
  | 'whispers'
  | 'murmurs'
  | 'shouts'
  | 'screams'
  | 'yells'
  // Character attitudes
  | 'sarcastically'
  | 'mockingly'
  | 'teasingly'
  | 'seductively'
  | 'mysteriously'
  | 'threateningly'
  | 'defiantly'
  | 'smugly';

export type CameraMovement =
  | 'static'
  | 'slow_dolly_in'
  | 'slow_dolly_out'
  | 'dolly_left'
  | 'dolly_right'
  | 'tracking_forward'
  | 'tracking_backward'
  | 'pan_left'
  | 'pan_right'
  | 'tilt_up'
  | 'tilt_down'
  | 'crane_up'
  | 'crane_down'
  | 'orbit_cw'
  | 'orbit_ccw'
  | 'handheld'
  | 'zoom_in'
  | 'zoom_out';

// ============================================================================
// Dialogue within a Segment
// ============================================================================

export interface SegmentDialogue {
  character_id: string;
  character_name: string;  // For display
  tone?: DialogueTone;
  text: string;            // Original language
  text_en?: string;        // Claude translation (auto-generated)
}

// ============================================================================
// Shot Beat (action/dialogue moment within a segment)
// ============================================================================

export type BeatType = 'action' | 'dialogue';
export type DialoguePresence = 'on' | 'off';

export interface ShotBeat {
  id: string;
  character_id?: string;
  character_name?: string;
  type: BeatType;
  content: string;        // The action description or dialogue text
  tone?: DialogueTone;    // Only for dialogue: coldly, flatly, whispers, etc.
  presence?: DialoguePresence; // Only for dialogue: on (on-screen) or off (off-screen/voice-over)
}

// ============================================================================
// Segment (Shot within a Plan)
// ============================================================================

export interface Segment {
  id: string;

  // Timing (in seconds)
  start_time: number;
  end_time: number;

  // Shot definition (new system)
  shot_framing: ShotFraming;          // Size: wide, medium, close-up...
  shot_composition?: ShotComposition; // Who: single, two-shot, OTS...
  subject?: string;                   // Extracted from description or first beat

  // Visual description (framing, atmosphere, setup)
  description?: string;

  // Sequence of action/dialogue moments
  beats?: ShotBeat[];

  // Camera
  camera_movement?: CameraMovement;
  camera_notes?: string;  // Free-form: "Slight push-in", "Subtle drift right"

  // Legacy fields (for backward compatibility)
  shot_type?: ShotType;  // @deprecated - use shot_framing + shot_composition
  dialogue?: SegmentDialogue;
  framing?: string;
  action?: string;
  environment?: string;

  // Override (for advanced users)
  custom_prompt?: string;
}

// ============================================================================
// Plan Translation (language version)
// ============================================================================

export interface PlanTranslation {
  language: DialogueLanguage;
  audio_url: string;      // ElevenLabs generated audio
  video_url: string;      // Sync Lipsync result
  status: 'pending' | 'generating' | 'completed' | 'failed';
  created_at?: string;
}

// ============================================================================
// Short Extension (simplified - no character_mappings)
// ============================================================================

export interface CinematicShortExtension {
  dialogue_language?: DialogueLanguage;
}

// ============================================================================
// Extended Plan Fields (new structure with segments)
// ============================================================================

export interface CinematicPlanExtension {
  // Plan title (optional, fallback: "Plan 1", "Plan 2", etc.)
  title?: string;

  // Cinematic style (belongs to plan, not short)
  cinematic_header?: CinematicHeaderConfig;

  // Reference frames
  frame_in_url?: string;
  frame_out_url?: string;

  // Segments (shots within this plan)
  segments: Segment[];

  // Translations (language versions)
  translations?: PlanTranslation[];

  // Legacy fields (kept for migration compatibility)
  shot_subject?: string;
  framing?: string;
  action?: string;
  environment?: string;
  dialogue_tone?: string;
  start_time?: number;
}

// ============================================================================
// Cinematic Preset (reusable configurations)
// ============================================================================

export interface CinematicPreset {
  id: string;
  user_id: string;
  project_id: string | null; // NULL = global user preset
  name: string;
  description?: string;
  config: CinematicHeaderConfig;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Character Data Extension (for fal.ai voice)
// ============================================================================

export interface CharacterDataExtension {
  // Existing fields
  visual_description?: string;
  voice_id?: string;           // ElevenLabs voice_id
  voice_name?: string;
  reference_images?: string[];

  // NEW: fal.ai voice fields
  fal_voice_id?: string;           // voice_id from fal.ai create-voice
  fal_voice_sample_url?: string;   // Sample audio URL used to create the voice
}

// ============================================================================
// Cinematic Generation Request
// ============================================================================

export interface CinematicGenerationRequest {
  short_id: string;
  project_id: string;

  // Elements for Kling (up to 4)
  elements: Array<{
    character_id: string;
    frontal_image_url: string;
    reference_image_urls?: string[];
  }>;

  // Voices (up to 2)
  voices: Array<{
    character_id: string;
    fal_voice_id: string;
  }>;

  // The mega-prompt
  prompt: string;

  // Generation options
  duration: number; // 3-15 seconds
  generate_audio: boolean; // true for English native Kling, false for post-process
  dialogue_language: DialogueLanguage;
}

// ============================================================================
// Helper Types for Wizard UI
// ============================================================================

export interface LightingOption {
  value: LightingStyle;
  label: string;
  description: string;
}

export interface CameraOption {
  value: CameraTypeCinematic;
  label: string;
  description: string;
}

export interface ColorStyleOption {
  value: ColorStyle;
  label: string;
  description: string;
}

export interface ToneOption {
  value: ToneMood;
  label: string;
  forGenres: ToneGenre[];
}

// Preset options for wizard
export const LIGHTING_OPTIONS: LightingOption[] = [
  { value: 'high_key', label: 'High-key', description: 'Bright, even lighting with minimal shadows' },
  { value: 'low_key', label: 'Low-key', description: 'Dark, dramatic with strong shadows' },
  { value: 'dramatic', label: 'Dramatic', description: 'High contrast with defined shadows' },
  { value: 'soft', label: 'Soft', description: 'Diffused, gentle lighting' },
  { value: 'harsh', label: 'Harsh', description: 'Direct, hard shadows' },
  { value: 'silhouette', label: 'Silhouette', description: 'Backlit subjects in shadow' },
];

export const CAMERA_TYPE_OPTIONS: CameraOption[] = [
  { value: 'handheld', label: 'Handheld', description: 'Natural shake, documentary feel' },
  { value: 'steadicam', label: 'Steadicam', description: 'Smooth tracking shots' },
  { value: 'tripod', label: 'Tripod', description: 'Static, stable framing' },
  { value: 'drone', label: 'Drone', description: 'Aerial perspectives' },
  { value: 'gimbal', label: 'Gimbal', description: 'Smooth handheld movement' },
  { value: 'crane', label: 'Crane', description: 'Sweeping vertical movements' },
  { value: 'dolly', label: 'Dolly', description: 'Smooth horizontal tracking' },
];

export const COLOR_STYLE_OPTIONS: ColorStyleOption[] = [
  { value: 'cinematic', label: 'Cinematic', description: 'Classic film look' },
  { value: 'vintage', label: 'Vintage', description: 'Warm, faded look' },
  { value: 'modern', label: 'Modern', description: 'Clean, contemporary' },
  { value: 'noir', label: 'Noir', description: 'Dark, moody tones' },
  { value: 'pastel', label: 'Pastel', description: 'Soft, muted tones' },
  { value: 'teal_orange', label: 'Teal & Orange', description: 'Hollywood blockbuster' },
  { value: 'black_white', label: 'Noir & Blanc', description: 'Classic monochrome' },
  { value: 'saturated', label: 'Saturé', description: 'Hyper-vivid colors' },
];

// ============================================================================
// Cinematic Style Presets (Kling AI 3.0 optimized)
// ============================================================================

export interface CinematicStyleOption {
  value: CinematicStyle;
  label: string;
  description: string;
  styleBible: string;  // The ending prompt line for this style
}

export const CINEMATIC_STYLE_OPTIONS: CinematicStyleOption[] = [
  {
    value: 'cinematic_realism',
    label: 'Cinematic Realism',
    description: '35mm film grain, anamorphic lens flares',
    styleBible: 'cinematic lighting, 35mm film grain, anamorphic lens flares, moody color grade, shallow depth of field, high production value',
  },
  {
    value: 'hollywood_blockbuster',
    label: 'Hollywood Blockbuster',
    description: 'Epic wide shots, dramatic lighting, IMAX',
    styleBible: 'Hollywood blockbuster style, epic wide shots, dramatic lighting, IMAX quality, high production value',
  },
  {
    value: 'film_noir',
    label: 'Film Noir',
    description: 'High contrast B&W, harsh shadows',
    styleBible: 'film noir, high-contrast black and white, harsh shadows, retro detective aesthetic, moody atmosphere',
  },
  {
    value: 'wes_anderson',
    label: 'Wes Anderson',
    description: 'Pastel colors, symmetry, quirky framing',
    styleBible: 'Wes Anderson style, perfect symmetry, pastel colors, deadpan composition, quirky framing, whimsical aesthetic',
  },
  {
    value: 'christopher_nolan',
    label: 'Christopher Nolan',
    description: 'Practical effects, cold blue tones',
    styleBible: 'Christopher Nolan style, practical effects, grounded realism, cold blue tones, IMAX quality, intense atmosphere',
  },
  {
    value: 'blade_runner',
    label: 'Blade Runner / Cyberpunk',
    description: 'Neon reflections, rain, dystopia',
    styleBible: 'Blade Runner cyberpunk, neon reflections, rain-slicked streets, futuristic dystopia, atmospheric haze, high contrast',
  },
  {
    value: 'studio_ghibli',
    label: 'Studio Ghibli',
    description: 'Soft hand-drawn look, whimsical nature',
    styleBible: 'Studio Ghibli inspired, soft hand-drawn aesthetic, whimsical nature elements, warm lighting, dreamlike atmosphere',
  },
  {
    value: 'vintage_vhs',
    label: 'Vintage VHS',
    description: '1990s film grain, nostalgic color bleed',
    styleBible: 'vintage 1990s VHS, film grain, slight distortion, nostalgic color bleed, retro aesthetic',
  },
  {
    value: 'documentary',
    label: 'Documentary',
    description: 'Handheld camera, natural lighting',
    styleBible: 'documentary style, handheld camera, natural lighting, authentic feel, realistic textures',
  },
  {
    value: 'epic_fantasy',
    label: 'Epic Fantasy',
    description: 'Volumetric god rays, mist-filled',
    styleBible: 'epic fantasy, volumetric god rays, mist-filled atmosphere, intricate costume details, magical lighting, high production value',
  },
  {
    value: 'custom',
    label: 'Custom',
    description: 'Use your own style bible',
    styleBible: '',
  },
];

export const GENRE_OPTIONS: { value: ToneGenre; label: string }[] = [
  { value: 'action', label: 'Action' },
  { value: 'comedy', label: 'Comedy' },
  { value: 'documentary', label: 'Documentary' },
  { value: 'horror', label: 'Horror' },
  { value: 'intimate', label: 'Intimate' },
  { value: 'spectacle', label: 'Spectacle' },
  { value: 'suspense', label: 'Suspense' },
  { value: 'western', label: 'Western' },
];

export const MOOD_OPTIONS: ToneOption[] = [
  { value: 'tense', label: 'Tense', forGenres: ['suspense', 'horror', 'action'] },
  { value: 'intimate', label: 'Intimate', forGenres: ['intimate', 'western'] },
  { value: 'epic', label: 'Epic', forGenres: ['action', 'spectacle', 'western'] },
  { value: 'melancholic', label: 'Melancholic', forGenres: ['intimate', 'western'] },
  { value: 'joyful', label: 'Joyful', forGenres: ['comedy', 'intimate'] },
  { value: 'mysterious', label: 'Mysterious', forGenres: ['suspense', 'horror', 'spectacle'] },
  { value: 'peaceful', label: 'Peaceful', forGenres: ['intimate', 'western'] },
];

export const TIME_OF_DAY_OPTIONS: { value: TimeOfDayCinematic; label: string }[] = [
  { value: 'dawn', label: 'Dawn' },
  { value: 'morning', label: 'Morning' },
  { value: 'midday', label: 'Midday' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'golden_hour', label: 'Golden Hour' },
  { value: 'dusk', label: 'Dusk' },
  { value: 'night', label: 'Night' },
  { value: 'blue_hour', label: 'Blue Hour' },
];

export const PACING_OPTIONS: { value: TonePacing; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'fast', label: 'Fast' },
  { value: 'frenetic', label: 'Frenetic' },
];

// ============================================================================
// Shot/Segment Options
// ============================================================================

export const SHOT_FRAMING_OPTIONS: { value: ShotFraming; label: string; abbr: string }[] = [
  { value: 'extreme_wide', label: 'Extreme Wide', abbr: 'XW' },
  { value: 'wide', label: 'Wide', abbr: 'W' },
  { value: 'medium_wide', label: 'Medium Wide', abbr: 'MW' },
  { value: 'medium', label: 'Medium', abbr: 'M' },
  { value: 'medium_close_up', label: 'Medium Close-up', abbr: 'MCU' },
  { value: 'close_up', label: 'Close-up', abbr: 'CU' },
  { value: 'extreme_close_up', label: 'Extreme Close-up', abbr: 'XCU' },
];

export const SHOT_COMPOSITION_OPTIONS: { value: ShotComposition; label: string; abbr: string }[] = [
  { value: 'single', label: 'Single', abbr: '' },
  { value: 'two_shot', label: 'Two-Shot', abbr: '2S' },
  { value: 'group', label: 'Group', abbr: 'GRP' },
  { value: 'over_shoulder', label: 'Over Shoulder', abbr: 'OTS' },
  { value: 'pov', label: 'POV', abbr: 'POV' },
  { value: 'insert', label: 'Insert', abbr: 'INS' },
];

// Legacy - kept for backward compatibility
export const SHOT_TYPE_OPTIONS: { value: ShotType; label: string; description: string }[] = [
  { value: 'extreme_wide', label: 'Extreme Wide', description: 'Vast landscape or setting' },
  { value: 'wide', label: 'Wide', description: 'Full scene with context' },
  { value: 'medium_wide', label: 'Medium Wide', description: 'Subject with environment' },
  { value: 'medium', label: 'Medium', description: 'Waist-up framing' },
  { value: 'medium_close_up', label: 'Medium Close-up', description: 'Chest-up framing' },
  { value: 'close_up', label: 'Close-up', description: 'Face or detail' },
  { value: 'extreme_close_up', label: 'Extreme Close-up', description: 'Eyes or minute detail' },
  { value: 'over_shoulder', label: 'Over Shoulder', description: 'From behind one character' },
  { value: 'pov', label: 'POV', description: 'Character\'s point of view' },
  { value: 'insert', label: 'Insert', description: 'Object or detail cutaway' },
  { value: 'two_shot', label: 'Two Shot', description: 'Two characters in frame' },
];

export interface DialogueToneOption {
  value: DialogueTone;
  label: string;      // French label
  labelEn: string;    // English (for prompt)
  category: 'neutral' | 'positive' | 'negative' | 'intensity' | 'attitude';
}

export const DIALOGUE_TONE_OPTIONS: DialogueToneOption[] = [
  // Neutral/Descriptive
  { value: 'neutral', label: 'Neutre', labelEn: 'Neutral', category: 'neutral' },
  { value: 'flatly', label: 'Platement', labelEn: 'Flatly', category: 'neutral' },
  { value: 'coldly', label: 'Froidement', labelEn: 'Coldly', category: 'neutral' },
  { value: 'calmly', label: 'Calmement', labelEn: 'Calmly', category: 'neutral' },
  { value: 'quietly', label: 'Doucement', labelEn: 'Quietly', category: 'neutral' },
  { value: 'thoughtfully', label: 'Pensivement', labelEn: 'Thoughtfully', category: 'neutral' },
  { value: 'curiously', label: 'Curieusement', labelEn: 'Curiously', category: 'neutral' },
  { value: 'cautiously', label: 'Prudemment', labelEn: 'Cautiously', category: 'neutral' },
  { value: 'suspiciously', label: 'Avec suspicion', labelEn: 'Suspiciously', category: 'neutral' },
  // Positive emotions
  { value: 'warmly', label: 'Chaleureusement', labelEn: 'Warmly', category: 'positive' },
  { value: 'happily', label: 'Joyeusement', labelEn: 'Happily', category: 'positive' },
  { value: 'excitedly', label: 'Avec excitation', labelEn: 'Excitedly', category: 'positive' },
  { value: 'enthusiastically', label: 'Avec enthousiasme', labelEn: 'Enthusiastically', category: 'positive' },
  { value: 'lovingly', label: 'Amoureusement', labelEn: 'Lovingly', category: 'positive' },
  { value: 'tenderly', label: 'Tendrement', labelEn: 'Tenderly', category: 'positive' },
  { value: 'gently', label: 'Gentiment', labelEn: 'Gently', category: 'positive' },
  { value: 'playfully', label: 'Espiègle', labelEn: 'Playfully', category: 'positive' },
  { value: 'cheerfully', label: 'Gaiement', labelEn: 'Cheerfully', category: 'positive' },
  { value: 'proudly', label: 'Fièrement', labelEn: 'Proudly', category: 'positive' },
  { value: 'confidently', label: 'Avec assurance', labelEn: 'Confidently', category: 'positive' },
  { value: 'hopefully', label: 'Avec espoir', labelEn: 'Hopefully', category: 'positive' },
  { value: 'gratefully', label: 'Avec gratitude', labelEn: 'Gratefully', category: 'positive' },
  { value: 'relieved', label: 'Soulagé', labelEn: 'Relieved', category: 'positive' },
  // Negative emotions
  { value: 'angrily', label: 'Avec colère', labelEn: 'Angrily', category: 'negative' },
  { value: 'furiously', label: 'Furieusement', labelEn: 'Furiously', category: 'negative' },
  { value: 'bitterly', label: 'Amèrement', labelEn: 'Bitterly', category: 'negative' },
  { value: 'sadly', label: 'Tristement', labelEn: 'Sadly', category: 'negative' },
  { value: 'mournfully', label: 'Avec affliction', labelEn: 'Mournfully', category: 'negative' },
  { value: 'desperately', label: 'Désespérément', labelEn: 'Desperately', category: 'negative' },
  { value: 'fearfully', label: 'Avec peur', labelEn: 'Fearfully', category: 'negative' },
  { value: 'anxiously', label: 'Anxieusement', labelEn: 'Anxiously', category: 'negative' },
  { value: 'nervously', label: 'Nerveusement', labelEn: 'Nervously', category: 'negative' },
  { value: 'hesitantly', label: 'Avec hésitation', labelEn: 'Hesitantly', category: 'negative' },
  { value: 'reluctantly', label: 'À contrecœur', labelEn: 'Reluctantly', category: 'negative' },
  { value: 'resentfully', label: 'Avec ressentiment', labelEn: 'Resentfully', category: 'negative' },
  { value: 'disgustedly', label: 'Avec dégoût', labelEn: 'Disgustedly', category: 'negative' },
  { value: 'contemptuously', label: 'Avec mépris', labelEn: 'Contemptuously', category: 'negative' },
  // Intensity/Volume
  { value: 'whispers', label: 'Chuchote', labelEn: 'Whispers', category: 'intensity' },
  { value: 'murmurs', label: 'Murmure', labelEn: 'Murmurs', category: 'intensity' },
  { value: 'shouts', label: 'Crie', labelEn: 'Shouts', category: 'intensity' },
  { value: 'screams', label: 'Hurle', labelEn: 'Screams', category: 'intensity' },
  { value: 'yells', label: 'S\'écrie', labelEn: 'Yells', category: 'intensity' },
  // Character attitudes
  { value: 'sarcastically', label: 'Sarcastiquement', labelEn: 'Sarcastically', category: 'attitude' },
  { value: 'mockingly', label: 'Moqueusement', labelEn: 'Mockingly', category: 'attitude' },
  { value: 'teasingly', label: 'Taquinement', labelEn: 'Teasingly', category: 'attitude' },
  { value: 'seductively', label: 'Séducteur', labelEn: 'Seductively', category: 'attitude' },
  { value: 'mysteriously', label: 'Mystérieusement', labelEn: 'Mysteriously', category: 'attitude' },
  { value: 'threateningly', label: 'Menaçant', labelEn: 'Threateningly', category: 'attitude' },
  { value: 'defiantly', label: 'Avec défi', labelEn: 'Defiantly', category: 'attitude' },
  { value: 'smugly', label: 'Avec suffisance', labelEn: 'Smugly', category: 'attitude' },
];

// Category labels for UI grouping
export const DIALOGUE_TONE_CATEGORIES: Record<DialogueToneOption['category'], string> = {
  neutral: '🎭 Neutre',
  positive: '😊 Positif',
  negative: '😢 Négatif',
  intensity: '🔊 Intensité',
  attitude: '😏 Attitude',
};

export const CAMERA_MOVEMENT_OPTIONS: { value: CameraMovement; label: string; description: string }[] = [
  { value: 'static', label: 'Static', description: 'No movement' },
  { value: 'slow_dolly_in', label: 'Dolly In (slow)', description: 'Slowly move toward subject' },
  { value: 'slow_dolly_out', label: 'Dolly Out (slow)', description: 'Slowly move away from subject' },
  { value: 'dolly_left', label: 'Dolly Left', description: 'Track left' },
  { value: 'dolly_right', label: 'Dolly Right', description: 'Track right' },
  { value: 'tracking_forward', label: 'Tracking Forward', description: 'Follow subject forward' },
  { value: 'tracking_backward', label: 'Tracking Backward', description: 'Pull back from subject' },
  { value: 'pan_left', label: 'Pan Left', description: 'Rotate camera left' },
  { value: 'pan_right', label: 'Pan Right', description: 'Rotate camera right' },
  { value: 'tilt_up', label: 'Tilt Up', description: 'Tilt camera upward' },
  { value: 'tilt_down', label: 'Tilt Down', description: 'Tilt camera downward' },
  { value: 'crane_up', label: 'Crane Up', description: 'Rise vertically' },
  { value: 'crane_down', label: 'Crane Down', description: 'Descend vertically' },
  { value: 'orbit_cw', label: 'Orbit CW', description: 'Circle clockwise around subject' },
  { value: 'orbit_ccw', label: 'Orbit CCW', description: 'Circle counter-clockwise' },
  { value: 'handheld', label: 'Handheld', description: 'Natural shake, documentary feel' },
  { value: 'zoom_in', label: 'Zoom In', description: 'Zoom toward subject' },
  { value: 'zoom_out', label: 'Zoom Out', description: 'Zoom away from subject' },
];

export const DIALOGUE_LANGUAGE_OPTIONS: { value: DialogueLanguage; label: string; flag: string }[] = [
  { value: 'en', label: 'English', flag: '🇬🇧' },
  { value: 'fr', label: 'French', flag: '🇫🇷' },
  { value: 'es', label: 'Spanish', flag: '🇪🇸' },
  { value: 'de', label: 'German', flag: '🇩🇪' },
  { value: 'it', label: 'Italian', flag: '🇮🇹' },
  { value: 'pt', label: 'Portuguese', flag: '🇵🇹' },
  { value: 'zh', label: 'Chinese', flag: '🇨🇳' },
  { value: 'ja', label: 'Japanese', flag: '🇯🇵' },
  { value: 'ko', label: 'Korean', flag: '🇰🇷' },
];

// ============================================================================
// Sequence Transition Types
// ============================================================================

export type TransitionType =
  // Basic
  | 'dissolve'
  | 'fade'
  // Fade to/from color
  | 'fadeblack'
  | 'fadewhite'
  // Zoom
  | 'crosszoom'
  | 'zoomin'
  | 'zoomout'
  // Slide
  | 'slideleft'
  | 'slideright'
  | 'slideup'
  | 'slidedown'
  // Wipe
  | 'directionalwipe'
  // Shape
  | 'circleopen'
  | 'circleclose'
  | 'radial'
  // 3D
  | 'cube';

export const TRANSITION_TYPE_OPTIONS: { value: TransitionType; label: string; category: string }[] = [
  // Basic
  { value: 'dissolve', label: 'Dissolve', category: 'Basic' },
  { value: 'fade', label: 'Fade', category: 'Basic' },
  // Fade to/from color
  { value: 'fadeblack', label: 'Fade to Black', category: 'Fade' },
  { value: 'fadewhite', label: 'Fade to White', category: 'Fade' },
  // Zoom
  { value: 'crosszoom', label: 'Cross Zoom', category: 'Zoom' },
  { value: 'zoomin', label: 'Zoom In', category: 'Zoom' },
  { value: 'zoomout', label: 'Zoom Out', category: 'Zoom' },
  // Slide
  { value: 'slideleft', label: 'Slide Left', category: 'Slide' },
  { value: 'slideright', label: 'Slide Right', category: 'Slide' },
  { value: 'slideup', label: 'Slide Up', category: 'Slide' },
  { value: 'slidedown', label: 'Slide Down', category: 'Slide' },
  // Wipe
  { value: 'directionalwipe', label: 'Directional Wipe', category: 'Wipe' },
  // Shape
  { value: 'circleopen', label: 'Circle Open', category: 'Shape' },
  { value: 'circleclose', label: 'Circle Close', category: 'Shape' },
  { value: 'radial', label: 'Radial', category: 'Shape' },
  // 3D
  { value: 'cube', label: 'Cube', category: '3D' },
];

// ============================================================================
// Sequence (group of contiguous plans within a Short)
// ============================================================================

export interface Sequence {
  id: string;
  scene_id: string;  // Short ID (scenes table)
  title: string | null;
  sort_order: number;

  // Cinematic style (shared by all plans in this sequence)
  cinematic_header: CinematicHeaderConfig | null;

  // Transitions
  transition_in: TransitionType | null;   // Entrée: [<--
  transition_out: TransitionType | null;  // Sortie: -->]
  transition_duration: number;

  // Assembly cache
  assembled_video_url: string | null;  // B2 URL of assembled sequence
  assembled_plan_hash: string | null;  // MD5 hash to detect plan changes
  assembled_at: string | null;         // Last assembly timestamp

  // Timestamps
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// Short Music Settings
// ============================================================================

export interface ShortMusicSettings {
  music_asset_id: string | null;
  music_volume: number;
  music_fade_in: number;
  music_fade_out: number;
}

// ============================================================================
// Helper: Create default beat
// ============================================================================

export function createDefaultBeat(type: BeatType = 'action'): ShotBeat {
  return {
    id: crypto.randomUUID(),
    type,
    content: '',
  };
}

// ============================================================================
// Helper: Create default segment
// ============================================================================

export function createDefaultSegment(startTime: number = 0, duration: number = 5): Segment {
  return {
    id: crypto.randomUUID(),
    start_time: startTime,
    end_time: startTime + duration,
    shot_framing: 'medium',
    shot_composition: 'single',
    beats: [],
  };
}

// ============================================================================
// Helper: Get plan display title
// ============================================================================

export function getPlanDisplayTitle(plan: { title?: string | null; sort_order?: number }, index?: number): string {
  if (plan.title) return plan.title;
  const num = plan.sort_order !== undefined ? plan.sort_order + 1 : (index !== undefined ? index + 1 : 1);
  return `Plan ${num}`;
}
