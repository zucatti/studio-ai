import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { fal } from '@fal-ai/client';
import { getPublicImageUrl } from '@/lib/fal-utils';

// Configure fal.ai
fal.config({
  credentials: process.env.AI_FAL_KEY,
});

// Types
type CharacterImageType = 'front' | 'profile' | 'back' | 'three_quarter' | 'custom';
type PerspectiveTarget = 'front' | 'left_side' | 'right_side' | 'back' | 'top_down' | 'bottom_up' | 'birds_eye' | 'three_quarter_left' | 'three_quarter_right';

interface ReferenceImage {
  url: string;
  type: CharacterImageType;
  label: string;
}

// Perspective targets for each view type
const VIEW_PERSPECTIVE: Record<CharacterImageType, PerspectiveTarget> = {
  front: 'front',
  profile: 'three_quarter_right',
  back: 'back',
  three_quarter: 'three_quarter_left',
  custom: 'front',
};

/**
 * POST /api/global-assets/[assetId]/queue-generate
 * Queue an image generation job using image-to-image from front reference
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    // Check API key
    if (!process.env.AI_FAL_KEY) {
      return NextResponse.json({ error: 'fal.ai API key not configured (AI_FAL_KEY)' }, { status: 500 });
    }

    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { assetId } = await params;
    const body = await request.json();
    const { viewType = 'profile' } = body;

    const supabase = createServerSupabaseClient();

    // Get the asset
    const { data: asset, error: assetError } = await supabase
      .from('global_assets')
      .select('*')
      .eq('id', assetId)
      .eq('user_id', session.user.sub)
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const assetData = asset.data as Record<string, unknown>;
    const referenceImages = (assetData.reference_images_metadata as ReferenceImage[]) || [];
    const frontImage = referenceImages.find(img => img.type === 'front');

    if (!frontImage) {
      return NextResponse.json({
        error: 'No front reference image found. Please upload a front view first.',
      }, { status: 400 });
    }

    // Get public URL for the front image
    const frontImageUrl = await getPublicImageUrl(frontImage.url);
    const perspectiveTarget = VIEW_PERSPECTIVE[viewType as CharacterImageType] || 'three_quarter_right';

    // Build fal.ai input for perspective change
    const falInput = {
      image_url: frontImageUrl,
      target_perspective: perspectiveTarget,
      aspect_ratio: { ratio: '3:4' as const },
    };

    // Create job in database
    const { data: job, error: jobError } = await supabase
      .from('generation_jobs')
      .insert({
        user_id: session.user.sub,
        asset_id: assetId,
        asset_type: 'character',
        asset_name: asset.name,
        job_type: 'image',
        job_subtype: viewType,
        status: 'pending',
        progress: 0,
        message: 'Préparation...',
        fal_endpoint: 'fal-ai/image-apps-v2/perspective',
        input_data: falInput,
        estimated_cost: 0.02,
      })
      .select()
      .single();

    if (jobError || !job) {
      console.error('[Queue] Error creating job:', jobError);
      return NextResponse.json({
        error: 'Failed to create job',
        details: jobError?.message || 'Unknown error',
        code: jobError?.code,
        hint: jobError?.hint,
      }, { status: 500 });
    }

    // Submit to fal.ai queue
    try {
      const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://studio.stevencreeks.com'}/api/jobs/webhook`;

      const { request_id } = await fal.queue.submit('fal-ai/image-apps-v2/perspective', {
        input: falInput,
        webhookUrl,
      });

      // Update job with fal request ID
      await supabase
        .from('generation_jobs')
        .update({
          fal_request_id: request_id,
          status: 'queued',
          queued_at: new Date().toISOString(),
          message: 'En file d\'attente...',
        })
        .eq('id', job.id);

      console.log(`[Queue] Job ${job.id} submitted to fal.ai, request_id: ${request_id}`);

      return NextResponse.json({
        success: true,
        job: {
          ...job,
          fal_request_id: request_id,
          status: 'queued',
        },
      });
    } catch (falError) {
      // Update job as failed
      await supabase
        .from('generation_jobs')
        .update({
          status: 'failed',
          error_message: falError instanceof Error ? falError.message : 'Failed to submit to queue',
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      console.error('[Queue] Error submitting to fal:', falError);
      return NextResponse.json(
        { error: 'Failed to submit to queue' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[Queue] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
