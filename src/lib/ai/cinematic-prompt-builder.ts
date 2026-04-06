/**
 * Cinematic Prompt Builder
 *
 * Builds prompts for video generation with character consistency.
 * Supports multiple models with different syntax:
 *
 * KLING OMNI:
 * - Character refs: @Element1, @Element2 (max 6)
 * - Voice refs: <<<voice_1>>>, <<<voice_2>>> (max 2)
 * - Requires voice_ids parameter for TTS
 * - Max 6 elements, 7 total images (including start frame)
 *
 * SEEDANCE 2.0:
 * - Character refs: @image1, @image2 (max 9)
 * - Audio: Native from prompt (no voice_ids needed)
 * - Describe voices in prompt: "speaks in a warm, elderly voice"
 * - Max 9 reference images via images_list
 */

import type { Plan, Short } from '@/store/shorts-store';
import type { GlobalAsset } from '@/types/database';
import type { Segment, ShotType, CameraMovement, CinematicHeaderConfig, ShotBeat } from '@/types/cinematic';
import { cinematicHeaderToPrompt, getStyleBibleFromCinematicStyle } from '@/lib/cinematic-header-to-prompt';

// ============================================================================
// Types
// ============================================================================

/**
 * Supported video models for prompt building
 */
export type VideoModelType = 'kling-omni' | 'seedance-2' | 'seedance-2-fast' | string;

/**
 * Model-specific configuration
 */
interface ModelConfig {
  maxElements: number;
  maxVoices: number; // For Kling voice_ids
  maxAudios: number; // For Seedance audio references
  totalImageBudget: number;
  elementPrefix: string; // '@Element' or '@image'
  voiceSyntax: 'kling' | 'audio-ref'; // <<<voice_1>>> or @Audio1
}

const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'kling-omni': {
    maxElements: 6,
    maxVoices: 2,
    maxAudios: 0,
    totalImageBudget: 7, // 6 elements + 1 start frame
    elementPrefix: '@Element',
    voiceSyntax: 'kling',
  },
  'seedance-2': {
    maxElements: 9,
    maxVoices: 0,
    maxAudios: 3, // Up to 3 audio files, combined max 15s
    totalImageBudget: 9, // Max images_list
    elementPrefix: '@image',
    voiceSyntax: 'audio-ref', // @Audio1, @Audio2, etc.
  },
  'seedance-2-fast': {
    maxElements: 9,
    maxVoices: 0,
    maxAudios: 3,
    totalImageBudget: 9,
    elementPrefix: '@image',
    voiceSyntax: 'audio-ref',
  },
};

// Default config for unknown models (use Kling syntax)
const DEFAULT_CONFIG: ModelConfig = MODEL_CONFIGS['kling-omni'];

function getModelConfig(model: VideoModelType): ModelConfig {
  return MODEL_CONFIGS[model] || DEFAULT_CONFIG;
}

/**
 * Plan with cinematic fields for prompt building
 * cinematic_header is populated from the parent Sequence at runtime
 */
export type CinematicPlan = Plan & {
  cinematic_header?: CinematicHeaderConfig | null;
};

/**
 * Short with cinematic fields (Short already includes these fields)
 */
export type CinematicShort = Short;

/**
 * Character info for prompt building
 * Distinguishes between "Stars" (with images) and "Figurants" (description only)
 */
export interface PromptCharacter {
  id: string;
  name: string;
  isStar: boolean; // Has reference images
  visualDescription?: string;
  voiceId?: string; // fal.ai voice ID (Kling only)
  voiceDescription?: string; // "warm female voice", "deep male voice"
  elementIndex?: number; // @Element1/@image1, etc. (only for stars)
  voiceIndex?: number; // <<<voice_1>>>, <<<voice_2>>> (Kling only)
  audioIndex?: number; // @Audio1, @Audio2, @Audio3 (Seedance only, max 3)
  audioUrl?: string; // Pre-rendered audio URL for Seedance
}

/**
 * Result of analyzing characters for prompt building
 */
