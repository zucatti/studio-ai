import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { uploadFile, getSignedFileUrl, parseStorageUrl, STORAGE_BUCKET } from '@/lib/storage';
import { fal } from '@fal-ai/client';
import Anthropic from '@anthropic-ai/sdk';
import { logFalUsage, logClaudeUsage } from '@/lib/ai/log-api-usage';
import { generateReferenceName } from '@/lib/reference-name';
import type { AspectRatio } from '@/types/database';

// NOTE: SSE has been removed. Use /api/projects/[projectId]/queue-rush for async generation.

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

// Rush image stored in database
export interface RushImage {
  id: string;
  project_id: string;
  user_id: string;
  url: string;
  prompt: string | null;
  aspect_ratio: string | null;
  model: string | null;
  created_at: string;
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

// Expand @mentions and #mentions to visual descriptions
function expandMentions(text: string, entities: EntityWithImage[]): string {
  let expanded = text;
  for (const entity of entities) {
    if (entity.visual_description) {
      const regex = new RegExp(entity.reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      expanded = expanded.replace(regex, entity.visual_description);
    }
  }
  return expanded;
}

// Get reference images for an entity (front + side for best consistency)
function getReferenceImages(entity: EntityWithImage, maxImages: number = 2): string[] {
  const images = entity.reference_images || [];
  if (images.length === 0) return [];

  const result: string[] = [];

  const frontImage = images.find(img => img.includes('_front_'));
  if (frontImage) {
    result.push(frontImage);
  }

  const sideImage = images.find(img => img.includes('_side_') || img.includes('_profile_'));
  if (sideImage && result.length < maxImages) {
    result.push(sideImage);
  }

  if (result.length === 0 && images.length > 0) {
    result.push(images[0]);
  }

  for (const img of images) {
    if (result.length >= maxImages) break;
    if (!result.includes(img) && !img.includes('_back_')) {
      result.push(img);
    }
  }

  return result.slice(0, maxImages);
}

// Get aspect ratio string for fal.ai
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

// Get a publicly accessible URL for fal.ai
async function getPublicImageUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }

  if (imageUrl.startsWith('b2://')) {
    const parsed = parseStorageUrl(imageUrl);
    if (parsed) {
      return await getSignedFileUrl(parsed.key, 3600);
    }
  }

  return imageUrl;
}

// Optimize prompt for image generation
async function optimizePrompt(
  frenchPrompt: string,
  entities: EntityWithImage[],
  hasReferenceImages: boolean,
  skipOptimization: boolean = false
): Promise<string> {
  const expandedPrompt = expandMentions(frenchPrompt, entities);

  if (skipOptimization) {
    return expandedPrompt;
  }

  if (!process.env.AI_CLAUDE_KEY) {
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
    operation: 'optimize-rush-prompt',
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

// POST /api/projects/[projectId]/rush - Generate rush images (same API as quick-shots)
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const {
      prompt,
      aspectRatio: requestedAspectRatio,
      model = 'fal-ai/nano-banana-2',
      count = 1,
      resolution = '2K',
      stream = true,
      skipOptimization = false,
    } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const imageCount = Math.min(Math.max(1, count), 8);

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

    // Fetch entities for mention expansion
    const entities = await fetchEntitiesWithImages(supabase, projectId);
    const mentionedEntities = findMentionedEntities(prompt, entities);
    const characterEntities = mentionedEntities.filter(e => e.type === 'character' && e.reference_images.length > 0);
    const hasCharacterRefs = characterEntities.length > 0;

    const ratio: AspectRatio = requestedAspectRatio || project.aspect_ratio || '16:9';
    const aspectRatioString = getAspectRatioString(ratio);

    // SSE streaming has been removed - use queue-rush endpoint instead
    if (stream) {
      return NextResponse.json(
        {
          error: 'Streaming not supported',
          message: 'Use /api/projects/[projectId]/queue-rush for async generation',
        },
        { status: 400 }
      );
    }

    // Non-streaming response (simplified)
    const optimizedPrompt = await optimizePrompt(prompt, entities, hasCharacterRefs, skipOptimization);

    const result = await fal.subscribe('fal-ai/nano-banana-2', {
      input: {
        prompt: `${optimizedPrompt} cinematic, high quality, no text, no watermark`,
        aspect_ratio: aspectRatioString,
        num_images: Math.min(imageCount, 4),
        output_format: 'png',
        resolution,
      } as any,
      logs: true,
    });

    const images = (result.data as any)?.images;
    if (!images || images.length === 0) {
      return NextResponse.json({ error: 'No image generated' }, { status: 500 });
    }

    // Upload and save
    const sanitizedUserId = session.user.sub.replace(/[|]/g, '_');
    const createdImages = [];

    for (let i = 0; i < images.length; i++) {
      const imageUrl = images[i].url;
      const imageResponse = await fetch(imageUrl);
      const imageBlob = await imageResponse.blob();
      const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());

      const timestamp = Date.now();
      const storageKey = `rush/${sanitizedUserId}/${projectId}/${timestamp}_${i}.png`;
      await uploadFile(storageKey, imageBuffer, 'image/png');

      const b2Url = `b2://${STORAGE_BUCKET}/${storageKey}`;

      const { data: rushImage } = await supabase
        .from('rush_media')
        .insert({
          project_id: projectId,
          user_id: session.user.sub,
          url: b2Url,
          media_type: 'image',
          prompt: prompt,
          aspect_ratio: ratio,
          model: 'nano-banana-2',
        })
        .select()
        .single();

      if (rushImage) {
        createdImages.push(rushImage);
      }
    }

    return NextResponse.json({
      success: true,
      shots: createdImages.map(img => ({
        id: img.id,
        project_id: img.project_id,
        storyboard_image_url: img.url,
        description: img.prompt,
        created_at: img.created_at,
      })),
      count: createdImages.length,
    });
  } catch (error) {
    console.error('Error generating rush image:', error);
    return NextResponse.json(
      { error: 'Failed to generate rush image: ' + String(error) },
      { status: 500 }
    );
  }
}

