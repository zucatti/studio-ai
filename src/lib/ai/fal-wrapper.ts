/**
 * fal.ai API Wrapper with Credit Management
 *
 * Wraps all fal.ai API calls to:
 * 1. Estimate cost before the call
 * 2. Check available budget
 * 3. Make the API call
 * 4. Log actual usage
 * 5. Trigger alerts if needed
 */

import { fal, type QueueStatus } from '@fal-ai/client';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  createCreditService,
  calculateFalCost,
  ensureCredit,
} from '@/lib/credits';
import { isCreditError, formatCreditError } from './credit-error';

// Configure fal.ai client
fal.config({
  credentials: process.env.AI_FAL_KEY,
});

export interface FalWrapperOptions {
  userId: string;
  projectId?: string;
  supabase: SupabaseClient;
  operation: string;
}

export interface FalSubscribeOptions<T> {
  endpoint: string;
  input: T;
  logs?: boolean;
  onQueueUpdate?: (update: QueueStatus) => void;
}

export interface FalWrapperResult<T> {
  result: T;
  cost: number;
  requestId?: string;
}

/**
 * Create a wrapped fal.ai client with credit management
 */
export class FalWrapper {
  private creditService: ReturnType<typeof createCreditService>;
  private userId: string;
  private projectId?: string;
  private supabase: SupabaseClient;
  private operation: string;

  constructor(options: FalWrapperOptions) {
    this.creditService = createCreditService(options.supabase);
    this.userId = options.userId;
    this.projectId = options.projectId;
    this.supabase = options.supabase;
    this.operation = options.operation;
  }