export interface CharacterAnalysis {
  stars: PromptCharacter[]; // Characters with reference images
  figurants: PromptCharacter[]; // Characters without reference images
  all: Map<string, PromptCharacter>; // Quick lookup by ID
  imagesPerStar: number; // How many images to use per star (based on count)
  modelConfig: ModelConfig; // Model-specific settings
}

// ============================================================================
// Constants (legacy, kept for backward compatibility)
// ============================================================================

// Max elements supported by Kling O3/V3
const MAX_ELEMENTS = 6;
// Max voices supported by fal.ai Kling API
const MAX_VOICES = 2;
// Total image budget (elements + reference images + start image ≤ 7)
const TOTAL_IMAGE_BUDGET = 7;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format time in MM:SS format
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get shot type label for prompt
 */
function getShotTypeLabel(shotType: ShotType | string | null | undefined): string {
  if (!shotType) return 'SHOT';

  const labels: Record<string, string> = {
    extreme_wide: 'EXTREME WIDE',
    wide: 'WIDE',
    medium_wide: 'MEDIUM WIDE',
    medium: 'MEDIUM',
    medium_close_up: 'MEDIUM CLOSE-UP',
    close_up: 'CLOSE-UP',
    extreme_close_up: 'EXTREME CLOSE-UP',
    over_shoulder: 'OVER-THE-SHOULDER',
    pov: 'POV',
    insert: 'INSERT',
    two_shot: 'TWO-SHOT',
  };

  return labels[shotType] || shotType.toUpperCase();
}

/**
 * Get camera movement label for prompt (Kling-friendly format)
 */
function getCameraMovementLabel(movement: CameraMovement | string | null): string {
  if (!movement || movement === 'static') return 'static camera';

  const labels: Record<string, string> = {
    slow_dolly_in: 'slow dolly in towards subject',
    slow_dolly_out: 'slow dolly out from subject',
    dolly_left: 'dolly left',
    dolly_right: 'dolly right',
    tracking_forward: 'tracking forward movement',
    tracking_backward: 'tracking backward movement',
    pan_left: 'pan left',
    pan_right: 'pan right',
    tilt_up: 'tilt up',
    tilt_down: 'tilt down',
    crane_up: 'crane up',
    crane_down: 'crane down',
    orbit_cw: 'orbit clockwise around subject',
    orbit_ccw: 'orbit counter-clockwise around subject',
    handheld: 'handheld camera subtle movement',
    zoom_in: 'smooth zoom in',
    zoom_out: 'smooth zoom out',
  };

  return labels[movement] || movement.replace(/_/g, ' ');
}

/**
 * Estimate dialogue duration based on word count and tone
 * Average speaking rate: ~150 words/min = 2.5 words/sec
 */
function estimateDialogueDuration(text: string, tone?: string): number {
  if (!text) return 0;

  const words = text.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  // Adjust by tone
  const toneMultipliers: Record<string, number> = {
    neutral: 1.0,
    angry: 0.85,
    fearful: 0.9,
    sad: 1.2,
    joyful: 0.95,
    sarcastic: 1.1,
    whispered: 1.15,
    shouted: 0.8,
    warmly: 1.0,
    coldly: 1.1,
    flatly: 1.0,
  };

  const toneMultiplier = toneMultipliers[tone || 'neutral'] || 1.0;

  // Add time for punctuation pauses
  const commas = (text.match(/,/g) || []).length;
  const periods = (text.match(/[.!?]/g) || []).length;
  const ellipsis = (text.match(/\.\.\./g) || []).length;
  const pauseTime = (commas * 0.15) + (periods * 0.3) + (ellipsis * 0.5);

  const baseDuration = (wordCount / 2.5) * toneMultiplier;
  return Math.round((baseDuration + pauseTime) * 10) / 10;
}

/**
 * Get tone description for Kling prompt
 */
