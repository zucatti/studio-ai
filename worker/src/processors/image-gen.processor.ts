/**
 * Image Generation Processor
 * Handles image generation jobs from the queue (character refs, locations, props)
 */

import type { Job } from 'bullmq';
import { fal } from '@fal-ai/client';
import { getSupabase } from '../supabase.js';
import { uploadFile, getPublicUrl } from '../storage.js';
import { startJob, updateJobProgress, completeJob, failJob } from '../utils/job-status.js';
import { aiConfig, storageConfig } from '../config.js';

// Configure fal.ai
fal.config({
  credentials: aiConfig.fal,
});

// Job data type - matches the shared types
export interface ImageGenJobData {
  type: 'image-gen';
  userId: string;
  jobId: string;
  createdAt: string;
  assetId: string;
  assetType: 'character' | 'location' | 'prop';
  assetName: string;
  mode: 'generate_single' | 'generate_all' | 'generate_variations' | 'generate_look';
  imageType?: 'front' | 'profile' | 'back' | 'three_quarter' | 'custom';
  prompt: string;
  fullPrompt: string;
  style: string;
  styleConfig: {
    promptPrefix: string;
    promptSuffix: string;
    renderingSpeed: 'TURBO' | 'BALANCED' | 'QUALITY';
    ideogramStyle: 'AUTO' | 'REALISTIC' | 'FICTION';
    resolution: '1K' | '2K' | '4K';
  };
  model: string;
  falEndpoint: string;
  frontReferenceUrl?: string;
  sourceImageUrl?: string;
  lookId?: string;
  lookName?: string;
  lookDescription?: string;
  aspectRatio?: string;
  resolution?: string;
  negativePrompt?: string;
}

// Reference image metadata
interface ReferenceImage {
  url: string;
  type: string;
  label: string;
}

// Rush image - a previous generation kept for comparison/selection
interface RushImage {
  url: string;
  type: string;
  label: string;
  createdAt: string;
}

// Maximum rushes per view type to prevent unlimited storage
const MAX_RUSHES_PER_TYPE = 5;

// View configurations
const CHARACTER_VIEWS = [
  { name: 'front', label: 'Face (Vue de face)', promptSuffix: 'front view, facing camera, looking straight ahead', perspectiveTarget: 'front' },
  { name: 'profile', label: 'Profil (Vue de côté)', promptSuffix: 'side profile view, looking to the side', perspectiveTarget: 'three_quarter_left' },
  { name: 'three_quarter', label: '3/4 (Vue trois-quarts)', promptSuffix: 'three quarter view, 3/4 angle, slightly turned', perspectiveTarget: 'three_quarter_right' },
  { name: 'back', label: 'Dos (Vue arrière)', promptSuffix: 'back view, facing away from camera, rear view, back of head visible', perspectiveTarget: 'back' },
];

/**
 * Process an image generation job
 */
