import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { GENERIC_CHARACTERS } from '@/lib/generic-characters';
import { createClaudeWrapper, extractTextContent, isCreditError, formatCreditError } from '@/lib/ai';
import { createCreditService, ensureCredit, calculateFalCost } from '@/lib/credits';
import { enqueueImageGen, type ImageGenJobData } from '@/lib/bullmq';
import type { GenericAssetLocalOverrides } from '../../route';

interface RouteParams {
  params: Promise<{ projectId: string; projectGenericAssetId: string }>;
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
};

// View configurations for multi-view generation
const CHARACTER_VIEWS: { name: CharacterImageType; label: string; promptSuffix: string }[] = [
  { name: 'front', label: 'Face (Vue de face)', promptSuffix: 'front view, facing camera, looking straight ahead' },
  { name: 'profile', label: 'Profil (Vue de cote)', promptSuffix: 'side profile view, looking to the side' },
  { name: 'three_quarter', label: '3/4 (Vue trois-quarts)', promptSuffix: 'three quarter view, 3/4 angle, slightly turned' },
  { name: 'back', label: 'Dos (Vue arriere)', promptSuffix: 'back view, facing away from camera, rear view, back of head visible' },
];

// Optimize prompt with Claude
async function optimizePrompt(
  frenchDescription: string,
  style: string,
  claudeWrapper: ReturnType<typeof createClaudeWrapper>
): Promise<string> {
  if (!process.env.AI_CLAUDE_KEY) {
    return frenchDescription;
  }

  const result = await claudeWrapper.createMessage({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `Convert this French description into an optimized English prompt for character image generation.

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

Return ONLY the optimized English prompt, nothing else.`,
      },
    ],
  });

  return extractTextContent(result.message).trim() || frenchDescription;
}

// POST /api/projects/[projectId]/generic-assets/[projectGenericAssetId]/generate-images
// Generate character reference images for a generic character
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, projectGenericAssetId } = await params;
    const body = await request.json();
    const {
      mode = 'generate_single',
      style = 'photorealistic',
      viewType = 'front',
      model,
      resolution = '2K',
      visualDescription: overrideVisualDescription,
    } = body;

    const textToImageModel = model || DEFAULT_TEXT_TO_IMAGE_MODEL;

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

    // Get the generic asset
    const { data: projectAsset, error: fetchError } = await supabase
      .from('project_generic_assets')
      .select('*')
      .eq('id', projectGenericAssetId)
      .eq('project_id', projectId)
      .single();

    if (fetchError || !projectAsset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const generic = GENERIC_CHARACTERS.find((g) => g.id === projectAsset.generic_asset_id);
    if (!generic) {
      return NextResponse.json({ error: 'Generic character not found' }, { status: 404 });
    }

    const localOverrides = (projectAsset.local_overrides || {}) as GenericAssetLocalOverrides;
    const displayName = projectAsset.name_override || generic.name;

    // Get visual description from overrides or generate from name
    const visualDescription = overrideVisualDescription ||
      localOverrides.visual_description ||
      `${displayName}, anonymous character, ${localOverrides.age || ''} ${localOverrides.gender || ''}`.trim();

    if (!visualDescription) {
      return NextResponse.json({ error: 'No visual description provided' }, { status: 400 });
    }

    // Save visual description if overridden
    if (overrideVisualDescription && overrideVisualDescription !== localOverrides.visual_description) {
      const updatedOverrides = { ...localOverrides, visual_description: overrideVisualDescription };
      await supabase
        .from('project_generic_assets')
        .update({ local_overrides: updatedOverrides })
        .eq('id', projectGenericAssetId);
    }

    if (!process.env.AI_FAL_KEY) {
      return NextResponse.json({ error: 'fal.ai API key not configured' }, { status: 500 });
    }

    const styleConfig = STYLE_CONFIG[style] || STYLE_CONFIG.photorealistic;

    // Initialize Claude wrapper for prompt optimization
    const claudeWrapper = createClaudeWrapper({
      userId: session.user.sub,
      supabase,
      operation: 'optimize-generic-character-prompt',
    });

    const creditService = createCreditService(supabase);

    // Check budget
    try {
      const estimatedCost = calculateFalCost(textToImageModel, 1);
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

    // Optimize prompt with Claude
    const optimizedPrompt = await optimizePrompt(visualDescription, style, claudeWrapper);
    const viewConfig = CHARACTER_VIEWS.find(v => v.name === viewType) || CHARACTER_VIEWS[0];
    const fullPrompt = `${styleConfig.promptPrefix}${optimizedPrompt}, ${viewConfig.promptSuffix}, full body portrait${styleConfig.promptSuffix}`;

    // Get front reference if exists
    const existingImages = localOverrides.reference_images_metadata || [];
    const frontRef = existingImages.find(img => img.type === 'front');
    const frontReferenceUrl = frontRef?.url;

    // Create job record
    const { data: job, error: jobError } = await supabase
      .from('generation_jobs')
      .insert({
        user_id: session.user.sub,
        asset_id: projectGenericAssetId,
        asset_type: 'generic_character',
        asset_name: displayName,
        job_type: 'image',
        job_subtype: viewType,
        status: 'queued',
        progress: 0,
        message: 'En file d\'attente...',
        input_data: {
          mode,
          style,
          model: textToImageModel,
          viewType,
          resolution,
          projectId,
          isGenericAsset: true,
        },
        queued_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error('[GenerateGenericImages] Failed to create job:', jobError);
      return NextResponse.json(
        { error: 'Failed to create job', details: jobError?.message },
        { status: 500 }
      );
    }

    // Build job data for BullMQ
    // Note: For generic assets, we store the projectGenericAssetId in assetId
    // The worker will use the input_data.isGenericAsset flag to determine how to save results
    const jobData: Omit<ImageGenJobData, 'type'> = {
      userId: session.user.sub,
      jobId: job.id,
      createdAt: new Date().toISOString(),
      assetId: projectGenericAssetId, // This is the project_generic_asset_id
      assetType: 'character',
      assetName: displayName,
      mode: mode as 'generate_single' | 'generate_all',
      imageType: viewType as CharacterImageType,
      prompt: optimizedPrompt,
      fullPrompt,
      style,
      styleConfig,
      model: textToImageModel,
      falEndpoint: textToImageModel,
      frontReferenceUrl,
      resolution,
    };

    // Enqueue the job
    try {
      await enqueueImageGen(jobData);
      console.log(`[GenerateGenericImages] Job ${job.id} enqueued for generic asset ${projectGenericAssetId}`);
    } catch (queueError) {
      console.error('[GenerateGenericImages] Failed to enqueue:', queueError);

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

    return NextResponse.json({
      success: true,
      jobId: job.id,
      status: 'queued',
      message: 'Job enqueued successfully',
      async: true,
      optimizedPrompt,
    });
  } catch (error) {
    console.error('[GenerateGenericImages] Error:', error);
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
