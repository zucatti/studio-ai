import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { uploadFile, getSignedFileUrl, parseStorageUrl, STORAGE_BUCKET } from '@/lib/storage';
import Anthropic from '@anthropic-ai/sdk';
import { logClaudeUsage, logFalUsage } from '@/lib/ai/log-api-usage';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// Style configurations for fal.ai
const STYLE_CONFIG: Record<string, {
  promptPrefix: string;
  promptSuffix: string;
  renderingSpeed: 'TURBO' | 'BALANCED' | 'QUALITY';
  ideogramStyle: 'AUTO' | 'REALISTIC' | 'FICTION';
}> = {
  photorealistic: {
    promptPrefix: 'photorealistic, cinematic still, professional photography, 8k uhd, ',
    promptSuffix: ', highly detailed, sharp focus, cinematic lighting',
    renderingSpeed: 'QUALITY',
    ideogramStyle: 'REALISTIC',
  },
  cartoon: {
    promptPrefix: 'pixar style, disney animation, 3d cartoon character, vibrant colors, ',
    promptSuffix: ', stylized, expressive, professional animation quality',
    renderingSpeed: 'BALANCED',
    ideogramStyle: 'FICTION',
  },
  anime: {
    promptPrefix: 'anime style, japanese animation, studio ghibli inspired, ',
    promptSuffix: ', detailed anime artwork, cel shaded, vibrant',
    renderingSpeed: 'BALANCED',
    ideogramStyle: 'FICTION',
  },
  cyberpunk: {
    promptPrefix: 'cyberpunk style, neon lights, futuristic, blade runner aesthetic, ',
    promptSuffix: ', high tech, dystopian, cinematic',
    renderingSpeed: 'QUALITY',
    ideogramStyle: 'REALISTIC',
  },
  noir: {
    promptPrefix: 'film noir style, black and white, high contrast, dramatic shadows, ',
    promptSuffix: ', 1940s aesthetic, moody, atmospheric, cinematic',
    renderingSpeed: 'QUALITY',
    ideogramStyle: 'REALISTIC',
  },
  watercolor: {
    promptPrefix: 'watercolor painting, artistic, soft edges, flowing colors, ',
    promptSuffix: ', traditional art, painterly, delicate brushstrokes',
    renderingSpeed: 'BALANCED',
    ideogramStyle: 'FICTION',
  },
};

// Character view configurations for multi-view generation
const CHARACTER_VIEWS = [
  { name: 'front', perspective: 'front' as const },
  { name: 'profile', perspective: 'three_quarter_right' as const },
  { name: 'back', perspective: 'back' as const },
];

type PerspectiveTarget = 'front' | 'left_side' | 'right_side' | 'back' | 'top_down' | 'bottom_up' | 'birds_eye' | 'three_quarter_left' | 'three_quarter_right';

