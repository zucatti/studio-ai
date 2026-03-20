/**
 * PiAPI Wrapper with Credit Management
 *
 * Wraps PiAPI calls (Midjourney-style API) with credit management
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  createCreditService,
  calculatePiapiCost,
  ensureCredit,
} from '@/lib/credits';
import { isCreditError, formatCreditError } from './credit-error';

export interface PiapiWrapperOptions {
  userId: string;
  projectId?: string;
  supabase: SupabaseClient;
  operation: string;
}

export interface PiapiWrapperResult<T> {
  result: T;
  cost: number;
  taskId?: string;
}

export interface MidjourneyImagineInput {
  prompt: string;
  aspect_ratio?: string;
  process_mode?: 'relax' | 'fast' | 'turbo';
  webhook_endpoint?: string;
  webhook_secret?: string;
}

export interface MidjourneyTaskResult {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  image_url?: string;
  error?: string;
}

// Video generation models supported by PiAPI
export type VideoModel =
  | 'kling-omni'    // Kuaishou Kling Omni (latest)
  | 'seedance-2'    // ByteDance Seedance 2
  | 'sora-2'        // OpenAI Sora 2
  | 'veo-3'         // Google Veo 3
  | 'kling-2'       // Kuaishou Kling 2.0
  | 'wan-2.1'       // Alibaba Wan 2.1
  | 'hunyuan';      // Tencent Hunyuan

export interface VideoGenerationInput {
  model: VideoModel;
  prompt?: string;
  first_frame_url: string;
  last_frame_url?: string;
  duration?: number; // 5, 10, or 15 seconds
  aspect_ratio?: '9:16' | '16:9' | '1:1';
}

export interface VideoTaskResult {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  video_url?: string;
  error?: string;
  progress?: number;
}

/**
 * PiAPI Wrapper with credit management
 */
export class PiapiWrapper {
  private creditService: ReturnType<typeof createCreditService>;
  private userId: string;
  private projectId?: string;
  private supabase: SupabaseClient;
  private operation: string;
  private apiKey: string;
  private baseUrl = 'https://api.piapi.ai';

  constructor(options: PiapiWrapperOptions) {
    this.creditService = createCreditService(options.supabase);
    this.userId = options.userId;
    this.projectId = options.projectId;
    this.supabase = options.supabase;
    this.operation = options.operation;
    this.apiKey = process.env.AI_PIAPI_KEY || '';
  }

