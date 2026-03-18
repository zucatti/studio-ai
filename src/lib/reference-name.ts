/**
 * Generate a PascalCase reference name from a display name
 * "Le lapin blanc" -> "@LeLapinBlanc" (character)
 * "La forêt magique" -> "#LaForetMagique" (location/prop)
 * "Jean-Pierre" -> "@JeanPierre"
 * "L'épée magique" -> "#LEpeeMagique"
 * "Jump Pose" -> "!JumpPose" (reference)
 *
 * @param displayName - The display name to convert
 * @param prefix - The prefix to use (@ for characters, # for locations/props, ! for references)
 */
export function generateReferenceName(displayName: string, prefix: '@' | '#' | '!' = '@'): string {
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
export function getReferencePrefix(assetType: 'character' | 'location' | 'prop' | 'audio' | 'reference'): '@' | '#' | '!' {
  if (assetType === 'character') return '@';
  if (assetType === 'reference') return '!';
  return '#';
}

/**
 * Check if a text contains a reference to an entity
 * Supports both @ReferenceName/#ReferenceName/!ReferenceName and full display name
 */
export function hasReference(text: string, displayName: string, prefix: '@' | '#' | '!' = '@'): boolean {
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
 * Extract all @references, #references, and !references from a text
 */
export function extractReferences(text: string): string[] {
  if (!text) return [];

  const matches = text.match(/[@#!][A-Z][a-zA-Z0-9_]*/g);
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
 * Extract only !references (pose/composition/style) from text
 */
export function extractStyleReferences(text: string): string[] {
  if (!text) return [];

  const matches = text.match(/![A-Z][a-zA-Z0-9_]*/g);
  return matches || [];
}

/**
 * Entity with name, visual description, and optional asset type
 */
interface VisualEntity {
  name: string;
  visual_description: string | null;
  asset_type?: 'character' | 'location' | 'prop' | 'audio';
}

/**
 * Replace all @references and #references in text with their visual descriptions
 * @param text - The text containing @references (characters) and #references (locations/props)
 * @param entities - Array of entities with name, visual_description, and asset_type
 * @returns Text with references replaced by visual descriptions
 *
 * Example:
 * Input: "@LeCoyote court dans #LeDesert avec #LeRevolver"
 * Entities: [
 *   { name: "Le Coyote", visual_description: "orange cartoon coyote with big eyes, Pixar style", asset_type: "character" },
 *   { name: "Le Desert", visual_description: "vast red sand desert with cacti", asset_type: "location" },
 *   { name: "Le Revolver", visual_description: "chrome plated Smith & Wesson revolver with pearl grips", asset_type: "prop" }
 * ]
 * Output: "orange cartoon coyote with big eyes, Pixar style court dans vast red sand desert with cacti avec chrome plated Smith & Wesson revolver with pearl grips"
 */
export function replaceReferencesWithDescriptions(
  text: string,
  entities: VisualEntity[]
): string {
  if (!text || !entities || entities.length === 0) return text;

  let result = text;

  for (const entity of entities) {
    if (!entity.visual_description) continue;

    // Determine prefix based on asset type (@ for characters, # for others)
    const prefix = entity.asset_type ? getReferencePrefix(entity.asset_type) : '@';
    const refName = generateReferenceName(entity.name, prefix);

    // Replace @ReferenceName or #ReferenceName with visual description (case insensitive)
    const refRegex = new RegExp(escapeRegex(refName), 'gi');
    result = result.replace(refRegex, entity.visual_description);

    // Also replace full name mentions (with prefix)
    const fullNameWithPrefix = `${prefix}${entity.name}`;
    const fullNameRegex = new RegExp(escapeRegex(fullNameWithPrefix), 'gi');
    result = result.replace(fullNameRegex, entity.visual_description);
  }

  return result;
}
