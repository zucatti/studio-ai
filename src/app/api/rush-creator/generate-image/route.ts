/**
 * Rush Creator - Generate Image API
 *
 * Queue an image generation job that saves to rush_media table.
 * Uses the quick-shot-gen queue but stores results in rush_media.
 */

import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { enqueueQuickShotGen } from '@/lib/bullmq';
import { generateReferenceName, generateLookReferenceName } from '@/lib/reference-name';
import { getSignedFileUrl } from '@/lib/storage';
import type { AspectRatio } from '@/types/database';

interface LookVariation {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  reference?: string;
}

interface EntityWithImage {
  reference: string;
  name: string;
  visual_description: string;
  reference_images: string[];
  type: 'character' | 'prop' | 'location';
  looks?: LookVariation[];
}

interface ReferenceImageData {
  url: string;
  label: string;
  type: 'character' | 'location' | 'prop' | 'look';
  description?: string;
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

  // Fetch global assets imported to this project
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

function findMentionedLooks(prompt: string, entities: EntityWithImage[]): { look: LookVariation; character: EntityWithImage }[] {
  const lookMentions = prompt.match(/![a-zA-Z][a-zA-Z0-9]*/g) || [];
  const results: { look: LookVariation; character: EntityWithImage }[] = [];
  const seenLooks = new Set<string>();

  for (const lookMention of lookMentions) {
    for (const entity of entities) {
      if (entity.type !== 'character' || !entity.looks) continue;

      const look = entity.looks.find(l =>
        l.reference?.toLowerCase() === lookMention.toLowerCase()
      );

      if (look && !seenLooks.has(look.id)) {
        seenLooks.add(look.id);
        results.push({ look, character: entity });
      }
    }
  }

  return results;
}

function getBestReferenceImages(entity: EntityWithImage, maxImages: number = 2): string[] {
  const images = entity.reference_images || [];
  if (images.length === 0) return [];

  const result: string[] = [];

  const frontImage = images.find(img => img.includes('_front_'));
  if (frontImage) result.push(frontImage);

  const sideImage = images.find(img => img.includes('_side_') || img.includes('_profile_'));
  if (sideImage && result.length < maxImages) result.push(sideImage);

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

async function signUrl(url: string): Promise<string | null> {
  if (url.startsWith('http')) {
    return url;
  }

  if (url.startsWith('b2://')) {
    const match = url.match(/^b2:\/\/[^/]+\/(.+)$/);
    if (match) {
      return getSignedFileUrl(match[1]);
    }
  }

  return getSignedFileUrl(url);
}

export async function POST(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      projectId,
      prompt,
      aspectRatio = '9:16',
      resolution = '2K',
      model,
    } = body;

    if (!projectId) {
      return Response.json({ error: 'projectId is required' }, { status: 400 });
    }

    if (!prompt?.trim()) {
      return Response.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, aspect_ratio')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return Response.json(
        { error: 'Project not found', details: projectError },
        { status: 404 }
      );
    }

    // Fetch entities
    const entities = await fetchEntitiesWithImages(supabase, projectId);
    console.log(`[RushCreator/GenerateImage] Found ${entities.length} entities`);

    // Find mentioned entities and looks
    const mentionedEntities = findMentionedEntities(prompt, entities);
    const mentionedLooks = findMentionedLooks(prompt, entities);

    console.log(`[RushCreator/GenerateImage] Mentioned: ${mentionedEntities.map(e => e.reference).join(', ')}`);

    // Build reference images with metadata
    const referenceImages: ReferenceImageData[] = [];

    for (const entity of mentionedEntities) {
      const images = getBestReferenceImages(entity, 2);
      for (const imgUrl of images) {
        const signedUrl = await signUrl(imgUrl);
        if (signedUrl) {
          referenceImages.push({
            url: signedUrl,
            label: entity.reference,
            type: entity.type,
            description: entity.visual_description,
          });
        }
      }
    }

    for (const { look, character } of mentionedLooks) {
      if (look.imageUrl) {
        const signedUrl = await signUrl(look.imageUrl);
        if (signedUrl) {
          referenceImages.push({
            url: signedUrl,
            label: look.reference || look.name,
            type: 'look',
            description: `${character.name} wearing ${look.description || look.name}`,
          });
        }
      }
    }

    const finalReferences = referenceImages.slice(0, 10);
    console.log(`[RushCreator/GenerateImage] Reference images: ${finalReferences.length}`);

    // Create job record
    // Note: asset_id is FK to global_assets, so we set it to null for project-level jobs
    const { data: job, error: jobError } = await supabase
      .from('generation_jobs')
      .insert({
        user_id: session.user.sub,
        asset_type: 'project',
        asset_id: null,
        asset_name: `Rush Image - ${prompt.slice(0, 30)}${prompt.length > 30 ? '...' : ''}`,
        job_type: 'image',
        job_subtype: 'rush-creator',
        status: 'queued',
        progress: 0,
        message: 'En file d\'attente...',
        input_data: {
          projectId,
          prompt,
          aspectRatio,
          resolution,
          model,
          referenceCount: finalReferences.length,
          targetTable: 'rush_media', // Signal to worker to store in rush_media
        },
        queued_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error('[RushCreator/GenerateImage] Failed to create job:', jobError);
      return Response.json(
        { error: 'Failed to create job', details: jobError },
        { status: 500 }
      );
    }

    // Enqueue the job
    try {
      await enqueueQuickShotGen({
        userId: session.user.sub,
        jobId: job.id,
        createdAt: new Date().toISOString(),
        projectId,
        prompt: prompt.trim(),
        aspectRatio: aspectRatio as AspectRatio,
        resolution,
        model,
        referenceImages: finalReferences,
      });
      console.log(`[RushCreator/GenerateImage] Job ${job.id} enqueued`);
    } catch (queueError) {
      console.error('[RushCreator/GenerateImage] Failed to enqueue:', queueError);

      await supabase
        .from('generation_jobs')
        .update({
          status: 'failed',
          error_message: queueError instanceof Error ? queueError.message : 'Failed to enqueue',
        })
        .eq('id', job.id);

      return Response.json(
        { error: 'Failed to enqueue job' },
        { status: 500 }
      );
    }

    return Response.json({
      jobId: job.id,
      status: 'queued',
      message: 'Image generation queued',
      referenceCount: finalReferences.length,
    });

  } catch (error) {
    console.error('[RushCreator/GenerateImage] Error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
