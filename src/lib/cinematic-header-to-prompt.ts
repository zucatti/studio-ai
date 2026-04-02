/**
 * Cinematic Header to Prompt Converter
 *
 * Converts the wizard-based CinematicHeaderConfig into a text prompt
 * suitable for Kling Omni video generation.
 */

import type {
  CinematicHeaderConfig,
  LightingStyle,
  LightingSource,
  LightingModifier,
  TimeOfDayCinematic,
  Weather,
  CameraTypeCinematic,
  LensType,
  ApertureStyle,
  FocusStyle,
  ColorTemperature,
  ColorSaturation,
  ColorContrast,
  ColorStyle,
  ToneGenre,
  ToneMood,
  TonePacing,
} from '@/types/cinematic';

// ============================================================================
// Text mappings for each option
// ============================================================================

const LIGHTING_STYLE_TEXT: Record<LightingStyle, string> = {
  high_key: 'bright, even lighting with minimal shadows',
  low_key: 'dark, dramatic low-key lighting with strong shadows',
  dramatic: 'dramatic lighting with high contrast',
  soft: 'soft, diffused lighting',
  harsh: 'harsh, direct lighting with hard shadows',
  silhouette: 'backlit silhouette lighting',
};

const LIGHTING_SOURCE_TEXT: Record<LightingSource, string> = {
  single_source: 'single source lighting',
  three_point: 'three-point lighting setup',
  practical: 'practical lighting from visible sources',
  ambient: 'ambient environmental lighting',
};

const LIGHTING_MODIFIER_TEXT: Record<LightingModifier, string> = {
  diffused: 'diffused',
  direct: 'direct',
  bounced: 'bounced',
  colored: 'colored',
};

const TIME_OF_DAY_TEXT: Record<TimeOfDayCinematic, string> = {
  dawn: 'dawn light',
  morning: 'morning light',
  midday: 'midday light',
  afternoon: 'afternoon light',
  golden_hour: 'golden hour light',
  dusk: 'dusk light',
  night: 'night setting',
  blue_hour: 'blue hour light',
};

const WEATHER_TEXT: Record<Weather, string> = {
  clear: 'clear weather',
  cloudy: 'cloudy skies',
  overcast: 'overcast conditions',
  rain: 'rain',
  fog: 'foggy atmosphere',
  storm: 'stormy conditions',
};

const CAMERA_TYPE_TEXT: Record<CameraTypeCinematic, string> = {
  handheld: 'handheld camera',
  steadicam: 'steadicam',
  tripod: 'tripod-mounted camera',
  drone: 'drone camera',
  gimbal: 'gimbal-stabilized camera',
  crane: 'crane shot',
  dolly: 'dolly shot',
};

const LENS_TYPE_TEXT: Record<LensType, string> = {
  wide: 'wide angle lens',
  standard: 'standard lens (35-50mm)',
  telephoto: 'telephoto lens',
  macro: 'macro lens',
  anamorphic: 'anamorphic lens',
};

const APERTURE_TEXT: Record<ApertureStyle, string> = {
  shallow_dof: 'shallow depth of field',
  medium_dof: 'medium depth of field',
  deep_dof: 'deep depth of field',
};

const FOCUS_TEXT: Record<FocusStyle, string> = {
  rack_focus: 'rack focus',
  pull_focus: 'pull focus',
  soft_focus: 'soft focus',
  sharp: 'sharp focus',
};

const TEMPERATURE_TEXT: Record<ColorTemperature, string> = {
  warm: 'warm tones',
  neutral: 'neutral color temperature',
  cold: 'cold blue-green tones',
};

const SATURATION_TEXT: Record<ColorSaturation, string> = {
  vibrant: 'vibrant, saturated colors',
  natural: 'natural color saturation',
  desaturated: 'desaturated colors',
  monochrome: 'monochrome',
};

