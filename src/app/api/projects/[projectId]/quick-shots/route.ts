import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { uploadFile, getSignedFileUrl, parseStorageUrl, STORAGE_BUCKET } from '@/lib/storage';
import { fal } from '@fal-ai/client';
import Anthropic from '@anthropic-ai/sdk';
import { logFalUsage, logClaudeUsage } from '@/lib/ai/log-api-usage';
import { generateReferenceName, generateLookReferenceName } from '@/lib/reference-name';
import { createSSEStream, createSSEHeaders, type GenerationProgressEvent } from '@/lib/sse';
import type { AspectRatio } from '@/types/database';

// Configure fal.ai client
fal.config({
  credentials: process.env.AI_FAL_KEY,
});

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

interface LookVariation {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  reference?: string; // Generated reference like !RobeDeSoiree
}

interface EntityWithImage {
  reference: string;
  name: string;
  visual_description: string;
  reference_images: string[];
  type: 'character' | 'prop' | 'location';
  looks?: LookVariation[]; // Looks for characters
}

// Reference system has been removed - keeping interface for type compatibility
interface ReferenceImage {
  id: string;
  reference: string;
  name: string;
  image_url: string;
  type: 'pose' | 'composition' | 'style';
  description: string | null;
}

// Fetch all entities with their reference images
async function fetchEntitiesWithImages(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  projectId: string
): Promise<EntityWithImage[]> {
  const entities: EntityWithImage[] = [];
  const seenRefs = new Set<string>();

  const [charactersRes, propsRes, locationsRes] = await Promise.all([
    supabase.from('characters').select('name, visual_description, reference_images').eq('project_id', projectId),
    supabase.from('props').select('name, visual_description, reference_images').eq('project_id', projectId),
    supabase.from('locations').select('name, visual_description, reference_images').eq('project_id', projectId),
  ]);

  for (const char of charactersRes.data || []) {
    const ref = generateReferenceName(char.name, '@');
    seenRefs.add(ref.toLowerCase());
    entities.push({
      reference: ref,
      name: char.name,
      visual_description: char.visual_description || '',
      reference_images: char.reference_images || [],
      type: 'character',
    });
  }

  for (const prop of propsRes.data || []) {
    const ref = generateReferenceName(prop.name, '#');
    seenRefs.add(ref.toLowerCase());
    entities.push({
      reference: ref,
      name: prop.name,
      visual_description: prop.visual_description || '',
      reference_images: prop.reference_images || [],
      type: 'prop',
    });
  }

  for (const loc of locationsRes.data || []) {
    const ref = generateReferenceName(loc.name, '#');
    seenRefs.add(ref.toLowerCase());
    entities.push({
      reference: ref,
      name: loc.name,
      visual_description: loc.visual_description || '',
      reference_images: loc.reference_images || [],
      type: 'location',
    });
  }

  // Also fetch global assets imported to this project
  const { data: projectAssets } = await supabase
    .from('project_assets')
    .select(`
      global_asset_id,
      global_assets (
        name,
        asset_type,
        data,
        reference_images
      )
    `)
    .eq('project_id', projectId);

  for (const pa of projectAssets || []) {
    const ga = pa.global_assets as any;
    if (!ga || ga.asset_type === 'audio') continue;

    const prefix = ga.asset_type === 'character' ? '@' : '#';
    const ref = generateReferenceName(ga.name, prefix);
    if (seenRefs.has(ref.toLowerCase())) continue;
    seenRefs.add(ref.toLowerCase());

    const data = ga.data as Record<string, unknown>;

    // Extract looks for characters and generate references
    let looks: LookVariation[] | undefined;
    if (ga.asset_type === 'character' && Array.isArray(data?.looks)) {
      looks = (data.looks as LookVariation[]).map(look => ({
        ...look,
        reference: generateLookReferenceName(look.name),
      }));
    }

    entities.push({
      reference: ref,
      name: ga.name,
      visual_description: (data?.visual_description as string) || (data?.description as string) || '',
      reference_images: ga.reference_images || [],
      type: ga.asset_type as 'character' | 'prop' | 'location',
      looks,
    });
  }

  return entities;
}

// Reference system has been removed - returns empty array
async function fetchReferences(
  _supabase: ReturnType<typeof createServerSupabaseClient>,
  _projectId: string
): Promise<ReferenceImage[]> {
  return [];
}

// Find mentioned references (!Pose, !Style, etc) in prompt
function findMentionedReferences(prompt: string, references: ReferenceImage[]): ReferenceImage[] {
  const mentions = prompt.match(/![a-zA-Z][a-zA-Z0-9]*/g) || [];
  const mentionedRefs: ReferenceImage[] = [];
  const seenIds = new Set<string>();

  for (const mention of mentions) {
    const ref = references.find(r =>
      r.reference.toLowerCase() === mention.toLowerCase()
    );
    if (ref && !seenIds.has(ref.id)) {
      seenIds.add(ref.id);
      mentionedRefs.push(ref);
    }
  }

  return mentionedRefs;
}

