import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import Replicate from 'replicate';
import Anthropic from '@anthropic-ai/sdk';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// Style configurations
const STYLE_CONFIG: Record<string, {
  model: string;
  promptPrefix: string;
  promptSuffix: string;
  negativePrompt: string;
}> = {
  photorealistic: {
    model: 'black-forest-labs/flux-1.1-pro',
    promptPrefix: 'photorealistic, cinematic still, professional photography, 8k uhd, ',
    promptSuffix: ', highly detailed, sharp focus, cinematic lighting, film grain',
    negativePrompt: 'cartoon, anime, drawing, painting, illustration, low quality, blurry',
  },
  cartoon: {
    model: 'stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc',
    promptPrefix: 'pixar style, disney animation, 3d cartoon character, vibrant colors, ',
    promptSuffix: ', stylized, expressive, professional animation quality',
    negativePrompt: 'photorealistic, photo, realistic, dark, gritty, horror',
  },
  anime: {
    model: 'stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc',
    promptPrefix: 'anime style, japanese animation, studio ghibli inspired, ',
    promptSuffix: ', detailed anime artwork, cel shaded, vibrant',
    negativePrompt: 'photorealistic, photo, realistic, western cartoon, 3d render',
  },
  cyberpunk: {
    model: 'stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc',
    promptPrefix: 'cyberpunk style, neon lights, futuristic, blade runner aesthetic, ',
    promptSuffix: ', high tech, dystopian, rain, reflections, cinematic',
    negativePrompt: 'medieval, fantasy, natural, bright daylight, cheerful',
  },
  noir: {
    model: 'stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc',
    promptPrefix: 'film noir style, black and white, high contrast, dramatic shadows, ',
    promptSuffix: ', 1940s aesthetic, moody, atmospheric, cinematic',
    negativePrompt: 'colorful, bright, cheerful, modern, cartoon',
  },
  watercolor: {
    model: 'stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc',
    promptPrefix: 'watercolor painting, artistic, soft edges, flowing colors, ',
    promptSuffix: ', traditional art, painterly, delicate brushstrokes',
    negativePrompt: 'photorealistic, sharp, digital art, 3d render, cartoon',
  },
};

// Aspect ratios per entity type
// Characters: 9:16 (portrait), Props/Locations: 16:9 (landscape)
const ASPECT_RATIOS: Record<string, { flux: string; sdxlWidth: number; sdxlHeight: number }> = {
  character: { flux: '9:16', sdxlWidth: 768, sdxlHeight: 1344 },
  prop: { flux: '16:9', sdxlWidth: 1344, sdxlHeight: 768 },
  location: { flux: '16:9', sdxlWidth: 1344, sdxlHeight: 768 },
};

// Character view configurations for multi-view generation
const CHARACTER_VIEWS = [
  { name: 'front', prompt: 'front view, facing camera, full body portrait' },
  { name: 'profile', prompt: 'side profile view, looking left, full body portrait' },
  { name: 'back', prompt: 'back view, facing away from camera, full body portrait' },
];

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
    character: 'Focus on the person: face, body type, clothing, pose. Use portrait or full body framing.',
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
- Keep it concise (max 40 words)
- Focus on visual elements only
- Do NOT include style keywords (they will be added separately)
- Be specific about visual details

