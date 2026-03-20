/**
 * Generate a PascalCase reference name from a display name
 * "Le lapin blanc" -> "@LeLapinBlanc" (character)
 * "La forêt magique" -> "#LaForetMagique" (location/prop)
 * "Jean-Pierre" -> "@JeanPierre"
 * "L'épée magique" -> "#LEpeeMagique"
 *
 * @param displayName - The display name to convert
 * @param prefix - The prefix to use (@ for characters, # for locations/props)
 */
export function generateReferenceName(displayName: string, prefix: '@' | '#' = '@'): string {
  if (!displayName) return '';

  // Normalize and clean the string
  const cleaned = displayName
    // Replace accented characters
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Replace apostrophes, hyphens, and underscores with spaces
    .replace(/['\-_]/g, ' ')
    // Remove any non-alphanumeric characters except spaces
    .replace(/[^a-zA-Z0-9\s]/g, '')
    // Trim
    .trim();

  // Split by spaces and convert to PascalCase
  const pascalCase = cleaned
    .split(/\s+/)
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');

  return `${prefix}${pascalCase}`;
}

/**
 * Get the appropriate prefix for an asset type
 */
export function getReferencePrefix(assetType: 'character' | 'location' | 'prop' | 'audio'): '@' | '#' {
  if (assetType === 'character') return '@';
  return '#';
}

/**
 * Check if a text contains a reference to an entity
 * Supports both @ReferenceName/#ReferenceName and full display name
 */
export function hasReference(text: string, displayName: string, prefix: '@' | '#' = '@'): boolean {
  if (!text || !displayName) return false;

  const textLower = text.toLowerCase();
  const nameLower = displayName.toLowerCase();
  const refName = generateReferenceName(displayName, prefix).toLowerCase();

  // Check for @ReferenceName or #ReferenceName (case insensitive)
  if (textLower.includes(refName)) {
    return true;
  }

  // Check for full name as word boundary
  const nameRegex = new RegExp(`(^|\\s|[@#!])${escapeRegex(nameLower)}(\\s|$|[.,;:'"])`, 'i');
  if (nameRegex.test(textLower)) {
    return true;
  }

  return false;
}

/**
 * Escape special regex characters
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract all @references and #references from a text
 */
export function extractReferences(text: string): string[] {
  if (!text) return [];

  const matches = text.match(/[@#][A-Z][a-zA-Z0-9_]*/g);
  return matches || [];
}

/**
 * Extract only @references (characters) from text
 */
export function extractCharacterReferences(text: string): string[] {
  if (!text) return [];

  const matches = text.match(/@[A-Z][a-zA-Z0-9_]*/g);
  return matches || [];
}

/**
 * Extract only #references (locations/props) from text
 */
export function extractLocationReferences(text: string): string[] {
  if (!text) return [];

  const matches = text.match(/#[A-Z][a-zA-Z0-9_]*/g);
  return matches || [];
}

/**
 * Generate a look reference name
 * "Robe de soirée" -> "!RobeDeSoiree"
 */
export function generateLookReferenceName(lookName: string): string {
  if (!lookName) return '';

  const cleaned = lookName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\-_]/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim();

  const pascalCase = cleaned
    .split(/\s+/)
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');

  return `!${pascalCase}`;
}

/**
 * Generate a full character+look reference
 * "@Morgana!RobeDeSoiree"
 */
export function generateCharacterLookReference(characterName: string, lookName: string): string {
  const charRef = generateReferenceName(characterName, '@');
  const lookRef = generateLookReferenceName(lookName);
  return `${charRef}${lookRef}`;
}

/**
 * Extract character references with their associated looks from text
 * The ! look follows the previous @ character contextually
 *
 * Example: "@Morgana !robeDeSoiree court vers @Kael !tenueRock"
 * Returns: [
 *   { character: "@Morgana", look: "!robeDeSoiree" },
 *   { character: "@Kael", look: "!tenueRock" }
 * ]
 */
export interface CharacterWithLook {
  character: string;
  look?: string;
}

export function extractCharacterWithLookReferences(text: string): CharacterWithLook[] {
  if (!text) return [];

  const mentionRegex = /[@!][A-Z][a-zA-Z0-9_]*/g;
  const results: CharacterWithLook[] = [];
  let currentCharacter: string | null = null;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    const ref = match[0];
    if (ref.startsWith('@')) {
      // New character - save previous if exists without look
      if (currentCharacter) {
        results.push({ character: currentCharacter });
      }
      currentCharacter = ref;
    } else if (ref.startsWith('!') && currentCharacter) {
      // Look for current character
      results.push({ character: currentCharacter, look: ref });
      currentCharacter = null; // Reset after associating
    }
  }

  // Don't forget last character without look
  if (currentCharacter) {
    results.push({ character: currentCharacter });
  }

  return results;
}


/**
 * Look variation for a character
 */
interface LookData {
  name: string;
  description: string;
}

/**
 * Entity with name, visual description, and optional asset type
 */
interface VisualEntity {
  name: string;
  visual_description: string | null;
  asset_type?: 'character' | 'location' | 'prop' | 'audio';
  looks?: LookData[];
}

/**
 * Replace all @references, #references, and !looks in text with their visual descriptions
 * The !Look is contextually associated with the previous @Character
 *
 * @param text - The text containing @references (characters), #references (locations/props), and !looks
 * @param entities - Array of entities with name, visual_description, asset_type, and optional looks
 * @returns Text with references replaced by visual descriptions
 *
 * Example:
 * Input: "@LeCoyote !TenueDeSoiree court dans #LeDesert"
 * Entities: [
 *   {
 *     name: "Le Coyote",
 *     visual_description: "orange cartoon coyote with big eyes, Pixar style",
 *     asset_type: "character",
 *     looks: [{ name: "Tenue de soirée", description: "wearing elegant black tuxedo with bow tie" }]
 *   },
 *   { name: "Le Desert", visual_description: "vast red sand desert with cacti", asset_type: "location" }
 * ]
 * Output: "orange cartoon coyote with big eyes, Pixar style, wearing elegant black tuxedo with bow tie court dans vast red sand desert with cacti"
 */
export function replaceReferencesWithDescriptions(
  text: string,
  entities: VisualEntity[]
): string {
  if (!text || !entities || entities.length === 0) return text;

  // Build lookup maps
  const characterMap = new Map<string, VisualEntity>();
  const otherMap = new Map<string, VisualEntity>();

  for (const entity of entities) {
    if (!entity.visual_description) continue;

    const prefix = entity.asset_type ? getReferencePrefix(entity.asset_type) : '@';
    const refName = generateReferenceName(entity.name, prefix).toLowerCase();

    if (entity.asset_type === 'character') {
      characterMap.set(refName, entity);
    } else {
      otherMap.set(refName, entity);
    }
  }

  // Process text sequentially to handle contextual ! references
  const mentionRegex = /[@#!][A-Z][a-zA-Z0-9_]*/g;
  let result = '';
  let lastIndex = 0;
  let currentCharacter: VisualEntity | null = null;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before this mention
    result += text.slice(lastIndex, match.index);

    const ref = match[0];
    const refLower = ref.toLowerCase();

    if (ref.startsWith('@')) {
      // Character reference
      const entity = characterMap.get(refLower);
      if (entity) {
        currentCharacter = entity;
        result += entity.visual_description;
      } else {
        result += ref; // Keep original if not found
      }
    } else if (ref.startsWith('!')) {
      // Look reference - apply to current character
      if (currentCharacter && currentCharacter.looks) {
        const lookRefName = ref.toLowerCase();
        const look = currentCharacter.looks.find(l =>
          generateLookReferenceName(l.name).toLowerCase() === lookRefName
        );
        if (look) {
          result += `, ${look.description}`;
        } else {
          result += ref; // Keep original if look not found
        }
      } else {
        result += ref; // Keep original if no current character
      }
    } else if (ref.startsWith('#')) {
      // Location/prop reference
      const entity = otherMap.get(refLower);
      if (entity) {
        result += entity.visual_description;
      } else {
        result += ref;
      }
    }

    lastIndex = match.index + ref.length;
  }

  // Add remaining text
  result += text.slice(lastIndex);

  return result;
}

/**
 * Legacy function - kept for backwards compatibility
 * @deprecated Use replaceReferencesWithDescriptions instead
 */
function replaceReferencesWithDescriptionsLegacy(
  text: string,
  entities: VisualEntity[]
): string {
  if (!text || !entities || entities.length === 0) return text;

  let result = text;

  for (const entity of entities) {
    if (!entity.visual_description) continue;

    const prefix = entity.asset_type ? getReferencePrefix(entity.asset_type) : '@';
    const refName = generateReferenceName(entity.name, prefix);

    // Replace @ReferenceName or #ReferenceName with visual description
    const refRegex = new RegExp(escapeRegex(refName), 'gi');
    result = result.replace(refRegex, entity.visual_description);

    const fullNameWithPrefix = `${prefix}${entity.name}`;
    const fullNameRegex = new RegExp(escapeRegex(fullNameWithPrefix) + '(?![!])', 'gi');
    result = result.replace(fullNameRegex, entity.visual_description);
  }

  return result;
}
