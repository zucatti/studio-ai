/**
 * Cinematic Prompt Builder
 *
 * Builds the mega-prompt for Kling Omni cinematic video generation
 * by combining the cinematic header with shot details.
 *
 * Auto-detection approach:
 * - Characters are auto-detected from @mentions in prompts and dialogues
 * - Element indices (1-4) are assigned based on detection order
 * - Voice indices (1-2) are assigned to characters with dialogue
 */

import type { Plan, Short } from '@/store/shorts-store';
import type { GlobalAsset } from '@/types/database';
import type { Segment, ShotType, CameraMovement, CinematicHeaderConfig } from '@/types/cinematic';
import { cinematicHeaderToPrompt } from '@/lib/cinematic-header-to-prompt';

// ============================================================================
// Types
// ============================================================================

/**
 * Plan with cinematic fields (Plan already includes these fields)
 */
export type CinematicPlan = Plan;

/**
 * Short with cinematic fields (Short already includes these fields)
 */
export type CinematicShort = Short;

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
function getShotTypeLabel(shotType: ShotType | string | null): string {
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
 * Get camera movement label for prompt
 */
function getCameraMovementLabel(movement: CameraMovement | string | null): string {
  if (!movement || movement === 'static') return '';

  const labels: Record<string, string> = {
    slow_dolly_in: 'Slow dolly in',
    slow_dolly_out: 'Slow dolly out',
    dolly_left: 'Dolly left',
    dolly_right: 'Dolly right',
    tracking_forward: 'Tracking forward',
    tracking_backward: 'Tracking backward',
    pan_left: 'Pan left',
    pan_right: 'Pan right',
    tilt_up: 'Tilt up',
    tilt_down: 'Tilt down',
    crane_up: 'Crane up',
    crane_down: 'Crane down',
    orbit_cw: 'Orbit clockwise',
    orbit_ccw: 'Orbit counter-clockwise',
    handheld: 'Handheld shake',
    zoom_in: 'Zoom in',
    zoom_out: 'Zoom out',
  };

  return labels[movement] || movement.replace(/_/g, ' ');
}

/**
 * Get the element index for a character based on Map insertion order
 * Characters are ordered: those with dialogue first, then others
 */
function getElementIndex(
  characterId: string,
  characters: Map<string, GlobalAsset>
): number | null {
  let index = 1;
  for (const [id] of characters) {
    if (id === characterId) {
      return index <= 4 ? index : null; // Max 4 elements
    }
    index++;
  }
  return null;
}

/**
 * Get character element reference (e.g., @Element1)
 * Uses auto-detected character order from the Map
 */
function getCharacterElement(
  characterId: string,
  characters: Map<string, GlobalAsset>
): string {
  const elementIndex = getElementIndex(characterId, characters);
  if (elementIndex) {
    return `@Element${elementIndex}`;
  }

  // Fallback to character name if not in elements
  const character = characters.get(characterId);
  return character?.name || '';
}

/**
 * Get voice reference (e.g., <<<voice_1>>>)
 * Only first 2 characters with dialogue get voice references
 * The Map is already sorted with dialogue characters first
 */
function getVoiceReference(
  characterId: string,
  characters: Map<string, GlobalAsset>,
  dialogueLanguage: string
): string {
  // No voice references for non-English (will use post-processing)
  if (dialogueLanguage !== 'en' && dialogueLanguage !== 'es') {
    return '';
  }

  // Check if character has fal_voice_id and is in first 2 positions
  const index = getElementIndex(characterId, characters);
  if (!index || index > 2) return ''; // Max 2 voices

  const character = characters.get(characterId);
  const charData = character?.data as Record<string, unknown> | null;
  if (!charData?.fal_voice_id) return '';

  return `<<<voice_${index}>>>`;
}

// ============================================================================
// Segment-based Builder Function
// ============================================================================

/**
 * Build prompt from segments within a single plan
 * Used when plan.segments is populated (new segment-based workflow)
 */
function buildSegmentsPrompt(
  segments: Segment[],
  characters: Map<string, GlobalAsset>,
  dialogueLanguage: string = 'en'
): string {
  const lines: string[] = [];

  // Sort segments by start_time
  const sortedSegments = [...segments].sort((a, b) => a.start_time - b.start_time);

  for (let i = 0; i < sortedSegments.length; i++) {
    const segment = sortedSegments[i];
    const shotNumber = i + 1;

    // Build shot header
    const shotType = getShotTypeLabel(segment.shot_type);
    const subject = segment.subject || 'Scene';

    lines.push(`SHOT ${shotNumber} (${formatTime(segment.start_time)}–${formatTime(segment.end_time)}) — ${shotType}, ${subject}:`);

    // Framing details
    if (segment.framing) {
      lines.push(segment.framing);
    }

    // Action
    if (segment.action) {
      lines.push(segment.action);
    }

    // Camera movement
    const movementLabel = getCameraMovementLabel(segment.camera_movement || null);
    if (movementLabel) {
      lines.push(`Camera: ${movementLabel}`);
    }

    // Camera notes (additional directions)
    if (segment.camera_notes) {
      lines.push(segment.camera_notes);
    }

    // Dialogue (with character reference and voice tag)
    if (segment.dialogue) {
      const charRef = segment.dialogue.character_id
        ? getCharacterElement(segment.dialogue.character_id, characters)
        : segment.dialogue.character_name || '';
      const voiceRef = segment.dialogue.character_id
        ? getVoiceReference(segment.dialogue.character_id, characters, dialogueLanguage)
        : '';
      const tone = segment.dialogue.tone ? ` ${segment.dialogue.tone}` : '';

      // Use English translation if available (for non-EN sources)
      const dialogueText = segment.dialogue.text_en || segment.dialogue.text;

      if (charRef && voiceRef) {
        lines.push(`${charRef} says${tone} ${voiceRef}: "${dialogueText}"`);
      } else if (charRef) {
        lines.push(`${charRef} says${tone}: "${dialogueText}"`);
      } else {
        lines.push(`Says${tone}: "${dialogueText}"`);
      }
    }

    // Environment details
    if (segment.environment) {
      lines.push(segment.environment);
    }

    // Custom prompt override (takes precedence)
    if (segment.custom_prompt) {
      lines.push(segment.custom_prompt);
    }

    lines.push(''); // Empty line between segments
  }

  return lines.join('\n').trim();
}

// ============================================================================
// Main Builder Function
// ============================================================================

/**
 * Build the cinematic mega-prompt for Kling Omni generation
 *
 * NEW: Supports segment-based workflow when plan.segments is populated
 * LEGACY: Falls back to plan-level fields for backward compatibility
 *
 * @param short - The short container
 * @param plans - Array of plans sorted by sort_order
 * @param characters - Map of character_id to GlobalAsset
 * @returns The formatted mega-prompt string
 */
export function buildCinematicPrompt(
  short: CinematicShort,
  plans: CinematicPlan[],
  characters: Map<string, GlobalAsset>
): string {
  const lines: string[] = [];
  const dialogueLanguage = short.dialogue_language || 'en';

  // Sort plans by sort_order
  const sortedPlans = [...plans].sort((a, b) => a.sort_order - b.sort_order);

  // Process each plan
  for (const plan of sortedPlans) {
    // ========================================
    // Part 1: Plan's Cinematic Header (if present)
    // ========================================
    const header = plan.cinematic_header;
    if (header) {
      const headerPrompt = cinematicHeaderToPrompt(header);
      lines.push(headerPrompt);
      lines.push(''); // Empty line separator
    }

    // ========================================
    // Part 2: Segments (NEW) or Legacy Fields
    // ========================================
    if (plan.segments && plan.segments.length > 0) {
      // New segment-based workflow
      const segmentsPrompt = buildSegmentsPrompt(plan.segments, characters, dialogueLanguage);
      lines.push(segmentsPrompt);
    } else {
      // Legacy: Use plan-level fields
      const shotType = getShotTypeLabel(plan.shot_type);
      const subject = plan.shot_subject || plan.description?.split('.')[0] || 'Scene';
      const startTime = plan.start_time ?? 0;
      const endTime = startTime + plan.duration;

      lines.push(`SHOT (${formatTime(startTime)}–${formatTime(endTime)}) — ${shotType}, ${subject}:`);

      // Framing details
      if (plan.framing) {
        lines.push(plan.framing);
      }

      // Action/movement
      if (plan.action) {
        lines.push(plan.action);
      } else if (plan.animation_prompt) {
        lines.push(plan.animation_prompt);
      }

      // Camera movement
      const movementLabel = getCameraMovementLabel(plan.camera_movement || null);
      if (movementLabel) {
        lines.push(`Camera: ${movementLabel}`);
      }

      // Dialogue
      if (plan.dialogue_text && plan.dialogue_character_id) {
        const charRef = getCharacterElement(plan.dialogue_character_id, characters);
        const voiceRef = getVoiceReference(plan.dialogue_character_id, characters, dialogueLanguage);
        const tone = plan.dialogue_tone ? ` ${plan.dialogue_tone}` : '';

        if (charRef && voiceRef) {
          lines.push(`${charRef} says${tone} ${voiceRef}: "${plan.dialogue_text}"`);
        } else if (charRef) {
          lines.push(`${charRef} says${tone}: "${plan.dialogue_text}"`);
        } else {
          lines.push(`Says${tone}: "${plan.dialogue_text}"`);
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

      lines.push(''); // Empty line
    }
  }

  return lines.join('\n').trim();
}

/**
 * Build a simple prompt for a single shot (non-cinematic mode)
 * This is used for standard generation mode
 */
export function buildSingleShotPrompt(
  plan: Plan,
  character?: GlobalAsset
): string {
  const lines: string[] = [];

  // Shot type and camera
  if (plan.shot_type) {
    lines.push(getShotTypeLabel(plan.shot_type));
  }

  // Animation/action
  if (plan.animation_prompt) {
    lines.push(plan.animation_prompt);
  } else if (plan.description) {
    lines.push(plan.description);
  }

  // Camera movement
  if (plan.camera_movement && plan.camera_movement !== 'static') {
    lines.push(`${plan.camera_movement.replace(/_/g, ' ')} camera movement`);
  }

  // Dialogue (without voice tags for non-cinematic)
  if (plan.dialogue_text && character) {
    lines.push(`${character.name} says: "${plan.dialogue_text}"`);
  } else if (plan.dialogue_text) {
    lines.push(`Dialogue: "${plan.dialogue_text}"`);
  }

  return lines.join('. ');
}

/**
 * Calculate total duration of all plans
 */
export function calculateTotalDuration(plans: CinematicPlan[]): number {
  // If plans have start_time, use the last plan's end time
  const lastPlan = plans.reduce((latest, plan) => {
    const planEnd = (plan.start_time ?? 0) + plan.duration;
    const latestEnd = (latest.start_time ?? 0) + latest.duration;
    return planEnd > latestEnd ? plan : latest;
  }, plans[0]);

  if (lastPlan) {
    return (lastPlan.start_time ?? 0) + lastPlan.duration;
  }

  // Fallback: sum all durations
  return plans.reduce((total, plan) => total + plan.duration, 0);
}

/**
 * Validate cinematic configuration before generation
 * Supports both segment-based and legacy plan-level fields
 */
export function validateCinematicConfig(
  short: CinematicShort,
  plans: CinematicPlan[],
  characters: Map<string, GlobalAsset>
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check basic requirements
  if (!plans || plans.length === 0) {
    errors.push('At least one plan is required');
  }

  const dialogueLanguage = short.dialogue_language || 'en';
  const uniqueDialogueCharacters = new Set<string>();

  // Process each plan
  for (const plan of plans) {
    // Check plan duration (Kling max is 15 seconds per plan)
    if (plan.duration > 15) {
      errors.push(`Plan ${plan.shot_number} duration (${plan.duration}s) exceeds Kling's 15s limit`);
    }

    // Check segments if present (new workflow)
    if (plan.segments && plan.segments.length > 0) {
      // Validate segment timing
      const lastSegment = plan.segments.reduce(
        (latest, seg) => (seg.end_time > latest.end_time ? seg : latest),
        plan.segments[0]
      );
      if (lastSegment.end_time > plan.duration) {
        warnings.push(`Plan ${plan.shot_number}: segments extend beyond plan duration`);
      }

      // Check segment dialogues
      for (const segment of plan.segments) {
        if (segment.dialogue?.character_id) {
          uniqueDialogueCharacters.add(segment.dialogue.character_id);

          const character = characters.get(segment.dialogue.character_id);
          if (!character) {
            errors.push(`Character not found for dialogue in plan ${plan.shot_number}`);
          } else {
            // Warn if character has no reference images
            if (!character.reference_images || character.reference_images.length === 0) {
              warnings.push(`Character "${character.name}" has no reference images`);
            }

            // For native voice generation, check fal_voice_id
            if (dialogueLanguage === 'en') {
              const charData = character.data as Record<string, unknown> | null;
              if (!charData?.fal_voice_id) {
                warnings.push(`Character "${character.name}" has no fal.ai voice`);
              }
            }
          }
        }
      }
    } else {
      // Legacy: Check plan-level dialogue
      if (plan.dialogue_text && plan.dialogue_character_id) {
        uniqueDialogueCharacters.add(plan.dialogue_character_id);

        const character = characters.get(plan.dialogue_character_id);
        if (!character) {
          errors.push(`Character not found for dialogue in plan ${plan.shot_number}`);
        }
      }
    }
  }

  // Check we don't have too many characters with dialogue (max 2 voices)
  if (uniqueDialogueCharacters.size > 2) {
    warnings.push(`${uniqueDialogueCharacters.size} characters have dialogue but only 2 distinct voices are supported`);
  }

  // Check auto-detected elements don't exceed 4
  if (characters.size > 4) {
    warnings.push(`${characters.size} characters detected but only 4 visual elements are supported`);
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