Return ONLY the optimized English prompt, nothing else.`,
      },
    ],
  });

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
    if (!process.env.AI_REPLICATE_KEY) {
      return NextResponse.json({ error: 'Replicate API key not configured' }, { status: 500 });
    }

    // Update status to generating with progress info
    const totalImages = (multiView && entityType === 'character') ? 3 : 1;
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

    // Get aspect ratio for entity type
    const aspectRatio = ASPECT_RATIOS[entityType] || ASPECT_RATIOS.character;

    // Initialize Replicate
    const replicate = new Replicate({
      auth: process.env.AI_REPLICATE_KEY,
    });

    // Helper to extract URL from FileOutput or other formats
    const extractUrl = (item: unknown): string | null => {
      if (!item) return null;
      if (typeof item === 'string' && item.startsWith('http')) {
        return item;
      }
      if (typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        if (typeof obj.url === 'function') {
          try {
            const urlObj = (obj.url as () => URL)();
            if (urlObj && urlObj.href) return urlObj.href;
          } catch (e) {
            console.error('Error calling url():', e);
          }
        }
        if (typeof obj.href === 'string') return obj.href;
        if (typeof obj.url === 'string') return obj.url;
      }
      return null;
    };

    // Helper to wait
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Helper to generate a single image with retry on 429
    const generateSingleImage = async (prompt: string, retries = 3): Promise<string | null> => {
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          let output: unknown;

          if (style === 'photorealistic') {
            output = await replicate.run(styleConfig.model as `${string}/${string}`, {
              input: {
                prompt,
                aspect_ratio: aspectRatio.flux,
                output_format: 'webp',
                output_quality: 90,
              },
            });
          } else {
            output = await replicate.run(styleConfig.model as `${string}/${string}:${string}`, {
              input: {
                prompt,
                negative_prompt: styleConfig.negativePrompt,
                width: aspectRatio.sdxlWidth,
                height: aspectRatio.sdxlHeight,
                num_outputs: 1,
                scheduler: 'K_EULER',
                num_inference_steps: 30,
                guidance_scale: 7.5,
              },
            });
          }

          const outputItem = Array.isArray(output) ? output[0] : output;
          return extractUrl(outputItem);
        } catch (error: unknown) {
          const err = error as { status?: number; message?: string };
          const isRateLimit = err.status === 429 || (err.message && err.message.includes('429'));

          if (isRateLimit && attempt < retries - 1) {
            const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
            console.log(`Rate limited, waiting ${delay}ms before retry ${attempt + 2}/${retries}`);
            await wait(delay);
            continue;
          }
          throw error;
        }
      }
      return null;
    };

    // Helper to upload image to Supabase
    const uploadImage = async (imageUrl: string, suffix: string): Promise<string> => {
      const imageResponse = await fetch(imageUrl);
      const imageBlob = await imageResponse.blob();
      const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());

      const fileName = `${session.user.sub.replace(/[|]/g, '_')}/${projectId}/${entityType}_${entityId}_${suffix}_${Date.now()}.webp`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('project-assets')
        .upload(fileName, imageBuffer, {
          contentType: 'image/webp',
          upsert: true,
        });

      if (uploadError) {
        throw new Error('Failed to upload: ' + uploadError.message);
      }

      const { data: urlData } = supabase.storage
        .from('project-assets')
        .getPublicUrl(uploadData.path);

      return urlData.publicUrl;
    };

    try {
      const uploadedUrls: string[] = [];

      if (useMultiView) {
        // Generate 3 views for characters: front, profile, back
        console.log(`Generating multi-view (3 images) for character: ${entity.name}`);

        for (let i = 0; i < CHARACTER_VIEWS.length; i++) {
          const view = CHARACTER_VIEWS[i];

          // Add delay between generations to avoid rate limits
          if (i > 0) {
            console.log('Waiting 1.5s before next generation...');
            await wait(1500);
          }

          const viewPrompt = styleConfig.promptPrefix + optimizedDescription + ', ' + view.prompt + styleConfig.promptSuffix;
          console.log(`Generating ${view.name} view:`, viewPrompt);

          const imageUrl = await generateSingleImage(viewPrompt);
          if (!imageUrl) {
            throw new Error(`Failed to generate ${view.name} view`);
          }

          const publicUrl = await uploadImage(imageUrl, view.name);
          uploadedUrls.push(publicUrl);
          console.log(`Uploaded ${view.name} view:`, publicUrl);

          // Update progress
          await supabase
            .from(tableName)
            .update({
              generation_progress: JSON.stringify({ current: i + 1, total: CHARACTER_VIEWS.length }),
              reference_images: uploadedUrls, // Save partial results
            })
            .eq('id', entityId);
        }
      } else {
        // Single image generation
        const fullPrompt = styleConfig.promptPrefix + optimizedDescription + styleConfig.promptSuffix;
        console.log('Full prompt:', fullPrompt);

        const imageUrl = await generateSingleImage(fullPrompt);
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

      return NextResponse.json({
        success: true,
        imageUrls: uploadedUrls,
        imageUrl: uploadedUrls[0], // For backwards compatibility
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
