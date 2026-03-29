/**
 * Generic Image Generation Service
 *
 * Provides a robust, reusable interface for image generation with reference support.
 * Automatically chooses the best model based on whether reference images are provided.
 *
 * - With references: Kling O1 (best for character/location consistency)
 * - Without references: Nano Banana 2 text-to-image (fast, high quality)
 */

import { fal } from '@fal-ai/client';
import { aiConfig } from '../config.js';

// Configure fal.ai
fal.config({
  credentials: aiConfig.fal,
});

// Supported aspect ratios
export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5' | '2:3' | '21:9';

// Supported resolutions
export type Resolution = '1K' | '2K' | '4K';

// Reference image with context
export interface ReferenceImage {
  url: string;           // Signed HTTPS URL
  label: string;         // e.g., "@Morgana", "#Castle", "!MedievalDress"
  type: 'character' | 'location' | 'prop' | 'look';
  description?: string;  // Visual description for context
}

// Progress callback type
export type ProgressCallback = (progress: number, message: string) => Promise<void>;

// Generation options
export interface GenerationOptions {
  prompt: string;
  aspectRatio: AspectRatio;
  resolution?: Resolution;
  referenceImages?: ReferenceImage[];
  numImages?: number;
  onProgress?: ProgressCallback;
}

// Generation result
export interface GenerationResult {
  imageUrl: string;
  model: string;
  usedReferences: boolean;
}

/**
 * Build a prompt that references images for Kling O1
 *
 * Kling O1 uses @Image1, @Image2 syntax to reference images.
 * We build a context section explaining what each image shows,
 * then the scene description with image references.
 */
function buildKlingPrompt(
  originalPrompt: string,
  references: ReferenceImage[]
): string {
  if (references.length === 0) {
    return originalPrompt;
  }

  // Build context explaining each image
  const contextParts: string[] = [];

  // Group references by label to handle multiple images of same entity
  const labelGroups = new Map<string, { indices: number[]; ref: ReferenceImage }>();

  references.forEach((ref, index) => {
    const imageNum = index + 1;
    const existing = labelGroups.get(ref.label);
    if (existing) {
      existing.indices.push(imageNum);
    } else {
      labelGroups.set(ref.label, { indices: [imageNum], ref });
    }
  });

  // Build context for each entity
  for (const [label, { indices, ref }] of labelGroups) {
    const typeLabel = ref.type === 'character' ? 'character' :
                     ref.type === 'location' ? 'location' :
                     ref.type === 'look' ? 'outfit/look' : 'object';

    const imageRefs = indices.length === 1
      ? `@Image${indices[0]}`
      : indices.map(i => `@Image${i}`).join(', ');

    const desc = ref.description ? ` - ${ref.description}` : '';
    contextParts.push(`${imageRefs} shows the ${typeLabel} "${label}"${desc}`);
  }

  // Replace entity mentions in prompt with @Image references
  let modifiedPrompt = originalPrompt;

  for (const [label, { indices }] of labelGroups) {
    // Escape special regex characters in label
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedLabel, 'gi');

    const imageRef = indices.length === 1
      ? `@Image${indices[0]}`
      : `@Image${indices[0]}`; // Use first image as primary reference

    modifiedPrompt = modifiedPrompt.replace(regex, imageRef);
  }

  // Combine context and prompt
  return `Reference images: ${contextParts.join('. ')}.\n\nCreate this scene: ${modifiedPrompt}`;
}

/**
 * Generate an image using the best available model
 *
 * Automatically selects:
 * - Kling O1 when reference images are provided (best for consistency)
 * - Nano Banana 2 for text-to-image when no references
 */
export async function generateImage(options: GenerationOptions): Promise<GenerationResult> {
  const {
    prompt,
    aspectRatio,
    resolution = '2K',
    referenceImages = [],
    numImages = 1,
    onProgress,
  } = options;

  const hasReferences = referenceImages.length > 0;

  console.log(`[ImageGen] Generating image:`);
  console.log(`[ImageGen]   Prompt: ${prompt.substring(0, 100)}...`);
  console.log(`[ImageGen]   Aspect: ${aspectRatio}, Resolution: ${resolution}`);
  console.log(`[ImageGen]   References: ${referenceImages.length}`);

  if (hasReferences) {
    // Use Kling O1 for reference-based generation
    return generateWithKlingO1(prompt, aspectRatio, resolution, referenceImages, numImages, onProgress);
  } else {
    // Use Nano Banana 2 for text-to-image
    return generateWithNanoBanana2(prompt, aspectRatio, resolution, numImages, onProgress);
  }
}

