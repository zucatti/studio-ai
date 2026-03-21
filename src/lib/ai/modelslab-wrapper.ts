/**
 * ModelsLab Wrapper with Credit Management
 *
 * API Base: https://modelslab.com/api/v6
 * Auth: API key in request body
 * Docs: https://docs.modelslab.com/
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  createCreditService,
  calculateModelslabCost,
  ensureCredit,
} from '@/lib/credits';
import { isCreditError, formatCreditError } from './credit-error';

export interface ModelslabWrapperOptions {
  userId: string;
  projectId?: string;
  supabase: SupabaseClient;
  operation: string;
}

export interface ModelslabWrapperResult<T> {
  result: T;
  cost: number;
  taskId?: string;
}

export interface ModelslabTaskResult {
  task_id: string;
  status: 'processing' | 'success' | 'failed' | 'error';
  output?: string[];
  future_links?: string[];
  error?: string;
  eta?: number;
}

// Models available on ModelsLab (2026 catalog)
export type ModelslabModel = string;

// Video models 2026 (v7 API - video-fusion)
export const MODELSLAB_VIDEO_MODELS = {
  // Kling 3.0
  'kling-v3-i2v': 'kling-v3-i2v',
  'kling-v3-t2v': 'kling-v3-t2v',
  // Sora 2
  'sora-2-i2v': 'sora-2-i2v',
  'sora-2-t2v': 'sora-2-t2v',
  // Veo 3
  'veo-3-i2v': 'veo-3-i2v',
  'veo-3-t2v': 'veo-3-t2v',
  // Legacy v6 models
  'text2video': 'text2video',
  'img2video': 'img2video',
  'video2video': 'video2video',
  // Note: OmniHuman 1.5 requires audio - use fal.ai with dialogue enabled
} as const;

// V7 models use video-fusion endpoint
const V7_VIDEO_MODELS = ['kling-v3-i2v', 'kling-v3-t2v', 'sora-2-i2v', 'sora-2-t2v', 'veo-3-i2v', 'veo-3-t2v'];

export interface ImageGenerationInput {
  model: ModelslabModel;
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  samples?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  seed?: number;
  scheduler?: string;
  enhance_prompt?: boolean;
}

export interface VideoGenerationInput {
  model: ModelslabModel;
  prompt?: string;
  negative_prompt?: string;
  init_image?: string;
  init_video?: string;
  width?: number;
  height?: number;
  num_frames?: number;
  fps?: number;
  guidance_scale?: number;
  seed?: number;
}

/**
 * ModelsLab Wrapper with credit management
 */
export class ModelslabWrapper {
  private creditService: ReturnType<typeof createCreditService>;
  private userId: string;
  private projectId?: string;
  private supabase: SupabaseClient;
  private operation: string;
  private apiKey: string;
  private baseUrl = 'https://modelslab.com/api/v6';

  constructor(options: ModelslabWrapperOptions) {
    this.creditService = createCreditService(options.supabase);
    this.userId = options.userId;
    this.projectId = options.projectId;
    this.supabase = options.supabase;
    this.operation = options.operation;
    this.apiKey = process.env.AI_MODELS_LAB || '';
  }

