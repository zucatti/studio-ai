import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { uploadFile, getSignedFileUrl, parseStorageUrl, STORAGE_BUCKET } from '@/lib/storage';
import { fal } from '@fal-ai/client';
import Anthropic from '@anthropic-ai/sdk';
import { logFalUsage, logClaudeUsage } from '@/lib/ai/log-api-usage';
import { generateReferenceName } from '@/lib/reference-name';
import { createSSEStream, createSSEHeaders } from '@/lib/sse';
import type { AspectRatio } from '@/types/database';

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

    // Streaming response
    if (stream) {
      const { stream: sseStream, send, close } = createSSEStream();

      (async () => {
        // Create a job in the database for queue tracking
        let jobId: string | null = null;
        try {
          const { data: job } = await supabase
            .from('generation_jobs')
            .insert({
              user_id: session.user.sub,
              asset_id: projectId,
              asset_type: 'project',
              asset_name: `Rush - ${prompt.slice(0, 30)}${prompt.length > 30 ? '...' : ''}`,
              job_type: 'image',
              job_subtype: 'rush',
              status: 'running',
              progress: 5,
              message: 'Démarrage...',
              fal_endpoint: 'fal-ai/nano-banana-2',
              input_data: { prompt, aspectRatio: ratio, count: imageCount },
              started_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (job) {
            jobId = job.id;
          }
        } catch (jobErr) {
          console.error('Error creating rush job:', jobErr);
        }

        // Helper to update job progress
        const updateJobProgress = async (progress: number, message: string, status: 'running' | 'completed' | 'failed' = 'running') => {
          if (!jobId) return;
          try {
            const updates: Record<string, unknown> = { progress, message, status };
            if (status === 'completed' || status === 'failed') {
              updates.completed_at = new Date().toISOString();
            }
            await supabase
              .from('generation_jobs')
              .update(updates)
              .eq('id', jobId);
          } catch (err) {
            console.error('Error updating job:', err);
          }
        };

        try {
          send({ type: 'init', count: imageCount, aspectRatio: ratio });

          // Optimize prompt
          send({ type: 'progress', status: 'queued', message: 'Optimisation du prompt...' });
          await updateJobProgress(10, 'Optimisation du prompt...');
          const optimizedPrompt = await optimizePrompt(prompt, entities, hasCharacterRefs, skipOptimization);

          // Get reference images
          let falImageUrls: string[] = [];
          if (hasCharacterRefs) {
            send({ type: 'progress', status: 'queued', message: 'Préparation des références...' });
            await updateJobProgress(20, 'Préparation des références...');
            for (const entity of characterEntities) {
              const refs = getReferenceImages(entity, 2);
              for (const ref of refs) {
                if (falImageUrls.length >= 4) break;
                const publicUrl = await getPublicImageUrl(ref);
                falImageUrls.push(publicUrl);
              }
            }
          }

          const generatedImages: string[] = [];
          let usedModel = 'nano-banana-2';

          send({ type: 'progress', status: 'generating', message: 'Génération en cours...' });
          await updateJobProgress(30, 'Génération en cours...');

          // Generate with Nano Banana 2 (most reliable)
          if (falImageUrls.length > 0) {
            // With reference images - use edit endpoint
            const consistencyPrompt = [
              'Generate a new image using the character(s) from the reference image(s).',
              'Keep the EXACT same appearance, face, clothing, and style.',
              optimizedPrompt,
              'cinematic, high quality, consistent character design, no text, no watermark',
            ].join(' ');

            try {
              const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
                input: {
                  prompt: consistencyPrompt,
                  image_urls: falImageUrls,
                  aspect_ratio: aspectRatioString,
                  num_images: Math.min(imageCount, 4),
                  output_format: 'png',
                  resolution,
                  safety_tolerance: '4',
                } as any,
                logs: true,
              });

              const images = (result.data as any)?.images;
              if (images) {
                for (const img of images) {
                  generatedImages.push(img.url);
                }
                usedModel = `nano-banana-2-edit-${resolution.toLowerCase()}`;
              }

              logFalUsage({
                operation: 'generate-rush-nano-edit',
                model: `nano-banana-2-edit-${resolution.toLowerCase()}`,
                imagesCount: Math.min(imageCount, 4),
                projectId,
              }).catch(console.error);
            } catch (err) {
              console.error('Nano Banana 2 edit failed:', err);
            }
          }

          // Fallback to text-to-image
          if (generatedImages.length === 0) {
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
            if (images) {
              for (const img of images) {
                generatedImages.push(img.url);
              }
              usedModel = `nano-banana-2-${resolution.toLowerCase()}`;
            }

            logFalUsage({
              operation: 'generate-rush-nano',
              model: `nano-banana-2-${resolution.toLowerCase()}`,
              imagesCount: Math.min(imageCount, 4),
              projectId,
            }).catch(console.error);
          }

          // Generate more if needed
          if (imageCount > 4 && generatedImages.length > 0 && generatedImages.length < imageCount) {
            const remaining = Math.min(imageCount - generatedImages.length, 4);
            const result = await fal.subscribe('fal-ai/nano-banana-2', {
              input: {
                prompt: `${optimizedPrompt} cinematic, high quality, no text, no watermark`,
                aspect_ratio: aspectRatioString,
                num_images: remaining,
                output_format: 'png',
                resolution,
              } as any,
              logs: true,
            });

            const images = (result.data as any)?.images;
            if (images) {
              for (const img of images) {
                generatedImages.push(img.url);
              }
            }
          }

          if (generatedImages.length === 0) {
            send({ type: 'error', error: 'No image generated' });
            await updateJobProgress(0, 'Aucune image générée', 'failed');
            close();
            return;
          }

          // Upload to storage and save to rush_images table
          send({ type: 'progress', status: 'uploading', message: 'Sauvegarde...' });
          await updateJobProgress(70, 'Sauvegarde...');

          const sanitizedUserId = session.user.sub.replace(/[|]/g, '_');
          const createdImages: any[] = [];

          for (let i = 0; i < generatedImages.length; i++) {
            const imageUrl = generatedImages[i];
            try {
              const imageResponse = await fetch(imageUrl);
              const imageBlob = await imageResponse.blob();
              const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());

              const timestamp = Date.now();
              const storageKey = `rush/${sanitizedUserId}/${projectId}/${timestamp}_${i}.png`;
              await uploadFile(storageKey, imageBuffer, 'image/png');

              const b2Url = `b2://${STORAGE_BUCKET}/${storageKey}`;

              // Save to rush_images table
              const { data: rushImage, error: insertError } = await supabase
                .from('rush_images')
                .insert({
                  project_id: projectId,
                  user_id: session.user.sub,
                  url: b2Url,
                  prompt: prompt,
                  aspect_ratio: ratio,
                  model: usedModel,
                })
                .select()
                .single();

              if (insertError) {
                console.error('Error saving rush image:', insertError);
              } else if (rushImage) {
                createdImages.push(rushImage);

                // Send image event (compatible with QuickShotGenerator)
                send({
                  type: 'image',
                  imageIndex: i,
                  imageUrl: b2Url,
                  shotId: rushImage.id,
                });
              }
            } catch (uploadErr) {
              console.error('Error uploading image:', uploadErr);
            }
          }

          // Send complete event (return as "shots" for QuickShotGenerator compatibility)
          send({
            type: 'complete',
            shots: createdImages.map(img => ({
              id: img.id,
              project_id: img.project_id,
              storyboard_image_url: img.url,
              description: img.prompt,
              created_at: img.created_at,
            })),
          });

          // Mark job as completed
          await updateJobProgress(100, `${createdImages.length} image${createdImages.length > 1 ? 's' : ''} générée${createdImages.length > 1 ? 's' : ''}`, 'completed');

          close();
        } catch (error) {
          console.error('Rush generation error:', error);
          send({ type: 'error', error: String(error) });
          await updateJobProgress(0, String(error), 'failed');
          close();
        }
      })();

      return new Response(sseStream, { headers: createSSEHeaders() });
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
        .from('rush_images')
        .insert({
          project_id: projectId,
          user_id: session.user.sub,
          url: b2Url,
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
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
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

    // Fetch rush images
    const { data: images, error } = await supabase
      .from('rush_images')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching rush images:', error);
      return NextResponse.json({ error: 'Failed to fetch rush images' }, { status: 500 });
    }

    return NextResponse.json({
      images: images || [],
      count: images?.length || 0,
      aspectRatio: project.aspect_ratio || '16:9',
    });
  } catch (error) {
    console.error('Error in rush GET:', error);
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
      .from('rush_images')
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
