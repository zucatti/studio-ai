import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { uploadFile, getSignedFileUrl, STORAGE_BUCKET } from '@/lib/storage';
import { fal } from '@fal-ai/client';
import Anthropic from '@anthropic-ai/sdk';
import { generateReferenceName } from '@/lib/reference-name';
import { logFalUsage, logClaudeUsage } from '@/lib/ai/log-api-usage';

// Configure fal.ai client
fal.config({
  credentials: process.env.AI_FAL_KEY,
});

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

interface EntityWithImage {
  reference: string;
  name: string;
  visual_description: string;
  reference_images: string[];
  type: 'character' | 'prop' | 'location';
}

interface EntityMap {
  [reference: string]: string;
}

// Build a map of @references to visual descriptions (from project + Bible global assets)
async function buildEntityMap(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  projectId: string,
  userId: string
): Promise<EntityMap> {
  const entityMap: EntityMap = {};

  const [charactersRes, propsRes, locationsRes] = await Promise.all([
    supabase.from('characters').select('name, visual_description').eq('project_id', projectId),
    supabase.from('props').select('name, visual_description').eq('project_id', projectId),
    supabase.from('locations').select('name, visual_description').eq('project_id', projectId),
  ]);

  for (const char of charactersRes.data || []) {
    const ref = generateReferenceName(char.name);
    if (char.visual_description) {
      entityMap[ref] = char.visual_description;
    }
  }

  for (const prop of propsRes.data || []) {
    const ref = generateReferenceName(prop.name);
    if (prop.visual_description) {
      entityMap[ref] = prop.visual_description;
    }
  }

  for (const loc of locationsRes.data || []) {
    const ref = generateReferenceName(loc.name);
    if (loc.visual_description) {
      entityMap[ref] = loc.visual_description;
    }
  }

  // Also include global assets imported to this project
  const { data: projectAssets } = await supabase
    .from('project_assets')
    .select(`
      global_asset_id,
      global_assets (
        name,
        asset_type,
        data
      )
    `)
    .eq('project_id', projectId);

  for (const pa of projectAssets || []) {
    const ga = pa.global_assets as any;
    if (!ga || ga.asset_type === 'audio') continue;

    const ref = generateReferenceName(ga.name);
    // Don't override project entities
    if (entityMap[ref]) continue;

    const data = ga.data as Record<string, unknown>;
    const visualDesc = (data?.visual_description as string) || (data?.description as string);
    if (visualDesc) {
      entityMap[ref] = visualDesc;
    }
  }

  return entityMap;
}

// Fetch all entities with their reference images (from project + Bible global assets)
async function fetchEntitiesWithImages(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  projectId: string,
  userId: string
): Promise<EntityWithImage[]> {
  const entities: EntityWithImage[] = [];
  const seenRefs = new Set<string>();

  // Fetch project-specific entities
  const [charactersRes, propsRes, locationsRes] = await Promise.all([
    supabase.from('characters').select('name, visual_description, reference_images').eq('project_id', projectId),
    supabase.from('props').select('name, visual_description, reference_images').eq('project_id', projectId),
    supabase.from('locations').select('name, visual_description, reference_images').eq('project_id', projectId),
  ]);

  for (const char of charactersRes.data || []) {
    const ref = generateReferenceName(char.name);
    seenRefs.add(ref);
    entities.push({
      reference: ref,
      name: char.name,
      visual_description: char.visual_description || '',
      reference_images: char.reference_images || [],
      type: 'character',
    });
  }

  for (const prop of propsRes.data || []) {
    const ref = generateReferenceName(prop.name);
    seenRefs.add(ref);
    entities.push({
      reference: ref,
      name: prop.name,
      visual_description: prop.visual_description || '',
      reference_images: prop.reference_images || [],
      type: 'prop',
    });
  }

  for (const loc of locationsRes.data || []) {
    const ref = generateReferenceName(loc.name);
    seenRefs.add(ref);
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

    const ref = generateReferenceName(ga.name);
    // Skip if we already have this reference from project entities
    if (seenRefs.has(ref)) continue;
    seenRefs.add(ref);

    const data = ga.data as Record<string, unknown>;
    entities.push({
      reference: ref,
      name: ga.name,
      visual_description: (data?.visual_description as string) || (data?.description as string) || '',
      reference_images: ga.reference_images || [],
      type: ga.asset_type as 'character' | 'prop' | 'location',
    });
  }

  return entities;
}