  /**
   * Subscribe to a fal.ai endpoint with automatic credit management
   */
  async subscribe<TInput extends Record<string, unknown>, TOutput>(
    options: FalSubscribeOptions<TInput>
  ): Promise<FalWrapperResult<TOutput>> {
    const { endpoint, input, logs, onQueueUpdate } = options;

    // Step 1: Estimate cost before the call
    const estimatedCost = calculateFalCost(endpoint, 1);

    // Step 2: Check budget
    try {
      await ensureCredit(
        this.creditService,
        this.userId,
        'fal',
        estimatedCost
      );
    } catch (error) {
      // Log the blocked call
      if (isCreditError(error)) {
        await this.creditService.logUsage(this.userId, {
          provider: 'fal',
          endpoint,
          operation: this.operation,
          project_id: this.projectId,
          estimated_cost: estimatedCost,
          status: 'blocked',
          error_message: formatCreditError(error),
        });
      }
      throw error;
    }

    // Step 3: Make the API call
    let result: { data: TOutput; requestId: string };
    try {
      result = await fal.subscribe(endpoint, {
        input,
        logs: logs ?? true,
        onQueueUpdate,
      }) as { data: TOutput; requestId: string };
    } catch (error) {
      // Log failed call
      await this.creditService.logUsage(this.userId, {
        provider: 'fal',
        endpoint,
        operation: this.operation,
        project_id: this.projectId,
        estimated_cost: 0,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }

    // Step 4: Log successful usage
    // Note: fal.ai doesn't return exact cost, so we use estimated
    const actualCost = estimatedCost;

    await this.creditService.logUsage(this.userId, {
      provider: 'fal',
      endpoint,
      operation: this.operation,
      project_id: this.projectId,
      estimated_cost: actualCost,
      status: 'success',
      metadata: {
        requestId: result.requestId,
      },
    });

    return {
      result: result.data,
      cost: actualCost,
      requestId: result.requestId,
    };
  }

  /**
   * Run a fal.ai endpoint directly (non-queued) with credit management
   */
  async run<TInput extends Record<string, unknown>, TOutput>(
    endpoint: string,
    input: TInput
  ): Promise<FalWrapperResult<TOutput>> {
    // Step 1: Estimate cost
    const estimatedCost = calculateFalCost(endpoint, 1);

    // Step 2: Check budget
    try {
      await ensureCredit(
        this.creditService,
        this.userId,
        'fal',
        estimatedCost
      );
    } catch (error) {
      if (isCreditError(error)) {
        await this.creditService.logUsage(this.userId, {
          provider: 'fal',
          endpoint,
          operation: this.operation,
          project_id: this.projectId,
          estimated_cost: estimatedCost,
          status: 'blocked',
          error_message: formatCreditError(error),
        });
      }
      throw error;
    }

    // Step 3: Make the API call
    let result: TOutput;
    try {
      const response = await fal.run(endpoint, { input });
      result = response.data as TOutput;
    } catch (error) {
      await this.creditService.logUsage(this.userId, {
        provider: 'fal',
        endpoint,
        operation: this.operation,
        project_id: this.projectId,
        estimated_cost: 0,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }

    // Step 4: Log success
    await this.creditService.logUsage(this.userId, {
      provider: 'fal',
      endpoint,
      operation: this.operation,
      project_id: this.projectId,
      estimated_cost: estimatedCost,
      status: 'success',
    });

    return {
      result,
      cost: estimatedCost,
    };
  }

  /**
   * Queue a fal.ai request and return the request ID
   */
  async queue<TInput extends Record<string, unknown>>(
    endpoint: string,
    input: TInput
  ): Promise<{ requestId: string; cost: number }> {
    const estimatedCost = calculateFalCost(endpoint, 1);

    try {
      await ensureCredit(
        this.creditService,
        this.userId,
        'fal',
        estimatedCost
      );
    } catch (error) {
      if (isCreditError(error)) {
        await this.creditService.logUsage(this.userId, {
          provider: 'fal',
          endpoint,
          operation: this.operation,
          project_id: this.projectId,
          estimated_cost: estimatedCost,
          status: 'blocked',
          error_message: formatCreditError(error),
        });
      }
      throw error;
    }

    let requestId: string;
    try {
      const queueResult = await fal.queue.submit(endpoint, { input });
      requestId = queueResult.request_id;
    } catch (error) {
      await this.creditService.logUsage(this.userId, {
        provider: 'fal',
        endpoint,
        operation: this.operation,
        project_id: this.projectId,
        estimated_cost: 0,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }

    // Log the queued request (cost will be finalized when result is fetched)
    await this.creditService.logUsage(this.userId, {
      provider: 'fal',
      endpoint,
      operation: this.operation,
      project_id: this.projectId,
      estimated_cost: estimatedCost,
      status: 'success',
      metadata: {
        requestId,
        queued: true,
      },
    });

    return { requestId, cost: estimatedCost };
  }

  /**
   * Get the status of a queued request
   */
  async status(endpoint: string, requestId: string): Promise<QueueStatus> {
    return fal.queue.status(endpoint, { requestId });
  }

  /**
   * Get the result of a completed request
   */
  async result<TOutput>(
    endpoint: string,
    requestId: string
  ): Promise<TOutput> {
    const response = await fal.queue.result(endpoint, { requestId });
    return response.data as TOutput;
  }
}

/**
 * Create a fal.ai wrapper instance
 */
export function createFalWrapper(options: FalWrapperOptions): FalWrapper {
  return new FalWrapper(options);
}

// Common fal.ai endpoint types for convenience
export interface FalImageInput {
  prompt: string;
  negative_prompt?: string;
  image_size?: string | { width: number; height: number };
  num_inference_steps?: number;
  guidance_scale?: number;
  num_images?: number;
  seed?: number;
}

export interface FalImageOutput {
  images: Array<{
    url: string;
    width: number;
    height: number;
    content_type?: string;
  }>;
  seed?: number;
  timings?: Record<string, number>;
}

export interface FalVideoInput {
  prompt?: string;
  image_url?: string;
  duration?: number | string;
  aspect_ratio?: string;
}

export interface FalVideoOutput {
  video: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
  };
}

// Kling v3 specific types
export interface KlingElement {
  frontal_image_url: string;
  reference_image_urls?: string[];
}

export interface KlingVideoInput extends Record<string, unknown> {
  prompt: string;
  start_image_url?: string;
  end_image_url?: string;
  duration?: number;           // 3-15 seconds, default 12
  generate_audio?: boolean;
  negative_prompt?: string;
  cfg_scale?: number;          // default 0.5
  elements?: KlingElement[];   // Character/object references, use @Element1 in prompt
}

export interface KlingVideoOutput {
  video: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
  };
}

// Kling v3 endpoints
export const FAL_KLING_ENDPOINTS = {
  V3_STANDARD_I2V: 'fal-ai/kling-video/v3/standard/image-to-video',
  V3_PRO_I2V: 'fal-ai/kling-video/v3/pro/image-to-video',
  V3_STANDARD_T2V: 'fal-ai/kling-video/v3/standard/text-to-video',
  LIPSYNC: 'fal-ai/kling-video/lipsync/audio-to-video',
} as const;

// OmniHuman 1.5 endpoint
export const FAL_OMNIHUMAN_ENDPOINT = 'fal-ai/bytedance/omnihuman/v1.5';

// Sora 2 endpoint
export const FAL_SORA2_ENDPOINT = 'fal-ai/sora-2/image-to-video';

// Veo 3.1 endpoint
export const FAL_VEO31_ENDPOINT = 'fal-ai/veo3.1/fast/image-to-video';

// OmniHuman 1.5 types
export interface OmniHumanInput extends Record<string, unknown> {
  image_url: string;
  audio_url: string;
  prompt?: string;          // Motion/behavior prompt (NOT dialogue text)
  resolution?: '720p' | '1080p';
  turbo_mode?: boolean;     // Faster but slightly lower quality
}

export interface OmniHumanOutput {
  video: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
  };
}

// Sora 2 types
export interface Sora2Input extends Record<string, unknown> {
  prompt: string;
  image_url: string;
  duration?: 4 | 8 | 12 | 16 | 20;
  resolution?: 'auto' | '720p';
  aspect_ratio?: 'auto' | '9:16' | '16:9';
  model?: 'sora-2' | 'sora-2-2025-12-08' | 'sora-2-2025-10-06';
}

export interface Sora2Output {
  video: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
  };
  video_id?: string;
}

// Veo 3.1 types
export interface Veo31Input extends Record<string, unknown> {
  prompt: string;
  image_url: string;
  duration?: '4s' | '6s' | '8s';
  resolution?: '720p' | '1080p' | '4k';
  aspect_ratio?: '16:9' | '9:16';
  generate_audio?: boolean;
  negative_prompt?: string;
}

export interface Veo31Output {
  video: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
  };
}

/**
 * Generate a video using Kling v3 via fal.ai
 */
export async function generateKlingVideoFal(
  wrapper: FalWrapper,
  input: {
    prompt: string;
    imageUrl?: string;
    endImageUrl?: string;  // Last frame for first-to-last generation
    referenceImages?: string[];  // Character reference images
    duration?: number;
    aspectRatio?: '16:9' | '9:16' | '1:1';
    generateAudio?: boolean;
    negativePrompt?: string;
  }
): Promise<{ videoUrl: string; cost: number }> {
  const {
    prompt,
    imageUrl,
    endImageUrl,
    referenceImages = [],
    duration = 5,
    generateAudio = false,
    negativePrompt = 'blur, distort, low quality, watermark, text',
  } = input;

  // Build elements array for character consistency
  const elements: KlingElement[] = [];

  // If we have reference images, create an element
  if (referenceImages.length > 0) {
    elements.push({
      frontal_image_url: referenceImages[0],
      reference_image_urls: referenceImages.slice(1, 5), // Up to 4 additional refs
    });
  }

  // Build prompt with element reference if needed
  let finalPrompt = prompt;
  if (elements.length > 0 && !prompt.includes('@Element1')) {
    finalPrompt = `@Element1 ${prompt}`;
  }

  const falInput: KlingVideoInput = {
    prompt: finalPrompt,
    duration: Math.max(3, Math.min(15, duration)),
    generate_audio: generateAudio,
    negative_prompt: negativePrompt,
    cfg_scale: 0.5,
  };

  // Add start image if provided
  if (imageUrl) {
    falInput.start_image_url = imageUrl;
  }

  // Add end image if provided (first-to-last frame generation)
  if (endImageUrl) {
    falInput.end_image_url = endImageUrl;
    console.log(`[fal.ai] Using end_image_url for first-to-last generation`);
  }

  // Add elements for character consistency
  if (elements.length > 0) {
    falInput.elements = elements;
  }

  console.log(`[fal.ai] Generating Kling v3 video...`);
  console.log(`[fal.ai] Prompt: ${finalPrompt.substring(0, 100)}...`);
  console.log(`[fal.ai] Duration: ${duration}s, Elements: ${elements.length}`);

  const result = await wrapper.subscribe<KlingVideoInput, KlingVideoOutput>({
    endpoint: FAL_KLING_ENDPOINTS.V3_STANDARD_I2V,
    input: falInput,
    logs: true,
  });

  const videoUrl = result.result.video?.url;

  if (!videoUrl) {
    throw new Error('Kling v3 returned no video URL');
  }

  console.log(`[fal.ai] Kling v3 video URL: ${videoUrl}`);

  return {
    videoUrl,
    cost: result.cost,
  };
}

// Kling LipSync types
export interface KlingLipSyncInput extends Record<string, unknown> {
  video_url: string;
  audio_url: string;
}

export interface KlingLipSyncOutput {
  video: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
  };
}