function getToneDescription(tone?: string): string {
  if (!tone || tone === 'neutral') return '';

  const descriptions: Record<string, string> = {
    angry: 'in an angry, intense tone',
    fearful: 'in a fearful, trembling voice',
    sad: 'in a sad, melancholic tone',
    joyful: 'in a joyful, enthusiastic tone',
    sarcastic: 'in a sarcastic, dry tone',
    whispered: 'in a soft whisper',
    shouted: 'shouting loudly',
    warmly: 'in a warm, friendly tone',
    coldly: 'in a cold, distant tone',
    flatly: 'in a flat, emotionless tone',
  };

  return descriptions[tone] || `in a ${tone} tone`;
}

// ============================================================================
// Character Analysis
// ============================================================================

/**
 * Analyze characters to determine Stars vs Figurants and image distribution
 *
 * @param characters - Map of character ID to GlobalAsset
 * @param hasStartFrame - Whether a starting frame is provided
 * @param targetModel - Target video model (affects max elements, voice handling)
 */
export function analyzeCharacters(
  characters: Map<string, GlobalAsset>,
  hasStartFrame: boolean = true,
  targetModel: VideoModelType = 'kling-omni'
): CharacterAnalysis {
  const modelConfig = getModelConfig(targetModel);
  const stars: PromptCharacter[] = [];
  const figurants: PromptCharacter[] = [];
  const all = new Map<string, PromptCharacter>();

  let elementIndex = 1;
  let voiceIndex = 1;
  let audioIndex = 1;

  // Sort characters: those with voice first (for voice slot priority)
  const sortedChars = Array.from(characters.values()).sort((a, b) => {
    const aHasVoice = !!(a.data as Record<string, unknown>)?.fal_voice_id;
    const bHasVoice = !!(b.data as Record<string, unknown>)?.fal_voice_id;
    if (aHasVoice && !bHasVoice) return -1;
    if (!aHasVoice && bHasVoice) return 1;
    return 0;
  });

  for (const char of sortedChars) {
    const charData = char.data as Record<string, unknown> | null;
    const hasImages = char.reference_images && char.reference_images.length > 0;
    const voiceId = charData?.fal_voice_id as string | undefined;
    const visualDesc = charData?.visual_description as string | undefined;
    const voiceDesc = charData?.voice_description as string | undefined;

    const promptChar: PromptCharacter = {
      id: char.id,
      name: char.name,
      isStar: hasImages,
      visualDescription: visualDesc,
      voiceId,
      voiceDescription: voiceDesc,
    };

    // Use model-specific max elements
    if (hasImages && elementIndex <= modelConfig.maxElements) {
      promptChar.elementIndex = elementIndex;
      elementIndex++;
      stars.push(promptChar);
    } else {
      figurants.push(promptChar);
    }

    // Assign voice index (Kling only, max 2)
    if (modelConfig.voiceSyntax === 'kling' && voiceId && voiceIndex <= modelConfig.maxVoices) {
      promptChar.voiceIndex = voiceIndex;
      voiceIndex++;
    }

    // Assign audio index (Seedance only, max 3)
    // Audio files must be pre-rendered and passed as audio_urls
    if (modelConfig.voiceSyntax === 'audio-ref' && voiceId && audioIndex <= modelConfig.maxAudios) {
      promptChar.audioIndex = audioIndex;
      audioIndex++;
    }

    all.set(char.id, promptChar);
  }

  // Calculate images per star based on count and model budget
  const availableSlots = modelConfig.totalImageBudget - (hasStartFrame ? 1 : 0);
  const starCount = stars.length;

  let imagesPerStar: number;
  if (starCount === 0) {
    imagesPerStar = 0;
  } else if (starCount === 1) {
    imagesPerStar = Math.min(3, availableSlots); // front, profile, back
  } else if (starCount === 2) {
    imagesPerStar = Math.min(2, Math.floor(availableSlots / 2)); // front, profile
  } else {
    // 3+ stars: distribute evenly, at least 1 each
    imagesPerStar = Math.max(1, Math.floor(availableSlots / starCount));
  }

  return { stars, figurants, all, imagesPerStar, modelConfig };
}

/**
 * Get character reference for prompt
 * - Kling: @Element1, @Element2
 * - Seedance: @image1, @image2
 * - Figurants: Just the name (description already in Character Legend)
 *
 * Like in cinema scripts, characters are introduced once with their description
 * in the legend, then referenced by name only in dialogue/action.
 */
