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

// Supported models
export type ImageModel = 'fal-ai/nano-banana-2' | 'seedream-5' | 'kling-o1' | 'grok' | 'gpt-image-1.5';

// Generation options
export interface GenerationOptions {
  prompt: string;
  aspectRatio: AspectRatio;
  resolution?: Resolution;
  referenceImages?: ReferenceImage[];
  model?: ImageModel; // User-selected model (if not provided, auto-selects)
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
 * Generate an image using the specified or best available model
 *
 * If model is specified, uses that model.
 * Otherwise, automatically selects:
 * - Kling O1 when reference images are provided (best for consistency)
 * - Nano Banana 2 for text-to-image when no references
 */
export async function generateImage(options: GenerationOptions): Promise<GenerationResult> {
  const {
    prompt,
    aspectRatio,
    resolution = '2K',
    referenceImages = [],
    model,
    numImages = 1,
    onProgress,
  } = options;

  const hasReferences = referenceImages.length > 0;

  console.log(`[ImageGen] Generating image:`);
  console.log(`[ImageGen]   Prompt: ${prompt.substring(0, 100)}...`);
  console.log(`[ImageGen]   Aspect: ${aspectRatio}, Resolution: ${resolution}`);
  console.log(`[ImageGen]   Model: ${model || 'auto'}, References: ${referenceImages.length}`);

  // If user specified a model, use it
  if (model) {
    switch (model) {
      case 'kling-o1':
        return generateWithKlingO1(prompt, aspectRatio, resolution, referenceImages, numImages, onProgress);
      case 'grok':
        return generateWithGrok(prompt, aspectRatio, resolution, referenceImages, numImages, onProgress);
      case 'seedream-5':
        return generateWithSeedream5(prompt, aspectRatio, resolution, numImages, onProgress, referenceImages);
      case 'gpt-image-1.5':
        return generateWithGPTImage(prompt, aspectRatio, resolution, numImages, onProgress, referenceImages);
      case 'fal-ai/nano-banana-2':
      default:
        // Nano Banana 2 supports references via edit endpoint
        return generateWithNanoBanana2(prompt, aspectRatio, resolution, numImages, onProgress, referenceImages);
    }
  }

  // Auto-select based on references
  if (hasReferences) {
    // Use Nano Banana 2 with references (faster than Kling O1)
    return generateWithNanoBanana2(prompt, aspectRatio, resolution, numImages, onProgress, referenceImages);
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
 * Generate with Seedream 5
 * - Without references: text-to-image endpoint
 * - With references: edit endpoint with image_urls
 */
async function generateWithSeedream5(
  prompt: string,
  aspectRatio: AspectRatio,
  resolution: Resolution,
  numImages: number,
  onProgress?: ProgressCallback,
  references: ReferenceImage[] = []
): Promise<GenerationResult> {
  const hasReferences = references.length > 0;

  if (hasReferences) {
    console.log(`[ImageGen] Using Seedream 5 with ${references.length} reference images`);

    // Build enhanced prompt with reference context
    const enhancedPrompt = buildReferencePrompt(prompt, references);
    const imageUrls = references.map(r => r.url).slice(0, 10); // Max 10 images

    const input = {
      prompt: enhancedPrompt,
      image_urls: imageUrls,
      num_images: numImages,
    };

    try {
      const result = await fal.subscribe('fal-ai/bytedance/seedream/v5/lite/edit', {
        input,
        logs: true,
        onQueueUpdate: async (update) => {
          if (onProgress && update.status === 'IN_PROGRESS') {
            await onProgress(50, 'Seedream 5: Génération avec références...');
          } else if (onProgress && update.status === 'IN_QUEUE') {
            await onProgress(25, 'En file d\'attente...');
          }
        },
      });

      const imageUrl = (result.data as any)?.images?.[0]?.url;

      if (!imageUrl) {
        throw new Error('Seedream 5 edit returned no image');
      }

      console.log(`[ImageGen] Seedream 5 with references success`);

      return {
        imageUrl,
        model: 'seedream-5',
        usedReferences: true,
      };
    } catch (error) {
      console.error(`[ImageGen] Seedream 5 edit failed:`, error);
      throw error;
    }
  } else {
    console.log(`[ImageGen] Using Seedream 5 text-to-image`);

    const input = {
      prompt,
      aspect_ratio: aspectRatio,
      num_images: numImages,
    };

    try {
      const result = await fal.subscribe('fal-ai/bytedance/seedream/v5/lite/text-to-image', {
        input,
        logs: true,
        onQueueUpdate: async (update) => {
          if (onProgress && update.status === 'IN_PROGRESS') {
            await onProgress(50, 'Seedream 5: Génération en cours...');
          } else if (onProgress && update.status === 'IN_QUEUE') {
            await onProgress(25, 'En file d\'attente...');
          }
        },
      });

      const imageUrl = (result.data as any)?.images?.[0]?.url;

      if (!imageUrl) {
        throw new Error('Seedream 5 returned no image');
      }

      console.log(`[ImageGen] Seedream 5 success`);

      return {
        imageUrl,
        model: 'seedream-5',
        usedReferences: false,
      };
    } catch (error) {
      console.error(`[ImageGen] Seedream 5 failed:`, error);
      throw error;
    }
  }
}

/**
 * Generate with GPT Image 1.5 (OpenAI via fal.ai)
 * Supports reference images via edit endpoint
 */
async function generateWithGPTImage(
  prompt: string,
  aspectRatio: AspectRatio,
  resolution: Resolution,
  numImages: number,
  onProgress?: ProgressCallback,
  references: ReferenceImage[] = []
): Promise<GenerationResult> {
  const hasReferences = references.length > 0;

  // Map aspect ratio to GPT Image sizes
  const sizeMap: Record<string, string> = {
    '1:1': '1024x1024',
    '16:9': '1536x1024',
    '9:16': '1024x1536',
    '4:5': '1024x1024', // Closest match
    '2:3': '1024x1536', // Closest match
    '21:9': '1536x1024', // Closest match
  };
  const imageSize = sizeMap[aspectRatio] || 'auto';

  if (hasReferences) {
    console.log(`[ImageGen] Using GPT Image 1.5 with ${references.length} reference images`);

    const enhancedPrompt = buildReferencePrompt(prompt, references);
    const imageUrls = references.map(r => r.url);

    const input = {
      prompt: enhancedPrompt,
      image_urls: imageUrls,
      image_size: imageSize,
      quality: resolution === '4K' ? 'high' : 'medium',
      num_images: Math.min(numImages, 4),
      output_format: 'webp',
    };

    try {
      const result = await fal.subscribe('fal-ai/gpt-image-1.5/edit', {
        input,
        logs: true,
        onQueueUpdate: async (update) => {
          if (onProgress && update.status === 'IN_PROGRESS') {
            await onProgress(50, 'GPT Image 1.5: Génération avec références...');
          } else if (onProgress && update.status === 'IN_QUEUE') {
            await onProgress(25, 'En file d\'attente...');
          }
        },
      });

      const imageUrl = (result.data as any)?.images?.[0]?.url;

      if (!imageUrl) {
        throw new Error('GPT Image 1.5 edit returned no image');
      }

      console.log(`[ImageGen] GPT Image 1.5 with references success`);

      return {
        imageUrl,
        model: 'gpt-image-1.5',
        usedReferences: true,
      };
    } catch (error) {
      console.error(`[ImageGen] GPT Image 1.5 edit failed:`, error);
      throw error;
    }
  } else {
    console.log(`[ImageGen] Using GPT Image 1.5 text-to-image`);

    const input = {
      prompt,
      image_size: imageSize,
      quality: resolution === '4K' ? 'high' : 'medium',
      num_images: Math.min(numImages, 4),
      output_format: 'webp',
    };

    try {
      const result = await fal.subscribe('fal-ai/gpt-image-1.5/text-to-image', {
        input,
        logs: true,
        onQueueUpdate: async (update) => {
          if (onProgress && update.status === 'IN_PROGRESS') {
            await onProgress(50, 'GPT Image 1.5: Génération en cours...');
          } else if (onProgress && update.status === 'IN_QUEUE') {
            await onProgress(25, 'En file d\'attente...');
          }
        },
      });

      const imageUrl = (result.data as any)?.images?.[0]?.url;

      if (!imageUrl) {
        throw new Error('GPT Image 1.5 returned no image');
      }

      console.log(`[ImageGen] GPT Image 1.5 success`);

      return {
        imageUrl,
        model: 'gpt-image-1.5',
        usedReferences: false,
      };
    } catch (error) {
      console.error(`[ImageGen] GPT Image 1.5 failed:`, error);
      throw error;
    }
  }
}

/**
 * Build a generic reference prompt for models that support image_urls
 */
function buildReferencePrompt(
  originalPrompt: string,
  references: ReferenceImage[]
): string {
  if (references.length === 0) {
    return originalPrompt;
  }

  // Group references by label
  const descriptions: string[] = [];
  const seenLabels = new Set<string>();

  for (const ref of references) {
    if (seenLabels.has(ref.label)) continue;
    seenLabels.add(ref.label);

    const typeLabel = ref.type === 'character' ? 'character' :
                     ref.type === 'location' ? 'location' :
                     ref.type === 'look' ? 'outfit' : 'object';

    if (ref.description) {
      descriptions.push(`${ref.label} (${typeLabel}): ${ref.description}`);
    } else {
      descriptions.push(`${ref.label} (${typeLabel})`);
    }
  }

  return `Use the provided reference images for visual consistency.\n\nReferences:\n${descriptions.join('\n')}\n\nScene: ${originalPrompt}`;
}

/**
 * Generate with Nano Banana 2
 * - Without references: text-to-image endpoint
 * - With references: image-to-image/edit endpoint with image_urls
 */
async function generateWithNanoBanana2(
  prompt: string,
  aspectRatio: AspectRatio,
  resolution: Resolution,
  numImages: number,
  onProgress?: ProgressCallback,
  references: ReferenceImage[] = []
): Promise<GenerationResult> {
  const hasReferences = references.length > 0;

  if (hasReferences) {
    console.log(`[ImageGen] Using Nano Banana 2 with ${references.length} reference images`);

    // Build prompt with @ImageN references (like Kling O1)
    const enhancedPrompt = buildNanoBananaPrompt(prompt, references);
    console.log(`[ImageGen] Enhanced prompt: ${enhancedPrompt.substring(0, 200)}...`);

    // Extract URLs for image_urls parameter
    const imageUrls = references.map(r => r.url);

    const input = {
      prompt: enhancedPrompt,
      image_urls: imageUrls,
      aspect_ratio: aspectRatio,
      resolution,
      num_images: numImages,
      output_format: 'webp',
    };

    try {
      // Use the edit/image-to-image endpoint
      const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
        input,
        logs: true,
        onQueueUpdate: async (update) => {
          if (onProgress && update.status === 'IN_PROGRESS') {
            await onProgress(50, 'Nano Banana 2: Génération avec références...');
          } else if (onProgress && update.status === 'IN_QUEUE') {
            await onProgress(25, 'En file d\'attente...');
          }
        },
      });

      const imageUrl = (result.data as any)?.images?.[0]?.url;

      if (!imageUrl) {
        throw new Error('Nano Banana 2 edit returned no image');
      }

      console.log(`[ImageGen] Nano Banana 2 with references success`);

      return {
        imageUrl,
        model: 'nano-banana-2',
        usedReferences: true,
      };
    } catch (error) {
      console.error(`[ImageGen] Nano Banana 2 edit failed:`, error);
      throw error;
    }
  } else {
    console.log(`[ImageGen] Using Nano Banana 2 text-to-image`);

    const input = {
      prompt,
      aspect_ratio: aspectRatio,
      resolution,
      num_images: numImages,
      output_format: 'webp',
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
}

/**
 * Build prompt for Nano Banana 2 with image references
 * Similar to Kling O1, uses @Image1, @Image2 syntax
 */
function buildNanoBananaPrompt(
  originalPrompt: string,
  references: ReferenceImage[]
): string {
  if (references.length === 0) {
    return originalPrompt;
  }

  // Build context explaining each image
  const contextParts: string[] = [];

  // Group references by label
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
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedLabel, 'gi');
    const imageRef = `@Image${indices[0]}`;
    modifiedPrompt = modifiedPrompt.replace(regex, imageRef);
  }

  return `Reference images: ${contextParts.join('. ')}.\n\nCreate this scene: ${modifiedPrompt}`;
}

/**
 * Generate with Grok Imagine (xAI)
 * - Without references: text-to-image endpoint
 * - With references: edit endpoint with image_urls (max 3 images)
 */
async function generateWithGrok(
  prompt: string,
  aspectRatio: AspectRatio,
  resolution: Resolution,
  references: ReferenceImage[],
  numImages: number,
  onProgress?: ProgressCallback
): Promise<GenerationResult> {
  const hasReferences = references.length > 0;

  // Map aspect ratio to Grok's supported values
  const grokAspectMap: Record<string, string> = {
    '16:9': '16:9',
    '9:16': '9:16',
    '1:1': '1:1',
    '4:5': '3:4',
    '2:3': '2:3',
    '21:9': '2:1',
  };

  if (hasReferences) {
    console.log(`[ImageGen] Using Grok Imagine with ${references.length} reference images`);

    const enhancedPrompt = buildReferencePrompt(prompt, references);
    // Grok supports max 3 reference images
    const imageUrls = references.map(r => r.url).slice(0, 3);

    const input = {
      prompt: enhancedPrompt,
      image_urls: imageUrls,
      resolution: resolution === '4K' ? '2k' : '1k',
      num_images: numImages,
      output_format: 'webp',
    };

    try {
      const result = await fal.subscribe('xai/grok-imagine-image/edit', {
        input,
        logs: true,
        onQueueUpdate: async (update) => {
          if (onProgress && update.status === 'IN_PROGRESS') {
            await onProgress(50, 'Grok Imagine: Génération avec références...');
          } else if (onProgress && update.status === 'IN_QUEUE') {
            await onProgress(25, 'En file d\'attente chez Grok...');
          }
        },
      });

      const imageUrl = (result.data as any)?.images?.[0]?.url;

      if (!imageUrl) {
        throw new Error('Grok Imagine edit returned no image');
      }

      console.log(`[ImageGen] Grok Imagine with references success`);

      return {
        imageUrl,
        model: 'grok',
        usedReferences: true,
      };
    } catch (error) {
      console.error(`[ImageGen] Grok Imagine edit failed:`, error);
      throw error;
    }
  } else {
    console.log(`[ImageGen] Using Grok Imagine text-to-image`);

    const input = {
      prompt,
      aspect_ratio: grokAspectMap[aspectRatio] || '1:1',
      resolution: resolution === '4K' ? '2k' : '1k',
      num_images: numImages,
      output_format: 'webp',
    };

    try {
      const result = await fal.subscribe('xai/grok-imagine-image', {
        input,
        logs: true,
        onQueueUpdate: async (update) => {
          if (onProgress && update.status === 'IN_PROGRESS') {
            await onProgress(50, 'Grok Imagine: Génération en cours...');
          } else if (onProgress && update.status === 'IN_QUEUE') {
            await onProgress(25, 'En file d\'attente chez Grok...');
          }
        },
      });

      const imageUrl = (result.data as any)?.images?.[0]?.url;

      if (!imageUrl) {
        throw new Error('Grok Imagine returned no image');
      }

      console.log(`[ImageGen] Grok Imagine success`);

      return {
        imageUrl,
        model: 'grok',
        usedReferences: false,
      };
    } catch (error) {
      console.error(`[ImageGen] Grok Imagine failed:`, error);
      throw error;
    }
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