/**
 * Apply lip-sync to an existing video using Kling LipSync via fal.ai
 * Takes a video + audio and generates video with lip-sync
 */
export async function generateKlingLipSyncFal(
  wrapper: FalWrapper,
  input: {
    videoUrl: string;
    audioUrl: string;
  }
): Promise<{ videoUrl: string; cost: number }> {
  const { videoUrl, audioUrl } = input;

  const falInput: KlingLipSyncInput = {
    video_url: videoUrl,
    audio_url: audioUrl,
  };

  console.log(`[fal.ai] Applying Kling LipSync...`);
  console.log(`[fal.ai] Video: ${videoUrl.substring(0, 60)}...`);
  console.log(`[fal.ai] Audio: ${audioUrl.substring(0, 60)}...`);

  const result = await wrapper.subscribe<KlingLipSyncInput, KlingLipSyncOutput>({
    endpoint: FAL_KLING_ENDPOINTS.LIPSYNC,
    input: falInput,
    logs: true,
  });

  const resultVideoUrl = result.result.video?.url;

  if (!resultVideoUrl) {
    throw new Error('Kling LipSync returned no video URL');
  }

  console.log(`[fal.ai] Kling LipSync video URL: ${resultVideoUrl}`);

  return {
    videoUrl: resultVideoUrl,
    cost: result.cost,
  };
}