// Find mentioned entities in prompt (case-insensitive)
function findMentionedEntities(prompt: string, entities: EntityWithImage[]): EntityWithImage[] {
  const mentions = prompt.match(/[@#][a-zA-Z][a-zA-Z0-9]*/g) || [];
  const mentionedEntities: EntityWithImage[] = [];
  const seenIds = new Set<string>();

  for (const mention of mentions) {
    const entity = entities.find(e =>
      e.reference.toLowerCase() === mention.toLowerCase()
    );
    if (entity && !seenIds.has(entity.reference)) {
      seenIds.add(entity.reference);
      mentionedEntities.push(entity);
    }
  }

  return mentionedEntities;
}

// Find mentioned looks in prompt and return their images
function findMentionedLookImages(prompt: string, entities: EntityWithImage[]): string[] {
  const lookMentions = prompt.match(/![a-zA-Z][a-zA-Z0-9]*/g) || [];
  const lookImages: string[] = [];
  const seenLooks = new Set<string>();

  for (const lookMention of lookMentions) {
    // Search for this look in all characters
    for (const entity of entities) {
      if (entity.type !== 'character' || !entity.looks) continue;

      const look = entity.looks.find(l =>
        l.reference?.toLowerCase() === lookMention.toLowerCase()
      );

      if (look && look.imageUrl && !seenLooks.has(look.id)) {
        seenLooks.add(look.id);
        lookImages.push(look.imageUrl);
      }
    }
  }

  return lookImages;
}

// Get reference images for an entity (front + side for best consistency)
function getReferenceImages(entity: EntityWithImage, maxImages: number = 2): string[] {
  const images = entity.reference_images || [];
  if (images.length === 0) return [];

  const result: string[] = [];

  // Priority 1: Front view (most important for face)
  const frontImage = images.find(img => img.includes('_front_'));
  if (frontImage) {
    result.push(frontImage);
  }

  // Priority 2: Side/profile view (helps with hair, profile shape)
  const sideImage = images.find(img => img.includes('_side_') || img.includes('_profile_'));
  if (sideImage && result.length < maxImages) {
    result.push(sideImage);
  }

  // If we don't have front, use whatever is available
  if (result.length === 0 && images.length > 0) {
    result.push(images[0]);
  }

  // Fill remaining slots with other images (except back, less useful)
  for (const img of images) {
    if (result.length >= maxImages) break;
    if (!result.includes(img) && !img.includes('_back_')) {
      result.push(img);
    }
  }

  return result.slice(0, maxImages);
}

// Get first reference image only (for models that accept single image)
function getFirstReferenceImage(entity: EntityWithImage): string | null {
  const images = getReferenceImages(entity, 1);
  return images[0] || null;
}

// Expand @mentions and #mentions to visual descriptions
function expandMentions(text: string, entities: EntityWithImage[]): string {
  let expanded = text;
  for (const entity of entities) {
    if (entity.visual_description) {
      // Case-insensitive replacement
      const regex = new RegExp(entity.reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      expanded = expanded.replace(regex, entity.visual_description);
    }
  }
  return expanded;
}

// Expand !references to their stored prompt descriptions
// The prompt is generated once at import time, so it's already anonymous
function expandReferences(text: string, references: ReferenceImage[]): string {
  let expanded = text;
  for (const ref of references) {
    if (ref.description) {
      // Replace !ReferenceName with the stored prompt
      const regex = new RegExp(ref.reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      expanded = expanded.replace(regex, ref.description);
    }
  }
  return expanded;
}

// Expand !Look mentions for characters
// Handles patterns like "@Character!Look" or standalone "!Look" (uses last mentioned character)
function expandCharacterLooks(text: string, entities: EntityWithImage[]): string {
  let expanded = text;

  // Build a map of all looks from all characters
  const lookMap = new Map<string, { look: LookVariation; character: EntityWithImage }>();
  for (const entity of entities) {
    if (entity.type === 'character' && entity.looks) {
      for (const look of entity.looks) {
        if (look.reference) {
          lookMap.set(look.reference.toLowerCase(), { look, character: entity });
        }
      }
    }
  }

  // Pattern 1: @Character!Look - explicit character + look combination
  // This replaces both the character mention and look with combined description
  const combinedPattern = /(@[a-zA-Z][a-zA-Z0-9]*)(![[a-zA-Z][a-zA-Z0-9]*)/gi;
  expanded = expanded.replace(combinedPattern, (match, charRef, lookRef) => {
    // Find the character
    const character = entities.find(e =>
      e.type === 'character' && e.reference.toLowerCase() === charRef.toLowerCase()
    );
    if (!character || !character.looks) return match;

    // Find the look in this specific character's looks
    const look = character.looks.find(l =>
      l.reference?.toLowerCase() === lookRef.toLowerCase()
    );
    if (!look) return match;

    // Combine: character visual description + look description
    const charDesc = character.visual_description || character.name;
    const lookDesc = look.description || '';
    return lookDesc ? `${charDesc}, ${lookDesc}` : charDesc;
  });

  // Pattern 2: Standalone !Look - find associated character or use the look description alone
  // Look for !Look that isn't preceded by @Character
  const standaloneLookPattern = /(?<!@[a-zA-Z][a-zA-Z0-9]*)(![[a-zA-Z][a-zA-Z0-9]*)/gi;
  expanded = expanded.replace(standaloneLookPattern, (match, lookRef) => {
    // Try to find this look in any character
    const lookData = lookMap.get(lookRef.toLowerCase());
    if (!lookData) return match;

    // Find the last mentioned character before this look in the original text
    const matchIndex = expanded.indexOf(match);
    const textBefore = expanded.substring(0, matchIndex);
    const charMentions = textBefore.match(/@[a-zA-Z][a-zA-Z0-9]*/g) || [];
    const lastCharMention = charMentions[charMentions.length - 1];

    if (lastCharMention) {
      // Check if this look belongs to the last mentioned character
      const lastChar = entities.find(e =>
        e.type === 'character' && e.reference.toLowerCase() === lastCharMention.toLowerCase()
      );
      if (lastChar && lastChar.looks) {
        const charLook = lastChar.looks.find(l =>
          l.reference?.toLowerCase() === lookRef.toLowerCase()
        );
        if (charLook) {
          return charLook.description || match;
        }
      }
    }

    // Fallback: just use the look description
    return lookData.look.description || match;
  });

  return expanded;
}

// Get aspect ratio string for fal.ai (nano-banana, flux-pro)
function getAspectRatioString(ratio: AspectRatio): string {
  switch (ratio) {
    case '16:9': return '16:9';
    case '9:16': return '9:16';
    case '1:1': return '1:1';
    case '4:5': return '4:5';
    case '2:3': return '2:3';
    case '21:9': return '21:9';
    default: return '16:9';
  }
}

// Get aspect ratio for Kling O1 Image (slightly different format)
function getKlingAspectRatio(ratio: AspectRatio): string {
  switch (ratio) {
    case '16:9': return '16:9';
    case '9:16': return '9:16';
    case '1:1': return '1:1';
    case '4:5': return '3:4'; // Closest match
    case '2:3': return '2:3';
    case '21:9': return '21:9';
    default: return '16:9';
  }
}

// Build Kling O1 input with elements for characters and image_urls for poses
// Returns { prompt, elements, image_urls }
function buildKlingInput(
  optimizedPrompt: string,
  characterImageUrls: string[],
  poseImageUrls: string[],
  hasCharacterRef: boolean,
  hasPoseRef: boolean
): { prompt: string; elements?: any[]; image_urls?: string[] } {
  const parts: string[] = [];

  // Build elements array for character references (better identity preservation)
  const elements: any[] = [];
  if (hasCharacterRef) {
    // Use first character image as frontal, rest as references
    elements.push({
      frontal_image_url: characterImageUrls[0],
      reference_image_urls: characterImageUrls.slice(1, 4), // Max 3 additional refs
    });
  }

  // Build prompt based on what we have
  if (hasCharacterRef && hasPoseRef) {
    // Character element + pose image reference
    parts.push('Generate @Element1 (the character from the element reference)');
    parts.push('with the EXACT body pose and position shown in @Image1.');
    parts.push('The character must keep their original face, hair, skin tone, and clothing from @Element1.');
    parts.push('From @Image1, ONLY copy the body posture, arm positions, leg positions, and head angle.');
    parts.push('Do NOT copy the face, hair color, clothing, or identity from @Image1.');
  } else if (hasCharacterRef) {
    // Only character element
    parts.push('Generate @Element1 in a new scene.');
    parts.push('Keep the exact same appearance, face, hair, and clothing.');
  } else if (hasPoseRef) {
    // Only pose image - generate new character with that pose
    parts.push('Generate a completely new person with the body pose from @Image1.');
    parts.push('Create a NEW face and appearance. Do NOT copy the face, hair, or clothing from @Image1.');
    parts.push('Only use @Image1 as a reference for body posture and position.');
  }

  parts.push(optimizedPrompt);
  parts.push('cinematic, high quality, no text, no watermark');

  return {
    prompt: parts.join(' '),
    elements: elements.length > 0 ? elements : undefined,
    image_urls: poseImageUrls.length > 0 ? poseImageUrls : undefined,
  };
}

// Get image size for flux-general (different format)
function getFluxGeneralImageSize(ratio: AspectRatio): string {
  switch (ratio) {
    case '16:9': return 'landscape_16_9';
    case '9:16': return 'portrait_16_9';
    case '1:1': return 'square_hd';
    case '4:5': return 'portrait_4_3'; // closest match
    case '2:3': return 'portrait_4_3'; // closest match
    case '21:9': return 'landscape_16_9'; // closest match
    default: return 'landscape_16_9';
  }
}

// Get a publicly accessible URL for fal.ai (convert B2 to signed URL)
async function getPublicImageUrl(imageUrl: string): Promise<string> {
  // Already a public URL
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }

  // Convert B2 URLs to signed URLs (valid for 1 hour)
  if (imageUrl.startsWith('b2://')) {
    const parsed = parseStorageUrl(imageUrl);
    if (parsed) {
      return await getSignedFileUrl(parsed.key, 3600);
    }
  }

  return imageUrl;
}

// Translate and optimize prompt for image generation
async function optimizePromptForGeneration(
  frenchPrompt: string,
  entities: EntityWithImage[],
  references: ReferenceImage[],
  hasReferenceImages: boolean,
  skipOptimization: boolean = false
): Promise<string> {
  console.log('\n========== PROMPT DEBUG ==========');
  console.log('1. Original prompt:', frenchPrompt);
  console.log('2. References found:', references.map(r => ({
    reference: r.reference,
    description: r.description?.substring(0, 50) + (r.description && r.description.length > 50 ? '...' : '') || '(NO DESCRIPTION!)'
  })));

  // First expand character looks (@Character!Look combinations)
  let expandedPrompt = expandCharacterLooks(frenchPrompt, entities);
  console.log('3. After !Look expansion:', expandedPrompt);

  // Then expand entity mentions (@character, #location)
  expandedPrompt = expandMentions(expandedPrompt, entities);
  console.log('4. After @/# expansion:', expandedPrompt);

  // Then expand !references to their stored prompts (generated at import time)
  expandedPrompt = expandReferences(expandedPrompt, references);
  console.log('5. After !ref expansion:', expandedPrompt);
  console.log('5. Skip optimization:', skipOptimization);
  console.log('===================================\n');

  // If user wants to skip optimization, return expanded prompt as-is
  if (skipOptimization) {
    console.log('Skipping prompt optimization (user disabled)');
    return expandedPrompt;
  }

  if (!process.env.AI_CLAUDE_KEY) {
    console.warn('AI_CLAUDE_KEY not set, using expanded description');
    return expandedPrompt;
  }

  const anthropic = new Anthropic({
    apiKey: process.env.AI_CLAUDE_KEY,
  });

  const referenceContext = hasReferenceImages
    ? 'The character from the reference image will be used, so focus on the scene, pose, and environment.'
    : 'Describe the character appearance in detail.';

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    messages: [
      {
        role: 'user',
        content: `You are an expert at creating image generation prompts for high-quality photorealistic or artistic images.

Convert this French image description into an optimized English prompt for Flux image generation.

French description:
"${expandedPrompt}"

Rules:
- Translate to English
- Keep it concise (max 80 words)
- Focus on visual elements: lighting, composition, mood, style
- Be specific about visual details
- ${referenceContext}
- Include photography/art style cues if implied

Return ONLY the optimized English prompt, nothing else.`,
      },
    ],
  });

  logClaudeUsage({
    operation: 'optimize-quick-shot-prompt',
    model: 'claude-sonnet-4-20250514',
    inputTokens: message.usage?.input_tokens || 0,
    outputTokens: message.usage?.output_tokens || 0,
  }).catch(console.error);

  const content = message.content[0];
  if (content.type === 'text') {
    return content.text.trim();
  }

  return expandedPrompt;
}

// Generate varied prompts for serial mode (portfolio/series)
async function generateSerialPrompts(
  themePrompt: string,
  entities: EntityWithImage[],
  references: ReferenceImage[],
  count: number
): Promise<string[]> {
  // Expand mentions first (looks, then characters/locations, then references)
  let expandedPrompt = expandCharacterLooks(themePrompt, entities);
  expandedPrompt = expandMentions(expandedPrompt, entities);
  expandedPrompt = expandReferences(expandedPrompt, references);

  if (!process.env.AI_CLAUDE_KEY) {
    // Fallback: return the same prompt N times
    return Array(count).fill(expandedPrompt);
  }

  const anthropic = new Anthropic({
    apiKey: process.env.AI_CLAUDE_KEY,
  });

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: `Tu es un expert en création de prompts pour la génération d'images de portfolio/série photo.

À partir de ce thème/concept:
"${expandedPrompt}"

Génère exactement ${count} prompts DIFFÉRENTS et VARIÉS pour créer une série cohérente mais diversifiée.

Règles:
- Chaque prompt doit être en anglais
- Chaque prompt doit être unique (différentes poses, angles, ambiances, lieux)
- Garde le même personnage/sujet principal
- Varie: les poses, les angles de caméra, l'éclairage, les décors, les expressions
- Chaque prompt fait max 60 mots
- Pense "portfolio professionnel" avec de la variété
- Inclus des détails cinématographiques (lighting, composition)

Retourne UNIQUEMENT les ${count} prompts, un par ligne, sans numérotation ni préfixe.`,
      },
    ],
  });

  logClaudeUsage({
    operation: 'generate-serial-prompts',
    model: 'claude-sonnet-4-20250514',
    inputTokens: message.usage?.input_tokens || 0,
    outputTokens: message.usage?.output_tokens || 0,
  }).catch(console.error);

  const content = message.content[0];
  if (content.type === 'text') {
    const prompts = content.text
      .trim()
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .slice(0, count);

    // Ensure we have exactly count prompts
    while (prompts.length < count) {
      prompts.push(expandedPrompt);
    }

    console.log('Generated serial prompts:', prompts);
    return prompts;
  }

  return Array(count).fill(expandedPrompt);
}

