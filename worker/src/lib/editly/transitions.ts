/**
 * Transition Mapping Utilities
 *
 * Maps our database transition types to Editly-supported transitions
 */

import type { EditlyTransition } from './types.js';
import { TRANSITION_MAP } from './types.js';

/**
 * Map our transition type to Editly transition
 */
export function mapTransition(transition: string | null): EditlyTransition | null {
  if (!transition) return null;
  return TRANSITION_MAP[transition] || 'fade';
}

/**
 * Check if a transition is a "fade to/from" style (needs two clips)
 */
export function isFadeTransition(transition: string | null): boolean {
  if (!transition) return false;
  return transition === 'fadeblack' || transition === 'fadewhite';
}

/**
 * Check if a transition is a direct crossfade (single transition between clips)
 */
export function isCrossfadeTransition(transition: string | null): boolean {
  if (!transition) return false;
  return transition === 'dissolve' || transition === 'fade';
}

/**
 * Get the best transition strategy for a sequence boundary
 *
 * When a sequence has transition_out and the next has transition_in:
 * - If both are fade-to-color (e.g., fadeblack): use single fadeblack
 * - If one is fade and one is crossfade: prioritize the fade
 * - If both are crossfades: use single crossfade
 */
export function getTransitionStrategy(
  outTransition: string | null,
  inTransition: string | null,
  outDuration: number,
  inDuration: number
): {
  transition: EditlyTransition;
  duration: number;
} {
  // Default: fade
  let transition: EditlyTransition = 'fade';
  let duration = Math.max(outDuration, inDuration);

  // If out transition is fade-to-color, use it
  if (isFadeTransition(outTransition)) {
    transition = mapTransition(outTransition)!;
    duration = outDuration;
  }
  // Else if in transition is fade-from-color, use it
  else if (isFadeTransition(inTransition)) {
    transition = mapTransition(inTransition)!;
    duration = inDuration;
  }
  // Otherwise use the out transition or default
  else if (outTransition) {
    transition = mapTransition(outTransition)!;
    duration = outDuration;
  }
  else if (inTransition) {
    transition = mapTransition(inTransition)!;
    duration = inDuration;
  }

  return { transition, duration };
}
