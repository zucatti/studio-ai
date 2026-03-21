/**
 * Runway ML Wrapper with Credit Management
 *
 * API Docs: https://docs.dev.runwayml.com/
 * Models: Gen-4, Gen-4.5, Gen-4 Aleph
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  createCreditService,
  calculateRunwayCost,
  calculateRunwayCostAsync,
  ensureCredit,
} from '@/lib/credits';
import { isCreditError, formatCreditError } from './credit-error';

export interface RunwayWrapperOptions {
  userId: string;
  projectId?: string;
  supabase: SupabaseClient;
  operation: string;
}

export interface RunwayWrapperResult<T> {
  result: T;
  cost: number;
  taskId?: string;
}

export interface RunwayTaskResult {
  task_id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  output?: string[];
  error?: string;
  progress?: number;
}

// Runway models
export type RunwayModel =
  | 'gen4.5'        // Gen-4.5 (latest, image-to-video)
  | 'gen4'          // Gen-4 (image-to-video)
  | 'gen4-aleph'    // Gen-4 Aleph (video-to-video)
  | 'gen4-image';   // Gen-4 Image (text-to-image)

export interface VideoGenerationInput {
  model: RunwayModel;
  prompt: string;
  image_url?: string;       // First frame (required for gen4/gen4.5)
  image_end_url?: string;   // Last frame (optional keyframe)
  video_url?: string;       // For video-to-video (gen4-aleph)
  duration?: 5 | 10;        // Seconds
  ratio?: '1280:720' | '720:1280' | '1104:832' | '832:1104';
  watermark?: boolean;
}

export interface ImageGenerationInput {
  model: 'gen4-image';
  prompt: string;
  ratio?: string;
}

/**
 * Runway ML Wrapper with credit management
 */
export class RunwayWrapper {
  private creditService: ReturnType<typeof createCreditService>;
  private userId: string;
  private projectId?: string;
  private supabase: SupabaseClient;
  private operation: string;
  private apiKey: string;
  private baseUrl = 'https://api.dev.runwayml.com/v1';

  constructor(options: RunwayWrapperOptions) {
    this.creditService = createCreditService(options.supabase);
    this.userId = options.userId;
    this.projectId = options.projectId;
    this.supabase = options.supabase;
    this.operation = options.operation;
    this.apiKey = process.env.AI_RUNWAY_ML || '';
  }

  /**
   * Generate video from image (Gen-4, Gen-4.5)
   */
  async generateVideo(input: VideoGenerationInput): Promise<RunwayWrapperResult<RunwayTaskResult>> {
    // Use DB-backed pricing with fallback
    const estimatedCost = await calculateRunwayCostAsync(input.model, input.duration || 5);

    try {
      await ensureCredit(this.creditService, this.userId, 'runway', estimatedCost);
    } catch (error) {
      if (isCreditError(error)) {
        await this.creditService.logUsage(this.userId, {
          provider: 'runway',
          model: input.model,
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

    let result: RunwayTaskResult;
    try {
      // Determine endpoint based on model
      let endpoint: string;
      const body: Record<string, unknown> = {
        model: input.model,
        promptText: input.prompt,
        ratio: input.ratio || '1280:720',
        duration: input.duration || 5,
        watermark: input.watermark ?? false,
      };

      if (input.model === 'gen4-aleph' && input.video_url) {
        // Video-to-video
        endpoint = `${this.baseUrl}/video_to_video`;
        body.videoUrl = input.video_url;
      } else {
        // Image-to-video
        endpoint = `${this.baseUrl}/image_to_video`;
        if (input.image_url) {
          body.imageUrl = input.image_url;
        }
        if (input.image_end_url) {
          body.lastFrameUrl = input.image_end_url;
        }
      }

      console.log(`[Runway] Generating video with ${input.model}...`);
      console.log(`[Runway] Request:`, JSON.stringify(body, null, 2));

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Runway-Version': '2024-11-06',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      console.log(`[Runway] Response:`, JSON.stringify(data, null, 2));

      if (!response.ok) {
        throw new Error(`Runway error: ${response.status} - ${JSON.stringify(data)}`);
      }

      result = {
        task_id: data.id,
        status: data.status || 'PENDING',
        output: data.output,
      };
    } catch (error) {
      await this.creditService.logUsage(this.userId, {
        provider: 'runway',
        model: input.model,
        operation: this.operation,
        project_id: this.projectId,
        video_duration: input.duration || 5,
        estimated_cost: 0,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }

    await this.creditService.logUsage(this.userId, {
      provider: 'runway',
      model: input.model,
      operation: this.operation,
      project_id: this.projectId,
      video_duration: input.duration || 5,
      estimated_cost: estimatedCost,
      status: 'success',
      metadata: { taskId: result.task_id },
    });

    return { result, cost: estimatedCost, taskId: result.task_id };
  }

  /**
   * Generate image (Gen-4 Image)
   */
  async generateImage(input: ImageGenerationInput): Promise<RunwayWrapperResult<RunwayTaskResult>> {
    // Use DB-backed pricing with fallback
    const estimatedCost = await calculateRunwayCostAsync('gen4-image', 1);

    try {
      await ensureCredit(this.creditService, this.userId, 'runway', estimatedCost);
    } catch (error) {
      if (isCreditError(error)) {
        await this.creditService.logUsage(this.userId, {
          provider: 'runway',
          model: input.model,
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

    let result: RunwayTaskResult;
    try {
      const response = await fetch(`${this.baseUrl}/text_to_image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Runway-Version': '2024-11-06',
        },
        body: JSON.stringify({
          model: input.model,
          promptText: input.prompt,
          ratio: input.ratio || '16:9',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`Runway image error: ${response.status} - ${JSON.stringify(data)}`);
      }

      result = {
        task_id: data.id,
        status: data.status || 'PENDING',
        output: data.output,
      };
    } catch (error) {
      await this.creditService.logUsage(this.userId, {
        provider: 'runway',
        model: input.model,
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
      provider: 'runway',
      model: input.model,
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
   * Get task status
   */
  async getTask(taskId: string): Promise<RunwayTaskResult> {
    const response = await fetch(`${this.baseUrl}/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Runway-Version': '2024-11-06',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Runway fetch error: ${response.status} - ${JSON.stringify(data)}`);
    }

    return {
      task_id: taskId,
      status: data.status,
      output: data.output,
      error: data.failure,
      progress: data.progress,
    };
  }

  /**
   * Wait for task completion (polling)
   */
  async waitForTask(taskId: string, maxWaitMs = 300000): Promise<RunwayTaskResult> {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < maxWaitMs) {
      const task = await this.getTask(taskId);

      if (task.status === 'SUCCEEDED') {
        return task;
      }

      if (task.status === 'FAILED') {
        throw new Error(`Runway task failed: ${task.error}`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Runway task timed out');
  }
}

export function createRunwayWrapper(options: RunwayWrapperOptions): RunwayWrapper {
  return new RunwayWrapper(options);
}
