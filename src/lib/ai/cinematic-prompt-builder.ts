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
 * - Timecode format: "0-4s:"
 * - Section headers: [CHARACTER LEGEND], [TIMELINE], [STYLE]
 *
 * SEEDANCE 2.0:
 * - Character refs: @Image1, @Image2 (max 9, capitalized)
 * - Audio refs: @Audio1, @Audio2 (max 3, pre-rendered)
 * - Native audio from prompt description or audio_urls
 * - Max 9 reference images via images_list
 * - Timecode format: "[00:00-00:04]" (bracketed MM:SS)
 * - Section headers: 【Duration】, 【Scene】, 【Characters】, 【Timeline】, 【Style】
 * - Shot format: "[00:00-00:04] Shot 1 (Camera Type): Description."
 */

import type { Plan, Short } from '@/store/shorts-store';
import type { GlobalAsset } from '@/types/database';
import type { Segment, ShotType, CameraMovement, CinematicHeaderConfig, ShotBeat } from '@/types/cinematic';
import { cinematicHeaderToPrompt, getStyleBibleFromCinematicStyle } from '@/lib/cinematic-header-to-prompt';
import { parseStyleMentions, findStylesBySlugs } from '@/lib/styles';

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
  elementPrefix: string; // '@Element' or '@Image'
  voiceSyntax: 'kling' | 'audio-ref'; // <<<voice_1>>> or @Audio1
  timecodeFormat: 'short' | 'bracketed'; // '0-4s:' or '[00:00-00:04]'
  audioPrefix: string; // '@Audio' for Seedance
  promptStyle: 'kling' | 'seedance'; // Determines overall prompt structure
}