// Find entities mentioned in the description
function findMentionedEntities(description: string, entities: EntityWithImage[]): EntityWithImage[] {
  const mentions = description.match(/@[A-Z][a-zA-Z0-9]*/g) || [];
  const mentionedEntities: EntityWithImage[] = [];

  for (const mention of mentions) {
    const entity = entities.find(e => e.reference === mention);
    if (entity && entity.reference_images.length > 0) {
      mentionedEntities.push(entity);
    }
  }

  return mentionedEntities;
}

// Get valid image URL (first from reference_images array)
function getFirstReferenceImage(entity: EntityWithImage): string | null {
  const images = entity.reference_images || [];
  // Find front view first, or any image
  const frontImage = images.find(img => img.includes('_front_'));
  return frontImage || images[0] || null;
}

// Collect reference images from mentioned entities (max 4 for Ideogram)
// Priority: characters first, then props, then locations
function collectReferenceImages(entities: EntityWithImage[], maxImages: number = 4): string[] {
  const images: string[] = [];

  // Sort by type priority
  const sortedEntities = [...entities].sort((a, b) => {
    const priority = { character: 0, prop: 1, location: 2 };
    return priority[a.type] - priority[b.type];
  });

  for (const entity of sortedEntities) {
    if (images.length >= maxImages) break;

    const image = getFirstReferenceImage(entity);
    if (image && !images.includes(image)) {
      images.push(image);
    }
  }

  return images;
}