// GET /api/projects/[projectId]/rush - List rush images
// Query params: ?status=pending|selected|rejected (default: pending)
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status') || 'pending';

    // Validate status
    if (!['pending', 'selected', 'rejected'].includes(statusParam)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Verify project ownership and get aspect ratio
    const { data: project } = await supabase
      .from('projects')
      .select('id, aspect_ratio')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Fetch rush images filtered by status
    // Note: NULL status is treated as 'pending' for backwards compatibility
    let query = supabase
      .from('rush_media')
      .select('*')
      .eq('project_id', projectId)
      .eq('media_type', 'image');

    if (statusParam === 'pending') {
      // Include both 'pending' and NULL (old records)
      query = query.or('status.eq.pending,status.is.null');
    } else {
      query = query.eq('status', statusParam);
    }

    const { data: images, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching rush images:', error);
      return NextResponse.json({ error: 'Failed to fetch rush images' }, { status: 500 });
    }

    // Filter out videos (Rush is for images only)
    const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];
    const filteredImages = (images || []).filter(img => {
      const url = img.url?.toLowerCase() || '';
      return !VIDEO_EXTENSIONS.some(ext => url.includes(ext));
    });

    return NextResponse.json({
      images: filteredImages,
      count: filteredImages.length,
      aspectRatio: project.aspect_ratio || '16:9',
    });
  } catch (error) {
    console.error('Error in rush GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/projects/[projectId]/rush - Update status of multiple images
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { imageIds, status } = body;

    if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
      return NextResponse.json({ error: 'imageIds array required' }, { status: 400 });
    }

    if (!status || !['selected', 'rejected', 'pending'].includes(status)) {
      return NextResponse.json({ error: 'Valid status required (selected, rejected, pending)' }, { status: 400 });
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

    // Update status for all specified images
    const { error } = await supabase
      .from('rush_media')
      .update({ status })
      .eq('project_id', projectId)
      .in('id', imageIds);

    if (error) {
      console.error('Error updating rush images status:', error);
      return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
    }

    return NextResponse.json({ success: true, updated: imageIds.length });
  } catch (error) {
    console.error('Error in rush PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/rush?id=xxx - Delete a rush image
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const url = new URL(request.url);
    const imageId = url.searchParams.get('id');

    if (!imageId) {
      return NextResponse.json({ error: 'Image ID required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Delete the rush image (RLS will ensure ownership)
    const { error } = await supabase
      .from('rush_media')
      .delete()
      .eq('id', imageId)
      .eq('project_id', projectId);

    if (error) {
      console.error('Error deleting rush image:', error);
      return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in rush DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
