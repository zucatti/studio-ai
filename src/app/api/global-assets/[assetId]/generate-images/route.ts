import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { createClaudeWrapper, extractTextContent, isCreditError, formatCreditError } from '@/lib/ai';
import { createCreditService, ensureCredit, calculateFalCost } from '@/lib/credits';
import { enqueueImageGen, type ImageGenJobData } from '@/lib/bullmq';
import { getPublicImageUrl } from '@/lib/fal-utils';

interface RouteParams {
  params: Promise<{ assetId: string }>;
}

// Reference image types for characters
export type CharacterImageType = 'front' | 'profile' | 'back' | 'three_quarter' | 'custom';

export interface ReferenceImage {
  url: string;
  type: CharacterImageType;
  label: string;
}

// Default model for text-to-image generation
const DEFAULT_TEXT_TO_IMAGE_MODEL = 'fal-ai/nano-banana-2';

// Model configurations
const MODEL_CONFIG: Record<string, {
  name: string;
  description: string;
  supportsReference: boolean;
  aspectRatioParam: string;
  falEndpoint?: string;
}> = {
  'fal-ai/nano-banana-2': {
    name: 'Nano Banana 2',
    description: 'Google Gemini 3.1 Flash - Rapide et haute qualité, 4K',
    supportsReference: false,
    aspectRatioParam: 'aspect_ratio',
  },
  'seedream-5': {
    name: 'Seedream 5',
    description: 'ByteDance - Excellente consistance de personnage',
    supportsReference: true,
    aspectRatioParam: 'aspect_ratio',
    falEndpoint: 'fal-ai/bytedance/seedream/v5/lite/text-to-image',
  },
  'flux-2-pro': {
    name: 'Flux 2 Pro',
    description: 'Black Forest Labs - Qualité studio, photoréalisme',
    supportsReference: false,
    aspectRatioParam: 'image_size',
    falEndpoint: 'fal-ai/flux-2-pro',
  },
  'gpt-image-1.5': {
    name: 'GPT Image 1.5',
    description: 'OpenAI - Flagship, haute fidélité',
    supportsReference: false,
    aspectRatioParam: 'image_size',
    falEndpoint: 'fal-ai/gpt-image-1.5',
  },
  'fal-ai/ideogram/character': {
    name: 'Ideogram Character',
    description: 'Consistance de personnage avec référence',
    supportsReference: true,
    aspectRatioParam: 'image_size',
  },
  // Image-to-image models
  'kling-omni': {
    name: 'Kling O1',
    description: 'Kuaishou - Multi-référence image-to-image',
    supportsReference: true,
    aspectRatioParam: 'aspect_ratio',
    falEndpoint: 'kling-omni', // Handled specially in worker
  },
  'flux-i2i': {
    name: 'Flux Dev I2I',
    description: 'Black Forest Labs - Image-to-image',
    supportsReference: true,
    aspectRatioParam: 'aspect_ratio',
    falEndpoint: 'flux-i2i',
  },
  'seedream-edit': {
    name: 'Seedream Edit',
    description: 'ByteDance - Image editing',
    supportsReference: true,
    aspectRatioParam: 'aspect_ratio',
    falEndpoint: 'seedream-edit',
  },
};

// Style configurations for fal.ai
const STYLE_CONFIG: Record<string, {
  promptPrefix: string;
  promptSuffix: string;
  renderingSpeed: 'TURBO' | 'BALANCED' | 'QUALITY';
  ideogramStyle: 'AUTO' | 'REALISTIC' | 'FICTION';
  resolution: '1K' | '2K' | '4K';
}> = {
  photorealistic: {
    promptPrefix: 'photorealistic, cinematic still, professional photography, 8k uhd, ',
    promptSuffix: ', highly detailed, sharp focus, cinematic lighting',
    renderingSpeed: 'QUALITY',
    ideogramStyle: 'REALISTIC',
    resolution: '4K',
  },
  cartoon: {
    promptPrefix: 'pixar style, disney animation, 3d cartoon character, vibrant colors, ',
    promptSuffix: ', stylized, expressive, professional animation quality',
    renderingSpeed: 'BALANCED',
    ideogramStyle: 'FICTION',
    resolution: '2K',
  },
  anime: {
    promptPrefix: 'anime style, japanese animation, studio ghibli inspired, ',
    promptSuffix: ', detailed anime artwork, cel shaded, vibrant',
    renderingSpeed: 'BALANCED',
    ideogramStyle: 'FICTION',
    resolution: '2K',
  },
  cyberpunk: {
    promptPrefix: 'cyberpunk style, neon lights, futuristic, blade runner aesthetic, ',
    promptSuffix: ', high tech, dystopian, cinematic',
    renderingSpeed: 'QUALITY',
    ideogramStyle: 'REALISTIC',
    resolution: '4K',
  },
  noir: {
    promptPrefix: 'film noir style, black and white, high contrast, dramatic shadows, ',
    promptSuffix: ', 1940s aesthetic, moody, atmospheric, cinematic',
    renderingSpeed: 'QUALITY',
    ideogramStyle: 'REALISTIC',
    resolution: '2K',
  },
  watercolor: {
    promptPrefix: 'watercolor painting, artistic, soft edges, flowing colors, ',
    promptSuffix: ', traditional art, painterly, delicate brushstrokes',
    renderingSpeed: 'BALANCED',
    ideogramStyle: 'FICTION',
    resolution: '2K',
  },
};

