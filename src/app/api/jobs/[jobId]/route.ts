import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { fal } from '@fal-ai/client';
import { uploadFile, STORAGE_BUCKET } from '@/lib/storage';
import { extractImageUrl, extractVideoUrl } from '@/lib/provider-mappings';

// Configure fal.ai
fal.config({
  credentials: process.env.AI_FAL_KEY,
});

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

/**
 * Update asset with generated image result (fallback when webhook not available)
 */
async function updateAssetWithResult(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  job: Record<string, unknown>,
  payload: Record<string, unknown>
) {
  try {
    const assetId = job.asset_id as string;
    const userId = job.user_id as string;
    const jobSubtype = job.job_subtype as string;

    if (!assetId || !userId) {
      console.log('[Jobs] No asset_id or user_id, skipping asset update');
      return;
    }

    // Get current asset
    const { data: asset, error: assetError } = await supabase
      .from('global_assets')
      .select('*')
      .eq('id', assetId)
      .single();

    if (assetError || !asset) {
      console.error('[Jobs] Asset not found:', assetId);
      return;
    }

    // Extract image URL from payload using provider mappings
    const endpoint = job.fal_endpoint as string || '';
    const tempImageUrl = extractImageUrl(payload, endpoint);

    if (!tempImageUrl) {
      console.error('[Jobs] No image URL in payload:', JSON.stringify(payload, null, 2));
      return;
    }

    // Upload to B2
    console.log(`[Jobs] Uploading image to B2 for asset ${assetId}...`);
    const b2Url = await uploadImageToB2(tempImageUrl, userId, assetId, jobSubtype);
    console.log(`[Jobs] Uploaded to B2: ${b2Url}`);

    // Update asset's reference_images_metadata
    const assetData = (asset.data || {}) as Record<string, unknown>;
    const existingImages = (assetData.reference_images_metadata || []) as Array<{
      url: string;
      type: string;
      label: string;
    }>;

    const typeLabels: Record<string, string> = {
      front: 'Face',
      profile: 'Profil',
      back: 'Dos',
      three_quarter: '3/4',
      custom: 'Autre',
    };

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
      console.error('[Jobs] Error updating asset:', updateError);
    } else {
      console.log(`[Jobs] Updated asset ${assetId} with new ${jobSubtype} image`);
    }
  } catch (error) {
    console.error('[Jobs] Error updating asset:', error);
  }
}

/**
 * GET /api/jobs/[jobId]
 * Get status of a specific job
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = await params;
    const supabase = createServerSupabaseClient();

    const { data: job, error } = await supabase
      .from('generation_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', session.user.sub)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // If job is queued/running, check fal.ai status
    if (['queued', 'running'].includes(job.status) && job.fal_request_id) {
      try {
        const falStatus = await fal.queue.status(job.fal_endpoint, {
          requestId: job.fal_request_id,
          logs: false,
        });

        // Map fal status to our status
        let newStatus = job.status;
        let progress = job.progress;
        let message = job.message;

        const status = falStatus.status as string;

        if (status === 'IN_QUEUE') {
          newStatus = 'queued';
          message = `Position ${(falStatus as { queue_position?: number }).queue_position || '?'} dans la file`;
        } else if (status === 'IN_PROGRESS') {
          newStatus = 'running';
          progress = 50; // fal doesn't give granular progress
          message = 'Génération en cours...';
        } else if (status === 'COMPLETED') {
          newStatus = 'completed';
          progress = 100;
          message = 'Terminé!';

          // Get the result
          const result = await fal.queue.result(job.fal_endpoint, {
            requestId: job.fal_request_id,
          });

          // Update job with result
          await supabase
            .from('generation_jobs')
            .update({
              status: 'completed',
              progress: 100,
              message: 'Terminé!',
              result_data: result,
              completed_at: new Date().toISOString(),
            })
            .eq('id', jobId);

          // If this was an image generation for an asset, update the asset
          // This is a fallback for when webhook is not available (e.g., localhost)
          if (job.asset_id && job.job_type === 'image' && result) {
            await updateAssetWithResult(supabase, job, result as Record<string, unknown>);
          }

          return NextResponse.json({
            job: {
              ...job,
              status: 'completed',
              progress: 100,
              message: 'Terminé!',
              result_data: result,
            },
          });
        } else if (status === 'FAILED') {
          newStatus = 'failed';
          message = 'Échec de la génération';
        }

        // Update if status changed
        if (newStatus !== job.status || progress !== job.progress) {
          await supabase
            .from('generation_jobs')
            .update({
              status: newStatus,
              progress,
              message,
              started_at: newStatus === 'running' && !job.started_at ? new Date().toISOString() : job.started_at,
            })
            .eq('id', jobId);

          return NextResponse.json({
            job: { ...job, status: newStatus, progress, message },
          });
        }
      } catch (falError) {
        console.error('[Jobs] Error checking fal status:', falError);
        // Don't fail the request, just return current DB state
      }
    }

    return NextResponse.json({ job });
  } catch (error) {
    console.error('[Jobs] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/jobs/[jobId]
 * Cancel a job
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = await params;
    const supabase = createServerSupabaseClient();

    // Get job
    const { data: job, error } = await supabase
      .from('generation_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', session.user.sub)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Can only cancel pending/queued/running jobs
    if (!['pending', 'queued', 'running'].includes(job.status)) {
      return NextResponse.json(
        { error: 'Cannot cancel job with status: ' + job.status },
        { status: 400 }
      );
    }

    // Try to cancel on fal.ai
    if (job.fal_request_id) {
      try {
        await fal.queue.cancel(job.fal_endpoint, {
          requestId: job.fal_request_id,
        });
      } catch (falError) {
        console.error('[Jobs] Error cancelling fal job:', falError);
        // Continue anyway, we'll mark as cancelled in DB
      }
    }

    // Update job as cancelled
    const { error: updateError } = await supabase
      .from('generation_jobs')
      .update({
        status: 'cancelled',
        message: 'Annulé par l\'utilisateur',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Job cancelled' });
  } catch (error) {
    console.error('[Jobs] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