  /**
   * Generate image(s)
   */
  async generateImage(input: ImageGenerationInput): Promise<ModelslabWrapperResult<ModelslabTaskResult>> {
    const samples = input.samples || 1;
    const estimatedCost = calculateModelslabCost(input.model, samples);

    try {
      await ensureCredit(this.creditService, this.userId, 'modelslab', estimatedCost);
    } catch (error) {
      if (isCreditError(error)) {
        await this.creditService.logUsage(this.userId, {
          provider: 'modelslab',
          model: input.model,
          operation: this.operation,
          project_id: this.projectId,
          images_count: samples,
          estimated_cost: estimatedCost,
          status: 'blocked',
          error_message: formatCreditError(error),
        });
      }
      throw error;
    }

    let result: ModelslabTaskResult;
    try {
      // Determine endpoint based on model
      let endpoint: string;
      if (input.model === 'flux' || input.model === 'flux-schnell') {
        endpoint = `${this.baseUrl}/images/flux`;
      } else if (input.model === 'sd-3.5') {
        endpoint = `${this.baseUrl}/images/sd3`;
      } else if (input.model === 'sdxl') {
        endpoint = `${this.baseUrl}/images/sdxl`;
      } else {
        endpoint = `${this.baseUrl}/images/text2img`;
      }

      const body = {
        key: this.apiKey,
        prompt: input.prompt,
        negative_prompt: input.negative_prompt || '',
        width: input.width || 1024,
        height: input.height || 1024,
        samples: samples,
        num_inference_steps: input.num_inference_steps || 30,
        guidance_scale: input.guidance_scale || 7.5,
        seed: input.seed || null,
        scheduler: input.scheduler || 'UniPCMultistepScheduler',
        enhance_prompt: input.enhance_prompt ?? true,
      };

      console.log(`[ModelsLab] Generating image with ${input.model}...`);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      console.log(`[ModelsLab] Response:`, JSON.stringify(data, null, 2));

      if (data.status === 'error' || data.status === 'failed') {
        throw new Error(`ModelsLab error: ${data.message || JSON.stringify(data)}`);
      }

      result = {
        task_id: data.id?.toString() || data.fetch_result || '',
        status: data.status,
        output: data.output,
        future_links: data.future_links,
        eta: data.eta,
      };
    } catch (error) {
      await this.creditService.logUsage(this.userId, {
        provider: 'modelslab',
        model: input.model,
        operation: this.operation,
        project_id: this.projectId,
        images_count: samples,
        estimated_cost: 0,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }

    await this.creditService.logUsage(this.userId, {
      provider: 'modelslab',
      model: input.model,
      operation: this.operation,
      project_id: this.projectId,
      images_count: samples,
      estimated_cost: estimatedCost,
      status: 'success',
      metadata: { taskId: result.task_id },
    });

    return { result, cost: estimatedCost, taskId: result.task_id };
  }

  /**
   * Generate video
   */
  async generateVideo(input: VideoGenerationInput): Promise<ModelslabWrapperResult<ModelslabTaskResult>> {
    const estimatedCost = calculateModelslabCost(input.model, 1, input.num_frames);

    try {
      await ensureCredit(this.creditService, this.userId, 'modelslab', estimatedCost);
    } catch (error) {
      if (isCreditError(error)) {
        await this.creditService.logUsage(this.userId, {
          provider: 'modelslab',
          model: input.model,
          operation: this.operation,
          project_id: this.projectId,
          video_duration: Math.ceil((input.num_frames || 25) / (input.fps || 8)),
          estimated_cost: estimatedCost,
          status: 'blocked',
          error_message: formatCreditError(error),
        });
      }
      throw error;
    }

    let result: ModelslabTaskResult;
    try {
      let endpoint: string;
      const body: Record<string, unknown> = {
        key: this.apiKey,
        prompt: input.prompt || '',
        negative_prompt: input.negative_prompt || '',
      };

      // Check if this is a v7 model (2026 models)
      const isV7Model = V7_VIDEO_MODELS.includes(input.model);

      if (isV7Model) {
        // V7 API - video-fusion endpoint
        endpoint = `https://modelslab.com/api/v7/video-fusion/image-to-video`;
        body.model_id = input.model;
        body.init_image = input.init_image;
        body.duration = Math.ceil((input.num_frames || 40) / 8); // Convert frames to seconds
        // V7 doesn't use width/height the same way
      } else {
        // Legacy v6 API
        body.width = input.width || 512;
        body.height = input.height || 512;
        body.num_frames = input.num_frames || 25;
        body.fps = input.fps || 8;
        body.guidance_scale = input.guidance_scale || 7.5;
        body.seed = input.seed || null;

        if (input.model === 'img2video' && input.init_image) {
          endpoint = `${this.baseUrl}/video/img2video`;
          body.init_image = input.init_image;
        } else if (input.model === 'video2video' && input.init_video) {
          endpoint = `${this.baseUrl}/video/video2video`;
          body.init_video = input.init_video;
        } else {
          endpoint = `${this.baseUrl}/video/text2video`;
        }
      }

      console.log(`[ModelsLab] Generating video with ${input.model} (${isV7Model ? 'v7' : 'v6'})...`);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      console.log(`[ModelsLab] Video response:`, JSON.stringify(data, null, 2));

      if (data.status === 'error' || data.status === 'failed') {
        throw new Error(`ModelsLab video error: ${data.message || JSON.stringify(data)}`);
      }

      result = {
        task_id: data.id?.toString() || data.fetch_result || '',
        status: data.status,
        output: data.output,
        future_links: data.future_links,
        eta: data.eta,
      };
    } catch (error) {
      await this.creditService.logUsage(this.userId, {
        provider: 'modelslab',
        model: input.model,
        operation: this.operation,
        project_id: this.projectId,
        video_duration: Math.ceil((input.num_frames || 25) / (input.fps || 8)),
        estimated_cost: 0,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }

    await this.creditService.logUsage(this.userId, {
      provider: 'modelslab',
      model: input.model,
      operation: this.operation,
      project_id: this.projectId,
      video_duration: Math.ceil((input.num_frames || 25) / (input.fps || 8)),
      estimated_cost: estimatedCost,
      status: 'success',
      metadata: { taskId: result.task_id },
    });

    return { result, cost: estimatedCost, taskId: result.task_id };
  }

  /**
   * Fetch queued result
   */
  async fetchResult(taskId: string, type: 'image' | 'video' = 'image'): Promise<ModelslabTaskResult> {
    const endpoint = type === 'video'
      ? `${this.baseUrl}/video/fetch`
      : `${this.baseUrl}/images/fetch`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: this.apiKey,
        request_id: taskId,
      }),
    });

    const data = await response.json();

    return {
      task_id: taskId,
      status: data.status,
      output: data.output,
      error: data.message,
    };
  }

  /**
   * Wait for task completion
   */
  async waitForResult(taskId: string, type: 'image' | 'video' = 'image', maxWaitMs = 120000): Promise<ModelslabTaskResult> {
    const startTime = Date.now();
    const pollInterval = 3000;

    while (Date.now() - startTime < maxWaitMs) {
      const result = await this.fetchResult(taskId, type);

      if (result.status === 'success' && result.output && result.output.length > 0) {
        return result;
      }

      if (result.status === 'error' || result.status === 'failed') {
        throw new Error(`ModelsLab task failed: ${result.error}`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('ModelsLab task timed out');
  }
}

export function createModelslabWrapper(options: ModelslabWrapperOptions): ModelslabWrapper {
  return new ModelslabWrapper(options);
}