// View configurations for multi-view generation
const CHARACTER_VIEWS: { name: CharacterImageType; label: string; promptSuffix: string }[] = [
  { name: 'front', label: 'Face (Vue de face)', promptSuffix: 'front view, facing camera, looking straight ahead' },
  { name: 'profile', label: 'Profil (Vue de côté)', promptSuffix: 'side profile view, looking to the side' },
  { name: 'three_quarter', label: '3/4 (Vue trois-quarts)', promptSuffix: 'three quarter view, 3/4 angle, slightly turned' },
  { name: 'back', label: 'Dos (Vue arrière)', promptSuffix: 'back view, facing away from camera, rear view, back of head visible' },
];

// Fetch image and convert to base64
async function fetchImageAsBase64(url: string): Promise<{ base64: string; mediaType: string } | null> {
  try {
    // Convert b2:// URLs to signed HTTPS URLs
    const publicUrl = await getPublicImageUrl(url);

    const response = await fetch(publicUrl);
    if (!response.ok) {
      console.error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    // Map content type to Claude's expected format
    let mediaType = 'image/jpeg';
    if (contentType.includes('png')) mediaType = 'image/png';
    else if (contentType.includes('gif')) mediaType = 'image/gif';
    else if (contentType.includes('webp')) mediaType = 'image/webp';

    return { base64, mediaType };
  } catch (error) {
    console.error('Error fetching image:', error);
    return null;
  }
}

// Translate and optimize prompt using Claude
async function optimizePrompt(
  frenchDescription: string,
  style: string,
  claudeWrapper: ReturnType<typeof createClaudeWrapper>,
  assetType: 'character' | 'location' | 'prop' = 'character',
  inspirationImageUrls?: string[]
): Promise<string> {
  if (!process.env.AI_CLAUDE_KEY) {
    return frenchDescription;
  }

  let systemPrompt: string;

  if (assetType === 'location') {
    const hasInspiration = inspirationImageUrls && inspirationImageUrls.length > 0;
    systemPrompt = `You are a prompt engineer. Your task is to write an optimized English prompt that will be sent to an AI image generator (like Stable Diffusion or DALL-E).

You are NOT generating the image yourself - you are writing the TEXT PROMPT that another AI will use to generate the image.

CONTEXT:
- The user describes a location/environment in French
- Style requested: ${style}
${hasInspiration ? '- The user has attached reference images showing the visual style, mood, colors, and atmosphere they want. Analyze these images and incorporate their visual characteristics into your prompt.' : ''}

USER'S DESCRIPTION (in French):
"${frenchDescription}"

YOUR TASK:
Write a concise English prompt (max 60 words) that describes this location for image generation.

REQUIREMENTS:
- Translate and enhance the French description to English
- Focus on: architecture, lighting, atmosphere, colors, textures, spatial composition
- Include specific visual details about materials, colors, textures
- CRITICAL: This must be an EMPTY scene - NO PEOPLE, NO HUMANS, NO FIGURES, NO SILHOUETTES
- Add "empty scene, no people, uninhabited" to enforce this
${hasInspiration ? '- Capture the visual style, color palette, lighting, and mood from the reference images' : ''}

Return ONLY the English prompt text, nothing else. No explanations, no quotes, just the prompt.`;
  } else if (assetType === 'prop') {
    systemPrompt = `Convert this French description into an optimized English prompt for object/prop image generation.

Style: ${style}
Focus on the OBJECT: shape, materials, textures, details, lighting.

French description:
"${frenchDescription}"

Rules:
- Translate to English
- Keep it concise (max 40 words)
- Focus on the object itself
- Describe materials, textures, colors
- Include specific details about shape and features
- Product photography style, clean background

Return ONLY the optimized English prompt, nothing else.`;
  } else {
    systemPrompt = `Convert this French description into an optimized English prompt for character image generation.

Style: ${style}
Focus on the person: face, body type, clothing, pose. Use portrait or full body framing.
Be very specific about facial features, hair, and distinguishing characteristics.

French description:
"${frenchDescription}"

Rules:
- Translate to English
- Keep it concise (max 50 words)
- Focus on visual elements only
- Do NOT include style keywords (they will be added separately)
- Be VERY specific about visual details, especially for faces
- Include specific details about face shape, eye color, hair style/color, skin tone, age appearance

Return ONLY the optimized English prompt, nothing else.`;
  }

  // Build message content with optional images
  type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  const messageContent: Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: ImageMediaType; data: string } }> = [];

  // Add inspiration images if provided (for locations)
  if (assetType === 'location' && inspirationImageUrls && inspirationImageUrls.length > 0) {
    for (const imageUrl of inspirationImageUrls.slice(0, 4)) {
      const imageData = await fetchImageAsBase64(imageUrl);
      if (imageData) {
        messageContent.push({
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: imageData.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: imageData.base64,
          },
        });
      }
    }
  }

  // Add the text prompt
  messageContent.push({ type: 'text' as const, text: systemPrompt });

  const result = await claudeWrapper.createMessage({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [{ role: 'user', content: messageContent.length === 1 ? systemPrompt : messageContent }],
  });

  return extractTextContent(result.message).trim() || frenchDescription;
}

