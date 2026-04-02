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
    prompt,
    aspectRatio,
    resolution,
    model,
    referenceImages,
  } = data;

  console.log(`[QuickShotGen] Processing job ${jobId}`);
  console.log(`[QuickShotGen] Aspect: ${aspectRatio}, Resolution: ${resolution}, Model: ${model || 'auto'}`);
  console.log(`[QuickShotGen] Reference images: ${referenceImages?.length || 0}`);
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

    // Generate image using the generic service
    const result = await generateImage({
      prompt,
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
    const storageKey = `shots/${sanitizedUserId}/${projectId}/quick-shot_${Date.now()}.webp`;
    const b2Url = await uploadFile(storageKey, imageBuffer, 'image/webp');

    console.log(`[QuickShotGen] Image saved to B2: ${b2Url}`);

    // Save to rush_images table (project rush)
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
      })
      .select('id')
      .single();

    if (rushError) {
      console.error(`[QuickShotGen] Failed to save rush image:`, rushError);
    } else {
      console.log(`[QuickShotGen] Rush image saved: ${rushImage?.id}`);
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
      rushImageId: rushImage?.id,
      model: result.model,
      usedReferences: result.usedReferences,
    }, 0.02); // Estimated cost

    console.log(`[QuickShotGen] Job ${jobId} completed`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[QuickShotGen] Job ${jobId} failed:`, errorMessage);
    await failJob(jobId, errorMessage);
    throw error;
  }
}