function getCharacterReference(
  characterId: string,
  analysis: CharacterAnalysis
): string {
  const char = analysis.all.get(characterId);
  if (!char) return '';

  if (char.isStar && char.elementIndex) {
    // Use model-specific prefix
    const prefix = analysis.modelConfig.elementPrefix;
    return `${prefix}${char.elementIndex}`;
  }

  // Figurant: just use name (description already in Character Legend)
  // This follows cinema script convention: introduce once, then name only
  return char.name;
}

/**
 * Get voice reference for prompt
 * - Kling: <<<voice_1>>> (requires voice_ids parameter)
 * - Seedance: Returns empty string (native audio from prompt description)
 */
function getVoiceReference(
  characterId: string,
  analysis: CharacterAnalysis
): string {
  const char = analysis.all.get(characterId);
  if (!char) return '';

  // Kling: use <<<voice_N>>> syntax
  if (analysis.modelConfig.voiceSyntax === 'kling' && char.voiceIndex) {
    return `<<<voice_${char.voiceIndex}>>>`;
  }

  // Seedance: use @AudioN syntax (requires pre-rendered audio files)
  if (analysis.modelConfig.voiceSyntax === 'audio-ref' && char.audioIndex) {
    return `@Audio${char.audioIndex}`;
  }

  return '';
}

/**
 * Get voice description for Seedance (native audio)
 * Returns a natural language description of the voice
 */
function getVoiceDescription(
  characterId: string,
  analysis: CharacterAnalysis
): string {
  const char = analysis.all.get(characterId);
  if (!char) return '';

  // For Seedance, we describe the voice naturally
  if (analysis.modelConfig.voiceSyntax === 'audio-ref') {
    if (char.voiceDescription) {
      return char.voiceDescription;
    }
    // Fallback: infer from visual description
    if (char.visualDescription) {
      const desc = char.visualDescription.toLowerCase();
      if (desc.includes('elderly') || desc.includes('old') || desc.includes('70') || desc.includes('80')) {
        return 'with an elderly, weathered voice';
      }
      if (desc.includes('young') || desc.includes('child')) {
        return 'with a young voice';
      }
    }
  }

  return '';
}

// ============================================================================
// Character Legend Builder
// ============================================================================

/**
 * Build Character Legend section for the prompt
 * - Kling: Maps @Element1 → character with [Voice N]
 * - Seedance: Maps @image1 → character with voice description
 */