// Build a look prompt using character morphology and look description
async function buildLookPrompt(
  assetData: Record<string, unknown>,
  lookDescription: string,
  style: string,
  claudeWrapper: ReturnType<typeof createClaudeWrapper>
): Promise<string> {
  if (!process.env.AI_CLAUDE_KEY) {
    return lookDescription;
  }

  const age = (assetData.age as string) || '';
  const gender = (assetData.gender as string) || '';
  const visualDescription = (assetData.visual_description as string) || '';

  const result = await claudeWrapper.createMessage({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    messages: [
      {
        role: 'user',
        content: `Create an optimized English prompt for generating a character image with a specific look/outfit.

CHARACTER MORPHOLOGY:
- Age: ${age || 'not specified'}
- Gender: ${gender || 'not specified'}
- Visual description: ${visualDescription || 'not specified'}

LOOK/OUTFIT DESCRIPTION (French):
"${lookDescription}"

IMAGE STYLE: ${style}

Rules:
1. Combine the character's physical traits with the outfit/look description
2. Translate everything to English
3. Be very specific about clothing, accessories, colors, materials
4. Include the character's physical features (face, hair, body type) from the morphology
5. Keep it concise (max 80 words)
6. Focus on visual elements only - no personality or story
7. Do NOT include style keywords (they will be added separately)
8. The character should be shown full body or portrait, naturally posed

Return ONLY the optimized English prompt, nothing else.`,
      },
    ],
  });

  return extractTextContent(result.message).trim() || lookDescription;
}