// Translate and optimize prompt using Claude
async function optimizePrompt(
  frenchDescription: string,
  entityType: 'character' | 'prop' | 'location',
  style: string
): Promise<string> {
  if (!process.env.AI_CLAUDE_KEY) {
    return frenchDescription;
  }

  const anthropic = new Anthropic({
    apiKey: process.env.AI_CLAUDE_KEY,
  });

  const typeInstructions = {
    character: 'Focus on the person: face, body type, clothing, pose. Use portrait or full body framing. Be very specific about facial features, hair, and distinguishing characteristics.',
    prop: 'Focus on the object: shape, materials, textures, details. Use product photography style.',
    location: 'Focus on the environment: architecture, atmosphere, lighting, depth. Use wide establishing shot.',
  };

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `Convert this French description into an optimized English prompt for image generation.

Entity type: ${entityType}
Style: ${style}
${typeInstructions[entityType]}

French description:
"${frenchDescription}"

Rules:
- Translate to English
- Keep it concise (max 50 words)
- Focus on visual elements only
- Do NOT include style keywords (they will be added separately)
- Be VERY specific about visual details, especially for faces
- For characters: include specific details about face shape, eye color, hair style/color, skin tone, age appearance

Return ONLY the optimized English prompt, nothing else.`,
      },
    ],
  });

  // Log API usage
  logClaudeUsage({
    operation: 'optimize-prompt-reference',
    model: 'claude-sonnet-4-20250514',
    inputTokens: message.usage?.input_tokens || 0,
    outputTokens: message.usage?.output_tokens || 0,
  }).catch(console.error);

  const content = message.content[0];
  if (content.type === 'text') {
    return content.text.trim();
  }

  return frenchDescription;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { entityType, entityId, multiView = false } = body;

    if (!entityType || !entityId) {
      return NextResponse.json({ error: 'Missing entityType or entityId' }, { status: 400 });
    }

    // Multi-view only available for characters
    const useMultiView = multiView && entityType === 'character';

    const supabase = createServerSupabaseClient();

    // Get project with visual style
    const { data: project } = await supabase
      .from('projects')
      .select('id, visual_style')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const style = project.visual_style || 'photorealistic';
    const styleConfig = STYLE_CONFIG[style] || STYLE_CONFIG.photorealistic;

    // Get entity data
    let entity: any;
    let tableName: string;

    if (entityType === 'character') {
      const { data } = await supabase
        .from('characters')
        .select('*')
        .eq('id', entityId)
        .eq('project_id', projectId)
        .single();
      entity = data;
      tableName = 'characters';
    } else if (entityType === 'prop') {
      const { data } = await supabase
        .from('props')
        .select('*')
        .eq('id', entityId)
        .eq('project_id', projectId)
        .single();
      entity = data;
      tableName = 'props';
    } else if (entityType === 'location') {
      const { data } = await supabase
        .from('locations')
        .select('*')
        .eq('id', entityId)
        .eq('project_id', projectId)
        .single();
      entity = data;
      tableName = 'locations';
    } else {
      return NextResponse.json({ error: 'Invalid entityType' }, { status: 400 });
    }

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    // Check visual description
    if (!entity.visual_description || entity.visual_description.trim() === '') {
      return NextResponse.json({ error: 'No visual description provided for this entity' }, { status: 400 });
    }

    // Check API key
    if (!process.env.AI_FAL_KEY) {
      return NextResponse.json({ error: 'fal.ai API key not configured (AI_FAL_KEY)' }, { status: 500 });
    }

    // Update status to generating with progress info
    const totalImages = useMultiView ? 3 : 1;
    await supabase
      .from(tableName)
      .update({
        generation_status: 'generating',
        generation_progress: JSON.stringify({ current: 0, total: totalImages }),
      })
      .eq('id', entityId);

    // Optimize prompt
    console.log(`Optimizing prompt for ${entityType}: ${entity.name}`);
    const optimizedDescription = await optimizePrompt(
      entity.visual_description,
      entityType,
      style
    );
    console.log(`Optimized description: ${optimizedDescription}`);

    // Initialize fal.ai
    const { fal } = await import('@fal-ai/client');
    fal.config({
      credentials: process.env.AI_FAL_KEY,
    });

    // Helper to upload image to fal.ai storage (handles B2, local, and public URLs)
    const uploadToFalStorage = async (imageUrl: string): Promise<string> => {
      // If already on fal.ai, return as-is
      if (imageUrl.includes('fal.media') || imageUrl.includes('fal-cdn')) {
        return imageUrl;
      }

      // Convert B2 URLs to signed URLs first
      let fetchUrl = imageUrl;
      if (imageUrl.startsWith('b2://')) {
        const parsed = parseStorageUrl(imageUrl);
        if (parsed) {
          console.log(`Converting b2:// URL to signed URL: ${imageUrl}`);
          fetchUrl = await getSignedFileUrl(parsed.key);
        }
      }

      // Check if it's a local URL or B2 URL that needs uploading to fal.ai
      const isLocalUrl = fetchUrl.includes('localhost') ||
                         fetchUrl.includes('127.0.0.1') ||
                         fetchUrl.includes('0.0.0.0');

      // For public remote URLs (not local, not B2), return as-is
      if (!isLocalUrl && !imageUrl.startsWith('b2://')) {
        return imageUrl;
      }

      console.log(`Uploading to fal.ai storage: ${fetchUrl.substring(0, 100)}...`);
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image for fal.ai upload: ${response.status}`);
      }
      const blob = await response.blob();
      const uploaded = await fal.storage.upload(blob);
      console.log(`Uploaded to fal.ai: ${uploaded}`);
      return uploaded;
    };

    // Helper to upload image to B2
    const uploadImage = async (imageUrl: string, suffix: string): Promise<string> => {
      const imageResponse = await fetch(imageUrl);
      const imageBlob = await imageResponse.blob();
      const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());

      const sanitizedUserId = session.user.sub.replace(/[|]/g, '_');
      const storageKey = `references/${sanitizedUserId}/${projectId}/${entityType}_${entityId}_${suffix}_${Date.now()}.webp`;

      await uploadFile(storageKey, imageBuffer, 'image/webp');

      // Return B2 URL format for database storage
      return `b2://${STORAGE_BUCKET}/${storageKey}`;
    };

    try {
      const uploadedUrls: string[] = [];

      if (useMultiView && entityType === 'character') {
        // =========================================================
        // CHARACTER MULTI-VIEW GENERATION WITH CONSISTENCY
        // Step 1: Generate front view with Ideogram Character
        // Step 2: Use Perspective Change to generate other views
        // =========================================================

        console.log(`=== Generating multi-view for character: ${entity.name} ===`);

        // Step 1: Generate the front view using Ideogram V3 Character
        console.log('Step 1: Generating front view with Ideogram V3 Character...');
        const frontPrompt = `${styleConfig.promptPrefix}${optimizedDescription}, front view, facing camera, full body portrait, standing pose${styleConfig.promptSuffix}`;
        console.log('Front prompt:', frontPrompt);

        let frontImageUrl: string;

        // Check if character already has a reference image to use for consistency
        const existingRef = entity.reference_images?.[0];

        if (existingRef) {
          // Use existing reference for consistency with Ideogram Character
          console.log('Using existing reference image for consistency:', existingRef);

          // Upload existing reference to fal.ai storage
          const falExistingRef = await uploadToFalStorage(existingRef);

          const frontResult = await fal.subscribe('fal-ai/ideogram/character', {
            input: {
              prompt: frontPrompt,
              reference_image_urls: [falExistingRef],
              rendering_speed: styleConfig.renderingSpeed,
              style: styleConfig.ideogramStyle,
              image_size: 'portrait_4_3',
              num_images: 1,
            } as any,
            logs: true,
          });

          frontImageUrl = (frontResult.data as any)?.images?.[0]?.url;
        } else {
          // Generate new front view with Flux Pro (high quality base)
          console.log('No existing reference, generating new front view with Flux Pro...');

          const fluxResult = await fal.subscribe('fal-ai/flux-pro/v1.1', {
            input: {
              prompt: frontPrompt,
              image_size: 'portrait_4_3',
              num_images: 1,
            },
            logs: true,
          });

          frontImageUrl = (fluxResult.data as any)?.images?.[0]?.url;
        }

        if (!frontImageUrl) {
          throw new Error('Failed to generate front view');
        }

        console.log('Front view generated:', frontImageUrl);

        // Upload front view
        const frontPublicUrl = await uploadImage(frontImageUrl, 'front');
        uploadedUrls.push(frontPublicUrl);
        console.log('Front view uploaded:', frontPublicUrl);

        // Update progress
        await supabase
          .from(tableName)
          .update({
            generation_progress: JSON.stringify({ current: 1, total: 3 }),
            reference_images: uploadedUrls,
          })
          .eq('id', entityId);

        // Step 2: Generate profile and back views using Perspective Change
        // This ensures consistency as the views are derived from the front view
        const perspectiveViews: { name: string; target: PerspectiveTarget }[] = [
          { name: 'profile', target: 'three_quarter_right' },
          { name: 'back', target: 'back' },
        ];

        for (let i = 0; i < perspectiveViews.length; i++) {
          const view = perspectiveViews[i];
          console.log(`Step ${i + 2}: Generating ${view.name} view with Perspective Change...`);

          try {
            // Upload front image to fal.ai storage if needed
            const falFrontImageUrl = await uploadToFalStorage(frontImageUrl);

            const perspectiveResult = await fal.subscribe('fal-ai/image-apps-v2/perspective', {
              input: {
                image_url: falFrontImageUrl,
                target_perspective: view.target,
                aspect_ratio: { ratio: '3:4' }, // Portrait aspect ratio (object format required)
              } as any,
              logs: true,
            });

            const viewImageUrl = (perspectiveResult.data as any)?.images?.[0]?.url;

            if (!viewImageUrl) {
              console.error(`Failed to generate ${view.name} view, falling back to Ideogram...`);
              // Fallback: use Ideogram Character with front view as reference
              const fallbackResult = await fal.subscribe('fal-ai/ideogram/character', {
                input: {
                  prompt: `${styleConfig.promptPrefix}${optimizedDescription}, ${view.name} view, ${view.target === 'back' ? 'facing away from camera, back of head visible' : 'side profile, looking to the side'}, full body portrait${styleConfig.promptSuffix}`,
                  reference_image_urls: [falFrontImageUrl],
                  rendering_speed: styleConfig.renderingSpeed,
                  style: styleConfig.ideogramStyle,
                  image_size: 'portrait_4_3',
                  num_images: 1,
                } as any,
                logs: true,
              });

              const fallbackUrl = (fallbackResult.data as any)?.images?.[0]?.url;
              if (fallbackUrl) {
                const publicUrl = await uploadImage(fallbackUrl, view.name);
                uploadedUrls.push(publicUrl);
                console.log(`${view.name} view (fallback) uploaded:`, publicUrl);
              } else {
                throw new Error(`Failed to generate ${view.name} view`);
              }
            } else {
              const publicUrl = await uploadImage(viewImageUrl, view.name);
              uploadedUrls.push(publicUrl);
              console.log(`${view.name} view uploaded:`, publicUrl);
            }
          } catch (perspectiveError) {
            console.error(`Perspective change failed for ${view.name}:`, perspectiveError);

            // Fallback to Ideogram Character
            console.log(`Falling back to Ideogram Character for ${view.name}...`);
            const falFrontImageUrlFallback = await uploadToFalStorage(frontImageUrl);
            const fallbackResult = await fal.subscribe('fal-ai/ideogram/character', {
              input: {
                prompt: `${styleConfig.promptPrefix}${optimizedDescription}, ${view.name} view, ${view.target === 'back' ? 'facing away from camera, back of head visible, rear view' : 'side profile view, looking to the side, 3/4 view'}, full body portrait${styleConfig.promptSuffix}`,
                reference_image_urls: [falFrontImageUrlFallback],
                rendering_speed: styleConfig.renderingSpeed,
                style: styleConfig.ideogramStyle,
                image_size: 'portrait_4_3',
                num_images: 1,
              } as any,
              logs: true,
            });

            const fallbackUrl = (fallbackResult.data as any)?.images?.[0]?.url;
            if (fallbackUrl) {
              const publicUrl = await uploadImage(fallbackUrl, view.name);
              uploadedUrls.push(publicUrl);
              console.log(`${view.name} view (fallback) uploaded:`, publicUrl);
            } else {
              throw new Error(`Failed to generate ${view.name} view with fallback`);
            }
          }

          // Update progress
          await supabase
            .from(tableName)
            .update({
              generation_progress: JSON.stringify({ current: i + 2, total: 3 }),
              reference_images: uploadedUrls,
            })
            .eq('id', entityId);
        }

      } else if (entityType === 'character') {
        // =========================================================
        // SINGLE CHARACTER IMAGE
        // =========================================================
        console.log(`=== Generating single view for character: ${entity.name} ===`);

        const fullPrompt = `${styleConfig.promptPrefix}${optimizedDescription}, front view, facing camera, full body portrait${styleConfig.promptSuffix}`;
        console.log('Prompt:', fullPrompt);

        // Check for existing reference
        const existingRef = entity.reference_images?.[0];

        let imageUrl: string;

        if (existingRef) {
          // Regenerate with consistency using Ideogram Character
          console.log('Using existing reference for consistency...');

          // Upload to fal.ai storage first
          const falExistingRef = await uploadToFalStorage(existingRef);

          const result = await fal.subscribe('fal-ai/ideogram/character', {
            input: {
              prompt: fullPrompt,
              reference_image_urls: [falExistingRef],
              rendering_speed: styleConfig.renderingSpeed,
              style: styleConfig.ideogramStyle,
              image_size: 'portrait_4_3',
              num_images: 1,
            } as any,
            logs: true,
          });
          imageUrl = (result.data as any)?.images?.[0]?.url;
        } else {
          // Generate new with Flux Pro
          console.log('Generating new character with Flux Pro...');
          const result = await fal.subscribe('fal-ai/flux-pro/v1.1', {
            input: {
              prompt: fullPrompt,
              image_size: 'portrait_4_3',
              num_images: 1,
            },
            logs: true,
          });
          imageUrl = (result.data as any)?.images?.[0]?.url;
        }

        if (!imageUrl) {
          throw new Error('No image generated');
        }

        const publicUrl = await uploadImage(imageUrl, 'main');
        uploadedUrls.push(publicUrl);

      } else {
        // =========================================================
        // PROPS AND LOCATIONS (non-character)
        // =========================================================
        console.log(`=== Generating image for ${entityType}: ${entity.name} ===`);

        const fullPrompt = `${styleConfig.promptPrefix}${optimizedDescription}${styleConfig.promptSuffix}`;
        console.log('Prompt:', fullPrompt);

        // Use Flux Pro for props and locations
        const aspectRatio = entityType === 'location' ? 'landscape_16_9' : 'square_hd';

        const result = await fal.subscribe('fal-ai/flux-pro/v1.1', {
          input: {
            prompt: fullPrompt,
            image_size: aspectRatio,
            num_images: 1,
          },
          logs: true,
        });

        const imageUrl = (result.data as any)?.images?.[0]?.url;
        if (!imageUrl) {
          throw new Error('No image generated');
        }

        const publicUrl = await uploadImage(imageUrl, 'main');
        uploadedUrls.push(publicUrl);
      }

      // Update entity with image URLs
      await supabase
        .from(tableName)
        .update({
          reference_images: uploadedUrls,
          generation_prompt: optimizedDescription,
          generation_status: 'completed',
          generation_error: null,
        })
        .eq('id', entityId);

      console.log(`Generated ${uploadedUrls.length} reference image(s) for ${entityType}: ${entity.name}`);

      // Log fal.ai usage (consolidated for all image generations in this request)
      logFalUsage({
        operation: `generate-reference-${entityType}`,
        model: useMultiView ? 'ideogram/character+perspective' : 'flux-pro/v1.1',
        imagesCount: uploadedUrls.length,
        projectId,
      }).catch(console.error);

      return NextResponse.json({
        success: true,
        imageUrls: uploadedUrls,
        imageUrl: uploadedUrls[0],
        entity: entity.name,
        multiView: useMultiView,
      });
    } catch (genError) {
      console.error('Generation error:', genError);
      await supabase
        .from(tableName)
        .update({ generation_status: 'failed', generation_error: String(genError) })
        .eq('id', entityId);
      return NextResponse.json({ error: 'Generation failed: ' + String(genError) }, { status: 500 });
    }
  } catch (error) {
    console.error('Error generating reference:', error);
    return NextResponse.json(
      { error: 'Failed to generate reference: ' + String(error) },
      { status: 500 }
    );
  }
}
