import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { fal } from '@fal-ai/client';
import Anthropic from '@anthropic-ai/sdk';
import { generateReferenceName } from '@/lib/reference-name';

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

// Build a map of @references to visual descriptions
async function buildEntityMap(supabase: ReturnType<typeof createServerSupabaseClient>, projectId: string): Promise<EntityMap> {
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

  return entityMap;
}

// Fetch all entities with their reference images
async function fetchEntitiesWithImages(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  projectId: string
): Promise<EntityWithImage[]> {
  const entities: EntityWithImage[] = [];

  const [charactersRes, propsRes, locationsRes] = await Promise.all([
    supabase.from('characters').select('name, visual_description, reference_images').eq('project_id', projectId),
    supabase.from('props').select('name, visual_description, reference_images').eq('project_id', projectId),
    supabase.from('locations').select('name, visual_description, reference_images').eq('project_id', projectId),
  ]);

  for (const char of charactersRes.data || []) {
    entities.push({
      reference: generateReferenceName(char.name),
      name: char.name,
      visual_description: char.visual_description || '',
      reference_images: char.reference_images || [],
      type: 'character',
    });
  }

  for (const prop of propsRes.data || []) {
    entities.push({
      reference: generateReferenceName(prop.name),
      name: prop.name,
      visual_description: prop.visual_description || '',
      reference_images: prop.reference_images || [],
      type: 'prop',
    });
  }

  for (const loc of locationsRes.data || []) {
    entities.push({
      reference: generateReferenceName(loc.name),
      name: loc.name,
      visual_description: loc.visual_description || '',
      reference_images: loc.reference_images || [],
      type: 'location',
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

    // Fetch entity map from Repérage
    console.log('Building entity map from Repérage...');
    const entityMap = await buildEntityMap(supabase, projectId);
    console.log('Entity map:', Object.keys(entityMap).length, 'entities');

    // Fetch entities with reference images
    const entities = await fetchEntitiesWithImages(supabase, projectId);
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

    // Use Nano Banana 2 which handles style prompts well
    console.log('Using Nano Banana 2 for storyboard generation');

    const result = await fal.subscribe('fal-ai/nano-banana-2', {
      input: {
        prompt: fullPrompt,
        resolution: '0.5K',
        aspect_ratio: '16:9',
        num_images: 1,
        output_format: 'png',
      } as any,
      logs: true,
    });

    let imageUrl: string | null = null;
    const images = (result.data as any)?.images;
    if (images && images.length > 0) {
      imageUrl = images[0].url;
    }

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

    // Download and upload to Supabase
    const imageResponse = await fetch(imageUrl);
    const imageBlob = await imageResponse.blob();
    const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());

    const fileName = `${session.user.sub.replace(/[|]/g, '_')}/${projectId}/${shotToGenerate.id}_storyboard_${Date.now()}.png`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('project-assets')
      .upload(fileName, imageBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
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

    const { data: urlData } = supabase.storage
      .from('project-assets')
      .getPublicUrl(uploadData.path);

    // Update shot with the storyboard image URL and optimized prompt
    await supabase
      .from('shots')
      .update({
        storyboard_image_url: urlData.publicUrl,
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
