import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import Replicate from 'replicate';
import Anthropic from '@anthropic-ai/sdk';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

const STORYBOARD_STYLE_PREFIX = `single cinematic scene, pencil sketch illustration, black and white drawing, graphite on paper, hand-drawn artwork, dramatic lighting, film noir style, professional concept art, `;

const STORYBOARD_STYLE_SUFFIX = `, detailed linework, crosshatching shading, monochrome, grayscale, artistic sketch`;

const NEGATIVE_PROMPT = `multiple panels, grid, collage, comic strip, photograph, photorealistic, 3d render, color, colorful, vibrant, saturated, anime, cartoon, low quality, blurry, text, watermark, border, frame, split screen`;

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
    if (!process.env.AI_REPLICATE_KEY) {
      return NextResponse.json({ error: 'Replicate API key not configured' }, { status: 500 });
    }

    // Initialize Replicate
    const replicate = new Replicate({
      auth: process.env.AI_REPLICATE_KEY,
    });

    // Update status to generating
    await supabase
      .from('shots')
      .update({ generation_status: 'generating' })
      .eq('id', shotToGenerate.id);

    // Optimize prompt using Claude (translate French to English + optimize for SDXL)
    console.log(`Optimizing prompt for shot ${shotToGenerate.id}...`);
    const optimizedDescription = await optimizePromptForSDXL(
      shotToGenerate.description,
      shotToGenerate.sceneContext,
      shotToGenerate.shotType,
      shotToGenerate.cameraAngle
    );

    const prompt = STORYBOARD_STYLE_PREFIX + optimizedDescription + STORYBOARD_STYLE_SUFFIX;

    console.log(`Generating storyboard for shot ${shotToGenerate.id}...`);

    // Generate image
    const output = await replicate.run(
      "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc",
      {
        input: {
          prompt: prompt,
          negative_prompt: NEGATIVE_PROMPT,
          width: 1024,
          height: 576,
          num_outputs: 1,
          scheduler: "K_EULER",
          num_inference_steps: 35,
          guidance_scale: 9,
          refine: "expert_ensemble_refiner",
          high_noise_frac: 0.75,
        }
      }
    );

    // Extract image URL
    let imageUrl: string | null = null;
    if (Array.isArray(output) && output.length > 0) {
      imageUrl = String(output[0]);
    } else if (typeof output === 'string') {
      imageUrl = output;
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