/**
 * Generate a video using OmniHuman 1.5 via fal.ai
 * Takes an image + audio and generates video with lip-sync
 */
export async function generateOmniHumanVideoFal(
  wrapper: FalWrapper,
  input: {
    imageUrl: string;
    audioUrl: string;
    prompt?: string;        // Motion/behavior prompt (NOT dialogue text)
    resolution?: '720p' | '1080p';
    turboMode?: boolean;    // Default true for faster generation
  }
): Promise<{ videoUrl: string; cost: number }> {
  const {
    imageUrl,
    audioUrl,
    prompt,
    resolution = '720p',
    turboMode = true,       // Default to turbo for speed
  } = input;

  const falInput: OmniHumanInput = {
    image_url: imageUrl,
    audio_url: audioUrl,
    resolution,
    turbo_mode: turboMode,
  };

  // Add optional motion prompt (for camera/behavior, NOT dialogue text)
  if (prompt) {
    falInput.prompt = prompt;
  }

  console.log(`[fal.ai] Generating OmniHuman 1.5 video...`);
  console.log(`[fal.ai] Image: ${imageUrl.substring(0, 60)}...`);
  console.log(`[fal.ai] Audio: ${audioUrl.substring(0, 60)}...`);
  console.log(`[fal.ai] Resolution: ${resolution}, Turbo: ${turboMode}`);

  const result = await wrapper.subscribe<OmniHumanInput, OmniHumanOutput>({
    endpoint: FAL_OMNIHUMAN_ENDPOINT,
    input: falInput,
    logs: true,
  });

  const videoUrl = result.result.video?.url;

  if (!videoUrl) {
    throw new Error('OmniHuman 1.5 returned no video URL');
  }

  console.log(`[fal.ai] OmniHuman 1.5 video URL: ${videoUrl}`);

  return {
    videoUrl,
    cost: result.cost,
  };
}

