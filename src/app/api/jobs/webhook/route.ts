import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { uploadFile, STORAGE_BUCKET } from '@/lib/storage';
import { extractImageUrl } from '@/lib/provider-mappings';

// Use service role client for webhook (no user context)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Download image from URL and upload to B2
 */
async function uploadImageToB2(
  imageUrl: string,
  userId: string,
  assetId: string,
  imageType: string
): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const blob = await response.blob();
  const buffer = Buffer.from(await blob.arrayBuffer());

  const sanitizedUserId = userId.replace(/[|]/g, '_');
  const storageKey = `characters/${sanitizedUserId}/${assetId}/${imageType}_${Date.now()}.webp`;

  await uploadFile(storageKey, buffer, 'image/webp');

  return `b2://${STORAGE_BUCKET}/${storageKey}`;
}

interface FalWebhookPayload {
  request_id: string;
  status: 'OK' | 'ERROR';
  payload?: Record<string, unknown>;
  error?: string;
}

/**
 * POST /api/jobs/webhook
 * Webhook called by fal.ai when a job completes
 */
export async function POST(request: NextRequest) {
  try {
    const body: FalWebhookPayload = await request.json();
    const { request_id, status, payload, error } = body;

    console.log(`[Webhook] Received for request_id: ${request_id}, status: ${status}`);

    if (!request_id) {
      return NextResponse.json({ error: 'Missing request_id' }, { status: 400 });
    }

    // Find the job by fal_request_id
    const { data: job, error: fetchError } = await supabase
      .from('generation_jobs')
      .select('*')
      .eq('fal_request_id', request_id)
      .single();

    if (fetchError || !job) {
      console.error('[Webhook] Job not found for request_id:', request_id);
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (status === 'OK' && payload) {
      // Success - update job with result
      const { error: updateError } = await supabase
        .from('generation_jobs')
        .update({
          status: 'completed',
          progress: 100,
          message: 'Terminé!',
          result_data: payload,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (updateError) {
        console.error('[Webhook] Error updating job:', updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      // If this was an image generation for an asset, update the asset
      if (job.asset_id && job.job_type === 'image' && payload) {
        await updateAssetWithResult(job, payload);
      }

      console.log(`[Webhook] Job ${job.id} completed successfully`);
    } else {
      // Error - update job as failed
      const { error: updateError } = await supabase
        .from('generation_jobs')
        .update({
          status: 'failed',
          message: 'Échec de la génération',
          error_message: error || 'Unknown error',
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (updateError) {
        console.error('[Webhook] Error updating job:', updateError);
      }

      console.log(`[Webhook] Job ${job.id} failed:`, error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Update the asset with the generated image result
 */
async function updateAssetWithResult(
  job: Record<string, unknown>,
  payload: Record<string, unknown>
) {
  try {
    const assetId = job.asset_id as string;
    const userId = job.user_id as string;
    const jobSubtype = job.job_subtype as string; // 'front', 'profile', etc.

    // Get current asset
    const { data: asset, error: assetError } = await supabase
      .from('global_assets')
      .select('*')
      .eq('id', assetId)
      .single();

    if (assetError || !asset) {
      console.error('[Webhook] Asset not found:', assetId);
      return;
    }

    // Extract image URL from payload using provider mappings
    const endpoint = job.fal_endpoint as string || '';
    const tempImageUrl = extractImageUrl(payload, endpoint);

    if (!tempImageUrl) {
      console.error('[Webhook] No image URL in payload:', JSON.stringify(payload, null, 2));
      return;
    }

    // Upload to B2 (convert temporary fal.ai URL to permanent B2 URL)
    console.log(`[Webhook] Uploading image to B2 for asset ${assetId}...`);
    const b2Url = await uploadImageToB2(tempImageUrl, userId, assetId, jobSubtype);
    console.log(`[Webhook] Uploaded to B2: ${b2Url}`);

    // Update asset's reference_images_metadata
    const assetData = (asset.data || {}) as Record<string, unknown>;
    const existingImages = (assetData.reference_images_metadata || []) as Array<{
      url: string;
      type: string;
      label: string;
    }>;

    // Build label from type
    const typeLabels: Record<string, string> = {
      front: 'Face',
      profile: 'Profil',
      back: 'Dos',
      three_quarter: '3/4',
      custom: 'Autre',
    };

    // Replace or add the image
    const newImage = {
      url: b2Url,
      type: jobSubtype || 'custom',
      label: typeLabels[jobSubtype] || 'Image',
    };

    const updatedImages = existingImages.filter((img) => img.type !== jobSubtype);
    updatedImages.push(newImage);

    // Update asset
    const { error: updateError } = await supabase
      .from('global_assets')
      .update({
        data: {
          ...assetData,
          reference_images_metadata: updatedImages,
        },
        reference_images: updatedImages.map((img) => img.url),
      })
      .eq('id', assetId);

    if (updateError) {
      console.error('[Webhook] Error updating asset:', updateError);
    } else {
      console.log(`[Webhook] Updated asset ${assetId} with new ${jobSubtype} image`);
    }
  } catch (error) {
    console.error('[Webhook] Error updating asset:', error);
  }
}
