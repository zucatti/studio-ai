/**
 * Generate a PascalCase reference name from a display name
 * "Le lapin blanc" -> "@LeLapinBlanc"
 * "Jean-Pierre" -> "@JeanPierre"
 * "L'épée magique" -> "@LEpeeMagique"
 */
export function generateReferenceName(displayName: string): string {
  if (!displayName) return '';

  // Normalize and clean the string
  const cleaned = displayName
    // Replace accented characters
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Replace apostrophes and hyphens with spaces
    .replace(/['-]/g, ' ')
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

  return `@${pascalCase}`;
}

/**
 * Check if a text contains a reference to an entity
 * Supports both @ReferenceName and full display name
 */
export function hasReference(text: string, displayName: string): boolean {
  if (!text || !displayName) return false;

  const textLower = text.toLowerCase();
  const nameLower = displayName.toLowerCase();
  const refName = generateReferenceName(displayName).toLowerCase();

  // Check for @ReferenceName (case insensitive)
  if (textLower.includes(refName)) {
    return true;
  }

  // Check for full name as word boundary
  const nameRegex = new RegExp(`(^|\\s|@)${escapeRegex(nameLower)}(\\s|$|[.,!?;:'"])`, 'i');
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
 * Extract all @references from a text
 */
export function extractReferences(text: string): string[] {
  if (!text) return [];

  const matches = text.match(/@[A-Z][a-zA-Z0-9]*/g);
  return matches || [];
}

/**
 * Entity with name and visual description
 */
interface VisualEntity {
  name: string;
  visual_description: string | null;
}

/**
 * Replace all @references in text with their visual descriptions
 * @param text - The text containing @references
 * @param entities - Array of entities (characters, props, locations) with name and visual_description
 * @returns Text with @references replaced by visual descriptions
 *
 * Example:
 * Input: "@LeCoyote court dans le désert avec @LeRevolver"
 * Entities: [
 *   { name: "Le Coyote", visual_description: "orange cartoon coyote with big eyes, Pixar style" },
 *   { name: "Le Revolver", visual_description: "chrome plated Smith & Wesson revolver with pearl grips" }
 * ]
 * Output: "orange cartoon coyote with big eyes, Pixar style court dans le désert avec chrome plated Smith & Wesson revolver with pearl grips"
 */
export function replaceReferencesWithDescriptions(
  text: string,
  entities: VisualEntity[]
): string {
  if (!text || !entities || entities.length === 0) return text;

  let result = text;

  for (const entity of entities) {
    if (!entity.visual_description) continue;

    const refName = generateReferenceName(entity.name);

    // Replace @ReferenceName with visual description (case insensitive)
    const refRegex = new RegExp(escapeRegex(refName), 'gi');
    result = result.replace(refRegex, entity.visual_description);

    // Also replace full name mentions (with @ prefix)
    const fullNameWithAt = `@${entity.name}`;
    const fullNameRegex = new RegExp(escapeRegex(fullNameWithAt), 'gi');
    result = result.replace(fullNameRegex, entity.visual_description);
  }

  return result;
}