// Get the actual fal.ai endpoint for a model
function getFalEndpoint(model: string): string {
  const config = MODEL_CONFIG[model];
  return config?.falEndpoint || model;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { assetId } = await params;
    const body = await request.json();
    const {
      mode, // 'generate_all' | 'generate_variations' | 'generate_single' | 'generate_look'
      sourceImageUrl,
      style = 'photorealistic',
      viewType,
      lookDescription,
      lookName,
      model,
      resolution = '2K',
      visualDescription: overrideVisualDescription,
      inspirationImageUrls, // Reference images for Claude to understand visual style (locations)
    } = body;

    const textToImageModel = model && MODEL_CONFIG[model] ? model : DEFAULT_TEXT_TO_IMAGE_MODEL;

    if (!mode) {
      return NextResponse.json({ error: 'Missing mode parameter' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Get the global asset
    const { data: asset, error: assetError } = await supabase
      .from('global_assets')
      .select('*')
      .eq('id', assetId)
      .eq('user_id', session.user.sub)
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const supportedTypes = ['character', 'location', 'prop'];
    if (!supportedTypes.includes(asset.asset_type)) {
      return NextResponse.json({ error: `Asset type '${asset.asset_type}' is not supported for image generation` }, { status: 400 });
    }

    const assetData = asset.data as Record<string, unknown>;
    const visualDescription = overrideVisualDescription || (assetData.visual_description as string) || (assetData.description as string) || '';
    const existingReferenceImages: ReferenceImage[] =
      (assetData.reference_images_metadata as ReferenceImage[] | undefined) || [];
    const hasFrontImage = existingReferenceImages.some(img => img.type === 'front');

    if (asset.asset_type !== 'character' && mode !== 'generate_single') {
      return NextResponse.json({ error: `Mode '${mode}' is only supported for characters. Use 'generate_single' for locations/props.` }, { status: 400 });
    }

    if (!visualDescription && mode !== 'generate_variations' && !(mode === 'generate_single' && hasFrontImage)) {
      return NextResponse.json({ error: 'No visual description provided for this asset' }, { status: 400 });
    }

    // If visual description was overridden, save it
    if (overrideVisualDescription && overrideVisualDescription !== assetData.visual_description) {
      const updatedAssetData = { ...assetData, visual_description: overrideVisualDescription };
      await supabase
        .from('global_assets')
        .update({ data: updatedAssetData })
        .eq('id', assetId);
    }

    if (!process.env.AI_FAL_KEY) {
      return NextResponse.json({ error: 'fal.ai API key not configured (AI_FAL_KEY)' }, { status: 500 });
    }

    const styleConfig = STYLE_CONFIG[style] || STYLE_CONFIG.photorealistic;

    // Initialize Claude wrapper for prompt optimization
    const claudeWrapper = createClaudeWrapper({
      userId: session.user.sub,
      supabase,
      operation: 'optimize-character-prompt',
    });

    const creditService = createCreditService(supabase);

    // Check budget for fal.ai calls
    try {
      const estimatedCost = calculateFalCost(textToImageModel, mode === 'generate_all' ? 3 : 1);
      await ensureCredit(creditService, session.user.sub, 'fal', estimatedCost);
    } catch (error) {
      if (isCreditError(error)) {
        return NextResponse.json(
          { error: formatCreditError(error), code: error.code },
          { status: 402 }
        );
      }
      throw error;
    }

    // Optimize prompt with Claude (this is fast, do it before enqueueing)
    let optimizedPrompt = visualDescription;
    let fullPrompt = '';

    if (mode === 'generate_look' && lookDescription) {
      optimizedPrompt = await buildLookPrompt(assetData, lookDescription, style, claudeWrapper);
      fullPrompt = `${styleConfig.promptPrefix}${optimizedPrompt}, full body portrait, standing pose, fashion photography${styleConfig.promptSuffix}`;
    } else if (visualDescription) {
      optimizedPrompt = await optimizePrompt(
        visualDescription,
        style,
        claudeWrapper,
        asset.asset_type as 'character' | 'location' | 'prop',
        inspirationImageUrls
      );

      if (asset.asset_type === 'location') {
        fullPrompt = `${styleConfig.promptPrefix}${optimizedPrompt}, empty scene, no people, no humans, uninhabited, wide angle architectural photography${styleConfig.promptSuffix}`;
      } else if (asset.asset_type === 'prop') {
        fullPrompt = `${styleConfig.promptPrefix}${optimizedPrompt}, product photography, clean background, studio lighting${styleConfig.promptSuffix}`;
      } else {
        const viewConfig = CHARACTER_VIEWS.find(v => v.name === viewType) || CHARACTER_VIEWS[0];
        fullPrompt = `${styleConfig.promptPrefix}${optimizedPrompt}, ${viewConfig.promptSuffix}, full body portrait${styleConfig.promptSuffix}`;
      }
    }

    // Get front reference URL if it exists
    const frontRef = existingReferenceImages.find(img => img.type === 'front');
    const frontReferenceUrl = frontRef?.url;

    // Handle generate_single with front reference but no visual description
    if (!fullPrompt && mode === 'generate_single' && hasFrontImage && frontReferenceUrl) {
      // When generating a view from front reference without visual description,
      // the worker will use perspective change - we just need the view info
      const viewConfig = CHARACTER_VIEWS.find(v => v.name === viewType);
      if (viewConfig) {
        optimizedPrompt = `single person, solo, character portrait, ${viewConfig.promptSuffix}`;
        fullPrompt = `${styleConfig.promptPrefix}${optimizedPrompt}, full body portrait, one person only${styleConfig.promptSuffix}`;
      } else {
        // Unknown view type, use viewType directly
        optimizedPrompt = `single person, solo, character portrait, ${viewType} view`;
        fullPrompt = `${styleConfig.promptPrefix}${optimizedPrompt}, full body portrait, one person only${styleConfig.promptSuffix}`;
      }
    }

    // Create job record in Supabase
    const lookId = mode === 'generate_look' ? crypto.randomUUID() : undefined;
    const { data: job, error: jobError } = await supabase
      .from('generation_jobs')
      .insert({
        user_id: session.user.sub,
        asset_id: assetId,
        asset_type: asset.asset_type,
        asset_name: asset.name,
        job_type: 'image',
        job_subtype: mode === 'generate_look' ? 'look' : (viewType || 'all'),
        status: 'queued',
        progress: 0,
        message: 'En file d\'attente...',
        input_data: {
          mode,
          style,
          model: textToImageModel,
          viewType,
          lookDescription,
          lookName,
          resolution,
        },
        queued_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error('[GenerateImages] Failed to create job:', jobError);
      return NextResponse.json(
        { error: 'Failed to create job', details: jobError?.message },
        { status: 500 }
      );
    }

    // Build job data for BullMQ
    const jobData: Omit<ImageGenJobData, 'type'> = {
      userId: session.user.sub,
      jobId: job.id,
      createdAt: new Date().toISOString(),
      assetId,
      assetType: asset.asset_type as 'character' | 'location' | 'prop',
      assetName: asset.name,
      mode: mode as 'generate_single' | 'generate_all' | 'generate_variations' | 'generate_look',
      imageType: viewType as 'front' | 'profile' | 'back' | 'three_quarter' | 'custom' | undefined,
      prompt: optimizedPrompt,
      fullPrompt,
      style,
      styleConfig,
      model: textToImageModel,
      falEndpoint: getFalEndpoint(textToImageModel),
      frontReferenceUrl,
      sourceImageUrl,
      inspirationImageUrls, // For image-to-image generation (locations)
      lookId,
      lookName,
      lookDescription,
      resolution,
    };

    // Enqueue the job
    try {
      await enqueueImageGen(jobData);
      console.log(`[GenerateImages] Job ${job.id} enqueued for asset ${assetId} (mode: ${mode})`);
    } catch (queueError) {
      console.error('[GenerateImages] Failed to enqueue:', queueError);

      await supabase
        .from('generation_jobs')
        .update({
          status: 'failed',
          error_message: queueError instanceof Error ? queueError.message : 'Failed to enqueue',
        })
        .eq('id', job.id);

      return NextResponse.json(
        { error: 'Failed to enqueue job', details: queueError instanceof Error ? queueError.message : 'Unknown' },
        { status: 500 }
      );
    }

    // Return job ID immediately
    return NextResponse.json({
      success: true,
      jobId: job.id,
      status: 'queued',
      message: 'Job enqueued successfully',
      // For backward compatibility with frontend expecting immediate results
      async: true,
      // Include optimized prompt for debugging/display
      optimizedPrompt,
    });

  } catch (error) {
    console.error('[GenerateImages] Error:', error);
    if (isCreditError(error)) {
      return NextResponse.json(
        { error: formatCreditError(error), code: error.code },
        { status: 402 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve image metadata (unchanged)
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { assetId } = await params;
    const supabase = createServerSupabaseClient();

    const { data: asset, error } = await supabase
      .from('global_assets')
      .select('id, name, data, reference_images')
      .eq('id', assetId)
      .eq('user_id', session.user.sub)
      .single();

    if (error || !asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const assetData = asset.data as Record<string, unknown>;
    const referenceImages = (assetData.reference_images_metadata as ReferenceImage[]) || [];

    return NextResponse.json({
      assetId: asset.id,
      name: asset.name,
      referenceImages,
      imageUrls: asset.reference_images || [],
    });

  } catch (error) {
    console.error('Error fetching character images:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
