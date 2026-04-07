/**
 * Character View Detection
 *
 * Determines the optimal camera view (front, profile, three_quarter, back)
 * for a character based on shot context and action description.
 *
 * Supports:
 * - Manual override via @Character:vue syntax
 * - Auto-detection from shot framing
 * - Auto-detection from action keywords
 */

export type CharacterView = 'front' | 'profile' | 'three_quarter' | 'back';

// View aliases for natural French input
const VIEW_ALIASES: Record<string, CharacterView> = {
  // French
  'face': 'front',
  'front': 'front',
  'avant': 'front',
  'profil': 'profile',
  'profile': 'profile',
  'cote': 'profile',
  'côté': 'profile',
  '3/4': 'three_quarter',
  '3-4': 'three_quarter',
  'trois-quart': 'three_quarter',
  'troisquart': 'three_quarter',
  'three_quarter': 'three_quarter',
  'dos': 'back',
  'back': 'back',
  'arriere': 'back',
  'arrière': 'back',
};

/**
 * Parse view hint from mention syntax
 * e.g., "@Morgana:profil" -> { characterRef: "@Morgana", view: "profile" }
 */
export function parseViewFromMention(mention: string): { characterRef: string; view: CharacterView | null } {
  const colonIndex = mention.lastIndexOf(':');

  if (colonIndex === -1 || colonIndex === mention.length - 1) {
    return { characterRef: mention, view: null };
  }

  const characterRef = mention.slice(0, colonIndex);
  const viewHint = mention.slice(colonIndex + 1).toLowerCase().trim();
  const view = VIEW_ALIASES[viewHint] || null;

  return { characterRef, view };
}

/**
 * Extract all character mentions with their view hints from text
 * Returns a map of character name -> preferred view
 */
export function extractCharacterViews(text: string): Map<string, CharacterView | null> {
  const views = new Map<string, CharacterView | null>();

  // Match @Character or @Character:view
  const mentionRegex = /@([A-Z][a-zA-Z0-9_]*)(?::([a-zA-Z0-9_/-]+))?/gi;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    const characterName = match[1];
    const viewHint = match[2]?.toLowerCase();
    const view = viewHint ? (VIEW_ALIASES[viewHint] || null) : null;

    // Only update if we have a view (don't overwrite with null)
    if (view || !views.has(characterName)) {
      views.set(characterName, view);
    }
  }

  return views;
}

/**
 * Auto-detect best view based on shot framing
 */
export function detectViewFromFraming(shotFraming?: string): CharacterView {
  if (!shotFraming) return 'front';

  const framing = shotFraming.toLowerCase();

  // Over-the-shoulder shots typically show back of one character
  if (framing.includes('over_shoulder') || framing.includes('ots')) {
    return 'back';
  }

  // Profile shots for side views
  if (framing.includes('profile')) {
    return 'profile';
  }

  // Close-ups and medium shots typically face camera
  if (framing.includes('close') || framing.includes('medium')) {
    return 'front';
  }

  // Wide shots often benefit from 3/4 view
  if (framing.includes('wide') || framing.includes('full')) {
    return 'three_quarter';
  }

  return 'front';
}

/**
 * Auto-detect view from action description keywords
 */
export function detectViewFromAction(action: string): CharacterView | null {
  const text = action.toLowerCase();

  // Walking away, leaving, departing -> back
  if (
    text.includes('walks away') ||
    text.includes('leaves') ||
    text.includes('departing') ||
    text.includes('exits') ||
    text.includes('turns away') ||
    text.includes('s\'éloigne') ||
    text.includes('part') ||
    text.includes('quitte') ||
    text.includes('de dos')
  ) {
    return 'back';
  }

  // Turning, rotating -> profile or 3/4
  if (
    text.includes('turns') ||
    text.includes('turning') ||
    text.includes('se tourne') ||
    text.includes('se retourne')
  ) {
    return 'profile';
  }

  // Face to face, dialogue, talking -> front or profile depending on camera
  if (
    text.includes('face to face') ||
    text.includes('face à face') ||
    text.includes('facing each other')
  ) {
    return 'profile'; // Side view of conversation
  }

  // Direct address, looking at camera
  if (
    text.includes('looks at camera') ||
    text.includes('regarde la caméra') ||
    text.includes('facing camera') ||
    text.includes('face caméra')
  ) {
    return 'front';
  }

  // No specific keywords detected
  return null;
}

/**
 * Get the best view for a character in a given context
 * Priority: manual override > action keywords > shot framing > default
 */
export function getBestView(
  characterName: string,
  options: {
    manualViews?: Map<string, CharacterView | null>;
    action?: string;
    shotFraming?: string;
    numCharacters?: number;
  }
): CharacterView {
  const { manualViews, action, shotFraming, numCharacters = 1 } = options;

  // 1. Manual override from @Character:vue syntax
  const manualView = manualViews?.get(characterName);
  if (manualView) {
    return manualView;
  }

  // 2. Detect from action keywords
  if (action) {
    const actionView = detectViewFromAction(action);
    if (actionView) {
      return actionView;
    }
  }

  // 3. Shot framing hint
  if (shotFraming) {
    return detectViewFromFraming(shotFraming);
  }

  // 4. Default based on number of characters
  // Multiple characters: 3/4 view shows depth and interaction
  // Single character: front view for clarity
  return numCharacters > 1 ? 'three_quarter' : 'front';
}

/**
 * Get reference image URL for a specific view from metadata
 */
export function getImageForView(
  refImagesMetadata: Array<{ url: string; type: string }>,
  preferredView: CharacterView
): { url: string; type: string } | null {
  // Try to find exact match
  const exact = refImagesMetadata.find(img => img.type === preferredView);
  if (exact) return exact;

  // Fallback chain
  const fallbackOrder: CharacterView[] = ['front', 'three_quarter', 'profile', 'back'];
  for (const view of fallbackOrder) {
    const found = refImagesMetadata.find(img => img.type === view);
    if (found) return found;
  }

  // Return first available
  return refImagesMetadata[0] || null;
}
