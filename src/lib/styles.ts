/**
 * Cinematic Styles Library
 *
 * Helper functions to load and search cinematic techniques from /public/styles/*.json
 */

export interface StyleTechnique {
  name: string;
  utility: string;
  prompt: string;
  preview: string;
  slug: string; // Generated from filename: "ambient-light"
  category: string; // "lightning", "camera_work", etc.
  categoryLabel: string; // "Lighting", "Camera Work", etc.
}

export interface StyleCategory {
  id: string;
  label: string;
  techniques: StyleTechnique[];
  // Filter: which media types this category applies to
  mediaTypes: ('image' | 'video')[];
}

// Categories configuration
export const STYLE_CATEGORIES: {
  id: string;
  label: string;
  icon: string;
  mediaTypes: ('image' | 'video')[];
}[] = [
  { id: 'camera_work', label: 'Camera Work', icon: 'Video', mediaTypes: ['video'] },
  { id: 'composition', label: 'Composition', icon: 'Layout', mediaTypes: ['image', 'video'] },
  { id: 'editing', label: 'Editing', icon: 'Scissors', mediaTypes: ['video'] },
  { id: 'genres', label: 'Genres', icon: 'Film', mediaTypes: ['image', 'video'] },
  { id: 'lightning', label: 'Lighting', icon: 'Sun', mediaTypes: ['image', 'video'] },
  { id: 'sfx', label: 'SFX', icon: 'Sparkles', mediaTypes: ['video'] },
  { id: 'storytelling', label: 'Storytelling', icon: 'BookOpen', mediaTypes: ['image', 'video'] },
];

// Video-only categories (for filtering)
export const VIDEO_ONLY_CATEGORIES = ['camera_work', 'editing', 'sfx'];

// Cache for loaded styles
let stylesCache: StyleCategory[] | null = null;

/**
 * Load all style categories from JSON files
 */
export async function loadAllStyles(): Promise<StyleCategory[]> {
  if (stylesCache) {
    return stylesCache;
  }

  const categories: StyleCategory[] = [];

  for (const catConfig of STYLE_CATEGORIES) {
    try {
      const response = await fetch(`/styles/${catConfig.id}.json`);
      if (!response.ok) {
        console.warn(`Failed to load styles/${catConfig.id}.json`);
        continue;
      }

      const data = await response.json();
      const techniques: StyleTechnique[] = (data.techniques || []).map((tech: any) => ({
        name: tech.name,
        utility: tech.utility,
        prompt: tech.prompt,
        preview: tech.preview,
        // Extract slug from preview path: "lightning/ambient-light.webp" -> "ambient-light"
        slug: tech.preview?.split('/').pop()?.replace('.webp', '') || slugify(tech.name),
        category: catConfig.id,
        categoryLabel: catConfig.label,
      }));

      categories.push({
        id: catConfig.id,
        label: data.category || catConfig.label,
        techniques,
        mediaTypes: catConfig.mediaTypes,
      });
    } catch (error) {
      console.error(`Error loading ${catConfig.id}.json:`, error);
    }
  }

  stylesCache = categories;
  return categories;
}

/**
 * Get styles filtered by media type
 */
export async function getStylesForMediaType(
  mediaType: 'image' | 'video'
): Promise<StyleCategory[]> {
  const allStyles = await loadAllStyles();

  if (mediaType === 'video') {
    // Video gets everything
    return allStyles;
  }

  // Image only gets non-video-specific categories
  return allStyles.filter((cat) => cat.mediaTypes.includes('image'));
}

/**
 * Search techniques across all categories
 */
export async function searchStyles(
  query: string,
  mediaType: 'image' | 'video' = 'video'
): Promise<StyleTechnique[]> {
  const categories = await getStylesForMediaType(mediaType);
  const lowerQuery = query.toLowerCase();

  const results: StyleTechnique[] = [];

  for (const category of categories) {
    for (const tech of category.techniques) {
      if (
        tech.name.toLowerCase().includes(lowerQuery) ||
        tech.slug.toLowerCase().includes(lowerQuery) ||
        tech.utility.toLowerCase().includes(lowerQuery)
      ) {
        results.push(tech);
      }
    }
  }

  return results;
}

/**
 * Find a technique by its slug
 */
export async function findStyleBySlug(slug: string): Promise<StyleTechnique | null> {
  const allStyles = await loadAllStyles();

  for (const category of allStyles) {
    const tech = category.techniques.find(
      (t) => t.slug.toLowerCase() === slug.toLowerCase()
    );
    if (tech) return tech;
  }

  return null;
}

/**
 * Find multiple techniques by their slugs
 */
export async function findStylesBySlugs(slugs: string[]): Promise<Map<string, StyleTechnique>> {
  const allStyles = await loadAllStyles();
  const result = new Map<string, StyleTechnique>();

  for (const slug of slugs) {
    for (const category of allStyles) {
      const tech = category.techniques.find(
        (t) => t.slug.toLowerCase() === slug.toLowerCase()
      );
      if (tech) {
        result.set(slug.toLowerCase(), tech);
        break;
      }
    }
  }

  return result;
}

/**
 * Parse /style mentions from text and return their slugs
 */
export function parseStyleMentions(text: string): string[] {
  const regex = /\/([a-z0-9-]+)/gi;
  const matches: string[] = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1].toLowerCase());
  }

  return [...new Set(matches)]; // Dedupe
}

/**
 * Expand /style mentions in text to their full prompts
 */
export async function expandStyleMentions(text: string): Promise<{
  expandedText: string;
  stylePrompts: string[];
}> {
  const slugs = parseStyleMentions(text);
  const stylePrompts: string[] = [];

  if (slugs.length === 0) {
    return { expandedText: text, stylePrompts: [] };
  }

  const stylesMap = await findStylesBySlugs(slugs);

  // Collect all style prompts (without removing from text - we keep the tag for display)
  for (const [, tech] of stylesMap) {
    // Clean the prompt: remove --v 6.0 suffix if present
    const cleanPrompt = tech.prompt.replace(/\s*--v\s*\d+\.\d+\s*$/, '').trim();
    stylePrompts.push(cleanPrompt);
  }

  return { expandedText: text, stylePrompts };
}

/**
 * Generate slug from technique name
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Generate reference tag from technique
 */
export function generateStyleReference(tech: StyleTechnique): string {
  return `/${tech.slug}`;
}

/**
 * Clear the styles cache (useful for hot reloading in dev)
 */
export function clearStylesCache(): void {
  stylesCache = null;
}
