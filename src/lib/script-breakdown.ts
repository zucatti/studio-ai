/**
 * Script Breakdown - Extract and analyze resources from script
 * Parses scenes, @mentions (characters), #mentions (locations/props)
 */

import { generateReferenceName } from './reference-name';

// ============================================================================
// Types
// ============================================================================

export type ResourceType = 'location' | 'character' | 'prop' | 'generic_character';

export interface ExtractedResource {
  type: ResourceType;
  name: string;             // Display name (as found in script)
  reference: string;        // Normalized reference (@Name or #Name)
  occurrences: number;      // How many times it appears
  scenes: number[];         // Scene numbers where it appears
  linkedAssetId?: string;   // If linked to a Bible asset
  linkedAssetName?: string; // Bible asset name
}

export interface ScriptBreakdown {
  locations: ExtractedResource[];
  characters: ExtractedResource[];
  props: ExtractedResource[];
  unlinkedCount: number;
  totalCount: number;
}

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Extract @mentions from text (characters)
 */
export function extractAtMentions(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/@([A-Za-z][A-Za-z0-9_]*)/g);
  return matches ? matches.map(m => m.slice(1)) : []; // Remove @ prefix
}

/**
 * Extract #mentions from text (locations/props)
 */
export function extractHashMentions(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/#([A-Za-z][A-Za-z0-9_]*)/g);
  return matches ? matches.map(m => m.slice(1)) : []; // Remove # prefix
}

/**
 * Normalize a reference for comparison (lowercase, no underscores)
 */
export function normalizeReference(ref: string): string {
  return ref.toLowerCase().replace(/_/g, '');
}

/**
 * Parse scene location from header
 * "La Forêt Enchantée" -> { name: "La Forêt Enchantée", reference: "#LaForetEnchantee" }
 */
export function parseSceneLocation(location: string): { name: string; reference: string } {
  const name = location.trim();
  const reference = generateReferenceName(name, '#');
  return { name, reference };
}

// ============================================================================
// Breakdown Builder
// ============================================================================

interface SceneData {
  scene_number: number;
  location: string;
  location_id?: string | null;
}

interface ScriptElementData {
  scene_id: string;
  content: string;
  character_id?: string | null;
  character_name?: string | null;
}

interface BibleAsset {
  id: string;
  name: string;
  asset_type: 'character' | 'location' | 'prop' | 'audio';
}

interface GenericAsset {
  id: string;
  name: string;
}

/**
 * Build a complete script breakdown
 */
export function buildScriptBreakdown(
  scenes: SceneData[],
  elements: (ScriptElementData & { scene_number: number })[],
  bibleAssets: BibleAsset[],
  projectGenericAssets: GenericAsset[]
): ScriptBreakdown {
  // Maps for aggregation (key = normalized reference)
  const locationMap = new Map<string, ExtractedResource>();
  const characterMap = new Map<string, ExtractedResource>();
  const propMap = new Map<string, ExtractedResource>();

  // Build lookup maps for Bible assets
  const bibleByNormalizedRef = new Map<string, BibleAsset>();
  for (const asset of bibleAssets) {
    const prefix = asset.asset_type === 'character' ? '@' : '#';
    const ref = generateReferenceName(asset.name, prefix);
    bibleByNormalizedRef.set(normalizeReference(ref.slice(1)), asset);
  }

  // Build lookup for generic characters
  const genericByNormalizedRef = new Map<string, GenericAsset>();
  for (const generic of projectGenericAssets) {
    const ref = generateReferenceName(generic.name, '@');
    genericByNormalizedRef.set(normalizeReference(ref.slice(1)), generic);
  }

  // Helper to add/update resource
  const addResource = (
    map: Map<string, ExtractedResource>,
    type: ResourceType,
    name: string,
    reference: string,
    sceneNumber: number
  ) => {
    const normalized = normalizeReference(reference.replace(/^[@#]/, ''));
    const existing = map.get(normalized);

    if (existing) {
      existing.occurrences++;
      if (!existing.scenes.includes(sceneNumber)) {
        existing.scenes.push(sceneNumber);
      }
    } else {
      // Check if linked to Bible
      let linkedAsset: BibleAsset | GenericAsset | undefined;

      if (type === 'character') {
        linkedAsset = bibleByNormalizedRef.get(normalized) || genericByNormalizedRef.get(normalized);
      } else {
        linkedAsset = bibleByNormalizedRef.get(normalized);
      }

      map.set(normalized, {
        type,
        name,
        reference,
        occurrences: 1,
        scenes: [sceneNumber],
        linkedAssetId: linkedAsset?.id,
        linkedAssetName: linkedAsset?.name,
      });
    }
  };

  // 1. Extract locations from scene headers
  for (const scene of scenes) {
    if (scene.location) {
      const { name, reference } = parseSceneLocation(scene.location);
      addResource(locationMap, 'location', name, reference, scene.scene_number);

      // If scene already has a location_id, mark it as linked
      if (scene.location_id) {
        const normalized = normalizeReference(reference.slice(1));
        const resource = locationMap.get(normalized);
        if (resource && !resource.linkedAssetId) {
          resource.linkedAssetId = scene.location_id;
        }
      }
    }
  }

  // 2. Extract @mentions and #mentions from elements
  for (const element of elements) {
    // Extract @mentions (characters)
    const atMentions = extractAtMentions(element.content);
    for (const mention of atMentions) {
      const reference = `@${mention}`;
      addResource(characterMap, 'character', mention, reference, element.scene_number);
    }

    // Also add dialogue character if present
    if (element.character_name) {
      const reference = generateReferenceName(element.character_name, '@');
      addResource(characterMap, 'character', element.character_name, reference, element.scene_number);
    }

    // Extract #mentions (locations/props)
    const hashMentions = extractHashMentions(element.content);
    for (const mention of hashMentions) {
      const reference = `#${mention}`;
      // Try to determine if it's a location or prop based on Bible
      const normalized = normalizeReference(mention);
      const bibleAsset = bibleByNormalizedRef.get(normalized);

      if (bibleAsset?.asset_type === 'location') {
        addResource(locationMap, 'location', mention, reference, element.scene_number);
      } else {
        // Default to prop
        addResource(propMap, 'prop', mention, reference, element.scene_number);
      }
    }
  }

  // Convert maps to arrays and sort by occurrence count
  const locations = Array.from(locationMap.values()).sort((a, b) => b.occurrences - a.occurrences);
  const characters = Array.from(characterMap.values()).sort((a, b) => b.occurrences - a.occurrences);
  const props = Array.from(propMap.values()).sort((a, b) => b.occurrences - a.occurrences);

  // Count unlinked resources
  const unlinkedCount = [
    ...locations.filter(r => !r.linkedAssetId),
    ...characters.filter(r => !r.linkedAssetId),
    ...props.filter(r => !r.linkedAssetId),
  ].length;

  const totalCount = locations.length + characters.length + props.length;

  return {
    locations,
    characters,
    props,
    unlinkedCount,
    totalCount,
  };
}