  /**
   * Generate an image using Midjourney via PiAPI
   */
  async imagine(input: MidjourneyImagineInput): Promise<PiapiWrapperResult<MidjourneyTaskResult>> {
    const operationType = 'midjourney-imagine';
    const estimatedCost = calculatePiapiCost(operationType, 1);

    // Check budget
    try {
      await ensureCredit(
        this.creditService,
        this.userId,
        'piapi',
        estimatedCost
      );
    } catch (error) {
      if (isCreditError(error)) {
        await this.creditService.logUsage(this.userId, {
          provider: 'piapi',
          model: operationType,
          operation: this.operation,
          project_id: this.projectId,
          images_count: 1,
          estimated_cost: estimatedCost,
          status: 'blocked',
          error_message: formatCreditError(error),
        });
      }
      throw error;
    }

    // Make API call
    let result: MidjourneyTaskResult;
    try {
      const response = await fetch(`${this.baseUrl}/mj/v2/imagine`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`PiAPI error: ${response.status} - ${errorText}`);
      }

      result = await response.json();
    } catch (error) {
      await this.creditService.logUsage(this.userId, {
        provider: 'piapi',
        model: operationType,
        operation: this.operation,
        project_id: this.projectId,
        images_count: 1,
        estimated_cost: 0,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }

    // Log success
    await this.creditService.logUsage(this.userId, {
      provider: 'piapi',
      model: operationType,
      operation: this.operation,
      project_id: this.projectId,
      images_count: 1,
      estimated_cost: estimatedCost,
      status: 'success',
      metadata: { taskId: result.task_id },
    });

    return {
      result,
      cost: estimatedCost,
      taskId: result.task_id,
    };
  }

  /**
   * Get task status
   */
  async getTask(taskId: string): Promise<MidjourneyTaskResult> {
    const response = await fetch(`${this.baseUrl}/mj/v2/fetch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({ task_id: taskId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PiAPI error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Upscale an image
   */
  async upscale(taskId: string, index: 1 | 2 | 3 | 4): Promise<PiapiWrapperResult<MidjourneyTaskResult>> {
    const operationType = 'midjourney-upscale';
    const estimatedCost = calculatePiapiCost(operationType, 1);

    try {
      await ensureCredit(this.creditService, this.userId, 'piapi', estimatedCost);
    } catch (error) {
      if (isCreditError(error)) {
        await this.creditService.logUsage(this.userId, {
          provider: 'piapi',
          model: operationType,
          operation: this.operation,
          project_id: this.projectId,
          images_count: 1,
          estimated_cost: estimatedCost,
          status: 'blocked',
          error_message: formatCreditError(error),
        });
      }
      throw error;
    }

    let result: MidjourneyTaskResult;
    try {
      const response = await fetch(`${this.baseUrl}/mj/v2/upscale`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify({ origin_task_id: taskId, index: `U${index}` }),
      });

      if (!response.ok) {
        throw new Error(`PiAPI upscale error: ${response.status}`);
      }

      result = await response.json();
    } catch (error) {
      await this.creditService.logUsage(this.userId, {
        provider: 'piapi',
        model: operationType,
        operation: this.operation,
        project_id: this.projectId,
        images_count: 1,
        estimated_cost: 0,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }

    await this.creditService.logUsage(this.userId, {
      provider: 'piapi',
      model: operationType,
      operation: this.operation,
      project_id: this.projectId,
      images_count: 1,
      estimated_cost: estimatedCost,
      status: 'success',
      metadata: { taskId: result.task_id },
    });

    return { result, cost: estimatedCost, taskId: result.task_id };
  }

  /**
   * Generate video from image(s) using various AI video models
   */
  async generateVideo(input: VideoGenerationInput): Promise<PiapiWrapperResult<VideoTaskResult>> {
    const operationType = input.model;
    const estimatedCost = calculatePiapiCost(operationType, 1);

    // Check budget
    try {
      await ensureCredit(this.creditService, this.userId, 'piapi', estimatedCost);
    } catch (error) {
      if (isCreditError(error)) {
        await this.creditService.logUsage(this.userId, {
          provider: 'piapi',
          model: operationType,
          operation: this.operation,
          project_id: this.projectId,
          video_duration: input.duration || 5,
          estimated_cost: estimatedCost,
          status: 'blocked',
          error_message: formatCreditError(error),
        });
      }
      throw error;
    }

    // Map model to PiAPI endpoint
    const endpointMap: Record<VideoModel, string> = {
      'kling-omni': '/kling/v2/video/image-to-video',
      'seedance-2': '/seedance/v2/video/image-to-video',
      'sora-2': '/sora/v2/video/image-to-video',
      'veo-3': '/veo/v2/video/image-to-video',
      'kling-2': '/kling/v1/video/image-to-video',
      'wan-2.1': '/wan/v2/video/image-to-video',
      'hunyuan': '/hunyuan/v1/video/image-to-video',
    };

    const endpoint = endpointMap[input.model] || endpointMap['kling-omni'];

    // Make API call
    let result: VideoTaskResult;
    try {
      const requestBody: Record<string, unknown> = {
        prompt: input.prompt || 'Smooth cinematic motion',
        start_image_url: input.first_frame_url,
        duration: String(input.duration || 5),
        aspect_ratio: input.aspect_ratio || '16:9',
      };

      // Add end frame if available (for interpolation)
      if (input.last_frame_url) {
        requestBody.end_image_url = input.last_frame_url;
      }

      console.log(`[PiAPI] Generating video with ${input.model}...`);
      console.log(`[PiAPI] Endpoint: ${this.baseUrl}${endpoint}`);
      console.log(`[PiAPI] Input:`, JSON.stringify(requestBody, null, 2));

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`PiAPI video error: ${response.status} - ${errorText}`);
      }

      result = await response.json();
    } catch (error) {
      await this.creditService.logUsage(this.userId, {
        provider: 'piapi',
        model: operationType,
        operation: this.operation,
        project_id: this.projectId,
        video_duration: input.duration || 5,
        estimated_cost: 0,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }

    // Log success
    await this.creditService.logUsage(this.userId, {
      provider: 'piapi',
      model: operationType,
      operation: this.operation,
      project_id: this.projectId,
      video_duration: input.duration || 5,
      estimated_cost: estimatedCost,
      status: 'success',
      metadata: { taskId: result.task_id },
    });

    return {
      result,
      cost: estimatedCost,
      taskId: result.task_id,
    };
  }

  /**
   * Get video task status
   */
  async getVideoTask(taskId: string): Promise<VideoTaskResult> {
    const response = await fetch(`${this.baseUrl}/video/v2/fetch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({ task_id: taskId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PiAPI video fetch error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }
}

export function createPiapiWrapper(options: PiapiWrapperOptions): PiapiWrapper {
  return new PiapiWrapper(options);
}