const CONTRAST_TEXT: Record<ColorContrast, string> = {
  low: 'low contrast',
  medium: 'medium contrast',
  high: 'high contrast',
};

const COLOR_STYLE_TEXT: Record<ColorStyle, string> = {
  cinematic: 'cinematic color grading',
  vintage: 'vintage film look',
  modern: 'modern clean look',
  noir: 'film noir style',
  pastel: 'pastel color palette',
  teal_orange: 'teal and orange color grading',
};

const GENRE_TEXT: Record<ToneGenre, string> = {
  action: 'action',
  comedy: 'comedy',
  documentary: 'documentary',
  horror: 'horror',
  intimate: 'intimate drama',
  spectacle: 'epic spectacle',
  suspense: 'suspense thriller',
  western: 'western',
};

const MOOD_TEXT: Record<ToneMood, string> = {
  tense: 'tense',
  intimate: 'intimate',
  epic: 'epic',
  melancholic: 'melancholic',
  joyful: 'joyful',
  mysterious: 'mysterious',
  peaceful: 'peaceful',
};

const PACING_TEXT: Record<TonePacing, string> = {
  slow: 'slow pacing',
  moderate: 'moderate pacing',
  fast: 'fast pacing',
  frenetic: 'frenetic pacing',
};

// ============================================================================
// Main conversion function
// ============================================================================

/**
 * Convert a CinematicHeaderConfig into a formatted text prompt
 */
export function cinematicHeaderToPrompt(config: CinematicHeaderConfig): string {
  const sections: string[] = [];

  // Build CINEMATIC STYLE section
  const styleLines: string[] = [];

  // Lighting
  if (config.lighting) {
    const { type, style, source, modifiers } = config.lighting;
    let lightingDesc = LIGHTING_STYLE_TEXT[style];

    if (source) {
      lightingDesc += `, ${LIGHTING_SOURCE_TEXT[source]}`;
    }

    if (modifiers && modifiers.length > 0) {
      const modifierText = modifiers.map(m => LIGHTING_MODIFIER_TEXT[m]).join(', ');
      lightingDesc += ` (${modifierText})`;
    }

    if (type === 'natural') {
      lightingDesc = `Natural ${lightingDesc}`;
    } else if (type === 'artificial') {
      lightingDesc = `Artificial ${lightingDesc}`;
    } else if (type === 'mixed') {
      lightingDesc = `Mixed natural and artificial ${lightingDesc}`;
    }

    styleLines.push(lightingDesc);
  }

  // Time & Weather
  if (config.time_of_day) {
    let timeDesc = TIME_OF_DAY_TEXT[config.time_of_day];
    if (config.weather && config.weather !== 'clear') {
      timeDesc += `, ${WEATHER_TEXT[config.weather]}`;
    }
    styleLines.push(timeDesc);
  }

  if (styleLines.length > 0) {
    sections.push(`CINEMATIC STYLE: ${styleLines.join('. ')}.`);
  }

  // Build CAMERA section
  if (config.camera) {
    sections.push(`CAMERA: ${CAMERA_TYPE_TEXT[config.camera.type]}.`);
  }

  // Build COLOR GRADE section
  if (config.color_grade) {
    const { temperature, saturation, contrast, style, lut_reference } = config.color_grade;
    const colorLines: string[] = [];

    colorLines.push(TEMPERATURE_TEXT[temperature]);
    colorLines.push(SATURATION_TEXT[saturation]);
    colorLines.push(CONTRAST_TEXT[contrast]);

    if (style) {
      colorLines.push(COLOR_STYLE_TEXT[style]);
    }

    if (lut_reference) {
      colorLines.push(`${lut_reference} LUT`);
    }

    sections.push(`COLOR GRADE: ${colorLines.join(', ')}.`);
  }

  // Build TONE section
  if (config.tone) {
    sections.push(`TONE: ${GENRE_TEXT[config.tone.genre]} atmosphere.`);
  }

  // Build CAST section (if provided)
  if (config.cast && config.cast.count > 0) {
    const { count, age_range, relationship } = config.cast;
    let castDesc = `${count} actor${count > 1 ? 's' : ''}`;

    if (age_range) {
      castDesc += `, ${age_range}`;
    }

    if (relationship) {
      castDesc += ` (${relationship})`;
    }

    sections.push(`CAST: ${castDesc}.`);
  }

  // Add additional notes if present
  if (config.additional_notes && config.additional_notes.trim()) {
    sections.push(config.additional_notes.trim());
  }

  return sections.join('\n');
}