/**
 * Generate a video using Sora 2 via fal.ai
 */
export async function generateSora2VideoFal(
  wrapper: FalWrapper,
  input: {
    prompt: string;
    imageUrl: string;
    duration?: 4 | 8 | 12 | 16 | 20;
    aspectRatio?: '9:16' | '16:9';
  }
): Promise<{ videoUrl: string; cost: number }> {
  const {
    prompt,
    imageUrl,
    duration = 8,
    aspectRatio = '16:9',
  } = input;

  const falInput: Sora2Input = {
    prompt,
    image_url: imageUrl,
    duration,
    aspect_ratio: aspectRatio,
    resolution: '720p',
    model: 'sora-2',
  };

  console.log(`[fal.ai] Generating Sora 2 video...`);
  console.log(`[fal.ai] Prompt: ${prompt.substring(0, 100)}...`);
  console.log(`[fal.ai] Duration: ${duration}s, Aspect: ${aspectRatio}`);

  const result = await wrapper.subscribe<Sora2Input, Sora2Output>({
    endpoint: FAL_SORA2_ENDPOINT,
    input: falInput,
    logs: true,
  });

  const videoUrl = result.result.video?.url;

  if (!videoUrl) {
    throw new Error('Sora 2 returned no video URL');
  }

  console.log(`[fal.ai] Sora 2 video URL: ${videoUrl}`);

  return {
    videoUrl,
    cost: result.cost,
  };
}

/**
 * Generate a video using Veo 3.1 via fal.ai
 */
export async function generateVeo31VideoFal(
  wrapper: FalWrapper,
  input: {
    prompt: string;
    imageUrl: string;
    duration?: '4s' | '6s' | '8s';
    aspectRatio?: '9:16' | '16:9';
    resolution?: '720p' | '1080p' | '4k';
    generateAudio?: boolean;
    negativePrompt?: string;
  }
): Promise<{ videoUrl: string; cost: number }> {
  const {
    prompt,
    imageUrl,
    duration = '8s',
    aspectRatio = '16:9',
    resolution = '720p',
    generateAudio = false,
    negativePrompt,
  } = input;

  const falInput: Veo31Input = {
    prompt,
    image_url: imageUrl,
    duration,
    aspect_ratio: aspectRatio,
    resolution,
    generate_audio: generateAudio,
  };

  if (negativePrompt) {
    falInput.negative_prompt = negativePrompt;
  }

  console.log(`[fal.ai] Generating Veo 3.1 video...`);
  console.log(`[fal.ai] Prompt: ${prompt.substring(0, 100)}...`);
  console.log(`[fal.ai] Duration: ${duration}, Aspect: ${aspectRatio}, Resolution: ${resolution}`);

  const result = await wrapper.subscribe<Veo31Input, Veo31Output>({
    endpoint: FAL_VEO31_ENDPOINT,
    input: falInput,
    logs: true,
  });

  const videoUrl = result.result.video?.url;

  if (!videoUrl) {
    throw new Error('Veo 3.1 returned no video URL');
  }

  console.log(`[fal.ai] Veo 3.1 video URL: ${videoUrl}`);

  return {
    videoUrl,
    cost: result.cost,
  };
}

// Re-export QueueStatus type
export type { QueueStatus };
