/**
 * Quick-Shot Generation Processor
 * Handles quick-shot image generation jobs from the queue
 */

import type { Job } from 'bullmq';
import { getSupabase } from '../supabase.js';
import { uploadFile } from '../storage.js';
import { startJob, updateJobProgress, completeJob, failJob } from '../utils/job-status.js';
import { generateImage, type ReferenceImage, type AspectRatio } from '../services/image-generation.js';

// Job data type - matches QuickShotGenJobData from src/lib/bullmq/types.ts
export interface QuickShotGenJobData {
  type: 'quick-shot-gen';
  userId: string;
  jobId: string;
  createdAt: string;
  projectId: string;
  shotId?: string;
  storyboardFrameId?: string; // For storyboard frame generation
  prompt: string;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5' | '2:3' | '21:9';
  resolution: '1K' | '2K' | '4K';
  model?: 'fal-ai/nano-banana-2' | 'seedream-5' | 'kling-o1';
  referenceImages: {
    url: string;
    label: string;
    type: 'character' | 'location' | 'prop' | 'look';
    description?: string;
  }[];
  stylePrefix?: string; // Style prefix for storyboard frames
}

/**
 * Process a quick-shot generation job
 */
export async function processQuickShotGenJob(job: Job<QuickShotGenJobData>): Promise<void> {
  const { data } = job;
  const {
    jobId,
    userId,
    projectId,
    shotId,
    storyboardFrameId,
    prompt,
    aspectRatio,
    resolution,
    model,
    referenceImages,
    stylePrefix,
  } = data;

  console.log(`[QuickShotGen] Processing job ${jobId}`);
  console.log(`[QuickShotGen] Aspect: ${aspectRatio}, Resolution: ${resolution}, Model: ${model || 'auto'}`);
  console.log(`[QuickShotGen] Reference images: ${referenceImages?.length || 0}`);
  console.log(`[QuickShotGen] Storyboard frame: ${storyboardFrameId || 'none'}`);
  console.log(`[QuickShotGen] Prompt: ${prompt.substring(0, 150)}...`);

  const supabase = getSupabase();

  try {
    await startJob(jobId, 'Préparation de la génération...');
    await updateJobProgress(jobId, 20, 'Génération de l\'image...');

    // Convert to ReferenceImage format
    const refs: ReferenceImage[] = (referenceImages || []).map(img => ({
      url: img.url,
      label: img.label,
      type: img.type,
      description: img.description,
    }));

    // Build prompt - apply style prefix for storyboard frames
    const fullPrompt = stylePrefix ? `${stylePrefix}, ${prompt}` : prompt;

    // Generate image using the generic service
    const result = await generateImage({
      prompt: fullPrompt,
      aspectRatio: aspectRatio as AspectRatio,
      resolution,
      model, // Pass the user-selected model
      referenceImages: refs,
    });

    console.log(`[QuickShotGen] Image generated with ${result.model}, used refs: ${result.usedReferences}`);
    await updateJobProgress(jobId, 70, 'Sauvegarde de l\'image...');

    // Upload to B2
    const imageResponse = await fetch(result.imageUrl);
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const sanitizedUserId = userId.replace(/[|]/g, '_');

    // Use different path/format for storyboard frames (PNG for sketches)
    const isStoryboard = !!storyboardFrameId;
    const storageKey = isStoryboard
      ? `storyboard-frames/${sanitizedUserId}/${projectId}/${storyboardFrameId}_${Date.now()}.png`
      : `shots/${sanitizedUserId}/${projectId}/quick-shot_${Date.now()}.webp`;
    const mimeType = isStoryboard ? 'image/png' : 'image/webp';
    const b2Url = await uploadFile(storageKey, imageBuffer, mimeType);

    console.log(`[QuickShotGen] Image saved to B2: ${b2Url}`);

    let rushImageId: string | undefined;

    // Handle storyboard frame update
    if (storyboardFrameId) {
      await updateJobProgress(jobId, 80, 'Mise à jour du storyboard...');
      const { error: frameError } = await supabase
        .from('storyboard_frames')
        .update({
          sketch_url: b2Url,
          sketch_prompt: prompt,
          generation_status: 'completed',
          generation_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', storyboardFrameId);

      if (frameError) {
        console.error(`[QuickShotGen] Failed to update storyboard frame:`, frameError);
      } else {
        console.log(`[QuickShotGen] Storyboard frame ${storyboardFrameId} updated`);
      }
    } else {
      // Save to rush_images table (project rush) with pending status
      // Only for regular quick-shots, not storyboard frames
      await updateJobProgress(jobId, 80, 'Enregistrement dans les rushes...');
      const { data: rushImage, error: rushError } = await supabase
        .from('rush_images')
        .insert({
          project_id: projectId,
          user_id: userId,
          url: b2Url,
          prompt: prompt,
          aspect_ratio: aspectRatio,
          model: result.model,
          status: 'pending', // Awaiting selection in Rush page
        })
        .select('id')
        .single();

      if (rushError) {
        console.error(`[QuickShotGen] Failed to save rush image:`, rushError);
      } else {
        console.log(`[QuickShotGen] Rush image saved: ${rushImage?.id}`);
        rushImageId = rushImage?.id;
      }
    }

    // If shotId provided, update the shot
    if (shotId) {
      await updateJobProgress(jobId, 90, 'Mise à jour du shot...');
      await supabase
        .from('shots')
        .update({
          storyboard_image_url: b2Url,
          first_frame_url: b2Url,
        })
        .eq('id', shotId);
    }

    // Complete the job
    await completeJob(jobId, {
      imageUrl: b2Url,
      shotId,
      storyboardFrameId,
      rushImageId,
      model: result.model,
      usedReferences: result.usedReferences,
    }, 0.02); // Estimated cost

    console.log(`[QuickShotGen] Job ${jobId} completed`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[QuickShotGen] Job ${jobId} failed:`, errorMessage);
    await failJob(jobId, errorMessage);

    // Also update storyboard frame status if applicable
    if (storyboardFrameId) {
      await supabase
        .from('storyboard_frames')
        .update({
          generation_status: 'failed',
          generation_error: errorMessage,
        })
        .eq('id', storyboardFrameId);
    }

    throw error;
  }
}
