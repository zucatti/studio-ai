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
  params: Promise<{ projectId: string; shotId: string }>;
}

interface EntityWithImage {
  reference: string;
  name: string;
  visual_description: string;
  reference_images: string[];
  type: 'character' | 'prop' | 'location';
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

// Expand @mentions to visual descriptions
function expandMentions(text: string, entities: EntityWithImage[]): string {
  let expanded = text;
  for (const entity of entities) {
    if (entity.visual_description) {
      expanded = expanded.replace(new RegExp(entity.reference, 'g'), entity.visual_description);
    }
  }
  return expanded;
}

// Get valid image URL (first from reference_images array)
function getFirstReferenceImage(entity: EntityWithImage): string | null {
  const images = entity.reference_images || [];
  // Find front view first, or any image
  const frontImage = images.find(img => img.includes('_front_'));
  return frontImage || images[0] || null;
}

// Storyboard style for Nano Banana 2 - natural language description
const STORYBOARD_STYLE = `black and white graphite pencil sketch storyboard frame, hand-drawn on white paper, monochrome grayscale drawing, rough pencil strokes with hatching shading, professional film production concept art, single cinematic panel, no color, no text, no labels, no annotations, no scene numbers, no panel numbers, no writing, clean image only`;

// Translate and optimize French description to English prompt
async function optimizePrompt(
  frenchDescription: string,
  sceneContext: string,
  shotType?: string,
  cameraAngle?: string
): Promise<string> {
  if (!process.env.AI_CLAUDE_KEY) {
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
        content: `Convert this French film shot description to an English image generation prompt.

Scene: ${sceneContext || 'Not specified'}
Shot type: ${shotType || 'medium shot'}
Camera angle: ${cameraAngle || 'eye level'}

Description: "${frenchDescription}"

Rules:
- Translate to English
- Keep concise (max 60 words)
- Focus on visual elements: characters, actions, environment, lighting
- Include camera framing based on shot type
- Do NOT include style keywords (pencil, sketch, etc.)

Return ONLY the prompt, nothing else.`,
      },
    ],
  });

  const content = message.content[0];
  return content.type === 'text' ? content.text.trim() : frenchDescription;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shotId } = await params;
    console.log('Generating storyboard for shot:', shotId);

    // Parse request body for custom prompt
    let customPrompt: string | undefined;
    try {
      const body = await request.json();
      customPrompt = body.customPrompt;
    } catch {
      // No body or invalid JSON - use auto-generated prompt
    }

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

    // Get the shot with its scene
    const { data: shot } = await supabase
      .from('shots')
      .select(`
        *,
        scenes (id, location, time_of_day, int_ext)
      `)
      .eq('id', shotId)
      .single();

    if (!shot) {
      return NextResponse.json({ error: 'Shot not found' }, { status: 404 });
    }

    const scene = shot.scenes;
    const sceneContext = scene ? `${scene.int_ext} ${scene.location} ${scene.time_of_day}` : '';

    // Fetch all entities with reference images
    const entities = await fetchEntitiesWithImages(supabase, projectId);
    console.log('Found entities:', entities.length);

    // Find entities mentioned in this shot
    const mentionedEntities = findMentionedEntities(shot.description, entities);
    console.log('Mentioned entities with images:', mentionedEntities.map(e => e.reference));

    // Expand @mentions to descriptions
    const expandedDescription = expandMentions(shot.description, entities);

    // Use custom prompt or generate optimized prompt
    let optimizedPrompt: string;
    if (customPrompt && customPrompt.trim()) {
      optimizedPrompt = customPrompt.trim();
      console.log('Using custom prompt:', optimizedPrompt);
    } else {
      optimizedPrompt = await optimizePrompt(
        expandedDescription,
        sceneContext,
        shot.shot_type,
        shot.camera_angle
      );
      console.log('Optimized prompt:', optimizedPrompt);
    }

    // Delete existing storyboard
    if (shot.storyboard_image_url) {
      const match = shot.storyboard_image_url.match(/project-assets\/(.+)$/);
      if (match) {
        await supabase.storage.from('project-assets').remove([match[1]]);
      }
    }

    // Update status
    await supabase
      .from('shots')
      .update({ generation_status: 'generating' })
      .eq('id', shotId);

    let imageUrl: string | null = null;

    // Build final prompt: style FIRST, then scene content
    const fullPrompt = `${STORYBOARD_STYLE}, ${optimizedPrompt}`;
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

    const images = (result.data as any)?.images;
    if (images && images.length > 0) {
      imageUrl = images[0].url;
    }

    if (!imageUrl) {
      await supabase
        .from('shots')
        .update({ generation_status: 'failed', generation_error: 'No image generated' })
        .eq('id', shotId);
      return NextResponse.json({ error: 'Failed to generate image' }, { status: 500 });
    }

    // Download and upload to Supabase
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    const fileName = `${session.user.sub.replace(/[|]/g, '_')}/${projectId}/${shotId}_storyboard_${Date.now()}.png`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('project-assets')
      .upload(fileName, imageBuffer, { contentType: 'image/png', upsert: true });

    if (uploadError) {
      await supabase
        .from('shots')
        .update({ generation_status: 'failed', generation_error: 'Upload failed' })
        .eq('id', shotId);
      return NextResponse.json({ error: 'Failed to save image' }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from('project-assets')
      .getPublicUrl(uploadData.path);

    // Update shot
    const { data: updatedShot } = await supabase
      .from('shots')
      .update({
        storyboard_image_url: urlData.publicUrl,
        storyboard_prompt: optimizedPrompt,
        generation_status: 'completed',
        generation_error: null,
      })
      .eq('id', shotId)
      .select()
      .single();

    return NextResponse.json({
      success: true,
      shot: updatedShot,
      storyboard_url: urlData.publicUrl,
    });
  } catch (error) {
    console.error('Error generating storyboard:', error);

    try {
      const { shotId } = await params;
      const supabase = createServerSupabaseClient();
      await supabase
        .from('shots')
        .update({
          generation_status: 'failed',
          generation_error: error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('id', shotId);
    } catch {
      // Ignore
    }

    return NextResponse.json(
      { error: 'Failed to generate storyboard' },
      { status: 500 }
    );
  }
}
