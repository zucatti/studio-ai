import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { uploadFile, getSignedFileUrl, parseStorageUrl, STORAGE_BUCKET } from '@/lib/storage';
import { createClaudeWrapper, extractTextContent, isCreditError, formatCreditError } from '@/lib/ai';
import { createCreditService, ensureCredit, calculateFalCost } from '@/lib/credits';

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
  aspectRatioParam: string; // How aspect ratio is passed to the API
}> = {
  'fal-ai/nano-banana-2': {
    name: 'Nano Banana 2',
    description: 'Google Gemini 3.1 Flash - Rapide et haute qualité, 4K',
    supportsReference: false,
    aspectRatioParam: 'aspect_ratio', // supports: auto, 21:9, 16:9, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, 9:16
  },
  'fal-ai/flux-pro/v1.1': {
    name: 'Flux Pro 1.1',
    description: 'Black Forest Labs - Très haute qualité',
    supportsReference: false,
    aspectRatioParam: 'image_size',
  },
  'fal-ai/ideogram/character': {
    name: 'Ideogram Character',
    description: 'Consistance de personnage avec référence',
    supportsReference: true,
    aspectRatioParam: 'image_size',
  },
};

// Style configurations for fal.ai
const STYLE_CONFIG: Record<string, {
  promptPrefix: string;
  promptSuffix: string;
  renderingSpeed: 'TURBO' | 'BALANCED' | 'QUALITY';
  ideogramStyle: 'AUTO' | 'REALISTIC' | 'FICTION';
  resolution: '1K' | '2K' | '4K'; // For Nano Banana 2
}> = {
  photorealistic: {
    promptPrefix: 'photorealistic, cinematic still, professional photography, 8k uhd, ',
    promptSuffix: ', highly detailed, sharp focus, cinematic lighting',
    renderingSpeed: 'QUALITY',
    ideogramStyle: 'REALISTIC',
    resolution: '4K', // High quality for photorealistic
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
const CHARACTER_VIEWS: { name: CharacterImageType; label: string; promptSuffix: string; perspectiveTarget: string }[] = [
  { name: 'front', label: 'Face (Vue de face)', promptSuffix: 'front view, facing camera, looking straight ahead', perspectiveTarget: 'front' },
  { name: 'profile', label: 'Profil (Vue de cote)', promptSuffix: 'side profile view, looking to the side, 3/4 view', perspectiveTarget: 'three_quarter_right' },
  { name: 'back', label: 'Dos (Vue arriere)', promptSuffix: 'back view, facing away from camera, rear view, back of head visible', perspectiveTarget: 'back' },
];

type PerspectiveTarget = 'front' | 'left_side' | 'right_side' | 'back' | 'top_down' | 'bottom_up' | 'birds_eye' | 'three_quarter_left' | 'three_quarter_right';

// Translate and optimize prompt using Claude (with credit management)
async function optimizePrompt(
  frenchDescription: string,
  style: string,
  claudeWrapper: ReturnType<typeof createClaudeWrapper>,
  assetType: 'character' | 'location' | 'prop' = 'character'
): Promise<string> {
  if (!process.env.AI_CLAUDE_KEY) {
    return frenchDescription;
  }

  // Different prompts based on asset type
  let systemPrompt: string;

  if (assetType === 'location') {
    systemPrompt = `Convert this French description into an optimized English prompt for location/environment image generation.

Style: ${style}
Focus on the PLACE: architecture, lighting, atmosphere, colors, textures, spatial composition.
DO NOT include any people or characters in the scene - this is an EMPTY location.

French description:
"${frenchDescription}"

Rules:
- Translate to English
- Keep it concise (max 60 words)
- Focus on architectural and environmental details
- Describe lighting, mood, atmosphere
- Include specific details about materials, colors, textures
- DO NOT mention any people, characters, or human figures
- This should be an empty scene showing only the location

Return ONLY the optimized English prompt, nothing else.`;
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

  const result = await claudeWrapper.createMessage({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: systemPrompt,
      },
    ],
  });

  return extractTextContent(result.message).trim() || frenchDescription;
}

// Build a look prompt using character morphology and look description (with credit management)
async function buildLookPrompt(
  assetData: Record<string, unknown>,
  lookDescription: string,
  style: string,
  claudeWrapper: ReturnType<typeof createClaudeWrapper>
): Promise<string> {
  if (!process.env.AI_CLAUDE_KEY) {
    return lookDescription;
  }

  // Extract character morphology data
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
      sourceImageUrl, // Used when generating variations from an uploaded image
      style = 'photorealistic',
      viewType, // For single view generation: 'front' | 'profile' | 'back'
      lookDescription, // For look generation
      lookName, // Name of the look being generated
      model, // Optional: 'fal-ai/nano-banana-2' | 'fal-ai/flux-pro/v1.1'
    } = body;

    // Determine which model to use (default to Nano Banana 2)
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

    // Support characters, locations, and props
    const supportedTypes = ['character', 'location', 'prop'];
    if (!supportedTypes.includes(asset.asset_type)) {
      return NextResponse.json({ error: `Asset type '${asset.asset_type}' is not supported for image generation` }, { status: 400 });
    }

    const assetData = asset.data as Record<string, unknown>;
    const visualDescription = (assetData.visual_description as string) || (assetData.description as string) || '';
    const existingReferenceImages: ReferenceImage[] =
      (assetData.reference_images_metadata as ReferenceImage[] | undefined) || [];
    const hasFrontImage = existingReferenceImages.some(img => img.type === 'front');

    // For non-character assets, only 'generate_single' mode is supported
    if (asset.asset_type !== 'character' && mode !== 'generate_single') {
      return NextResponse.json({ error: `Mode '${mode}' is only supported for characters. Use 'generate_single' for locations/props.` }, { status: 400 });
    }

    // Allow generation if we have a description OR if we have a front image to use as reference
    if (!visualDescription && mode !== 'generate_variations' && !(mode === 'generate_single' && hasFrontImage)) {
      return NextResponse.json({ error: 'No visual description provided for this asset' }, { status: 400 });
    }

    // Check API key
    if (!process.env.AI_FAL_KEY) {
      return NextResponse.json({ error: 'fal.ai API key not configured (AI_FAL_KEY)' }, { status: 500 });
    }

    const styleConfig = STYLE_CONFIG[style] || STYLE_CONFIG.photorealistic;

    // Initialize fal.ai
    const { fal } = await import('@fal-ai/client');
    fal.config({
      credentials: process.env.AI_FAL_KEY,
    });

    // Initialize Claude wrapper and credit service for credit management
    const claudeWrapper = createClaudeWrapper({
      userId: session.user.sub,
      supabase,
      operation: 'optimize-character-prompt',
    });

    const creditService = createCreditService(supabase);

    // Helper to log fal.ai usage with resolution-aware pricing
    const logFalUsage = async (endpoint: string, success: boolean, error?: string, resolution?: string) => {
      // For Nano Banana 2, use resolution-specific pricing
      let costEndpoint = endpoint;
      if (endpoint === DEFAULT_TEXT_TO_IMAGE_MODEL && resolution) {
        costEndpoint = `${endpoint}/${resolution}`;
      }
      const cost = calculateFalCost(costEndpoint, 1);
      await creditService.logUsage(session.user.sub, {
        provider: 'fal',
        endpoint: costEndpoint,
        operation: `generate-character-image-${mode}`,
        estimated_cost: success ? cost : 0,
        status: success ? 'success' : 'failed',
        error_message: error,
      });
    };

    // Helper to check fal.ai budget before calls
    const checkFalBudget = async (endpoint: string) => {
      const estimatedCost = calculateFalCost(endpoint, 1);
      try {
        await ensureCredit(creditService, session.user.sub, 'fal', estimatedCost);
      } catch (error) {
        if (isCreditError(error)) {
          throw error; // Re-throw to be caught by outer handler
        }
        throw error;
      }
    };

    // Helper to upload image to fal.ai storage
    const uploadToFalStorage = async (imageUrl: string): Promise<string> => {
      if (imageUrl.includes('fal.media') || imageUrl.includes('fal-cdn')) {
        return imageUrl;
      }

      // Blob URLs are client-side only and cannot be fetched from the server
      if (imageUrl.startsWith('blob:')) {
        throw new Error('Cannot use blob URL on server. Please save the image first before generating new views.');
      }

      // Convert b2:// URLs to signed URLs first
      let fetchUrl = imageUrl;

      // Only convert b2:// protocol URLs, not Supabase HTTP URLs
      if (imageUrl.startsWith('b2://')) {
        const parsed = parseStorageUrl(imageUrl);
        if (parsed) {
          console.log(`Converting b2:// URL to signed URL: ${imageUrl}`);
          fetchUrl = await getSignedFileUrl(parsed.key);
          console.log(`Signed URL obtained: ${fetchUrl.substring(0, 100)}...`);
        }
      }
      // For Supabase or other HTTP URLs, use them directly

      console.log(`Uploading to fal.ai storage from: ${fetchUrl.substring(0, 100)}...`);
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
    const uploadToB2 = async (imageUrl: string, imageName: string): Promise<string> => {
      const imageResponse = await fetch(imageUrl);
      const imageBlob = await imageResponse.blob();
      const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());

      const sanitizedUserId = session.user.sub.replace(/[|]/g, '_');
      const storageKey = `characters/${sanitizedUserId}/${assetId}/${imageName}_${Date.now()}.webp`;

      await uploadFile(storageKey, imageBuffer, 'image/webp');

      // Return B2 URL format for database storage
      return `b2://${STORAGE_BUCKET}/${storageKey}`;
    };

    // Helper to build text-to-image input based on model
    const buildTextToImageInput = (prompt: string) => {
      const modelConfig = MODEL_CONFIG[textToImageModel];

      if (textToImageModel === 'fal-ai/flux-pro/v1.1') {
        // Flux Pro uses image_size parameter
        return {
          prompt,
          image_size: 'portrait_4_3', // Flux Pro format
          num_images: 1,
        };
      } else {
        // Nano Banana 2 uses aspect_ratio and image_resolution
        return {
          prompt,
          aspect_ratio: '3:4', // Portrait format
          image_resolution: styleConfig.resolution,
          num_images: 1,
        };
      }
    };

    const generatedImages: ReferenceImage[] = [];
    const existingImages = (asset.reference_images || []) as string[];

    try {
      if (mode === 'generate_all') {
        // Generate all 3 views (front, profile, back) from text description
        console.log(`=== Generating all views for character: ${asset.name} ===`);

        // Check budget for fal.ai calls (estimate 4-5 calls for all views)
        await checkFalBudget(textToImageModel);

        // Optimize prompt with asset type for appropriate context
        const optimizedDescription = await optimizePrompt(visualDescription, style, claudeWrapper, asset.asset_type as 'character' | 'location' | 'prop');
        console.log(`Optimized description: ${optimizedDescription}`);

        // Step 1: Generate front view
        console.log(`Step 1: Generating front view with ${MODEL_CONFIG[textToImageModel]?.name || textToImageModel}...`);
        const frontPrompt = `${styleConfig.promptPrefix}${optimizedDescription}, front view, facing camera, full body portrait, standing pose${styleConfig.promptSuffix}`;

        const frontResult = await fal.subscribe(textToImageModel, {
          input: buildTextToImageInput(frontPrompt),
          logs: true,
        });

        const frontImageUrl = (frontResult.data as any)?.images?.[0]?.url;
        await logFalUsage(textToImageModel, !!frontImageUrl, frontImageUrl ? undefined : 'No image generated', styleConfig.resolution);

        if (!frontImageUrl) {
          throw new Error('Failed to generate front view');
        }

        const frontPublicUrl = await uploadToB2(frontImageUrl, 'front');
        generatedImages.push({ url: frontPublicUrl, type: 'front', label: 'Face (Vue de face)' });
        console.log('Front view uploaded:', frontPublicUrl);

        // Step 2 & 3: Generate profile and back views using perspective change or Ideogram
        const otherViews = CHARACTER_VIEWS.filter(v => v.name !== 'front');

        for (const view of otherViews) {
          console.log(`Generating ${view.name} view...`);

          try {
            // Try perspective change first
            const falFrontImageUrl = await uploadToFalStorage(frontImageUrl);

            const perspectiveResult = await fal.subscribe('fal-ai/image-apps-v2/perspective', {
              input: {
                image_url: falFrontImageUrl,
                target_perspective: view.perspectiveTarget as PerspectiveTarget,
                aspect_ratio: { ratio: '3:4' },
              } as any,
              logs: true,
            });

            const viewImageUrl = (perspectiveResult.data as any)?.images?.[0]?.url;

            if (viewImageUrl) {
              const publicUrl = await uploadToB2(viewImageUrl, view.name);
              generatedImages.push({ url: publicUrl, type: view.name, label: view.label });
              console.log(`${view.name} view uploaded:`, publicUrl);
            } else {
              throw new Error('No image from perspective change');
            }
          } catch (perspectiveError) {
            console.log(`Perspective change failed for ${view.name}, using Ideogram fallback...`);

            // Fallback to Ideogram Character
            const falFrontImageUrl = await uploadToFalStorage(frontImageUrl);
            const viewPrompt = `${styleConfig.promptPrefix}${optimizedDescription}, ${view.promptSuffix}, full body portrait${styleConfig.promptSuffix}`;

            const fallbackResult = await fal.subscribe('fal-ai/ideogram/character', {
              input: {
                prompt: viewPrompt,
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
              const publicUrl = await uploadToB2(fallbackUrl, view.name);
              generatedImages.push({ url: publicUrl, type: view.name, label: view.label });
              console.log(`${view.name} view (fallback) uploaded:`, publicUrl);
            } else {
              console.error(`Failed to generate ${view.name} view`);
            }
          }
        }

      } else if (mode === 'generate_variations') {
        // Generate profile and back from an existing uploaded image
        if (!sourceImageUrl) {
          return NextResponse.json({ error: 'sourceImageUrl required for generate_variations mode' }, { status: 400 });
        }

        console.log(`=== Generating variations from uploaded image for: ${asset.name} ===`);

        // Keep the source image as front view
        const existingFront = existingReferenceImages.find(img => img.type === 'front');
        if (!existingFront) {
          generatedImages.push({ url: sourceImageUrl, type: 'front', label: 'Face (Vue de face)' });
        }

        // Upload source to fal.ai storage
        const falSourceUrl = await uploadToFalStorage(sourceImageUrl);

        // Generate profile and back views
        const viewsToGenerate = CHARACTER_VIEWS.filter(v => v.name !== 'front');

        for (const view of viewsToGenerate) {
          console.log(`Generating ${view.name} view from uploaded image...`);

          try {
            const perspectiveResult = await fal.subscribe('fal-ai/image-apps-v2/perspective', {
              input: {
                image_url: falSourceUrl,
                target_perspective: view.perspectiveTarget as PerspectiveTarget,
                aspect_ratio: { ratio: '3:4' },
              } as any,
              logs: true,
            });

            const viewImageUrl = (perspectiveResult.data as any)?.images?.[0]?.url;

            if (viewImageUrl) {
              const publicUrl = await uploadToB2(viewImageUrl, view.name);
              generatedImages.push({ url: publicUrl, type: view.name, label: view.label });
              console.log(`${view.name} view uploaded:`, publicUrl);
            } else {
              throw new Error('No image from perspective change');
            }
          } catch (error) {
            console.error(`Failed to generate ${view.name} view:`, error);
            // Try with Ideogram if we have a visual description
            if (visualDescription) {
              console.log(`Trying Ideogram fallback for ${view.name}...`);
              const optimizedDescription = await optimizePrompt(visualDescription, style, claudeWrapper, asset.asset_type as 'character' | 'location' | 'prop');
              const viewPrompt = `${styleConfig.promptPrefix}${optimizedDescription}, ${view.promptSuffix}, full body portrait${styleConfig.promptSuffix}`;

              const fallbackResult = await fal.subscribe('fal-ai/ideogram/character', {
                input: {
                  prompt: viewPrompt,
                  reference_image_urls: [falSourceUrl],
                  rendering_speed: styleConfig.renderingSpeed,
                  style: styleConfig.ideogramStyle,
                  image_size: 'portrait_4_3',
                  num_images: 1,
                } as any,
                logs: true,
              });

              const fallbackUrl = (fallbackResult.data as any)?.images?.[0]?.url;
              if (fallbackUrl) {
                const publicUrl = await uploadToB2(fallbackUrl, view.name);
                generatedImages.push({ url: publicUrl, type: view.name, label: view.label });
                console.log(`${view.name} view (fallback) uploaded:`, publicUrl);
              }
            }
          }
        }

        // Log fal.ai usage for variations (one log per generated image)
        for (const _ of generatedImages.filter(img => img.type !== 'front')) {
          await logFalUsage('fal-ai/image-apps-v2/perspective', true);
        }

      } else if (mode === 'generate_single') {
        // Generate a single view
        if (!viewType) {
          return NextResponse.json({ error: 'viewType required for generate_single mode' }, { status: 400 });
        }

        // For three_quarter and custom, use the same config as front
        let viewConfig = CHARACTER_VIEWS.find(v => v.name === viewType);
        if (!viewConfig) {
          // Handle custom view types not in CHARACTER_VIEWS
          if (viewType === 'three_quarter') {
            viewConfig = { name: 'three_quarter', label: '3/4 (Vue trois-quarts)', promptSuffix: 'three quarter view, 3/4 angle, slight angle from front', perspectiveTarget: 'three_quarter_left' };
          } else if (viewType === 'custom') {
            viewConfig = { name: 'custom', label: 'Autre', promptSuffix: 'portrait view, natural pose', perspectiveTarget: 'front' };
          } else {
            return NextResponse.json({ error: 'Invalid viewType' }, { status: 400 });
          }
        }

        console.log(`=== Generating single ${viewType} view for: ${asset.name} ===`);

        // Check if we have an existing front view to use as reference
        const existingFront = existingReferenceImages.find(img => img.type === 'front');

        let imageUrl: string = '';

        if (existingFront && viewType !== 'front') {
          // Use existing front as reference - can work without visual description
          const falFrontUrl = await uploadToFalStorage(existingFront.url);

          // For perspective views (profile, back, three_quarter), try perspective change first
          const isPerspectiveView = ['profile', 'back', 'three_quarter'].includes(viewType);

          if (isPerspectiveView) {
            console.log(`Trying perspective change for ${viewType} view...`);
            try {
              const perspectiveResult = await fal.subscribe('fal-ai/image-apps-v2/perspective', {
                input: {
                  image_url: falFrontUrl,
                  target_perspective: viewConfig.perspectiveTarget as PerspectiveTarget,
                  aspect_ratio: { ratio: '3:4' },
                } as any,
                logs: true,
              });

              imageUrl = (perspectiveResult.data as any)?.images?.[0]?.url;
              if (imageUrl) {
                console.log(`Perspective change succeeded for ${viewType}`);
              }
            } catch (perspectiveError) {
              console.log(`Perspective change failed for ${viewType}, falling back to ideogram...`, perspectiveError);
              imageUrl = '';
            }
          }

          // Fallback to ideogram/character if perspective failed or for custom views
          if (!imageUrl) {
            // Build prompt - use visual description if available, otherwise use a generic prompt
            let viewPrompt: string;
            if (visualDescription) {
              const optimizedDescription = await optimizePrompt(visualDescription, style, claudeWrapper, asset.asset_type as 'character' | 'location' | 'prop');
              viewPrompt = `${styleConfig.promptPrefix}${optimizedDescription}, ${viewConfig.promptSuffix}, full body portrait${styleConfig.promptSuffix}`;
            } else {
              // Generic prompt when no description - rely on reference image
              viewPrompt = `${styleConfig.promptPrefix}same person as reference image, ${viewConfig.promptSuffix}, full body portrait, consistent character${styleConfig.promptSuffix}`;
            }

            const result = await fal.subscribe('fal-ai/ideogram/character', {
              input: {
                prompt: viewPrompt,
                reference_image_urls: [falFrontUrl],
                rendering_speed: styleConfig.renderingSpeed,
                style: styleConfig.ideogramStyle,
                image_size: 'portrait_4_3',
                num_images: 1,
              } as any,
              logs: true,
            });

            imageUrl = (result.data as any)?.images?.[0]?.url;
          }
        } else {
          // Generate fresh - requires visual description
          if (!visualDescription) {
            return NextResponse.json({ error: 'Visual description required to generate front view from scratch' }, { status: 400 });
          }

          const optimizedDescription = await optimizePrompt(visualDescription, style, claudeWrapper, asset.asset_type as 'character' | 'location' | 'prop');
          const viewPrompt = `${styleConfig.promptPrefix}${optimizedDescription}, ${viewConfig.promptSuffix}, full body portrait${styleConfig.promptSuffix}`;

          // Use selected model for text-to-image generation
          const result = await fal.subscribe(textToImageModel, {
            input: buildTextToImageInput(viewPrompt),
            logs: true,
          });

          imageUrl = (result.data as any)?.images?.[0]?.url;
        }

        if (!imageUrl) {
          throw new Error(`Failed to generate ${viewType} view`);
        }

        // Log fal.ai usage for single view generation
        await logFalUsage(textToImageModel, true);

        const publicUrl = await uploadToB2(imageUrl, viewType);
        generatedImages.push({ url: publicUrl, type: viewType as CharacterImageType, label: viewConfig.label });
        console.log(`${viewType} view uploaded:`, publicUrl);

      } else if (mode === 'generate_look') {
        // Generate a look/outfit variation
        if (!lookDescription) {
          return NextResponse.json({ error: 'lookDescription required for generate_look mode' }, { status: 400 });
        }

        console.log(`=== Generating look for character: ${asset.name} ===`);
        console.log(`Look description: ${lookDescription}`);

        // Build optimized prompt using character morphology + look description
        const optimizedPrompt = await buildLookPrompt(assetData, lookDescription, style, claudeWrapper);
        console.log(`Optimized look prompt: ${optimizedPrompt}`);

        const fullPrompt = `${styleConfig.promptPrefix}${optimizedPrompt}, full body portrait, standing pose, fashion photography${styleConfig.promptSuffix}`;

        // Check if we have a front reference image to use
        const existingFront = existingReferenceImages.find(img => img.type === 'front');

        let lookImageUrl: string;

        if (existingFront) {
          // Use reference image for character consistency
          const falFrontUrl = await uploadToFalStorage(existingFront.url);

          const result = await fal.subscribe('fal-ai/ideogram/character', {
            input: {
              prompt: fullPrompt,
              reference_image_urls: [falFrontUrl],
              rendering_speed: styleConfig.renderingSpeed,
              style: styleConfig.ideogramStyle,
              image_size: 'portrait_4_3',
              num_images: 1,
            } as any,
            logs: true,
          });

          lookImageUrl = (result.data as any)?.images?.[0]?.url;
        } else {
          // Generate without reference - use selected model
          const result = await fal.subscribe(textToImageModel, {
            input: buildTextToImageInput(fullPrompt),
            logs: true,
          });

          lookImageUrl = (result.data as any)?.images?.[0]?.url;
        }

        if (!lookImageUrl) {
          throw new Error('Failed to generate look image');
        }

        // Upload to B2 with look-specific naming
        const lookId = crypto.randomUUID();
        const sanitizedUserId = session.user.sub.replace(/[|]/g, '_');
        const storageKey = `characters/${sanitizedUserId}/${assetId}/look_${lookId}_${Date.now()}.webp`;

        const imageResponse = await fetch(lookImageUrl);
        const imageBlob = await imageResponse.blob();
        const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());

        await uploadFile(storageKey, imageBuffer, 'image/webp');
        const publicUrl = `b2://${STORAGE_BUCKET}/${storageKey}`;

        console.log(`Look image uploaded:`, publicUrl);

        // Log fal.ai usage for look generation
        await logFalUsage('fal-ai/ideogram/character', true);

        // Return the look data (the caller will add it to the looks array)
        return NextResponse.json({
          success: true,
          look: {
            id: lookId,
            name: lookName || 'Look généré',
            description: lookDescription,
            imageUrl: publicUrl,
          },
        });
      }

      // Merge with existing images (replace same types)
      const allReferenceImages = [...existingReferenceImages];
      for (const newImg of generatedImages) {
        const existingIndex = allReferenceImages.findIndex(img => img.type === newImg.type);
        if (existingIndex >= 0) {
          allReferenceImages[existingIndex] = newImg;
        } else {
          allReferenceImages.push(newImg);
        }
      }

      // Update global asset with new images
      const imageUrls = allReferenceImages.map(img => img.url);
      const updatedData = {
        ...assetData,
        reference_images_metadata: allReferenceImages,
      };

      await supabase
        .from('global_assets')
        .update({
          reference_images: imageUrls,
          data: updatedData,
        })
        .eq('id', assetId);

      console.log(`Generated ${generatedImages.length} image(s) for character: ${asset.name}`);

      return NextResponse.json({
        success: true,
        generatedImages,
        allImages: allReferenceImages,
        imageUrls,
      });

    } catch (genError) {
      console.error('Generation error:', genError);
      // Handle credit errors
      if (isCreditError(genError)) {
        return NextResponse.json(
          { error: formatCreditError(genError), code: genError.code },
          { status: 402 }
        );
      }
      return NextResponse.json({ error: 'Generation failed: ' + String(genError) }, { status: 500 });
    }

  } catch (error) {
    console.error('Error generating character images:', error);
    // Handle credit errors at top level
    if (isCreditError(error)) {
      return NextResponse.json(
        { error: formatCreditError(error), code: error.code },
        { status: 402 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to generate images: ' + String(error) },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve image metadata
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
