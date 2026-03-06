import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import Replicate from 'replicate';
import Anthropic from '@anthropic-ai/sdk';

interface RouteParams {
  params: Promise<{ projectId: string; shotId: string }>;
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

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shotId } = await params;
    console.log('Generating storyboard for shot:', shotId, 'project:', projectId);

    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (projectError) {
      console.error('Project error:', projectError);
    }

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get the shot with its scene
    const { data: shot, error: shotError } = await supabase
      .from('shots')
      .select(`
        *,
        scenes (
          id,
          project_id,
          location,
          time_of_day,
          int_ext
        )
      `)
      .eq('id', shotId)
      .single();

    if (shotError) {
      console.error('Shot error:', shotError);
    }

    console.log('Shot data:', JSON.stringify(shot, null, 2));

    if (!shot) {
      return NextResponse.json({ error: 'Shot not found' }, { status: 404 });
    }

    // Get scene from the relation
    const scene = shot.scenes;

    // Build scene context
    const sceneContext = scene
      ? `${scene.int_ext} ${scene.location} ${scene.time_of_day}`
      : '';

    // Optimize prompt using Claude (translate French to English + optimize for SDXL)
    console.log('Optimizing prompt with Claude...');
    const optimizedDescription = await optimizePromptForSDXL(
      shot.description,
      sceneContext,
      shot.shot_type,
      shot.camera_angle
    );

    const prompt = STORYBOARD_STYLE_PREFIX + optimizedDescription + STORYBOARD_STYLE_SUFFIX;
    console.log('Final prompt:', prompt.substring(0, 300) + '...');

    // Check API key
    if (!process.env.AI_REPLICATE_KEY) {
      console.error('AI_REPLICATE_KEY is not set');
      return NextResponse.json({ error: 'Replicate API key not configured' }, { status: 500 });
    }

    // Delete existing storyboard image from storage if regenerating
    if (shot.storyboard_image_url) {
      const match = shot.storyboard_image_url.match(/project-assets\/(.+)$/);
      if (match) {
        await supabase.storage
          .from('project-assets')
          .remove([match[1]]);
        console.log('Deleted old storyboard:', match[1]);
      }
    }

    // Initialize Replicate
    const replicate = new Replicate({
      auth: process.env.AI_REPLICATE_KEY,
    });

    // Update shot status to generating
    await supabase
      .from('shots')
      .update({ generation_status: 'generating' })
      .eq('id', shotId);

    console.log('Calling Replicate API...');

    // Generate image with SDXL
    let output;
    try {
      output = await replicate.run(
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
      console.log('Replicate output:', output);
    } catch (replicateError) {
      console.error('Replicate API error:', replicateError);
      await supabase
        .from('shots')
        .update({ generation_status: 'failed', generation_error: String(replicateError) })
        .eq('id', shotId);
      return NextResponse.json({ error: 'Replicate API error: ' + String(replicateError) }, { status: 500 });
    }

    // Get the image URL from output
    let imageUrl: string | null = null;
    if (Array.isArray(output) && output.length > 0) {
      imageUrl = String(output[0]);
    } else if (typeof output === 'string') {
      imageUrl = output;
    } else if (output && typeof output === 'object' && 'output' in output) {
      const outputArr = (output as { output: string[] }).output;
      if (Array.isArray(outputArr) && outputArr.length > 0) {
        imageUrl = outputArr[0];
      }
    }

    console.log('Image URL:', imageUrl);

    if (!imageUrl) {
      await supabase
        .from('shots')
        .update({ generation_status: 'failed', generation_error: 'No image generated' })
        .eq('id', shotId);

      return NextResponse.json(
        { error: 'Failed to generate image' },
        { status: 500 }
      );
    }

    // Download the image and upload to Supabase Storage
    const imageResponse = await fetch(imageUrl);
    const imageBlob = await imageResponse.blob();
    const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());

    const fileName = `${session.user.sub.replace(/[|]/g, '_')}/${projectId}/${shotId}_storyboard_${Date.now()}.png`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('project-assets')
      .upload(fileName, imageBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      await supabase
        .from('shots')
        .update({ generation_status: 'failed', generation_error: 'Failed to save image' })
        .eq('id', shotId);

      return NextResponse.json(
        { error: 'Failed to save image' },
        { status: 500 }
      );
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('project-assets')
      .getPublicUrl(uploadData.path);

    // Update shot with the storyboard image URL and optimized prompt
    const { data: updatedShot, error: updateError } = await supabase
      .from('shots')
      .update({
        storyboard_image_url: urlData.publicUrl,
        storyboard_prompt: optimizedDescription,
        generation_status: 'completed',
        generation_error: null,
      })
      .eq('id', shotId)
      .select()
      .single();

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update shot' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      shot: updatedShot,
      storyboard_url: urlData.publicUrl,
    });
  } catch (error) {
    console.error('Error generating storyboard:', error);

    // Try to update status to failed
    try {
      const { projectId, shotId } = await params;
      const supabase = createServerSupabaseClient();
      await supabase
        .from('shots')
        .update({
          generation_status: 'failed',
          generation_error: error instanceof Error ? error.message : 'Unknown error'
        })
        .eq('id', shotId);
    } catch (e) {
      // Ignore
    }

    return NextResponse.json(
      { error: 'Failed to generate storyboard' },
      { status: 500 }
    );
  }
}