// Streaming generation handler
interface StreamingGenerationParams {
  projectId: string;
  userId: string;
  prompt: string;
  optimizedPrompt: string;
  entities: EntityWithImage[];
  mentionedEntities: EntityWithImage[];
  mentionedReferences: ReferenceImage[];
  ratio: AspectRatio;
  aspectRatioString: string;
  imageCount: number;
  resolution: '1K' | '2K' | '4K';
  useSeedream5: boolean;
  useKlingO1: boolean;
  supabase: ReturnType<typeof createServerSupabaseClient>;
  serialMode?: boolean;
  serialPrompts?: string[];
}

async function handleStreamingGeneration(params: StreamingGenerationParams): Promise<Response> {
  const { stream, send, close } = createSSEStream();

  // Start async generation in background
  (async () => {
    try {
      const {
        projectId,
        userId,
        prompt,
        optimizedPrompt,
        entities,
        mentionedEntities,
        mentionedReferences,
        ratio,
        aspectRatioString,
        imageCount,
        resolution,
        useSeedream5,
        useKlingO1,
        supabase,
        serialMode,
        serialPrompts,
      } = params;

      // Send init event
      send({
        type: 'init',
        count: imageCount,
        aspectRatio: ratio,
      });

      // Get character reference images
      const characterEntities = mentionedEntities.filter(e => e.type === 'character' && e.reference_images.length > 0);
      const otherEntities = mentionedEntities.filter(e => e.type !== 'character' && e.reference_images.length > 0);

      // Get pose references (with images)
      const poseReferences = mentionedReferences.filter(r => r.type === 'pose' && r.image_url);

      // Smart allocation: max 6 images total
      // Strategy: 2 images per character (front + side), then 1 per location/prop, then pose refs
      const MAX_TOTAL_REFS = 6;
      const referenceImageUrls: string[] = [];
      const poseImageUrls: string[] = [];

      // Calculate images per character based on count
      const numCharacters = characterEntities.length;
      const imagesPerCharacter = numCharacters <= 2 ? 2 : 1; // 2 chars = 2 each, 3+ = 1 each

      // Add character references (front + side when possible)
      for (const entity of characterEntities) {
        if (referenceImageUrls.length >= MAX_TOTAL_REFS - poseReferences.length) break;
        const refs = getReferenceImages(entity, imagesPerCharacter);
        for (const ref of refs) {
          if (referenceImageUrls.length >= MAX_TOTAL_REFS - poseReferences.length) break;
          referenceImageUrls.push(ref);
        }
      }

      // Add look images (costumes, styles) if mentioned
      const lookImages = findMentionedLookImages(prompt, entities);
      for (const lookImg of lookImages) {
        if (referenceImageUrls.length >= MAX_TOTAL_REFS - poseReferences.length) break;
        referenceImageUrls.push(lookImg);
      }

      // Add location/prop references if space remains (1 each)
      for (const entity of otherEntities) {
        if (referenceImageUrls.length >= MAX_TOTAL_REFS - poseReferences.length) break;
        const ref = getFirstReferenceImage(entity);
        if (ref) {
          referenceImageUrls.push(ref);
        }
      }

      // Add pose reference images (these will be used for pose transfer)
      for (const poseRef of poseReferences) {
        if (poseRef.image_url) {
          poseImageUrls.push(poseRef.image_url);
        }
      }

      console.log(`Reference strategy: ${numCharacters} characters × ${imagesPerCharacter} images, ${poseImageUrls.length} pose refs`);

      // Upload reference images (characters + poses)
      let falImageUrls: string[] = [];
      let falPoseUrls: string[] = [];

      if (referenceImageUrls.length > 0 || poseImageUrls.length > 0) {
        send({ type: 'progress', status: 'queued', message: 'Preparation des references...' });
        try {
          // Upload character/entity references first
          for (const imgUrl of referenceImageUrls) {
            const falUrl = await getPublicImageUrl(imgUrl);
            falImageUrls.push(falUrl);
          }
          // Upload pose references
          for (const imgUrl of poseImageUrls) {
            const falUrl = await getPublicImageUrl(imgUrl);
            falPoseUrls.push(falUrl);
          }
        } catch (uploadErr) {
          console.error('Failed to upload reference images:', uploadErr);
          falImageUrls = [];
          falPoseUrls = [];
        }
      }

      // Build prompt based on what references we have
      let consistencyPrompt: string;
      const hasPoseRef = falPoseUrls.length > 0;
      const hasCharacterRef = falImageUrls.length > 0;

      if (hasCharacterRef && hasPoseRef) {
        // Both character and pose references - use pose transfer
        consistencyPrompt = [
          'Generate an image using the character from images 1-' + falImageUrls.length + '.',
          'The character should adopt the EXACT POSE shown in image ' + (falImageUrls.length + 1) + '.',
          'Keep the character\'s appearance, face, and clothing from the character reference.',
          'Copy ONLY the body position and pose from the pose reference, NOT the person\'s appearance.',
          optimizedPrompt,
          'cinematic, high quality, consistent character design, no text, no watermark',
        ].join(' ');
      } else if (hasCharacterRef) {
        // Only character references
        consistencyPrompt = [
          'Generate a new image using the character(s) from the reference image(s).',
          'Keep the EXACT same appearance, face, clothing, and style.',
          optimizedPrompt,
          'cinematic, high quality, consistent character design, no text, no watermark',
        ].join(' ');
      } else if (hasPoseRef) {
        // Only pose reference (no character)
        consistencyPrompt = [
          'Generate an image with a person in the EXACT POSE shown in the reference image.',
          'Do NOT copy the person\'s appearance, only their body position and pose.',
          optimizedPrompt,
          'cinematic, high quality, no text, no watermark',
        ].join(' ');
      } else {
        consistencyPrompt = optimizedPrompt;
      }

      // Combine all image URLs (character first, then pose)
      const allImageUrls = [...falImageUrls, ...falPoseUrls];

      const generatedImages: string[] = [];
      const generatedPrompts: string[] = []; // Track prompt used for each image
      let currentImageIndex = 0;
      let usedModel = 'nano-banana-2'; // Track which model was used

      // Serial mode: generate images one by one with different prompts
      if (serialMode && serialPrompts && serialPrompts.length > 0) {
        send({
          type: 'progress',
          status: 'generating',
          message: 'Mode série: génération des variations...',
        });

        for (let i = 0; i < serialPrompts.length; i++) {
          const serialPrompt = serialPrompts[i];

          send({
            type: 'progress',
            status: 'generating',
            imageIndex: i,
            totalImages: imageCount,
            message: `Image ${i + 1}/${imageCount}: génération...`,
          });

          // Build prompt with character consistency
          let finalPrompt = serialPrompt;
          if (hasCharacterRef) {
            finalPrompt = [
              'Generate using the character from the reference image(s).',
              'Keep the EXACT same face, appearance, and style.',
              serialPrompt,
              'cinematic, high quality, no text, no watermark',
            ].join(' ');
          }

          try {
            // Use Nano Banana 2 for serial mode (simpler, one image at a time)
            if (allImageUrls.length > 0) {
              const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
                input: {
                  prompt: finalPrompt,
                  image_urls: allImageUrls,
                  aspect_ratio: aspectRatioString,
                  num_images: 1,
                  output_format: 'png',
                  resolution,
                  safety_tolerance: '4',
                } as any,
                logs: true,
              });

              const images = (result.data as any)?.images;
              if (images && images.length > 0) {
                generatedImages.push(images[0].url);
                generatedPrompts.push(serialPrompt);
                usedModel = `nano-banana-2-edit-${resolution.toLowerCase()}`;
              }
            } else {
              const result = await fal.subscribe('fal-ai/nano-banana-2', {
                input: {
                  prompt: finalPrompt,
                  aspect_ratio: aspectRatioString,
                  num_images: 1,
                  output_format: 'png',
                  resolution,
                } as any,
                logs: true,
              });

              const images = (result.data as any)?.images;
              if (images && images.length > 0) {
                generatedImages.push(images[0].url);
                generatedPrompts.push(serialPrompt);
                usedModel = `nano-banana-2-${resolution.toLowerCase()}`;
              }
            }

            logFalUsage({
              operation: 'generate-serial-shot',
              model: `nano-banana-2-${resolution.toLowerCase()}`,
              imagesCount: 1,
              projectId,
            }).catch(console.error);

          } catch (err) {
            console.error(`Serial mode: failed to generate image ${i + 1}:`, err);
          }
        }
      }

      // Progress callback for fal.ai with detailed info
      const onProgress = (imageIndex: number) => (update: any) => {
        // Debug: log what fal.ai sends
        console.log(`[fal.ai progress] Image ${imageIndex}:`, JSON.stringify(update, null, 2));

        const statusMap: Record<string, string> = {
          'IN_QUEUE': 'queued',
          'IN_PROGRESS': 'generating',
          'COMPLETED': 'completed',
        };
        const status = statusMap[update.status] || update.status;

        // Build detailed message
        let message = '';
        let progress: number | undefined;

        if (status === 'queued') {
          const position = update.queue_position ?? update.position;
          message = position !== undefined
            ? `File d'attente (position ${position})...`
            : 'En file d\'attente...';
        } else if (status === 'generating') {
          // Try to extract progress from logs
          const logs = update.logs || [];
          const lastLog = logs[logs.length - 1];

          // Look for percentage in logs (e.g., "50%", "Step 14/28")
          if (lastLog?.message) {
            const percentMatch = lastLog.message.match(/(\d+)%/);
            const stepMatch = lastLog.message.match(/(?:step|Step)\s*(\d+)\s*\/\s*(\d+)/i);

            if (percentMatch) {
              progress = parseInt(percentMatch[1]);
              message = `Generation ${progress}%...`;
            } else if (stepMatch) {
              const current = parseInt(stepMatch[1]);
              const total = parseInt(stepMatch[2]);
              progress = Math.round((current / total) * 100);
              message = `Étape ${current}/${total}...`;
            } else {
              message = `Generation en cours...`;
            }
          } else {
            message = `Generation en cours...`;
          }
        }

        send({
          type: 'progress',
          status: status as any,
          imageIndex,
          totalImages: imageCount,
          message,
          progress, // 0-100 percentage if available
        });
      };

      // Generate with Kling O1 Image (best quality + pose transfer)
      // Skip if serial mode already generated images
      if (generatedImages.length === 0 && useKlingO1 && (falImageUrls.length > 0 || falPoseUrls.length > 0)) {
        send({
          type: 'progress',
          status: 'generating',
          imageIndex: 0,
          totalImages: imageCount,
          message: hasPoseRef ? 'Kling O1: Pose transfer...' : 'Kling O1: Génération...',
        });

        try {
          // Build Kling input with elements for characters, image_urls for poses
          const klingInput = buildKlingInput(
            optimizedPrompt,
            falImageUrls,
            falPoseUrls,
            hasCharacterRef,
            hasPoseRef
          );

          console.log('Kling O1 prompt:', klingInput.prompt);
          console.log('Kling O1 elements:', klingInput.elements?.length || 0);
          console.log('Kling O1 image_urls:', klingInput.image_urls?.length || 0);

          const result = await fal.subscribe('fal-ai/kling-image/o1', {
            input: {
              prompt: klingInput.prompt,
              ...(klingInput.elements && { elements: klingInput.elements }),
              ...(klingInput.image_urls && { image_urls: klingInput.image_urls }),
              aspect_ratio: getKlingAspectRatio(ratio),
              resolution,
              num_images: Math.min(imageCount, 4),
              output_format: 'png',
            } as any,
            logs: true,
            onQueueUpdate: onProgress(0),
          });

          const images = (result.data as any)?.images;
          if (images) {
            for (const img of images) {
              generatedImages.push(img.url);
            }
            usedModel = `kling-image-o1-${resolution.toLowerCase()}`;
          }

          logFalUsage({
            operation: hasPoseRef ? 'generate-quick-shots-kling-pose' : 'generate-quick-shots-kling',
            model: `kling-image-o1-${resolution.toLowerCase()}`,
            imagesCount: Math.min(imageCount, 4),
            projectId,
          }).catch(console.error);

          // Generate more if needed (Kling supports up to 9)
          if (imageCount > 4 && generatedImages.length > 0) {
            const remaining = Math.min(imageCount - generatedImages.length, 5);
            const result2 = await fal.subscribe('fal-ai/kling-image/o1', {
              input: {
                prompt: klingInput.prompt,
                ...(klingInput.elements && { elements: klingInput.elements }),
                ...(klingInput.image_urls && { image_urls: klingInput.image_urls }),
                aspect_ratio: getKlingAspectRatio(ratio),
                resolution,
                num_images: remaining,
                output_format: 'png',
              } as any,
              logs: true,
              onQueueUpdate: onProgress(generatedImages.length),
            });

            const images2 = (result2.data as any)?.images;
            if (images2) {
              for (const img of images2) {
                generatedImages.push(img.url);
              }
            }

            logFalUsage({
              operation: 'generate-quick-shots-kling',
              model: 'kling-image-o1',
              imagesCount: remaining,
              projectId,
            }).catch(console.error);
          }
        } catch (err) {
          console.error('Kling O1 Image failed:', err);
          // Will fall through to other models
        }
      }

      // Generate with Seedream 5 Edit (multi-reference image editing)
      if (generatedImages.length === 0 && useSeedream5 && allImageUrls.length > 0) {
        send({
          type: 'progress',
          status: 'generating',
          imageIndex: 0,
          totalImages: imageCount,
          message: 'Seedream 5: Génération...',
        });

        try {
          // Seedream 5 uses @Image1, @Image2, etc. references in prompt
          let seedreamPrompt = '';
          if (hasCharacterRef && hasPoseRef) {
            seedreamPrompt = `Generate @Image1 (the character) adopting the pose from @Image${falImageUrls.length + 1}. Keep the character's face and appearance. ${optimizedPrompt}`;
          } else if (hasCharacterRef) {
            seedreamPrompt = `Generate @Image1 (the character) in a new scene. Keep the exact same face and appearance. ${optimizedPrompt}`;
          } else {
            seedreamPrompt = optimizedPrompt;
          }

          const result = await fal.subscribe('fal-ai/bytedance/seedream/v5/lite/edit', {
            input: {
              prompt: seedreamPrompt,
              image_urls: allImageUrls,
              aspect_ratio: aspectRatioString,
              num_images: Math.min(imageCount, 4),
              output_format: 'png',
            } as any,
            logs: true,
            onQueueUpdate: onProgress(0),
          });

          const images = (result.data as any)?.images;
          if (images) {
            for (const img of images) {
              generatedImages.push(img.url);
            }
            usedModel = 'seedream-5-edit';
          }

          logFalUsage({
            operation: 'generate-quick-shots-seedream5',
            model: 'seedream-5-edit',
            imagesCount: Math.min(imageCount, 4),
            projectId,
          }).catch(console.error);
        } catch (err) {
          console.error('Seedream 5 failed:', err);
        }
      }

      // Generate with Nano Banana 2 if needed
      if (generatedImages.length === 0) {
        send({
          type: 'progress',
          status: 'generating',
          imageIndex: 0,
          totalImages: imageCount,
          message: hasPoseRef ? 'Generation avec pose...' : 'Generation en cours...',
        });

        if (allImageUrls.length > 0) {
          try {
            const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
              input: {
                prompt: consistencyPrompt,
                image_urls: allImageUrls,
                aspect_ratio: aspectRatioString,
                num_images: Math.min(imageCount, 4),
                output_format: 'png',
                resolution,
                safety_tolerance: '4',
              } as any,
              logs: true,
              onQueueUpdate: onProgress(0),
            });

            const images = (result.data as any)?.images;
            if (images) {
              for (const img of images) {
                generatedImages.push(img.url);
              }
              usedModel = `nano-banana-2-edit-${resolution.toLowerCase()}`;
            }

            logFalUsage({
              operation: 'generate-quick-shots-nano-edit',
              model: `nano-banana-2-edit-${resolution.toLowerCase()}`,
              imagesCount: Math.min(imageCount, 4),
              projectId,
            }).catch(console.error);
          } catch (err) {
            console.error('Nano Banana 2 edit failed:', err);
          }
        }
      }

      // Fallback to text-to-image
      if (generatedImages.length === 0) {
        const result = await fal.subscribe('fal-ai/nano-banana-2', {
          input: {
            prompt: optimizedPrompt,
            aspect_ratio: aspectRatioString,
            num_images: Math.min(imageCount, 4),
            output_format: 'png',
            resolution,
          } as any,
          logs: true,
          onQueueUpdate: onProgress(0),
        });

        const images = (result.data as any)?.images;
        if (images) {
          for (const img of images) {
            generatedImages.push(img.url);
          }
          usedModel = `nano-banana-2-${resolution.toLowerCase()}`;
        }

        logFalUsage({
          operation: 'generate-quick-shots-nano',
          model: `nano-banana-2-${resolution.toLowerCase()}`,
          imagesCount: Math.min(imageCount, 4),
          projectId,
        }).catch(console.error);
      }

      if (generatedImages.length === 0) {
        send({ type: 'error', error: 'No images generated' });
        close();
        return;
      }

      // Upload images and create shots
      send({
        type: 'progress',
        status: 'uploading',
        message: 'Sauvegarde des images...',
      });

      const sanitizedUserId = userId.replace(/[|]/g, '_');
      const createdShots: any[] = [];

      const { data: existingShots } = await supabase
        .from('shots')
        .select('shot_number')
        .eq('project_id', projectId)
        .order('shot_number', { ascending: false })
        .limit(1);

      let shotNumber = (existingShots?.[0]?.shot_number || 0) + 1;

      for (let i = 0; i < generatedImages.length; i++) {
        const imageUrl = generatedImages[i];
        try {
          const imageResponse = await fetch(imageUrl);
          const imageBlob = await imageResponse.blob();
          const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());

          const timestamp = Date.now();
          const ext = imageUrl.includes('.jpg') || imageUrl.includes('.jpeg') ? 'jpg' : 'png';
          const storageKey = `quick-shots/${sanitizedUserId}/${projectId}/${timestamp}_${shotNumber}.${ext}`;
          await uploadFile(storageKey, imageBuffer, ext === 'jpg' ? 'image/jpeg' : 'image/png');

          const b2Url = `b2://${STORAGE_BUCKET}/${storageKey}`;

          // Build generation metadata (stored in description as JSON for now)
          // TODO: Use dedicated columns after migration is applied
          // Map resolution parameter to display value
          const resolutionDisplay = resolution === '4K' ? '4K'
            : resolution === '2K' ? '1080p'
            : '720p';
          // In serial mode, use the specific prompt for this image
          const imagePrompt = serialMode && generatedPrompts[i] ? generatedPrompts[i] : optimizedPrompt;
          const generationMetadata = {
            model: usedModel,
            original_prompt: prompt,
            optimized_prompt: imagePrompt,
            resolution: resolutionDisplay,
            aspect_ratio: aspectRatioString,
            serial_mode: serialMode || false,
            references: {
              characters: characterEntities.map(e => e.name),
              poses: mentionedReferences.filter(r => r.type === 'pose').map(r => r.name),
              styles: mentionedReferences.filter(r => r.type === 'style').map(r => r.name),
            },
            generated_at: new Date().toISOString(),
          };

          // Store prompt with metadata appended as comment
          const descriptionWithMeta = `${prompt}\n\n<!-- metadata:${JSON.stringify(generationMetadata)} -->`;

          const { data: shot, error } = await supabase
            .from('shots')
            .insert({
              project_id: projectId,
              scene_id: null,
              shot_number: shotNumber,
              description: descriptionWithMeta,
              storyboard_image_url: b2Url,
              generation_status: 'completed',
              status: 'draft',
              sort_order: shotNumber,
            })
            .select()
            .single();

          if (!error && shot) {
            createdShots.push(shot);
            // Send image event for each saved shot
            send({
              type: 'image',
              imageIndex: i,
              shotId: shot.id,
              imageUrl: b2Url,
            });
            shotNumber++;
          }
        } catch (uploadError) {
          console.error('Error uploading image:', uploadError);
        }
      }

      // Send complete event
      send({
        type: 'complete',
        shots: createdShots,
      });

      close();
    } catch (error) {
      console.error('Streaming generation error:', error);
      send({ type: 'error', error: String(error) });
      close();
    }
  })();

  return new Response(stream, { headers: createSSEHeaders() });
}

