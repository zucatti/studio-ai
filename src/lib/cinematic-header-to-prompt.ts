/**
 * Cinematic Header to Prompt Converter
 *
 * Converts the wizard-based CinematicHeaderConfig into a text prompt
 * suitable for Kling Omni video generation.
 */

import type {
  CinematicHeaderConfig,
  SceneSetting,
  LightingStyle,
  LightingSource,
  LightingModifier,
  TimeOfDayCinematic,
  Weather,
  CameraTypeCinematic,
  ColorStyle,
  ToneGenre,
} from '@/types/cinematic';

// ============================================================================
// Scene setting mappings
// ============================================================================

const SCENE_SETTING_TEXT: Record<SceneSetting, string> = {
  int: 'INT.',
  ext: 'EXT.',
  int_ext: 'INT./EXT.',
};

const TIME_FOR_SLUGLINE: Record<TimeOfDayCinematic, string> = {
  dawn: 'DAWN',
  morning: 'DAY',
  midday: 'DAY',
  afternoon: 'DAY',
  golden_hour: 'GOLDEN HOUR',
  dusk: 'DUSK',
  night: 'NIGHT',
  blue_hour: 'BLUE HOUR',
};

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

const DEPTH_OF_FIELD_TEXT: Record<string, string> = {
  shallow_dof: 'shallow depth of field',
  medium_dof: 'medium depth of field',
  deep_dof: 'deep depth of field',
};

const COLOR_STYLE_TEXT: Record<ColorStyle, string> = {
  cinematic: 'cinematic color grading',
  vintage: 'vintage film look',
  modern: 'modern clean look',
  noir: 'film noir style',
  pastel: 'pastel color palette',
  teal_orange: 'teal and orange color grading',
  black_white: 'black and white cinematography',
  saturated: 'highly saturated vivid colors',
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

// ============================================================================
// Main conversion function
// ============================================================================

/**
 * Convert a CinematicHeaderConfig into a formatted text prompt
 */
export function cinematicHeaderToPrompt(config: CinematicHeaderConfig, locationName?: string): string {
  const sections: string[] = [];

  // Build SCENE slugline (INT. LOCATION - TIME)
  if (config.scene?.setting) {
    const setting = SCENE_SETTING_TEXT[config.scene.setting];
    const location = locationName || config.scene.location_custom || 'LOCATION';
    const time = TIME_FOR_SLUGLINE[config.time_of_day] || 'DAY';
    sections.push(`${setting} ${location.toUpperCase()} - ${time}`);
  }

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
    let cameraDesc = CAMERA_TYPE_TEXT[config.camera.type];
    if (config.camera.depth_of_field) {
      cameraDesc += `, ${DEPTH_OF_FIELD_TEXT[config.camera.depth_of_field]}`;
    }
    sections.push(`CAMERA: ${cameraDesc}.`);
  }

  // Build COLOR GRADE section
  if (config.color_grade) {
    sections.push(`COLOR GRADE: ${COLOR_STYLE_TEXT[config.color_grade.style]}.`);
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

  // Join with space - the master prompt format uses a single flowing line
  // not multiple lines with newlines
  return sections.join(' ');
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
        color_grade: { style: 'teal_orange' },
        tone: { genre: 'action' },
      };

    case 'comedy':
      return {
        ...base,
        lighting: { type: 'natural', style: 'high_key' },
        time_of_day: 'morning',
        color_grade: { style: 'modern' },
        tone: { genre: 'comedy' },
      };

    case 'horror':
      return {
        ...base,
        lighting: { type: 'artificial', style: 'low_key' },
        time_of_day: 'night',
        weather: 'fog',
        color_grade: { style: 'noir' },
        tone: { genre: 'horror' },
      };

    case 'intimate':
      return {
        ...base,
        lighting: { type: 'natural', style: 'soft' },
        time_of_day: 'golden_hour',
        color_grade: { style: 'pastel' },
        tone: { genre: 'intimate' },
      };

    case 'spectacle':
      return {
        ...base,
        lighting: { type: 'artificial', style: 'dramatic' },
        time_of_day: 'night',
        camera: { type: 'steadicam' },
        color_grade: { style: 'saturated' },
        tone: { genre: 'spectacle' },
      };

    case 'suspense':
      return {
        ...base,
        lighting: { type: 'artificial', style: 'low_key' },
        time_of_day: 'night',
        color_grade: { style: 'teal_orange' },
        tone: { genre: 'suspense' },
      };

    case 'western':
      return {
        ...base,
        lighting: { type: 'natural', style: 'harsh' },
        time_of_day: 'golden_hour',
        color_grade: { style: 'cinematic' },
        tone: { genre: 'western' },
      };

    case 'documentary':
      return {
        ...base,
        lighting: { type: 'natural', style: 'soft' },
        time_of_day: 'afternoon',
        camera: { type: 'handheld' },
        color_grade: { style: 'modern' },
        tone: { genre: 'documentary' },
      };

    default:
      return base;
  }
}