// Helper to upload image to fal.ai storage
async function uploadToFalStorage(falClient: typeof fal, imageUrl: string): Promise<string> {
  if (imageUrl.includes('fal.media') || imageUrl.includes('fal-cdn')) {
    return imageUrl;
  }
  console.log(`Uploading to fal.ai storage: ${imageUrl.substring(0, 50)}...`);
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image for fal.ai upload: ${response.status}`);
  }
  const blob = await response.blob();
  const uploaded = await falClient.storage.upload(blob);
  console.log(`Uploaded to fal.ai: ${uploaded}`);
  return uploaded;
}

// Expand @mentions in text to their visual descriptions
function expandMentions(text: string, entityMap: EntityMap): string {
  if (!text) return text;

  let expanded = text;
  const mentions = text.match(/@[A-Z][a-zA-Z0-9]*/g) || [];

  for (const mention of mentions) {
    if (entityMap[mention]) {
      expanded = expanded.replace(mention, entityMap[mention]);
    }
  }

  return expanded;
}

// Storyboard style for Nano Banana 2 - natural language description
const STORYBOARD_STYLE = `black and white graphite pencil sketch storyboard frame, hand-drawn on white paper, monochrome grayscale drawing, rough pencil strokes with hatching shading, professional film production concept art, single cinematic panel, no color, no text, no labels, no annotations, no scene numbers, no panel numbers, no writing, clean image only`;

// Translate and optimize French description to English SDXL prompt
async function optimizePromptForSDXL(
  frenchDescription: string,
  sceneContext: string,
  shotType?: string,
  cameraAngle?: string
): Promise<string> {
  if (!process.env.AI_CLAUDE_KEY) {
    console.warn('AI_CLAUDE_KEY not set, using original description');
    return frenchDescription;
  }

  const anthropic = new Anthropic({
    apiKey: process.env.AI_CLAUDE_KEY,
  });

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `You are an expert at creating image generation prompts for Stable Diffusion XL.

Convert this French film shot description into an optimized English prompt for SDXL storyboard generation.

Scene context: ${sceneContext || 'Not specified'}
Shot type: ${shotType || 'Not specified'}
Camera angle: ${cameraAngle || 'Not specified'}

French description:
"${frenchDescription}"

Rules:
- Translate to English
- Keep it concise (max 50 words)
- Focus on visual elements that SDXL can render
- Include camera framing keywords (close-up, wide shot, etc.) based on shot type
- Remove abstract emotions, keep only visual descriptions
- Do NOT include any style keywords (pencil, sketch, etc.) - those will be added separately

Return ONLY the optimized English prompt, nothing else.`,
      },
    ],
  });

  // Log Claude usage
  logClaudeUsage({
    operation: 'optimize-storyboard-prompt',
    model: 'claude-sonnet-4-20250514',
    inputTokens: message.usage?.input_tokens || 0,
    outputTokens: message.usage?.output_tokens || 0,
  }).catch(console.error);

  const content = message.content[0];
  if (content.type === 'text') {
    console.log('Optimized prompt:', content.text);
    return content.text.trim();
  }

  return frenchDescription;
}

// This endpoint generates ONE storyboard at a time to avoid timeout
// Frontend should call repeatedly until all are generated
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get all shots to count progress
    const { data: scenes } = await supabase
      .from('scenes')
      .select(`
        id,
        location,
        time_of_day,
        int_ext,
        shots (
          id,
          description,
          shot_type,
          camera_angle,
          storyboard_image_url,
          generation_status
        )
      `)
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });

    if (!scenes || scenes.length === 0) {
      return NextResponse.json(
        { error: 'Aucune scène trouvée. Générez d\'abord le script.' },
        { status: 400 }
      );
    }

    // Find the FIRST shot that needs generation
    let shotToGenerate: {
      id: string;
      description: string;
      sceneContext: string;
      shotType?: string;
      cameraAngle?: string;
    } | null = null;

    let totalShots = 0;
    let completedShots = 0;

    for (const scene of scenes) {
      const sceneContext = `${scene.int_ext} ${scene.location} ${scene.time_of_day}`;

      for (const shot of scene.shots || []) {
        totalShots++;

        if (shot.storyboard_image_url) {
          completedShots++;
        } else if (!shotToGenerate && shot.generation_status !== 'generating') {
          shotToGenerate = {
            id: shot.id,
            description: shot.description,
            sceneContext,
            shotType: shot.shot_type,
            cameraAngle: shot.camera_angle,
          };
        }
      }
    }

    // All done
    if (!shotToGenerate) {
      // Update project step to storyboard
      await supabase
        .from('projects')
        .update({ current_step: 'storyboard' })
        .eq('id', projectId);

      return NextResponse.json({
        success: true,
        done: true,
        message: 'Tous les storyboards sont générés',
        completed: completedShots,
        total: totalShots,
      });
    }

    // Check API key
    if (!process.env.AI_FAL_KEY) {
      return NextResponse.json({ error: 'Fal.ai API key not configured' }, { status: 500 });
    }

    // Fetch entity map from Repérage + Bible
    console.log('Building entity map from Reperage + Bible...');
    const entityMap = await buildEntityMap(supabase, projectId, session.user.sub);
    console.log('Entity map:', Object.keys(entityMap).length, 'entities');

    // Fetch entities with reference images (includes Bible global assets)
    const entities = await fetchEntitiesWithImages(supabase, projectId, session.user.sub);
    console.log('Found entities with images:', entities.length);

    // Find entities mentioned in this shot
    const mentionedEntities = findMentionedEntities(shotToGenerate.description, entities);
    console.log('Mentioned entities with images:', mentionedEntities.map(e => e.reference));

    // Expand @mentions in description
    const expandedDescription = expandMentions(shotToGenerate.description, entityMap);
    console.log('Expanded description:', expandedDescription.substring(0, 200) + '...');

    // Update status to generating
    await supabase
      .from('shots')
      .update({ generation_status: 'generating' })
      .eq('id', shotToGenerate.id);

    // Optimize prompt using Claude (translate French to English + optimize for SDXL)
    console.log(`Optimizing prompt for shot ${shotToGenerate.id}...`);
    const optimizedDescription = await optimizePromptForSDXL(
      expandedDescription,
      shotToGenerate.sceneContext,
      shotToGenerate.shotType,
      shotToGenerate.cameraAngle
    );

    // Build final prompt: style FIRST, then scene content
    const fullPrompt = `${STORYBOARD_STYLE}, ${optimizedDescription}`;

    console.log(`Generating storyboard for shot ${shotToGenerate.id}...`);
    console.log('Full prompt:', fullPrompt);

    // Collect reference images from mentioned entities
    const referenceImages = collectReferenceImages(mentionedEntities, 4);
    console.log(`Found ${referenceImages.length} reference images from mentioned entities`);

    let result;

    // If we have reference images, use Ideogram Character for better consistency
    if (referenceImages.length > 0 && mentionedEntities.some(e => e.type === 'character')) {
      console.log('Using Ideogram with character references for consistency');

      // Upload reference images to fal.ai storage
      const uploadedRefs = await Promise.all(
        referenceImages.map(url => uploadToFalStorage(fal, url))
      );
      console.log(`Uploaded ${uploadedRefs.length} reference images to fal.ai storage`);

      // Use Ideogram Character model with references
      result = await fal.subscribe('fal-ai/ideogram/v2', {
        input: {
          prompt: fullPrompt,
          aspect_ratio: '16:9',
          style: 'AUTO',
          rendering_quality: 'BALANCED',
          // Note: Ideogram v2 doesn't support reference images directly
          // but the character model does - using v2 for better storyboard style
        } as any,
        logs: true,
      });
    } else {
      // Use Nano Banana 2 which handles style prompts well (no reference support)
      console.log('Using Nano Banana 2 for storyboard generation (no character references)');

      result = await fal.subscribe('fal-ai/nano-banana-2', {
        input: {
          prompt: fullPrompt,
          resolution: '0.5K',
          aspect_ratio: '16:9',
          num_images: 1,
          output_format: 'png',
        } as any,
        logs: true,
      });
    }

    let imageUrl: string | null = null;
    const images = (result.data as any)?.images;
    if (images && images.length > 0) {
      imageUrl = images[0].url;
    }

    // Log fal.ai usage for storyboard generation
    const falModel = referenceImages.length > 0 ? 'fal-ai/ideogram/v2' : 'fal-ai/nano-banana-2';
    logFalUsage({
      operation: 'generate-storyboard',
      model: falModel,
      imagesCount: 1,
      projectId,
    }).catch(console.error);

    if (!imageUrl) {
      await supabase
        .from('shots')
        .update({ generation_status: 'failed', generation_error: 'No image generated' })
        .eq('id', shotToGenerate.id);

      return NextResponse.json({
        success: false,
        done: false,
        error: 'Failed to generate image',
        completed: completedShots,
        total: totalShots,
      });
    }

    // Download and upload to B2
    const imageResponse = await fetch(imageUrl);
    const imageBlob = await imageResponse.blob();
    const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());

    const sanitizedUserId = session.user.sub.replace(/[|]/g, '_');
    const storageKey = `storyboards/${sanitizedUserId}/${projectId}/${shotToGenerate.id}_${Date.now()}.png`;

    try {
      await uploadFile(storageKey, imageBuffer, 'image/png');
    } catch (uploadError) {
      console.error('B2 upload failed:', uploadError);
      await supabase
        .from('shots')
        .update({ generation_status: 'failed', generation_error: 'Failed to upload' })
        .eq('id', shotToGenerate.id);

      return NextResponse.json({
        success: false,
        done: false,
        error: 'Failed to upload image',
        completed: completedShots,
        total: totalShots,
      });
    }

    // Store B2 URL in database
    const b2Url = `b2://${STORAGE_BUCKET}/${storageKey}`;

    // Update shot with the storyboard image URL and optimized prompt
    await supabase
      .from('shots')
      .update({
        storyboard_image_url: b2Url,
        storyboard_prompt: optimizedDescription,
        generation_status: 'completed',
        generation_error: null,
      })
      .eq('id', shotToGenerate.id);

    console.log(`Storyboard generated for shot ${shotToGenerate.id}`);

    return NextResponse.json({
      success: true,
      done: false, // More to generate
      message: `Storyboard généré (${completedShots + 1}/${totalShots})`,
      completed: completedShots + 1,
      total: totalShots,
      shotId: shotToGenerate.id,
    });
  } catch (error) {
    console.error('Error generating storyboard:', error);
    return NextResponse.json(
      { error: 'Failed to generate storyboard: ' + String(error) },
      { status: 500 }
    );
  }
}
