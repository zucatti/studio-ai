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

// Re-export QueueStatus type
export type { QueueStatus };