// POST /api/projects/[projectId]/quick-shots - Generate quick shots
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { prompt, selectedEntities, aspectRatio, model = 'nano-banana-2', count = 4, resolution = '2K', stream = false, skipOptimization = false, serialMode = false } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const imageCount = Math.min(Math.max(1, count), 8);
    const useSeedream5 = model === 'seedream-5' || model === 'fal-ai/bytedance/seedream/v5/lite/edit';
    const useKlingO1 = model === 'kling-o1' || model === 'fal-ai/kling-image/o1';

    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id, aspect_ratio')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!process.env.AI_FAL_KEY) {
      return NextResponse.json({ error: 'Fal.ai API key not configured' }, { status: 500 });
    }

    // Fetch all entities with images
    console.log('Fetching entities with images...');
    const entities = await fetchEntitiesWithImages(supabase, projectId);
    console.log('Found entities:', entities.length);

    // Fetch all references (poses, compositions, styles)
    console.log('Fetching references...');
    const references = await fetchReferences(supabase, projectId);
    console.log('Found references:', references.length);

    // Build full prompt with selected entity references
    let fullPrompt = prompt;
    if (selectedEntities && selectedEntities.length > 0) {
      const entityRefs = selectedEntities.map((e: string) => {
        // Determine prefix based on entity type
        const entity = entities.find(ent =>
          ent.name.toLowerCase().replace(/\s+/g, '') === e.toLowerCase().replace(/\s+/g, '')
        );
        const prefix = entity?.type === 'character' ? '@' : '#';
        return `${prefix}${e}`;
      }).join(' ');
      fullPrompt = `${entityRefs} ${prompt}`;
    }

    // Find mentioned entities in the prompt
    const mentionedEntities = findMentionedEntities(fullPrompt, entities);
    console.log('Mentioned entities:', mentionedEntities.map(e => e.reference));

    // Find mentioned references (!poses, !styles, etc) in the prompt
    const mentionedReferences = findMentionedReferences(fullPrompt, references);
    console.log('Mentioned references:', mentionedReferences.map(r => r.reference));

    // Get character reference images (prioritize characters for consistency)
    const characterEntities = mentionedEntities.filter(e => e.type === 'character' && e.reference_images.length > 0);
    const hasCharacterRefs = characterEntities.length > 0 || mentionedReferences.length > 0;

    console.log('Characters with reference images:', characterEntities.map(e => e.reference));

    // Generate serial prompts if in serial mode
    let serialPrompts: string[] | undefined;
    if (serialMode) {
      console.log('Serial mode enabled, generating varied prompts...');
      serialPrompts = await generateSerialPrompts(fullPrompt, entities, mentionedReferences, imageCount);
    }

    // Optimize prompt (expands entity mentions and reference prompts)
    // In serial mode, we use serialPrompts directly (already optimized)
    const optimizedPrompt = serialMode
      ? serialPrompts![0] // Use first serial prompt as the "main" one for metadata
      : await optimizePromptForGeneration(fullPrompt, entities, mentionedReferences, hasCharacterRefs, skipOptimization);
    console.log('Optimized prompt:', optimizedPrompt);

    const ratio: AspectRatio = aspectRatio || project.aspect_ratio || '16:9';
    const aspectRatioString = getAspectRatioString(ratio);

    // If streaming is requested, use SSE
    if (stream) {
      return handleStreamingGeneration({
        projectId,
        userId: session.user.sub,
        prompt: fullPrompt,
        optimizedPrompt,
        entities,
        mentionedEntities,
        mentionedReferences,
        ratio,
        aspectRatioString,
        imageCount,
        resolution: resolution as '1K' | '2K' | '4K',
        useSeedream5,
        useKlingO1,
        supabase,
        serialMode,
        serialPrompts,
      });
    }

    const generatedImages: string[] = [];

    // Get pose references (with images)
    const poseReferences = mentionedReferences.filter(r => r.type === 'pose' && r.image_url);

    // Smart allocation: max 6 images total
    // Strategy: 2 images per character (front + side), then 1 per location/prop, then pose refs
    const MAX_TOTAL_REFS = 6;
    const referenceImageUrls: string[] = [];
    const poseImageUrls: string[] = [];
    const otherEntities = mentionedEntities.filter(e => e.type !== 'character' && e.reference_images.length > 0);

    // Calculate images per character based on count
    const numCharacters = characterEntities.length;
    const imagesPerCharacter = numCharacters <= 2 ? 2 : 1; // 2 chars = 2 each, 3+ = 1 each

    // Add character references (front + side when possible)
    for (const entity of characterEntities) {
      if (referenceImageUrls.length >= MAX_TOTAL_REFS - poseReferences.length) break;
      const refs = getReferenceImages(entity, imagesPerCharacter);
      for (const ref of refs) {
        if (referenceImageUrls.length >= MAX_TOTAL_REFS - poseReferences.length) break;
        referenceImageUrls.push(ref);
      }
    }

    // Add look images (costumes, styles) if mentioned
    const lookImages = findMentionedLookImages(prompt, entities);
    for (const lookImg of lookImages) {
      if (referenceImageUrls.length >= MAX_TOTAL_REFS - poseReferences.length) break;
      referenceImageUrls.push(lookImg);
    }

    // Add location/prop references if space remains (1 each)
    for (const entity of otherEntities) {
      if (referenceImageUrls.length >= MAX_TOTAL_REFS - poseReferences.length) break;
      const ref = getFirstReferenceImage(entity);
      if (ref) {
        referenceImageUrls.push(ref);
      }
    }

    // Add pose reference images
    for (const poseRef of poseReferences) {
      if (poseRef.image_url) {
        poseImageUrls.push(poseRef.image_url);
      }
    }

    console.log(`Reference strategy: ${numCharacters} characters × ${imagesPerCharacter} images, ${lookImages.length} look refs, ${poseImageUrls.length} pose refs`);
    console.log('Using model:', useKlingO1 ? 'Kling O1 Image' : useSeedream5 ? 'Seedream 5' : 'Nano Banana 2');

    // Upload reference images if available
    let falImageUrls: string[] = [];
    let falPoseUrls: string[] = [];
    if (referenceImageUrls.length > 0 || poseImageUrls.length > 0) {
      try {
        for (const imgUrl of referenceImageUrls) {
          const falUrl = await getPublicImageUrl(imgUrl);
          falImageUrls.push(falUrl);
          console.log('Character reference URL:', falUrl.substring(0, 60) + '...');
        }
        for (const imgUrl of poseImageUrls) {
          const falUrl = await getPublicImageUrl(imgUrl);
          falPoseUrls.push(falUrl);
          console.log('Pose reference URL:', falUrl.substring(0, 60) + '...');
        }
      } catch (uploadErr) {
        console.error('Failed to upload reference images:', uploadErr);
        falImageUrls = [];
        falPoseUrls = [];
      }
    }

    // Build prompt based on what references we have
    const hasPoseRef = falPoseUrls.length > 0;
    const hasCharacterRef = falImageUrls.length > 0;
    let consistencyPrompt: string;

    if (hasCharacterRef && hasPoseRef) {
      // Both character and pose references - use pose transfer
      consistencyPrompt = [
        'Generate an image using the character from images 1-' + falImageUrls.length + '.',
        'The character should adopt the EXACT POSE shown in image ' + (falImageUrls.length + 1) + '.',
        'Keep the character\'s appearance, face, and clothing from the character reference.',
        'Copy ONLY the body position and pose from the pose reference, NOT the person\'s appearance.',
        optimizedPrompt,
        'cinematic, high quality, consistent character design, no text, no watermark',
      ].join(' ');
    } else if (hasCharacterRef) {
      // Only character references
      consistencyPrompt = [
        'Generate a new image using the character(s) from the reference image(s).',
        'Keep the EXACT same appearance, face, clothing, and style.',
        optimizedPrompt,
        'cinematic, high quality, consistent character design, no text, no watermark',
      ].join(' ');
    } else if (hasPoseRef) {
      // Only pose reference (no character)
      consistencyPrompt = [
        'Generate an image with a person in the EXACT POSE shown in the reference image.',
        'Do NOT copy the person\'s appearance, only their body position and pose.',
        optimizedPrompt,
        'cinematic, high quality, no text, no watermark',
      ].join(' ');
    } else {
      consistencyPrompt = optimizedPrompt;
    }

    // Combine all image URLs (character first, then pose)
    const allImageUrls = [...falImageUrls, ...falPoseUrls];

    let usedModel = 'nano-banana-2'; // Track which model was used

    // Generate with Kling O1 Image (best quality + pose transfer)
    if (useKlingO1 && (falImageUrls.length > 0 || falPoseUrls.length > 0)) {
      console.log('Using Kling O1 Image...', hasPoseRef ? '(with pose transfer)' : '');

      try {
        // Build Kling input with elements for characters, image_urls for poses
        const klingInput = buildKlingInput(
          optimizedPrompt,
          falImageUrls,
          falPoseUrls,
          hasCharacterRef,
          hasPoseRef
        );

        console.log('Kling O1 prompt:', klingInput.prompt);
        console.log('Kling O1 elements:', klingInput.elements?.length || 0);
        console.log('Kling O1 image_urls:', klingInput.image_urls?.length || 0);

        const result = await fal.subscribe('fal-ai/kling-image/o1', {
          input: {
            prompt: klingInput.prompt,
            ...(klingInput.elements && { elements: klingInput.elements }),
            ...(klingInput.image_urls && { image_urls: klingInput.image_urls }),
            aspect_ratio: getKlingAspectRatio(ratio),
            resolution,
            num_images: Math.min(imageCount, 4),
            output_format: 'png',
          } as any,
          logs: true,
        });

        const images = (result.data as any)?.images;
        if (images) {
          for (const img of images) {
            generatedImages.push(img.url);
          }
          usedModel = `kling-image-o1-${resolution.toLowerCase()}`;
        }

        logFalUsage({
          operation: hasPoseRef ? 'generate-quick-shots-kling-pose' : 'generate-quick-shots-kling',
          model: `kling-image-o1-${resolution.toLowerCase()}`,
          imagesCount: Math.min(imageCount, 4),
          projectId,
        }).catch(console.error);

        // Generate more if needed
        if (imageCount > 4 && generatedImages.length > 0) {
          const remaining = Math.min(imageCount - generatedImages.length, 5);
          const result2 = await fal.subscribe('fal-ai/kling-image/o1', {
            input: {
              prompt: klingInput.prompt,
              ...(klingInput.elements && { elements: klingInput.elements }),
              ...(klingInput.image_urls && { image_urls: klingInput.image_urls }),
              aspect_ratio: getKlingAspectRatio(ratio),
              resolution,
              num_images: remaining,
              output_format: 'png',
            } as any,
            logs: true,
          });

          const images2 = (result2.data as any)?.images;
          if (images2) {
            for (const img of images2) {
              generatedImages.push(img.url);
            }
          }

          logFalUsage({
            operation: 'generate-quick-shots-kling',
            model: `kling-image-o1-${resolution.toLowerCase()}`,
            imagesCount: remaining,
            projectId,
          }).catch(console.error);
        }
      } catch (klingError) {
        console.error('Kling O1 Image failed:', klingError);
        // Fall through to other models
      }
    }

    // Generate with Seedream 5 Edit (multi-reference)
    if (generatedImages.length === 0 && useSeedream5 && allImageUrls.length > 0) {
      console.log('Using Seedream 5 Edit with reference images...');

      try {
        // Seedream 5 uses @Image1, @Image2, etc. references in prompt
        let seedreamPrompt = '';
        if (hasCharacterRef && hasPoseRef) {
          seedreamPrompt = `Generate @Image1 (the character) adopting the pose from @Image${falImageUrls.length + 1}. Keep the character's face and appearance. ${optimizedPrompt}`;
        } else if (hasCharacterRef) {
          seedreamPrompt = `Generate @Image1 (the character) in a new scene. Keep the exact same face and appearance. ${optimizedPrompt}`;
        } else {
          seedreamPrompt = optimizedPrompt;
        }

        const result = await fal.subscribe('fal-ai/bytedance/seedream/v5/lite/edit', {
          input: {
            prompt: seedreamPrompt,
            image_urls: allImageUrls,
            aspect_ratio: aspectRatioString,
            num_images: Math.min(imageCount, 4),
            output_format: 'png',
          } as any,
          logs: true,
        });

        const images = (result.data as any)?.images;
        if (images) {
          for (const img of images) {
            generatedImages.push(img.url);
          }
          usedModel = 'seedream-5-edit';
        }

        logFalUsage({
          operation: 'generate-quick-shots-seedream5',
          model: 'seedream-5-edit',
          imagesCount: Math.min(imageCount, 4),
          projectId,
        }).catch(console.error);
      } catch (seedreamError) {
        console.error('Seedream 5 failed:', seedreamError);
        // Fall through to Nano Banana 2
      }
    }

    // Generate with Nano Banana 2 (with or without reference images)
    if (generatedImages.length === 0) {
      if (allImageUrls.length > 0) {
        // Use Nano Banana 2 /edit endpoint with reference images (character + pose)
        console.log('Using Nano Banana 2 with reference images...', hasPoseRef ? '(with pose transfer)' : '');

        try {
          const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
            input: {
              prompt: consistencyPrompt,
              image_urls: allImageUrls,
              aspect_ratio: aspectRatioString,
              num_images: Math.min(imageCount, 4),
              output_format: 'png',
              resolution,
              safety_tolerance: '4',
            } as any,
            logs: true,
          });

          logFalUsage({
            operation: hasPoseRef ? 'generate-quick-shots-nano-pose' : 'generate-quick-shots-nano-edit',
            model: `nano-banana-2-edit-${resolution.toLowerCase()}`,
            imagesCount: Math.min(imageCount, 4),
            projectId,
          }).catch(console.error);

          const images = (result.data as any)?.images;
          if (images) {
            for (const img of images) {
              generatedImages.push(img.url);
            }
            usedModel = `nano-banana-2-edit-${resolution.toLowerCase()}`;
          }

          // Generate more if needed
          if (imageCount > 4 && generatedImages.length > 0) {
            const remaining = imageCount - generatedImages.length;
            const result2 = await fal.subscribe('fal-ai/nano-banana-2/edit', {
              input: {
                prompt: consistencyPrompt,
                image_urls: allImageUrls,
                aspect_ratio: aspectRatioString,
                num_images: Math.min(remaining, 4),
                output_format: 'png',
                resolution,
                safety_tolerance: '4',
              } as any,
              logs: true,
            });

            const images2 = (result2.data as any)?.images;
            if (images2) {
              for (const img of images2) {
                generatedImages.push(img.url);
              }
            }

            logFalUsage({
              operation: 'generate-quick-shots-nano-edit',
              model: `nano-banana-2-edit-${resolution.toLowerCase()}`,
              imagesCount: Math.min(remaining, 4),
              projectId,
            }).catch(console.error);
          }
        } catch (editError) {
          console.error('Nano Banana 2 edit failed:', editError);
        }
      }
    }

    // Fallback to Nano Banana 2 text-to-image
    if (generatedImages.length === 0) {
      console.log('Using Nano Banana 2 text-to-image (no references)...');

      const result = await fal.subscribe('fal-ai/nano-banana-2', {
        input: {
          prompt: optimizedPrompt,
          aspect_ratio: aspectRatioString,
          num_images: Math.min(imageCount, 4),
          output_format: 'png',
          resolution,
        } as any,
        logs: true,
      });

      logFalUsage({
        operation: 'generate-quick-shots-nano',
        model: `nano-banana-2-${resolution.toLowerCase()}`,
        imagesCount: Math.min(imageCount, 4),
        projectId,
      }).catch(console.error);

      const images = (result.data as any)?.images;
      if (images) {
        for (const img of images) {
          generatedImages.push(img.url);
        }
      }
    }

    if (generatedImages.length === 0) {
      return NextResponse.json({ error: 'No images generated' }, { status: 500 });
    }

    // Upload images and create shots
    const sanitizedUserId = session.user.sub.replace(/[|]/g, '_');
    const createdShots = [];

    const { data: existingShots } = await supabase
      .from('shots')
      .select('shot_number')
      .eq('project_id', projectId)
      .order('shot_number', { ascending: false })
      .limit(1);

    let shotNumber = (existingShots?.[0]?.shot_number || 0) + 1;

    for (const imageUrl of generatedImages) {
      try {
        const imageResponse = await fetch(imageUrl);
        const imageBlob = await imageResponse.blob();
        const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());

        const timestamp = Date.now();
        const ext = imageUrl.includes('.jpg') || imageUrl.includes('.jpeg') ? 'jpg' : 'png';
        const storageKey = `quick-shots/${sanitizedUserId}/${projectId}/${timestamp}_${shotNumber}.${ext}`;
        await uploadFile(storageKey, imageBuffer, ext === 'jpg' ? 'image/jpeg' : 'image/png');

        const b2Url = `b2://${STORAGE_BUCKET}/${storageKey}`;

        // Build generation metadata (stored in description as JSON for now)
        // Map resolution parameter to display value
        const resolutionDisplay = resolution === '4K' ? '4K'
          : resolution === '2K' ? '1080p'
          : '720p';
        const generationMetadata = {
          model: usedModel,
          original_prompt: prompt,
          optimized_prompt: optimizedPrompt,
          resolution: resolutionDisplay,
          aspect_ratio: aspectRatioString,
          references: {
            characters: characterEntities.map(e => e.name),
            poses: mentionedReferences.filter(r => r.type === 'pose').map(r => r.name),
            styles: mentionedReferences.filter(r => r.type === 'style').map(r => r.name),
          },
          generated_at: new Date().toISOString(),
        };

        // Store prompt with metadata appended as comment
        const descriptionWithMeta = `${prompt}\n\n<!-- metadata:${JSON.stringify(generationMetadata)} -->`;

        const { data: shot, error } = await supabase
          .from('shots')
          .insert({
            project_id: projectId,
            scene_id: null,
            shot_number: shotNumber,
            description: descriptionWithMeta,
            storyboard_image_url: b2Url,
            generation_status: 'completed',
            status: 'draft',
            sort_order: shotNumber,
          })
          .select()
          .single();

        if (error) {
          console.error('Error creating shot:', error);
        } else {
          createdShots.push(shot);
          shotNumber++;
        }
      } catch (uploadError) {
        console.error('Error uploading image:', uploadError);
      }
    }

    return NextResponse.json({
      success: true,
      shots: createdShots,
      count: createdShots.length,
      prompt: optimizedPrompt,
      model: usedModel,
      hasReferences: referenceImageUrls.length > 0,
    });
  } catch (error) {
    console.error('Error generating quick shots:', error);
    return NextResponse.json(
      { error: 'Failed to generate quick shots: ' + String(error) },
      { status: 500 }
    );
  }
}