function buildCharacterLegend(analysis: CharacterAnalysis): string {
  if (analysis.stars.length === 0) return '';

  const isKling = analysis.modelConfig.voiceSyntax === 'kling';
  const isSeedance = analysis.modelConfig.voiceSyntax === 'audio-ref';
  const prefix = isKling ? 'Element' : 'image';

  const lines: string[] = [];

  for (const star of analysis.stars) {
    const desc = star.visualDescription || star.name;

    if (isKling) {
      // Kling: "Element 1 = Name: description [Voice 1]"
      const voiceInfo = star.voiceIndex ? ` [Voice ${star.voiceIndex}]` : '';
      lines.push(`${prefix} ${star.elementIndex} = ${star.name}: ${desc}${voiceInfo}`);
    } else {
      // Seedance: "image 1 = Name: description (voice: elderly warm voice)"
      const voiceInfo = star.voiceDescription ? ` (voice: ${star.voiceDescription})` : '';
      lines.push(`${prefix} ${star.elementIndex} = ${star.name}: ${desc}${voiceInfo}`);
    }
  }

  // Add figurants with dialogue potential
  const figurantsWithDesc = analysis.figurants.filter(f => f.visualDescription);
  if (figurantsWithDesc.length > 0) {
    lines.push(''); // Empty line separator
    lines.push('Additional characters (no reference images):');
    for (const fig of figurantsWithDesc) {
      const voiceInfo = isSeedance && fig.voiceDescription ? ` (voice: ${fig.voiceDescription})` : '';
      lines.push(`- ${fig.name}: ${fig.visualDescription}${voiceInfo}`);
    }
  }

  // IMPORTANT: Join with space, not newline. Newlines cause audio glitches in video generation.
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

// ============================================================================
// Auto-Timecode Calculator
// ============================================================================

/**
 * Calculate auto-timecodes for beats within a segment
 * Returns beats with calculated start/end times
 */
function calculateBeatTimecodes(
  beats: ShotBeat[],
  segmentStart: number,
  segmentEnd: number
): Array<ShotBeat & { calcStart: number; calcEnd: number }> {
  if (!beats || beats.length === 0) return [];

  const segmentDuration = segmentEnd - segmentStart;
  const result: Array<ShotBeat & { calcStart: number; calcEnd: number }> = [];

  // First pass: estimate duration for each beat
  const beatDurations: number[] = beats.map(beat => {
    if (beat.type === 'dialogue' && beat.content) {
      return estimateDialogueDuration(beat.content, beat.tone);
    }
    // Action beats: default 2 seconds, or based on content length
    const words = (beat.content || '').split(/\s+/).filter(w => w.length > 0).length;
    return Math.max(1.5, Math.min(3, words * 0.3));
  });

  // Calculate total estimated duration
  const totalEstimated = beatDurations.reduce((sum, d) => sum + d, 0);

  // Scale to fit segment duration
  const scale = totalEstimated > 0 ? segmentDuration / totalEstimated : 1;

  let currentTime = segmentStart;
  for (let i = 0; i < beats.length; i++) {
    const duration = beatDurations[i] * scale;
    const endTime = Math.min(currentTime + duration, segmentEnd);

    result.push({
      ...beats[i],
      calcStart: Math.round(currentTime * 10) / 10,
      calcEnd: Math.round(endTime * 10) / 10,
    });

    currentTime = endTime;
  }

  return result;
}

// ============================================================================
// Segment-based Builder Function
// ============================================================================

/**
 * Build prompt from segments within a single plan
 *
 * Kling AI 3.0 Best Practice structure:
 * 1. Shot header with camera movement
 * 2. Visual description
 * 3. Sequential actions with timecodes
 * 4. Dialogue with speaker attribution
 */
function buildSegmentsPrompt(
  segments: Segment[],
  analysis: CharacterAnalysis,
  dialogueLanguage: string = 'en',
  planDescription?: string | null
): string {
  const lines: string[] = [];

  // Sort segments by start_time
  const sortedSegments = [...segments].sort((a, b) => a.start_time - b.start_time);

  for (let i = 0; i < sortedSegments.length; i++) {
    const segment = sortedSegments[i];
    const shotNumber = i + 1;

    // Build shot header from framing/composition fields
    let shotType: string;
    if (segment.shot_framing) {
      const framing = segment.shot_framing.replace(/_/g, ' ').toUpperCase();
      const composition = segment.shot_composition && segment.shot_composition !== 'single'
        ? ` ${segment.shot_composition.replace(/_/g, '-').toUpperCase()}`
        : '';
      shotType = `${framing}${composition}`;
    } else {
      shotType = getShotTypeLabel(segment.shot_type);
    }

    // Camera movement
    const cameraLabel = getCameraMovementLabel(segment.camera_movement || null);

    // Build shot header line
    // Format: "Shot 1 (0:00-0:05): CLOSE-UP. Slow dolly in."
    lines.push(`Shot ${shotNumber} (${formatTime(segment.start_time)}-${formatTime(segment.end_time)}): ${shotType}. Camera: ${cameraLabel}.`);

    // Visual description
    const visualParts: string[] = [];
    if (segment.description) {
      visualParts.push(segment.description);
    }
    if (segment.framing) {
      visualParts.push(segment.framing);
    }
    if (segment.action) {
      visualParts.push(segment.action);
    }

    // Fallback to plan description
    if (visualParts.length === 0 && planDescription) {
      visualParts.push(planDescription);
    }

    if (visualParts.length > 0) {
      lines.push(visualParts.join('. ') + '.');
    }

    // Process beats with auto-calculated timecodes
    if (segment.beats && segment.beats.length > 0) {
      const timedBeats = calculateBeatTimecodes(segment.beats, segment.start_time, segment.end_time);

      for (const beat of timedBeats) {
        if (!beat.content) continue;

        // Time range prefix for each beat
        const timeRange = `${formatTime(beat.calcStart)}-${formatTime(beat.calcEnd)}`;

        if (beat.type === 'dialogue' && beat.character_id) {
          // Dialogue beat with character
          const charRef = getCharacterReference(beat.character_id, analysis);
          const voiceRef = getVoiceReference(beat.character_id, analysis);
          const voiceDesc = getVoiceDescription(beat.character_id, analysis);
          const toneDesc = getToneDescription(beat.tone);
          const offScreen = beat.presence === 'off' ? ' (off-screen)' : '';

          // Build dialogue line based on model
          if (voiceRef) {
            // Kling: use <<<voice_N>>> syntax
            lines.push(`${timeRange}: ${charRef}${offScreen} says ${voiceRef}${toneDesc ? ' ' + toneDesc : ''}: "${beat.content}"`);
          } else if (voiceDesc) {
            // Seedance: use natural voice description
            lines.push(`${timeRange}: ${charRef}${offScreen} says ${voiceDesc}${toneDesc ? ', ' + toneDesc : ''}: "${beat.content}"`);
          } else {
            lines.push(`${timeRange}: ${charRef}${offScreen} says${toneDesc ? ' ' + toneDesc : ''}: "${beat.content}"`);
          }
        } else if (beat.type === 'dialogue' && beat.character_name) {
          // Dialogue with name only (figurant)
          const toneDesc = getToneDescription(beat.tone);
          const offScreen = beat.presence === 'off' ? ' (off-screen)' : '';
          lines.push(`${timeRange}: ${beat.character_name}${offScreen} says${toneDesc ? ' ' + toneDesc : ''}: "${beat.content}"`);
        } else {
          // Action beat
          if (beat.character_id) {
            const charRef = getCharacterReference(beat.character_id, analysis);
            lines.push(`${timeRange}: ${charRef} ${beat.content}`);
          } else if (beat.character_name) {
            lines.push(`${timeRange}: ${beat.character_name} ${beat.content}`);
          } else {
            lines.push(`${timeRange}: ${beat.content}`);
          }
        }
      }
    }
    // LEGACY: Dialogue field (fallback if no beats)
    else if (segment.dialogue) {
      const charRef = segment.dialogue.character_id
        ? getCharacterReference(segment.dialogue.character_id, analysis)
        : segment.dialogue.character_name || '';
      const voiceRef = segment.dialogue.character_id
        ? getVoiceReference(segment.dialogue.character_id, analysis)
        : '';
      const toneDesc = getToneDescription(segment.dialogue.tone);
      const dialogueText = segment.dialogue.text_en || segment.dialogue.text;

      if (charRef && voiceRef) {
        lines.push(`${charRef} says ${voiceRef}${toneDesc ? ' ' + toneDesc : ''}: "${dialogueText}"`);
      } else if (charRef) {
        lines.push(`${charRef} says${toneDesc ? ' ' + toneDesc : ''}: "${dialogueText}"`);
      } else {
        lines.push(`Says${toneDesc ? ' ' + toneDesc : ''}: "${dialogueText}"`);
      }
    }

    // Environment details
    if (segment.environment) {
      lines.push(segment.environment);
    }

    // Custom prompt override
    if (segment.custom_prompt) {
      lines.push(segment.custom_prompt);
    }

    // Add empty line between shots for readability
    if (i < sortedSegments.length - 1) {
      lines.push('');
    }
  }

  // IMPORTANT: Join with space, not newline. Newlines cause audio glitches in video generation.
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

// ============================================================================
// Main Builder Function
// ============================================================================

/**
 * Build the cinematic mega-prompt for video generation
 *
 * Adapts output based on target model:
 * - Kling: @Element1 + <<<voice_1>>> syntax
 * - Seedance: @image1 + natural voice descriptions
 *
 * Structure:
 * 1. Cinematic Header (scene, lighting, camera, color)
 * 2. Character Legend (model-specific element mappings)
 * 3. Shots with timecoded beats
 * 4. Style Bible (at the very end)
 *
 * @param short - Short configuration with dialogue_language
 * @param plans - Array of plans with segments
 * @param characters - Map of character ID to GlobalAsset
 * @param hasStartFrame - Whether a starting frame is provided
 * @param targetModel - Target video model ('kling-omni', 'seedance-2', etc.)
 */
export function buildCinematicPrompt(
  short: CinematicShort,
  plans: CinematicPlan[],
  characters: Map<string, GlobalAsset>,
  hasStartFrame: boolean = true,
  targetModel: VideoModelType = 'kling-omni'
): string {
  const lines: string[] = [];
  const dialogueLanguage = short.dialogue_language || 'en';

  // Analyze characters for Stars vs Figurants (model-aware)
  const analysis = analyzeCharacters(characters, hasStartFrame, targetModel);
  const isSeedance = analysis.modelConfig.voiceSyntax === 'audio-ref';

  console.log(`[PromptBuilder] Building prompt for ${targetModel} (${isSeedance ? 'Seedance' : 'Kling'} syntax)`);

  // Sort plans by sort_order
  const sortedPlans = [...plans].sort((a, b) => a.sort_order - b.sort_order);

  // Collect style bible from short or first plan's cinematic style
  let styleBible = (short as CinematicShort & { style_bible?: string | null }).style_bible || '';

  // ========================================
  // Part 1: Cinematic Header
  // ========================================
  for (const plan of sortedPlans) {
    const header = plan.cinematic_header;
    if (header) {
      const headerPrompt = cinematicHeaderToPrompt(header);
      lines.push(headerPrompt);

      // If no style_bible on short, use the cinematic_style's bible
      if (!styleBible) {
        const effectiveStyle = header.cinematic_style || 'cinematic_realism';
        styleBible = getStyleBibleFromCinematicStyle(effectiveStyle, header.custom_style_bible);
      }
      break; // Only use first plan's header
    }
  }

  // ========================================
  // Part 2: Character Legend
  // ========================================
  const characterLegend = buildCharacterLegend(analysis);
  if (characterLegend) {
    lines.push(characterLegend);
    lines.push('');
  }

  // ========================================
  // Part 3: Shots with timecoded beats
  // ========================================

  for (const plan of sortedPlans) {
    if (plan.segments && plan.segments.length > 0) {
      // New segment-based workflow
      const segmentsPrompt = buildSegmentsPrompt(plan.segments, analysis, dialogueLanguage, plan.description);
      lines.push(segmentsPrompt);
    } else {
      // Legacy: Use plan-level fields
      const shotType = getShotTypeLabel(plan.shot_type);
      const subject = plan.shot_subject || plan.description?.split('.')[0] || 'Scene';
      const startTime = plan.start_time ?? 0;
      const endTime = startTime + plan.duration;
      const cameraLabel = getCameraMovementLabel(plan.camera_movement || null);

      lines.push(`Shot (${formatTime(startTime)}-${formatTime(endTime)}): ${shotType}. Camera: ${cameraLabel}.`);

      if (plan.framing) {
        lines.push(plan.framing);
      }

      if (plan.action) {
        lines.push(plan.action);
      } else if (plan.animation_prompt) {
        lines.push(plan.animation_prompt);
      }

      // Dialogue
      if (plan.dialogue_text && plan.dialogue_character_id) {
        const charRef = getCharacterReference(plan.dialogue_character_id, analysis);
        const voiceRef = getVoiceReference(plan.dialogue_character_id, analysis);
        const tone = plan.dialogue_tone ? getToneDescription(plan.dialogue_tone) : '';

        if (charRef && voiceRef) {
          lines.push(`${charRef} says ${voiceRef}${tone ? ' ' + tone : ''}: "${plan.dialogue_text}"`);
        } else if (charRef) {
          lines.push(`${charRef} says${tone ? ' ' + tone : ''}: "${plan.dialogue_text}"`);
        } else {
          lines.push(`Says${tone ? ' ' + tone : ''}: "${plan.dialogue_text}"`);
        }
      }

      // Environment details
      if (plan.environment) {
        lines.push(plan.environment);
      }

      // Description as fallback
      if (!plan.action && !plan.animation_prompt && plan.description) {
        lines.push(plan.description);
      }
    }
  }

  // ========================================
  // Part 4: Style Bible Line (at the very end)
  // ========================================
  if (styleBible) {
    lines.push(styleBible);
  }

  // IMPORTANT: Join with space, not newline. Newlines cause audio glitches in video generation.
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Build a simple prompt for a single shot (non-cinematic mode)
 */
export function buildSingleShotPrompt(
  plan: Plan,
  character?: GlobalAsset
): string {
  const lines: string[] = [];

  if (plan.shot_type) {
    lines.push(getShotTypeLabel(plan.shot_type));
  }

  if (plan.animation_prompt) {
    lines.push(plan.animation_prompt);
  } else if (plan.description) {
    lines.push(plan.description);
  }

  if (plan.camera_movement && plan.camera_movement !== 'static') {
    lines.push(`${plan.camera_movement.replace(/_/g, ' ')} camera movement`);
  }

  if (plan.dialogue_text && character) {
    lines.push(`${character.name} says: "${plan.dialogue_text}"`);
  } else if (plan.dialogue_text) {
    lines.push(`Dialogue: "${plan.dialogue_text}"`);
  }

  return lines.join('. ');
}

/**
 * Calculate images per star for API call
 * Export for use in queue-video route
 */
export function calculateImagesPerStar(starCount: number, hasStartFrame: boolean = true): number {
  if (starCount === 0) return 0;

  const availableSlots = TOTAL_IMAGE_BUDGET - (hasStartFrame ? 1 : 0);

  if (starCount === 1) {
    return Math.min(3, availableSlots); // front, profile, back
  } else if (starCount === 2) {
    return Math.min(2, Math.floor(availableSlots / 2)); // front, profile
  } else {
    return Math.max(1, Math.floor(availableSlots / starCount));
  }
}

/**
 * Calculate total duration of all plans
 */
export function calculateTotalDuration(plans: CinematicPlan[]): number {
  const lastPlan = plans.reduce((latest, plan) => {
    const planEnd = (plan.start_time ?? 0) + plan.duration;
    const latestEnd = (latest.start_time ?? 0) + latest.duration;
    return planEnd > latestEnd ? plan : latest;
  }, plans[0]);

  if (lastPlan) {
    return (lastPlan.start_time ?? 0) + lastPlan.duration;
  }

  return plans.reduce((total, plan) => total + plan.duration, 0);
}

/**
 * Validate cinematic configuration before generation
 */
export function validateCinematicConfig(
  short: CinematicShort,
  plans: CinematicPlan[],
  characters: Map<string, GlobalAsset>
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!plans || plans.length === 0) {
    errors.push('At least one plan is required');
  }

  const analysis = analyzeCharacters(characters);

  // Check element count
  if (analysis.stars.length > MAX_ELEMENTS) {
    warnings.push(`${analysis.stars.length} stars detected but only ${MAX_ELEMENTS} elements supported`);
  }

  // Check voice count
  const charsWithVoice = Array.from(analysis.all.values()).filter(c => c.voiceId).length;
  if (charsWithVoice > MAX_VOICES) {
    warnings.push(`${charsWithVoice} characters have voices but only ${MAX_VOICES} are supported`);
  }

  // Check plan durations
  for (const plan of plans) {
    if (plan.duration > 15) {
      errors.push(`Plan ${plan.shot_number} duration (${plan.duration}s) exceeds Kling's 15s limit`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Extract character IDs from plans that have dialogue
 */
export function extractDialogueCharacterIds(plans: Plan[]): string[] {
  const ids = new Set<string>();

  for (const plan of plans) {
    if (plan.dialogue_character_id) {
      ids.add(plan.dialogue_character_id);
    }
  }

  return Array.from(ids);
}