const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'kling-omni': {
    maxElements: 6,
    maxVoices: 2,
    maxAudios: 0,
    totalImageBudget: 7, // 6 elements + 1 start frame
    elementPrefix: '@Element',
    voiceSyntax: 'kling',
    timecodeFormat: 'short',
    audioPrefix: '',
    promptStyle: 'kling',
  },
  'seedance-2': {
    maxElements: 9,
    maxVoices: 0,
    maxAudios: 3, // Up to 3 audio files, combined max 15s
    totalImageBudget: 9, // Max images_list
    elementPrefix: '@Image', // Capitalized for Seedance
    voiceSyntax: 'audio-ref',
    timecodeFormat: 'bracketed', // [00:00-00:04] format
    audioPrefix: '@Audio',
    promptStyle: 'seedance',
  },
  'seedance-2-fast': {
    maxElements: 9,
    maxVoices: 0,
    maxAudios: 3,
    totalImageBudget: 9,
    elementPrefix: '@Image',
    voiceSyntax: 'audio-ref',
    timecodeFormat: 'bracketed',
    audioPrefix: '@Audio',
    promptStyle: 'seedance',
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
    // Voice IDs: fal_voice_id for Kling, voice_id (ElevenLabs) for Seedance
    const falVoiceId = charData?.fal_voice_id as string | undefined;
    const elevenLabsVoiceId = charData?.voice_id as string | undefined;
    const visualDesc = charData?.visual_description as string | undefined;
    const voiceDesc = charData?.voice_description as string | undefined;

    const promptChar: PromptCharacter = {
      id: char.id,
      name: char.name,
      isStar: hasImages,
      visualDescription: visualDesc,
      voiceId: falVoiceId, // Keep fal_voice_id as the main voiceId for Kling
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

    // Assign voice index (Kling only, max 2) - uses fal_voice_id
    if (modelConfig.voiceSyntax === 'kling' && falVoiceId && voiceIndex <= modelConfig.maxVoices) {
      promptChar.voiceIndex = voiceIndex;
      voiceIndex++;
    }

    // Assign audio index (Seedance only, max 3) - uses ElevenLabs voice_id
    // Audio files must be pre-rendered and passed as audio_urls
    // Only assign to stars (characters with images) - figurants use Seedance native TTS
    if (modelConfig.voiceSyntax === 'audio-ref' && elevenLabsVoiceId && hasImages && audioIndex <= modelConfig.maxAudios) {
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
  if (analysis.stars.length === 0 && analysis.figurants.filter(f => f.visualDescription).length === 0) {
    return '';
  }

  const config = analysis.modelConfig;
  const isKling = config.voiceSyntax === 'kling';
  const isSeedance = config.promptStyle === 'seedance';

  const lines: string[] = [];

  for (const star of analysis.stars) {
    const desc = star.visualDescription || star.name;

    if (isKling) {
      // Kling: "Element 1 = Name: description [Voice 1]"
      const voiceInfo = star.voiceIndex ? ` [Voice ${star.voiceIndex}]` : '';
      lines.push(`Element ${star.elementIndex} = ${star.name}: ${desc}${voiceInfo}`);
    } else {
      // Seedance: Explicit reference linking for character consistency
      // Format: "- Name: Use @Image1 for Name's appearance. [description] (voice: ...)"
      const voiceInfo = star.voiceDescription ? ` (voice: ${star.voiceDescription})` : '';
      lines.push(`- ${star.name}: Use @Image${star.elementIndex} for ${star.name}'s appearance. ${desc}${voiceInfo}`);
    }
  }

  // Add figurants with dialogue potential
  const figurantsWithDesc = analysis.figurants.filter(f => f.visualDescription);
  if (figurantsWithDesc.length > 0) {
    if (lines.length > 0) {
      lines.push(''); // Empty line separator
    }
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
 * Format time as simple seconds (e.g., "0", "4", "15")
 */
function formatTimeShort(seconds: number): number {
  return Math.round(seconds);
}

/**
 * Format time in MM:SS format for Seedance bracketed timecodes
 * e.g., 4 seconds -> "00:04"
 */
function formatTimeMMSS(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format timecode based on model configuration
 * Kling: "0-4s:" format
 * Seedance: "[00:00-00:04]" format
 */
function formatTimecode(startSeconds: number, endSeconds: number, config: ModelConfig): string {
  if (config.timecodeFormat === 'bracketed') {
    // Seedance style: [00:00-00:04]
    return `[${formatTimeMMSS(startSeconds)}-${formatTimeMMSS(endSeconds)}]`;
  }
  // Kling style: 0-4s:
  return `${formatTimeShort(startSeconds)}-${formatTimeShort(endSeconds)}s:`;
}

/**
 * Clean content that may contain formatting tags from old data
 * Strips patterns like [DIALOGUE], [ACTION], (character: Name), [off-screen], etc.
 */
function cleanContentTags(content: string): string {
  if (!content) return content;

  // Remove patterns like [DIALOGUE], [ACTION], [SFX], etc. at the start
  let cleaned = content.replace(/^\s*\[(DIALOGUE|ACTION|FOCUS|SFX|PHYSICS|LIGHTING)\]\s*/i, '');

  // Remove (character: Name) patterns
  cleaned = cleaned.replace(/\(character:\s*[^)]+\)\s*:?\s*/gi, '');

  // Remove [off-screen] or [on-screen] patterns
  cleaned = cleaned.replace(/\[(off-screen|on-screen)\]\s*:?\s*/gi, '');

  // Remove [tone: xxx] patterns
  cleaned = cleaned.replace(/\[tone:\s*[^\]]+\]\s*/gi, '');

  // If the content is wrapped in quotes, extract just the quoted part
  const quotedMatch = cleaned.match(/^["'](.+)["']$/);
  if (quotedMatch) {
    cleaned = quotedMatch[1];
  }

  // Also handle case where entire content is: "Text here"
  // after removing tags, we might have: : "Text here" - remove leading colon
  cleaned = cleaned.replace(/^:\s*["']?/, '').replace(/["']?\s*$/, '');

  return cleaned.trim();
}

/**
 * Build a single element's prompt string
 * Uses content_en (English translation) if available, otherwise falls back to content
 */
function buildElementPrompt(
  element: { type: string; content: string; content_en?: string; character_id?: string; character_name?: string; tone?: string; presence?: string },
  analysis: CharacterAnalysis
): string | null {
  // Prefer English translation for prompt generation
  // Clean any formatting tags that might have been included from old data
  const rawContent = element.content_en || element.content;
  const textContent = cleanContentTags(rawContent);
  if (!textContent) return null;

  switch (element.type) {
    case 'dialogue': {
      if (element.character_id) {
        const charRef = getCharacterReference(element.character_id, analysis);
        const voiceRef = getVoiceReference(element.character_id, analysis);
        const voiceDesc = getVoiceDescription(element.character_id, analysis);
        const toneDesc = getToneDescription(element.tone);
        const isOffScreen = element.presence === 'off';
        const isSeedance = analysis.modelConfig.promptStyle === 'seedance';

        // Off-screen: Voice-over (no character visible, no lipsync needed)
        // On-screen: Dialogue lipsync (Kling does lipsync with native audio or TTS voice_ids)
        // For Seedance: Be explicit about not showing off-screen characters
        let dialogueType: string;
        if (isOffScreen) {
          dialogueType = isSeedance
            ? `Voice-over (audio only, do not show ${charRef} on screen)`
            : 'Voice-over';
        } else {
          dialogueType = 'Dialogue lipsync';
        }

        if (voiceRef) {
          return `[${dialogueType}: ${charRef} says ${voiceRef}${toneDesc ? ' ' + toneDesc : ''}: "${textContent}"]`;
        } else if (voiceDesc) {
          return `[${dialogueType}: ${charRef} says ${voiceDesc}${toneDesc ? ', ' + toneDesc : ''}: "${textContent}"]`;
        } else {
          return `[${dialogueType}: ${charRef} says${toneDesc ? ' ' + toneDesc : ''}: "${textContent}"]`;
        }
      } else if (element.character_name) {
        const toneDesc = getToneDescription(element.tone);
        const isOffScreen = element.presence === 'off';
        const isSeedance = analysis.modelConfig.promptStyle === 'seedance';
        let dialogueType: string;
        if (isOffScreen) {
          dialogueType = isSeedance
            ? `Voice-over (audio only, do not show ${element.character_name} on screen)`
            : 'Voice-over';
        } else {
          dialogueType = 'Dialogue lipsync';
        }
        return `[${dialogueType}: ${element.character_name} says${toneDesc ? ' ' + toneDesc : ''}: "${textContent}"]`;
      }
      return null;
    }

    case 'action': {
      if (element.character_id) {
        const charRef = getCharacterReference(element.character_id, analysis);
        return `[Action: ${charRef} ${textContent}]`;
      } else if (element.character_name) {
        return `[Action: ${element.character_name} ${textContent}]`;
      } else {
        return `[Action: ${textContent}]`;
      }
    }

    case 'focus': {
      if (element.character_id) {
        const charRef = getCharacterReference(element.character_id, analysis);
        return `[Focus on ${charRef}${textContent ? ': ' + textContent : ''}]`;
      } else if (element.character_name) {
        return `[Focus on ${element.character_name}${textContent ? ': ' + textContent : ''}]`;
      } else if (textContent) {
        return `[Focus: ${textContent}]`;
      }
      return null;
    }

    case 'sfx':
      return `[SFX: ${textContent}]`;

    case 'physics':
      return `[Physics: ${textContent}]`;

    case 'lighting':
      return `[Lighting: ${textContent}]`;

    default:
      return textContent;
  }
}

/**
 * Build prompt from segments within a single plan
 *
 * Reference prompt format:
 * 0-4s: [Medium Shot - Over the Shoulder] + [Focus on @Element1] + [Action: stirs coffee] + [SFX: tink-tink]
 *
 * All elements within a shot happen SIMULTANEOUSLY - joined with " + "
 */
function buildSegmentsPrompt(
  segments: Segment[],
  analysis: CharacterAnalysis,
  dialogueLanguage: string = 'en',
  planDescription?: string | null,
  includeTimecodes: boolean = false // kept for API compatibility, always uses shot-level timecode
): string {
  const lines: string[] = [];

  // Sort segments by start_time
  const sortedSegments = [...segments].sort((a, b) => a.start_time - b.start_time);

  for (let i = 0; i < sortedSegments.length; i++) {
    const segment = sortedSegments[i];

    // Build shot type from framing/composition
    let shotType: string;
    if (segment.shot_framing) {
      const framing = segment.shot_framing.replace(/_/g, ' ');
      // Capitalize first letter of each word
      const formattedFraming = framing.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      const composition = segment.shot_composition && segment.shot_composition !== 'single'
        ? ` - ${segment.shot_composition.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')}`
        : '';
      shotType = `${formattedFraming}${composition}`;
    } else {
      shotType = getShotTypeLabel(segment.shot_type);
    }

    // Start building the shot parts (will be joined with " + ")
    const shotParts: string[] = [];

    // Shot type with camera movement if any
    const cameraMovement = segment.camera_movement && segment.camera_movement !== 'static'
      ? `, ${getCameraMovementLabel(segment.camera_movement)}`
      : '';
    shotParts.push(`[${shotType}${cameraMovement}]`);

    // Add description as a part if present
    if (segment.description) {
      shotParts.push(segment.description);
    } else if (planDescription && i === 0) {
      // Use plan description for first segment if no segment description
      shotParts.push(planDescription);
    }

    // Legacy fields
    if (segment.framing) {
      shotParts.push(segment.framing);
    }
    if (segment.action) {
      shotParts.push(`[Action: ${segment.action}]`);
    }

    // Process elements (or legacy beats) - all joined with " + "
    const elements = segment.elements || segment.beats;
    if (elements && elements.length > 0) {
      for (const element of elements) {
        const elementPrompt = buildElementPrompt(element, analysis);
        if (elementPrompt) {
          shotParts.push(elementPrompt);
        }
      }
    }
    // LEGACY: Dialogue field (fallback if no elements)
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
        shotParts.push(`[Dialogue lipsync: ${charRef} says ${voiceRef}${toneDesc ? ' ' + toneDesc : ''}: "${dialogueText}"]`);
      } else if (charRef) {
        shotParts.push(`[Dialogue lipsync: ${charRef} says${toneDesc ? ' ' + toneDesc : ''}: "${dialogueText}"]`);
      } else {
        shotParts.push(`[Dialogue lipsync: Says${toneDesc ? ' ' + toneDesc : ''}: "${dialogueText}"]`);
      }
    }

    // Environment details
    if (segment.environment) {
      shotParts.push(segment.environment);
    }

    // Custom prompt override
    if (segment.custom_prompt) {
      shotParts.push(segment.custom_prompt);
    }

    // Build the final line (Kling format - Seedance uses buildSeedanceSegments)
    const config = analysis.modelConfig;
    const timecode = formatTimecode(segment.start_time, segment.end_time, config);

    // Kling style: 0-4s: [Shot Type] + [Element1] + [Element2]
    lines.push(`${timecode} ${shotParts.join(' + ')}`);
  }

  // Join shots with space (single line prompt)
  return lines.join(' ').trim();
}

// ============================================================================
// Main Builder Function
// ============================================================================

/**
 * Build the cinematic mega-prompt for video generation
 *
 * Adapts output based on target model:
 * - Kling: @Element1 + <<<voice_1>>> syntax with 【】 headers
 * - Seedance: @Image1 + reference prompt format (no establishing shots)
 *
 * Seedance Reference Format (proven to work):
 * ```
 * Film stock: 35mm Kodak Vision3 500T, heavy organic film grain.
 * Lens/Aperture: 35mm Anamorphic lens, f/2.8.
 * Color Grade: "Saturated 90s Diner" palette.
 * Camera Behavior: Slow, rhythmic movements.
 * Atmosphere: A half-empty, sun-drenched diner. (MOOD, not instruction to film)
 * Audio: Immersive spatial sound design.
 *
 * [IMAGE REFERENCES / LEGEND]
 * @Image1: Character description...
 *
 * [TIMELINE SECOND BY SECOND]
 * 0-4s: [Shot type] + [Focus on @Image1] + [Action: ...] + [SFX: ...]
 *
 * [STYLE & QUALITY BOOSTERS]
 * Movie-level realistic facial features...
 * ```
 *
 * @param short - Short configuration with dialogue_language
 * @param plans - Array of plans with segments
 * @param characters - Map of character ID to GlobalAsset
 * @param hasStartFrame - Whether a starting frame is provided
 * @param targetModel - Target video model ('kling-omni', 'seedance-2', etc.)
 * @param includeTimecodes - Whether to include beat timecodes (default: false, Kling ignores them)
 */
export function buildCinematicPrompt(
  short: CinematicShort,
  plans: CinematicPlan[],
  characters: Map<string, GlobalAsset>,
  hasStartFrame: boolean = true,
  targetModel: VideoModelType = 'kling-omni',
  includeTimecodes: boolean = false
): string {
  const dialogueLanguage = short.dialogue_language || 'en';

  // Analyze characters for Stars vs Figurants (model-aware)
  const analysis = analyzeCharacters(characters, hasStartFrame, targetModel);
  const config = analysis.modelConfig;
  const isSeedance = config.promptStyle === 'seedance';

  console.log(`[PromptBuilder] Building prompt for ${targetModel} (${isSeedance ? 'Seedance' : 'Kling'} syntax)`);

  // Sort plans by sort_order
  const sortedPlans = [...plans].sort((a, b) => a.sort_order - b.sort_order);

  // Collect style bible from short or first plan's cinematic style
  let styleBible = (short as CinematicShort & { style_bible?: string | null }).style_bible || '';

  // Calculate total duration
  const totalDuration = sortedPlans.reduce((sum, p) => sum + p.duration, 0);

  // Use Seedance-specific format that avoids establishing shots
  if (isSeedance) {
    return buildSeedancePrompt(sortedPlans, analysis, dialogueLanguage, styleBible, totalDuration);
  }

  // Kling format (with rich descriptions like master prompt)
  const lines: string[] = [];

  // Get cinematic header from first plan
  let header: CinematicHeaderConfig | null = null;
  for (const plan of sortedPlans) {
    if (plan.cinematic_header) {
      header = plan.cinematic_header;
      // If no style_bible on short, use the cinematic_style's bible
      if (!styleBible) {
        const effectiveStyle = header.cinematic_style || 'cinematic_realism';
        styleBible = getStyleBibleFromCinematicStyle(effectiveStyle, header.custom_style_bible);
      }
      break;
    }
  }

  // ========================================
  // Part 1: Rich Technical Specs (Master Prompt Quality)
  // ========================================

  // Film stock with rich technical description
  const cinematicStyle = header?.cinematic_style || 'cinematic_realism';
  const filmStock = FILM_STOCK_RICH[cinematicStyle] || FILM_STOCK_RICH['cinematic_realism'];
  lines.push(`Film stock: ${filmStock}.`);

  // Lens/Aperture with specific technical specs
  const dof = header?.camera?.depth_of_field || 'medium_dof';
  const lensAperture = LENS_APERTURE_RICH[dof] || LENS_APERTURE_RICH['medium_dof'];
  lines.push(`Lens/Aperture: ${lensAperture}.`);

  // Color Grade with rich palette description
  const colorStyle = header?.color_grade?.style || 'cinematic';
  const colorGrade = COLOR_GRADE_RICH[colorStyle] || COLOR_GRADE_RICH['cinematic'];
  lines.push(`Color Grade: ${colorGrade}.`);

  // Camera Behavior with expressive description
  const cameraType = header?.camera?.type || 'handheld';
  const cameraBehavior = CAMERA_BEHAVIOR_RICH[cameraType] || CAMERA_BEHAVIOR_RICH['handheld'];
  lines.push(`Camera Behavior: ${cameraBehavior}.`);

  // Atmosphere with location + rich mood description (like master prompt)
  const timeOfDay = header?.time_of_day || 'morning';
  const weather = header?.weather || 'clear';
  const locationDesc = header?.scene?.location_custom || '';
  const atmosphereDesc = ATMOSPHERE_RICH[timeOfDay]?.[weather]
    || ATMOSPHERE_RICH[timeOfDay]?.['clear']
    || 'Natural ambient lighting with cinematic mood';
  // Master prompt format: "A half-empty, sun-drenched diner. Dust motes floating in the light."
  if (locationDesc) {
    lines.push(`Atmosphere: ${locationDesc}. ${atmosphereDesc}.`);
  } else {
    lines.push(`Atmosphere: ${atmosphereDesc}.`);
  }

  // Audio with contextual ambient sounds (like master prompt)
  const sceneSetting = header?.scene?.setting || 'ext';
  const audioTimeKey = ['morning', 'night', 'golden_hour', 'dusk'].includes(timeOfDay) ? timeOfDay : (weather === 'rain' ? 'rain' : 'default');
  const audioAmbianceObj = AUDIO_AMBIANCE_RICH[sceneSetting] || AUDIO_AMBIANCE_RICH['ext'];
  const audioAmbiance = audioAmbianceObj[audioTimeKey] || audioAmbianceObj['default'] || '';
  lines.push(`Audio: Immersive spatial sound design. ${audioAmbiance}. Dialogue lipsync where indicated.`);

  // ========================================
  // Part 2: Character Legend (Kling format with rich descriptions)
  // ========================================
  lines.push('[CHARACTER LEGEND]');

  for (const star of analysis.stars) {
    const desc = star.visualDescription || '';
    const voiceInfo = star.voiceIndex ? ` [Voice ${star.voiceIndex}]` : '';
    if (desc) {
      lines.push(`Element ${star.elementIndex} = ${star.name}: ${desc}.${voiceInfo}`);
    } else {
      lines.push(`Element ${star.elementIndex} = ${star.name}.${voiceInfo}`);
    }
  }

  // Add figurants with descriptions
  const figurantsWithDesc = analysis.figurants.filter(f => f.visualDescription);
  if (figurantsWithDesc.length > 0) {
    lines.push(`Additional characters (no reference images):`);
    for (const fig of figurantsWithDesc) {
      lines.push(`- ${fig.name}: ${fig.visualDescription}`);
    }
  }

  // ========================================
  // Part 3: Timeline with timecoded beats
  // ========================================
  lines.push('[TIMELINE]');

  for (const plan of sortedPlans) {
    if (plan.segments && plan.segments.length > 0) {
      const segmentsPrompt = buildSegmentsPrompt(plan.segments, analysis, dialogueLanguage, plan.description, includeTimecodes);
      lines.push(segmentsPrompt);
    } else {
      // Legacy: Use plan-level fields
      const shotType = getShotTypeLabel(plan.shot_type);
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
  // Part 4: Style & Quality Boosters
  // ========================================
  const qualityBoosters = QUALITY_BOOSTERS_RICH[cinematicStyle] || QUALITY_BOOSTERS_RICH['default'];
  if (styleBible) {
    lines.push(`[STYLE & QUALITY BOOSTERS] ${styleBible} ${qualityBoosters}`);
  } else {
    lines.push(`[STYLE & QUALITY BOOSTERS] ${qualityBoosters}`);
  }

  // IMPORTANT: Join with space, not newline. Newlines cause audio glitches in video generation.
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

// ============================================================================
// Seedance-specific Prompt Builder
// ============================================================================

/**
 * Build Seedance 2.0 prompt using the reference format that avoids establishing shots.
 *
 * Reference format (proven to work - Master Prompt quality):
 * ```
 * Film stock: 35mm Kodak Vision3 500T, heavy organic film grain, high contrast.
 * Lens/Aperture: 35mm Anamorphic lens, f/2.8. Deep depth of field.
 * Color Grade: "Saturated 90s Diner" palette. Warm nicotine yellows, bright red vinyl booths.
 * Camera Behavior: Slow, rhythmic "Shot/Reverse Shot" switching.
 * Atmosphere: A half-empty, sun-drenched diner. Dust motes floating in the light. Tense, quiet.
 * Audio: Immersive spatial sound design. The distant clinking of silverware, a coffee pot pouring.
 *
 * [IMAGE REFERENCES / LEGEND]
 * @Image1: The lead enforcer. Maintain exact beard, dark sunglasses... Keep exact same character.
 *
 * [TIMELINE SECOND BY SECOND]
 * 0-4s: [Medium Shot - Over the Shoulder] + [Focus on @Image1] + [Action: stirs coffee] + [SFX: tink-tink]
 *
 * [STYLE & QUALITY BOOSTERS]
 * Movie-level realistic facial features, no deformation, stable character consistency.
 * ```
 */
function buildSeedancePrompt(
  sortedPlans: CinematicPlan[],
  analysis: CharacterAnalysis,
  dialogueLanguage: string,
  styleBible: string,
  totalDuration: number
): string {
  const lines: string[] = [];

  // Get cinematic header from first plan
  let header: CinematicHeaderConfig | null = null;
  for (const plan of sortedPlans) {
    if (plan.cinematic_header) {
      header = plan.cinematic_header;
      break;
    }
  }

  // ========================================
  // Part 1: Rich Technical Specs (Master Prompt Quality)
  // ========================================

  // Film stock with rich technical description
  const cinematicStyle = header?.cinematic_style || 'cinematic_realism';
  const filmStock = FILM_STOCK_RICH[cinematicStyle] || FILM_STOCK_RICH['cinematic_realism'];
  lines.push(`Film stock: ${filmStock}.`);

  // Lens/Aperture with specific technical specs
  const dof = header?.camera?.depth_of_field || 'medium_dof';
  const lensAperture = LENS_APERTURE_RICH[dof] || LENS_APERTURE_RICH['medium_dof'];
  lines.push(`Lens/Aperture: ${lensAperture}.`);

  // Color Grade with rich palette description
  const colorStyle = header?.color_grade?.style || 'cinematic';
  const colorGrade = COLOR_GRADE_RICH[colorStyle] || COLOR_GRADE_RICH['cinematic'];
  lines.push(`Color Grade: ${colorGrade}.`);

  // Camera Behavior with expressive description
  const cameraType = header?.camera?.type || 'handheld';
  const cameraBehavior = CAMERA_BEHAVIOR_RICH[cameraType] || CAMERA_BEHAVIOR_RICH['handheld'];
  lines.push(`Camera Behavior: ${cameraBehavior}.`);

  // Atmosphere with location + rich mood description (like master prompt)
  // Master format: "A half-empty, sun-drenched diner. Dust motes floating in the light."
  const timeOfDay = header?.time_of_day || 'morning';
  const weather = header?.weather || 'clear';
  const locationDesc = header?.scene?.location_custom || '';
  const atmosphereDesc = ATMOSPHERE_RICH[timeOfDay]?.[weather]
    || ATMOSPHERE_RICH[timeOfDay]?.['clear']
    || 'Natural ambient lighting with cinematic mood';
  if (locationDesc) {
    lines.push(`Atmosphere: ${locationDesc}. ${atmosphereDesc}.`);
  } else {
    lines.push(`Atmosphere: ${atmosphereDesc}.`);
  }

  // Audio with contextual ambient sounds (like master prompt)
  // Master format: "The distant clinking of silverware, a coffee pot pouring."
  const sceneSetting = header?.scene?.setting || 'ext';
  const audioTimeKey = ['morning', 'night', 'golden_hour', 'dusk'].includes(timeOfDay) ? timeOfDay : (weather === 'rain' ? 'rain' : 'default');
  const audioAmbianceObj = AUDIO_AMBIANCE_RICH[sceneSetting] || AUDIO_AMBIANCE_RICH['ext'];
  const audioAmbiance = audioAmbianceObj[audioTimeKey] || audioAmbianceObj['default'] || '';
  lines.push(`Audio: Immersive spatial sound design. ${audioAmbiance}. Dialogue lipsync where indicated.`);

  // ========================================
  // Part 2: Character Legend (Rich Descriptions)
  // ========================================
  lines.push(`[IMAGE REFERENCES / LEGEND]`);

  for (const star of analysis.stars) {
    // Build rich character description
    const visualDesc = star.visualDescription || '';
    const audioInfo = star.audioIndex ? ` Voice synced to @Audio${star.audioIndex}.` : '';

    // Format like master prompt: "@Image1: The lead enforcer. Maintain exact beard, dark sunglasses..."
    if (visualDesc) {
      lines.push(`@Image${star.elementIndex}: ${star.name}. ${visualDesc}.${audioInfo} Maintain exact appearance consistency throughout all frames.`);
    } else {
      lines.push(`@Image${star.elementIndex}: ${star.name}.${audioInfo} Maintain exact appearance consistency throughout all frames.`);
    }
  }

  // Add figurants with detailed descriptions
  const figurantsWithDesc = analysis.figurants.filter(f => f.visualDescription);
  if (figurantsWithDesc.length > 0) {
    lines.push(`Additional characters (no reference images):`);
    for (const fig of figurantsWithDesc) {
      lines.push(`- ${fig.name}: ${fig.visualDescription}.`);
    }
  }

  // ========================================
  // Part 3: Timeline (Rich Format with SFX, Physics, Lighting)
  // ========================================
  lines.push(`[TIMELINE SECOND BY SECOND]`);

  for (const plan of sortedPlans) {
    if (plan.segments && plan.segments.length > 0) {
      const segmentsPrompt = buildSeedanceSegments(plan.segments, analysis, plan.description);
      lines.push(segmentsPrompt);
    }
  }

  // ========================================
  // Part 4: Style & Quality Boosters (Style-specific)
  // ========================================
  const qualityBoosters = QUALITY_BOOSTERS_RICH[cinematicStyle] || QUALITY_BOOSTERS_RICH['default'];
  if (styleBible) {
    lines.push(`[STYLE & QUALITY BOOSTERS] ${styleBible} ${qualityBoosters}`);
  } else {
    lines.push(`[STYLE & QUALITY BOOSTERS] ${qualityBoosters}`);
  }

  // Join with space (single line)
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

// ============================================================================
// Rich Cinematic Text Mappings (Master Prompt Quality)
// ============================================================================

// Film stock descriptions with technical specs
const FILM_STOCK_RICH: Record<string, string> = {
  cinematic_realism: '35mm Kodak Vision3 500T, natural organic film grain, cinematic depth of field',
  hollywood_blockbuster: '35mm Panavision Primo lenses, clean digital finish with subtle grain, blockbuster production quality',
  film_noir: '35mm Kodak Double-X black and white stock, heavy grain, extreme high contrast with deep blacks',
  wes_anderson: '35mm Fujifilm Pro 400H, symmetrical framing, soft pastel tones with precise color control',
  christopher_nolan: 'IMAX 70mm film, ultra-sharp resolution, dramatic scale with natural grain texture',
  blade_runner: '35mm Anamorphic with Panavision C-Series, neon-reflective coating, rain-soaked cyberpunk atmosphere',
  studio_ghibli: 'Hand-painted animation style, soft watercolor textures, dreamy organic movement',
  vintage_vhs: 'VHS tape aesthetic, scan lines, tracking artifacts, color bleeding, 90s nostalgia distortion',
  documentary: 'Digital handheld, available light, raw authenticity with natural imperfections',
  epic_fantasy: '65mm large format film, sweeping vistas, rich saturated colors with mythical quality',
};

// Lens and aperture descriptions
const LENS_APERTURE_RICH: Record<string, string> = {
  shallow_dof: '85mm prime lens, f/1.4 wide open, creamy bokeh background separation',
  medium_dof: '50mm prime lens, f/2.8, balanced depth with subtle background blur',
  deep_dof: '24mm wide lens, f/8, everything in sharp focus from foreground to infinity',
};

// Rich color grade descriptions with palette names
const COLOR_GRADE_RICH: Record<string, string> = {
  cinematic: 'Cinematic color grading with crushed blacks, lifted shadows, and teal-orange complementary tones',
  vintage: 'Vintage film emulation with warm faded highlights, lifted blacks, and nostalgic color cast',
  modern: 'Clean modern grade with neutral whites, subtle contrast, and accurate skin tones',
  noir: 'High contrast black and white with deep shadows, bright highlights, and film noir mood',
  pastel: 'Soft pastel palette with desaturated primaries, lifted shadows, and dreamy ethereal quality',
  teal_orange: 'Hollywood teal and orange grade with warm skin tones against cool shadows',
  black_white: 'Rich monochrome with full tonal range, from deep blacks to clean whites',
  saturated: 'Punchy saturated colors with vivid primaries, high contrast, and bold visual impact',
};

// Camera behavior descriptions
const CAMERA_BEHAVIOR_RICH: Record<string, string> = {
  handheld: 'Handheld camera with subtle organic breathing movement, naturalistic human presence',
  steadicam: 'Steadicam with fluid gliding motion, smooth tracking through space',
  tripod: 'Tripod-locked static composition, precise framing with intentional stillness',
  drone: 'Aerial drone perspective with sweeping reveals and dynamic elevation changes',
  gimbal: 'Gimbal-stabilized movement, precise controlled motion with modern smoothness',
  crane: 'Crane shots with vertical movement, dramatic reveals and sweeping perspectives',
  dolly: 'Dolly tracking with parallel movement, classic Hollywood precision',
};

// Atmosphere/mood descriptions (evocative, not instructional)
const ATMOSPHERE_RICH: Record<string, Record<string, string>> = {
  dawn: {
    clear: 'First light breaking over the horizon, cool blue shadows giving way to warm pink highlights',
    cloudy: 'Soft diffused dawn light filtering through cloud layers, gentle awakening atmosphere',
    fog: 'Ethereal morning mist catching the first rays of light, mysterious and peaceful',
  },
  morning: {
    clear: 'Bright morning sun casting long shadows, crisp air and fresh energy',
    cloudy: 'Soft overcast morning light, even illumination with gentle mood',
    rain: 'Morning rain pattering against windows, cozy interior warmth against grey exterior',
  },
  midday: {
    clear: 'Harsh overhead sun with minimal shadows, high-contrast midday intensity',
    cloudy: 'Diffused midday light through cloud cover, soft and even',
  },
  afternoon: {
    clear: 'Warm afternoon sunlight streaming at an angle, relaxed golden ambiance',
    cloudy: 'Gentle afternoon overcast, comfortable and contemplative mood',
  },
  golden_hour: {
    clear: 'Magic hour golden light, long warm shadows, cinematic perfection',
    cloudy: 'Soft golden tones filtering through clouds, romantic diffused warmth',
  },
  dusk: {
    clear: 'Fading twilight with deep orange and purple sky, day surrendering to night',
    cloudy: 'Moody dusk with heavy clouds, dramatic end-of-day atmosphere',
  },
  night: {
    clear: 'Dark night with moonlight and practical sources, pools of light in darkness',
    rain: 'Rain-soaked night streets, neon reflections on wet pavement, noir atmosphere',
    storm: 'Stormy night with lightning flashes, dramatic tension and raw power',
  },
  blue_hour: {
    clear: 'Deep blue twilight, magical transition between day and night',
    fog: 'Blue hour mist creating layers of atmosphere, ethereal and mysterious',
  },
};

// Audio/ambiance descriptions - specific evocative sounds like master prompt
// Master format: "The distant clinking of silverware, a coffee pot pouring."
const AUDIO_AMBIANCE_RICH: Record<string, Record<string, string>> = {
  int: {
    default: 'The subtle hum of air conditioning, distant footsteps on hardwood, the soft tick of a wall clock',
    morning: 'The clink of coffee cups, morning radio murmur, birds chirping outside windows, floorboards creaking underfoot',
    night: 'The tick of a clock in the silence, distant car passing, the hum of a refrigerator, settling house sounds',
    rain: 'Rain pattering against windows, the cozy hiss of a radiator, occasional thunder rumble, water dripping from gutters',
    golden_hour: 'Late afternoon quietude, distant children playing, the soft whir of a ceiling fan',
    dusk: 'Evening settling in, the click of turning on lamps, distant dinner preparations, TV murmur from another room',
  },
  ext: {
    default: 'Wind rustling through leaves, distant traffic hum, birds calling, ambient city life',
    morning: 'Dawn chorus of birdsong, distant traffic starting up, dew dripping from leaves, jogger footsteps',
    night: 'Crickets chirping, distant dogs barking, the hum of streetlights, occasional car passing',
    rain: 'Rain drumming on surfaces, water rushing in gutters, splashing footsteps, thunder rolling in the distance',
    fog: 'Muffled sounds through the mist, foghorn in the distance, damp footsteps, eerie silence',
    golden_hour: 'Evening birdsong, children playing in the distance, the warm buzz of summer insects',
    dusk: 'Twilight sounds, bats chirping, streetlights buzzing to life, distant dinner sounds',
  },
  int_ext: {
    default: 'Muffled outside traffic, conversation bleeding through walls, the transition between spaces',
    rain: 'Rain audible through open windows, interior warmth meeting wet exterior, umbrella drops',
  },
};

// Quality boosters by style
const QUALITY_BOOSTERS_RICH: Record<string, string> = {
  default: 'Movie-level realistic facial features, no deformation, stable character consistency. High-fidelity skin textures with visible pores and natural details. Professional cinematography with intentional composition.',
  cinematic_realism: 'Photorealistic rendering with natural skin subsurface scattering, accurate eye reflections, and micro-expressions. Cinema-quality production values throughout.',
  film_noir: 'Dramatic shadow play on faces, period-accurate styling, expressive eyes catching highlights. Classic Hollywood glamour with modern detail.',
  vintage_vhs: 'Authentic 90s aesthetic with period-appropriate styling, CRT screen texture overlay, nostalgic color science. Retro charm with intentional imperfections.',
};

/**
 * Build segments for Seedance using reference format:
 * 0-4s: [Shot type] + [Focus on @Image1] + [Action: ...] + [SFX: ...]
 */
function buildSeedanceSegments(
  segments: Segment[],
  analysis: CharacterAnalysis,
  planDescription?: string | null
): string {
  const lines: string[] = [];

  // Sort segments by start_time
  const sortedSegments = [...segments].sort((a, b) => a.start_time - b.start_time);

  for (let i = 0; i < sortedSegments.length; i++) {
    const segment = sortedSegments[i];
    const shotParts: string[] = [];

    // Build shot type
    let shotType: string;
    if (segment.shot_framing) {
      const framing = segment.shot_framing.replace(/_/g, ' ');
      const formattedFraming = framing.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      const composition = segment.shot_composition && segment.shot_composition !== 'single'
        ? ` - ${segment.shot_composition.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')}`
        : '';
      shotType = `${formattedFraming}${composition}`;
    } else {
      shotType = getShotTypeLabel(segment.shot_type);
    }

    // Camera movement
    const cameraMovement = segment.camera_movement && segment.camera_movement !== 'static'
      ? `, ${getCameraMovementLabel(segment.camera_movement)}`
      : '';
    shotParts.push(`[${shotType}${cameraMovement}]`);

    // Process elements - use reference format with " + " joins
    const elements = segment.elements || segment.beats;
    if (elements && elements.length > 0) {
      for (const element of elements) {
        const elementPrompt = buildElementPrompt(element, analysis);
        if (elementPrompt) {
          shotParts.push(elementPrompt);
        }
      }
    }

    // Add segment description if no elements
    if (shotParts.length === 1 && segment.description) {
      shotParts.push(segment.description);
    } else if (shotParts.length === 1 && planDescription && i === 0) {
      shotParts.push(planDescription);
    }

    // Build timecode in simple format: 0-4s:
    const startSec = Math.round(segment.start_time);
    const endSec = Math.round(segment.end_time);
    const timecode = `${startSec}-${endSec}s:`;

    // Join parts with " + " (reference format)
    lines.push(`${timecode} ${shotParts.join(' + ')}`);
  }

  return lines.join(' ');
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

// ============================================================================
// Style Mentions Expansion
// ============================================================================

/**
 * Expand /style mentions in text to their full Midjourney prompts
 *
 * Input: "@Morgana walks through the forest /dolly-zoom /golden-hour-lighting"
 * Output: "@Morgana walks through the forest /dolly-zoom /golden-hour-lighting [STYLES: dolly zoom, Hitchcock zoom effect..., golden hour lighting, warm amber sunlight...]"
 *
 * The /tags are kept for visibility, and the expanded prompts are appended in a [STYLES] block.
 */
export async function expandStyleMentionsInText(text: string): Promise<string> {
  const slugs = parseStyleMentions(text);
  if (slugs.length === 0) {
    return text;
  }

  const stylesMap = await findStylesBySlugs(slugs);
  if (stylesMap.size === 0) {
    return text;
  }

  // Collect prompts (clean --v 6.0 suffix)
  const stylePrompts: string[] = [];
  for (const [, tech] of stylesMap) {
    const cleanPrompt = tech.prompt.replace(/\s*--v\s*\d+\.\d+\s*$/, '').trim();
    stylePrompts.push(cleanPrompt);
  }

  // Append style prompts as a single block
  return `${text} [STYLES: ${stylePrompts.join(', ')}]`;
}

/**
 * Expand style mentions in segment descriptions and element content
 * Call this before building the final prompt
 */
export async function expandStylesInSegments(segments: Segment[]): Promise<Segment[]> {
  const expanded: Segment[] = [];

  for (const segment of segments) {
    const newSegment = { ...segment };

    // Expand in description
    if (newSegment.description) {
      newSegment.description = await expandStyleMentionsInText(newSegment.description);
    }

    // Expand in elements
    if (newSegment.elements) {
      newSegment.elements = await Promise.all(
        newSegment.elements.map(async (el) => ({
          ...el,
          content: el.content ? await expandStyleMentionsInText(el.content) : el.content,
          content_en: el.content_en ? await expandStyleMentionsInText(el.content_en) : el.content_en,
        }))
      );
    }

    // Legacy beats
    if (newSegment.beats) {
      newSegment.beats = await Promise.all(
        newSegment.beats.map(async (beat) => ({
          ...beat,
          content: beat.content ? await expandStyleMentionsInText(beat.content) : beat.content,
          content_en: beat.content_en ? await expandStyleMentionsInText(beat.content_en) : beat.content_en,
        }))
      );
    }

    expanded.push(newSegment);
  }

  return expanded;
}