/**
 * Create a default CinematicHeaderConfig with sensible defaults
 */
export function createDefaultCinematicHeader(): CinematicHeaderConfig {
  return {
    lighting: {
      type: 'natural',
      style: 'soft',
    },
    time_of_day: 'morning',
    camera: {
      type: 'tripod',
    },
    color_grade: {
      temperature: 'cold',
      saturation: 'desaturated',
      contrast: 'medium',
      style: 'cinematic',
    },
    tone: {
      genre: 'intimate',
    },
  };
}

/**
 * Create a preset based on genre
 */
export function createGenrePreset(genre: ToneGenre): CinematicHeaderConfig {
  const base = createDefaultCinematicHeader();

  switch (genre) {
    case 'action':
      return {
        ...base,
        lighting: { type: 'mixed', style: 'dramatic' },
        time_of_day: 'afternoon',
        camera: { type: 'handheld' },
        color_grade: { temperature: 'neutral', saturation: 'vibrant', contrast: 'high', style: 'teal_orange' },
        tone: { genre: 'action' },
      };

    case 'comedy':
      return {
        ...base,
        lighting: { type: 'natural', style: 'high_key' },
        time_of_day: 'morning',
        color_grade: { temperature: 'warm', saturation: 'vibrant', contrast: 'low', style: 'modern' },
        tone: { genre: 'comedy' },
      };

    case 'horror':
      return {
        ...base,
        lighting: { type: 'artificial', style: 'low_key' },
        time_of_day: 'night',
        weather: 'fog',
        color_grade: { temperature: 'cold', saturation: 'desaturated', contrast: 'high', style: 'noir' },
        tone: { genre: 'horror' },
      };

    case 'intimate':
      return {
        ...base,
        lighting: { type: 'natural', style: 'soft' },
        time_of_day: 'golden_hour',
        color_grade: { temperature: 'warm', saturation: 'natural', contrast: 'low', style: 'pastel' },
        tone: { genre: 'intimate' },
      };

    case 'spectacle':
      return {
        ...base,
        lighting: { type: 'artificial', style: 'dramatic' },
        time_of_day: 'night',
        camera: { type: 'steadicam' },
        color_grade: { temperature: 'cold', saturation: 'vibrant', contrast: 'high', style: 'teal_orange' },
        tone: { genre: 'spectacle' },
      };

    case 'suspense':
      return {
        ...base,
        lighting: { type: 'artificial', style: 'low_key' },
        time_of_day: 'night',
        color_grade: { temperature: 'cold', saturation: 'desaturated', contrast: 'high', style: 'teal_orange' },
        tone: { genre: 'suspense' },
      };

    case 'western':
      return {
        ...base,
        lighting: { type: 'natural', style: 'harsh' },
        time_of_day: 'golden_hour',
        color_grade: { temperature: 'warm', saturation: 'natural', contrast: 'high', style: 'cinematic' },
        tone: { genre: 'western' },
      };

    case 'documentary':
      return {
        ...base,
        lighting: { type: 'natural', style: 'soft' },
        time_of_day: 'afternoon',
        camera: { type: 'handheld' },
        color_grade: { temperature: 'neutral', saturation: 'natural', contrast: 'medium', style: 'modern' },
        tone: { genre: 'documentary' },
      };

    default:
      return base;
  }
}