/**
 * Generate with Kling O1 (reference-based, best for consistency)
 */
async function generateWithKlingO1(
  prompt: string,
  aspectRatio: AspectRatio,
  resolution: Resolution,
  references: ReferenceImage[],
  numImages: number,
  onProgress?: ProgressCallback
): Promise<GenerationResult> {
  console.log(`[ImageGen] Using Kling O1 with ${references.length} reference images`);

  // Build prompt with image references
  const finalPrompt = buildKlingPrompt(prompt, references);
  console.log(`[ImageGen] Kling prompt: ${finalPrompt.substring(0, 200)}...`);

  // Extract URLs
  const imageUrls = references.map(r => r.url);
  console.log(`[ImageGen] Image URLs:`, imageUrls.map(u => u.substring(0, 60) + '...'));

  const input = {
    prompt: finalPrompt,
    image_urls: imageUrls,
    aspect_ratio: aspectRatio as '16:9' | '9:16' | '1:1',
    resolution: resolution === '4K' ? '2K' : resolution, // Kling max is 2K
    num_images: numImages,
  };

  try {
    const result = await fal.subscribe('fal-ai/kling-image/o1', {
      input,
      logs: true,
      onQueueUpdate: async (update) => {
        if (onProgress && update.status === 'IN_PROGRESS') {
          // fal.ai doesn't always give percentage, estimate based on logs
          const logs = (update as any).logs || [];
          const lastLog = logs[logs.length - 1]?.message || '';
          await onProgress(50, `Kling O1: ${lastLog || 'Génération en cours...'}`);
        } else if (onProgress && update.status === 'IN_QUEUE') {
          await onProgress(25, 'En file d\'attente chez Kling O1...');
        }
      },
    });

    const imageUrl = (result.data as any)?.images?.[0]?.url;

    if (!imageUrl) {
      throw new Error('Kling O1 returned no image');
    }

    console.log(`[ImageGen] Kling O1 success`);

    return {
      imageUrl,
      model: 'kling-o1',
      usedReferences: true,
    };
  } catch (error) {
    console.error(`[ImageGen] Kling O1 failed:`, error);
    throw error;
  }
}

/**
 * Generate with Nano Banana 2 (text-to-image, no references)
 */
async function generateWithNanoBanana2(
  prompt: string,
  aspectRatio: AspectRatio,
  resolution: Resolution,
  numImages: number,
  onProgress?: ProgressCallback
): Promise<GenerationResult> {
  console.log(`[ImageGen] Using Nano Banana 2 text-to-image`);

  const input = {
    prompt,
    aspect_ratio: aspectRatio,
    resolution,
    num_images: numImages,
  };

  try {
    const result = await fal.subscribe('fal-ai/nano-banana-2', {
      input,
      logs: true,
      onQueueUpdate: async (update) => {
        if (onProgress && update.status === 'IN_PROGRESS') {
          await onProgress(50, 'Nano Banana 2: Génération en cours...');
        } else if (onProgress && update.status === 'IN_QUEUE') {
          await onProgress(25, 'En file d\'attente...');
        }
      },
    });

    const imageUrl = (result.data as any)?.images?.[0]?.url;

    if (!imageUrl) {
      throw new Error('Nano Banana 2 returned no image');
    }

    console.log(`[ImageGen] Nano Banana 2 success`);

    return {
      imageUrl,
      model: 'nano-banana-2',
      usedReferences: false,
    };
  } catch (error) {
    console.error(`[ImageGen] Nano Banana 2 failed:`, error);
    throw error;
  }
}

/**
 * Validate that reference image URLs are accessible
 * (Optional utility for debugging)
 */
export async function validateReferenceUrls(urls: string[]): Promise<{ url: string; valid: boolean; error?: string }[]> {
  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, { method: 'HEAD' });
        return {
          url,
          valid: response.ok,
          error: response.ok ? undefined : `HTTP ${response.status}`,
        };
      } catch (error) {
        return {
          url,
          valid: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    })
  );
  return results;
}
