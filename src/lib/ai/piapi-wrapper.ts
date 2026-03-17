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
}

export function createPiapiWrapper(options: PiapiWrapperOptions): PiapiWrapper {
  return new PiapiWrapper(options);
}