export async function processImageGenJob(job: Job<ImageGenJobData>): Promise<void> {
  const { data } = job;
  const {
    jobId,
    userId,
    assetId,
    assetType,
    assetName,
    mode,
    imageType,
    prompt,
    fullPrompt,
    style,
    styleConfig,
    model,
    falEndpoint,
    frontReferenceUrl,
    sourceImageUrl,
    lookId,
    lookName,
    lookDescription,
    resolution,
  } = data;

  console.log(`[ImageGen] Processing job ${jobId} for asset ${assetId}`);
  console.log(`[ImageGen] Mode: ${mode}, Style: ${style}, Model: ${model}`);

  const supabase = getSupabase();

  try {
    await startJob(jobId, 'Préparation de la génération d\'image...');

    const generatedImages: ReferenceImage[] = [];
    let totalCost = 0;

    if (mode === 'generate_single') {
      // Generate a single view
      await updateJobProgress(jobId, 20, `Génération de la vue ${imageType}...`);

      const imageUrl = await generateSingleImage({
        fullPrompt,
        falEndpoint,
        styleConfig,
        resolution,
        frontReferenceUrl,
        imageType: imageType || 'front',
      });

      if (!imageUrl) {
        throw new Error(`Failed to generate ${imageType} view`);
      }

      // Upload to B2
      await updateJobProgress(jobId, 70, 'Sauvegarde de l\'image...');
      const b2Url = await uploadImageToB2(imageUrl, userId, assetId, imageType || 'front');

      const viewConfig = CHARACTER_VIEWS.find(v => v.name === imageType) || { label: imageType || 'Image' };
      generatedImages.push({
        url: b2Url,
        type: imageType || 'front',
        label: viewConfig.label,
      });
      totalCost = 0.02;

    } else if (mode === 'generate_all') {
      // Generate all 3 views (front, profile, back)
      await updateJobProgress(jobId, 10, 'Génération de la vue de face...');

      // Step 1: Generate front view
      const frontUrl = await generateSingleImage({
        fullPrompt: `${styleConfig.promptPrefix}${prompt}, front view, facing camera, full body portrait, standing pose${styleConfig.promptSuffix}`,
        falEndpoint,
        styleConfig,
        resolution,
      });

      if (!frontUrl) {
        throw new Error('Failed to generate front view');
      }

      const frontB2Url = await uploadImageToB2(frontUrl, userId, assetId, 'front');
      generatedImages.push({ url: frontB2Url, type: 'front', label: 'Face (Vue de face)' });
      totalCost += 0.02;

      // Step 2 & 3: Generate profile and back views
      const otherViews = CHARACTER_VIEWS.filter(v => v.name !== 'front');
      let progress = 30;

      for (const view of otherViews) {
        await updateJobProgress(jobId, progress, `Génération de la vue ${view.name}...`);

        try {
          // Try perspective change first
          const perspectiveUrl = await tryPerspectiveChange(frontUrl, view.perspectiveTarget);

          if (perspectiveUrl) {
            const b2Url = await uploadImageToB2(perspectiveUrl, userId, assetId, view.name);
            generatedImages.push({ url: b2Url, type: view.name, label: view.label });
          } else {
            // Fallback to ideogram/character
            const fallbackUrl = await generateWithIdeogram({
              prompt: `${styleConfig.promptPrefix}${prompt}, ${view.promptSuffix}, full body portrait${styleConfig.promptSuffix}`,
              referenceUrl: frontUrl,
              styleConfig,
            });

            if (fallbackUrl) {
              const b2Url = await uploadImageToB2(fallbackUrl, userId, assetId, view.name);
              generatedImages.push({ url: b2Url, type: view.name, label: view.label });
            }
          }
          totalCost += 0.02;
        } catch (error) {
          console.error(`[ImageGen] Failed to generate ${view.name} view:`, error);
        }

        progress += 25;
      }

    } else if (mode === 'generate_variations') {
      // Generate profile and back from source image
      if (!sourceImageUrl) {
        throw new Error('sourceImageUrl required for generate_variations mode');
      }

      await updateJobProgress(jobId, 10, 'Préparation des variations...');

      const sourcePublicUrl = await getPublicUrl(sourceImageUrl);
      const viewsToGenerate = CHARACTER_VIEWS.filter(v => v.name !== 'front');
      let progress = 20;

      for (const view of viewsToGenerate) {
        await updateJobProgress(jobId, progress, `Génération de la vue ${view.name}...`);

        try {
          const perspectiveUrl = await tryPerspectiveChange(sourcePublicUrl, view.perspectiveTarget);

          if (perspectiveUrl) {
            const b2Url = await uploadImageToB2(perspectiveUrl, userId, assetId, view.name);
            generatedImages.push({ url: b2Url, type: view.name, label: view.label });
          } else if (prompt) {
            // Fallback with ideogram
            const fallbackUrl = await generateWithIdeogram({
              prompt: `${styleConfig.promptPrefix}${prompt}, ${view.promptSuffix}, full body portrait${styleConfig.promptSuffix}`,
              referenceUrl: sourcePublicUrl,
              styleConfig,
            });

            if (fallbackUrl) {
              const b2Url = await uploadImageToB2(fallbackUrl, userId, assetId, view.name);
              generatedImages.push({ url: b2Url, type: view.name, label: view.label });
            }
          }
          totalCost += 0.02;
        } catch (error) {
          console.error(`[ImageGen] Failed to generate ${view.name} variation:`, error);
        }

        progress += 35;
      }

    } else if (mode === 'generate_look') {
      // Generate a look/outfit variation
      if (!lookDescription) {
        throw new Error('lookDescription required for generate_look mode');
      }

      await updateJobProgress(jobId, 20, 'Génération du look...');

      let lookImageUrl: string | undefined;

      if (frontReferenceUrl) {
        // Use reference image for character consistency
        const refPublicUrl = await getPublicUrl(frontReferenceUrl);
        lookImageUrl = await generateWithIdeogram({
          prompt: fullPrompt,
          referenceUrl: refPublicUrl,
          styleConfig,
        });
      } else {
        // Generate without reference
        lookImageUrl = await generateSingleImage({
          fullPrompt,
          falEndpoint,
          styleConfig,
          resolution,
        });
      }

      if (!lookImageUrl) {
        throw new Error('Failed to generate look image');
      }

      await updateJobProgress(jobId, 70, 'Sauvegarde du look...');

      const storageKey = `${assetType}s/${userId.replace(/[|]/g, '_')}/${assetId}/look_${lookId}_${Date.now()}.webp`;
      const imageResponse = await fetch(lookImageUrl);
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      const b2Url = await uploadFile(storageKey, imageBuffer, 'image/webp');

      totalCost = 0.03;

      // Update asset with new look
      await updateJobProgress(jobId, 85, 'Mise à jour de l\'asset...');

      const { data: asset } = await supabase
        .from('global_assets')
        .select('data')
        .eq('id', assetId)
        .single();

      if (asset) {
        const assetData = (asset.data as Record<string, unknown>) || {};
        const looks = (assetData.looks as Array<Record<string, unknown>>) || [];
        looks.push({
          id: lookId,
          name: lookName || 'Look généré',
          description: lookDescription,
          imageUrl: b2Url,
        });

        await supabase
          .from('global_assets')
          .update({ data: { ...assetData, looks } })
          .eq('id', assetId);
      }

      // Complete with look result
      await completeJob(jobId, {
        look: {
          id: lookId,
          name: lookName || 'Look généré',
          description: lookDescription,
          imageUrl: b2Url,
        },
      }, totalCost);

      console.log(`[ImageGen] Job ${jobId} completed (look generation)`);
      return;
    }

    // Update asset with generated images (for non-look modes)
    if (generatedImages.length > 0) {
      await updateJobProgress(jobId, 85, 'Mise à jour de l\'asset...');

      const { data: asset } = await supabase
        .from('global_assets')
        .select('reference_images, data')
        .eq('id', assetId)
        .single();

      if (asset) {
        const assetData = (asset.data as Record<string, unknown>) || {};
        const existingMetadata = (assetData.reference_images_metadata as ReferenceImage[]) || [];
        const existingRushes = (assetData.rushes as RushImage[]) || [];

        // Merge with existing images (replace same types, saving old ones as rushes)
        const allReferenceImages = [...existingMetadata];
        const newRushes = [...existingRushes];

        for (const newImg of generatedImages) {
          const existingIndex = allReferenceImages.findIndex(img => img.type === newImg.type);
          if (existingIndex >= 0) {
            // Save the old image as a rush before replacing
            const oldImage = allReferenceImages[existingIndex];
            const rushEntry: RushImage = {
              url: oldImage.url,
              type: oldImage.type,
              label: oldImage.label,
              createdAt: new Date().toISOString(),
            };
            newRushes.push(rushEntry);

            // Replace with new image
            allReferenceImages[existingIndex] = newImg;
          } else {
            allReferenceImages.push(newImg);
          }
        }

        // Limit rushes per type to prevent unlimited storage
        const limitedRushes: RushImage[] = [];
        const rushCountByType = new Map<string, number>();

        // Sort by createdAt descending to keep most recent rushes
        newRushes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        for (const rush of newRushes) {
          const count = rushCountByType.get(rush.type) || 0;
          if (count < MAX_RUSHES_PER_TYPE) {
            limitedRushes.push(rush);
            rushCountByType.set(rush.type, count + 1);
          }
        }

        const imageUrls = allReferenceImages.map(img => img.url);

        await supabase
          .from('global_assets')
          .update({
            reference_images: imageUrls,
            data: {
              ...assetData,
              reference_images_metadata: allReferenceImages,
              rushes: limitedRushes,
            },
          })
          .eq('id', assetId);

        console.log(`[ImageGen] Saved ${newRushes.length - limitedRushes.length > 0 ? `${limitedRushes.length} rushes (pruned ${newRushes.length - limitedRushes.length} old)` : `${limitedRushes.length} rushes`}`);
      }
    }

    // Complete the job
    await completeJob(jobId, {
      generatedImages,
      imageCount: generatedImages.length,
    }, totalCost);

    console.log(`[ImageGen] Job ${jobId} completed (${generatedImages.length} images)`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ImageGen] Job ${jobId} failed:`, errorMessage);
    await failJob(jobId, errorMessage);
    throw error;
  }
}

/**
 * Generate a single image with text-to-image model
 */
async function generateSingleImage(options: {
  fullPrompt: string;
  falEndpoint: string;
  styleConfig: ImageGenJobData['styleConfig'];
  resolution?: string;
  frontReferenceUrl?: string;
  imageType?: string;
}): Promise<string | undefined> {
  const { fullPrompt, falEndpoint, styleConfig, resolution, frontReferenceUrl, imageType } = options;

  // If we have a front reference and it's not a front view, try perspective change first
  if (frontReferenceUrl && imageType && imageType !== 'front') {
    console.log(`[ImageGen] Using reference image for ${imageType} view`);
    const viewConfig = CHARACTER_VIEWS.find(v => v.name === imageType);
    const publicUrl = await getPublicUrl(frontReferenceUrl);
    console.log(`[ImageGen] Reference URL: ${publicUrl.substring(0, 80)}...`);

    if (viewConfig) {
      console.log(`[ImageGen] Found view config: ${viewConfig.name}, perspectiveTarget: ${viewConfig.perspectiveTarget}`);

      const perspectiveUrl = await tryPerspectiveChange(publicUrl, viewConfig.perspectiveTarget);
      if (perspectiveUrl) {
        console.log(`[ImageGen] Perspective change succeeded`);
        return perspectiveUrl;
      }

      console.log(`[ImageGen] Perspective change failed, falling back to Ideogram`);
    } else {
      console.log(`[ImageGen] Custom view type: ${imageType}, using Ideogram with reference`);
    }

    // Use Ideogram with reference for all non-front views (including custom)
    return generateWithIdeogram({
      prompt: fullPrompt,
      referenceUrl: publicUrl,
      styleConfig,
    });
  }

  // Build input based on model
  const input = buildTextToImageInput(fullPrompt, falEndpoint, resolution || styleConfig.resolution);

  const result = await fal.subscribe(falEndpoint, {
    input,
    logs: true,
  });

  return (result.data as any)?.images?.[0]?.url;
}

/**
 * Try perspective change with fal.ai
 */
async function tryPerspectiveChange(imageUrl: string, perspectiveTarget: string): Promise<string | undefined> {
  try {
    const result = await fal.subscribe('fal-ai/image-apps-v2/perspective', {
      input: {
        image_url: imageUrl,
        target_perspective: perspectiveTarget,
        aspect_ratio: { ratio: '3:4' },
      } as any,
      logs: true,
    });

    return (result.data as any)?.images?.[0]?.url;
  } catch (error) {
    console.log(`[ImageGen] Perspective change failed:`, error);
    return undefined;
  }
}

/**
 * Generate with Ideogram Character (with reference)
 */
async function generateWithIdeogram(options: {
  prompt: string;
  referenceUrl: string;
  styleConfig: ImageGenJobData['styleConfig'];
}): Promise<string | undefined> {
  const { prompt, referenceUrl, styleConfig } = options;

  try {
    const result = await fal.subscribe('fal-ai/ideogram/character', {
      input: {
        prompt,
        reference_image_urls: [referenceUrl],
        rendering_speed: styleConfig.renderingSpeed,
        style: styleConfig.ideogramStyle,
        image_size: 'portrait_4_3',
        num_images: 1,
      } as any,
      logs: true,
    });

    return (result.data as any)?.images?.[0]?.url;
  } catch (error) {
    console.error(`[ImageGen] Ideogram generation failed:`, error);
    return undefined;
  }
}

/**
 * Build text-to-image input based on model
 */
function buildTextToImageInput(prompt: string, falEndpoint: string, resolution: string): Record<string, unknown> {
  if (falEndpoint.includes('seedream')) {
    return {
      prompt,
      aspect_ratio: '3:4',
      num_images: 1,
      output_format: 'png',
    };
  } else if (falEndpoint.includes('flux-2-pro')) {
    return {
      prompt,
      image_size: 'portrait_4_3',
      output_format: 'png',
    };
  } else if (falEndpoint.includes('gpt-image')) {
    return {
      prompt,
      image_size: '1024x1536',
      quality: 'high',
      output_format: 'png',
      num_images: 1,
    };
  } else {
    // Nano Banana 2 and others
    return {
      prompt,
      aspect_ratio: '3:4',
      image_resolution: resolution,
      num_images: 1,
    };
  }
}

/**
 * Upload image to B2
 */
async function uploadImageToB2(imageUrl: string, userId: string, assetId: string, imageName: string): Promise<string> {
  const imageResponse = await fetch(imageUrl);
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

  const sanitizedUserId = userId.replace(/[|]/g, '_');
  const storageKey = `characters/${sanitizedUserId}/${assetId}/${imageName}_${Date.now()}.webp`;

  return uploadFile(storageKey, imageBuffer, 'image/webp');
}
