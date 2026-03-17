/**
 * Replicate API Wrapper with Credit Management
 *
 * Wraps all Replicate API calls to:
 * 1. Estimate cost before the call
 * 2. Check available budget
 * 3. Make the API call
 * 4. Log actual usage
 * 5. Trigger alerts if needed
 */

import Replicate from 'replicate';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  createCreditService,
  calculateReplicateCost,
  ensureCredit,
  REPLICATE_PRICES,
} from '@/lib/credits';
import { isCreditError, formatCreditError } from './credit-error';

export interface ReplicateWrapperOptions {
  userId: string;
  projectId?: string;
  supabase: SupabaseClient;
  operation: string;
}

export interface ReplicateRunOptions {
  model: `${string}/${string}` | `${string}/${string}:${string}`;
  input: Record<string, unknown>;
  wait?: boolean | { interval?: number };
}

export interface ReplicateWrapperResult<T> {
  output: T;
  cost: number;
  predictionId?: string;
}

/**
 * Create a wrapped Replicate client with credit management
 */
export class ReplicateWrapper {
  private client: Replicate;
  private creditService: ReturnType<typeof createCreditService>;
  private userId: string;
  private projectId?: string;
  private supabase: SupabaseClient;
  private operation: string;

  constructor(options: ReplicateWrapperOptions) {
    this.client = new Replicate({
      auth: process.env.AI_REPLICATE_KEY,
    });
    this.creditService = createCreditService(options.supabase);
    this.userId = options.userId;
    this.projectId = options.projectId;
    this.supabase = options.supabase;
    this.operation = options.operation;
  }

  /**
   * Extract model name from the full model identifier
   */
  private extractModelName(model: string): string {
    // Format: owner/name or owner/name:version
    const parts = model.split(':')[0].split('/');
    return parts[1] || parts[0];
  }

  /**
   * Run a Replicate model with automatic credit management
   */
  async run<T = unknown>(options: ReplicateRunOptions): Promise<ReplicateWrapperResult<T>> {
    const { model, input, wait = true } = options;
    const modelName = this.extractModelName(model);

    // Step 1: Estimate cost before the call
    const imagesCount = (input.num_outputs as number) || 1;
    const estimatedCost = calculateReplicateCost(modelName, imagesCount);

    // Step 2: Check budget
    try {
      await ensureCredit(
        this.creditService,
        this.userId,
        'replicate',
        estimatedCost
      );
    } catch (error) {
      if (isCreditError(error)) {
        await this.creditService.logUsage(this.userId, {
          provider: 'replicate',
          model: modelName,
          operation: this.operation,
          project_id: this.projectId,
          images_count: imagesCount,
          estimated_cost: estimatedCost,
          status: 'blocked',
          error_message: formatCreditError(error),
        });
      }
      throw error;
    }

    // Step 3: Make the API call
    let output: T;
    let predictionId: string | undefined;
    try {
      if (wait) {
        output = await this.client.run(model, { input }) as T;
      } else {
        const prediction = await this.client.predictions.create({
          model,
          input,
        });
        predictionId = prediction.id;
        // Wait for completion
        const completed = await this.client.wait(prediction);
        output = completed.output as T;
      }
    } catch (error) {
      await this.creditService.logUsage(this.userId, {
        provider: 'replicate',
        model: modelName,
        operation: this.operation,
        project_id: this.projectId,
        images_count: imagesCount,
        estimated_cost: 0,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }

    // Step 4: Log successful usage
    await this.creditService.logUsage(this.userId, {
      provider: 'replicate',
      model: modelName,
      operation: this.operation,
      project_id: this.projectId,
      images_count: imagesCount,
      estimated_cost: estimatedCost,
      status: 'success',
      metadata: {
        predictionId,
      },
    });

    return {
      output,
      cost: estimatedCost,
      predictionId,
    };
  }

  /**
   * Create a prediction without waiting for it to complete
   */
  async createPrediction(
    model: `${string}/${string}` | `${string}/${string}:${string}`,
    input: Record<string, unknown>
  ): Promise<{ id: string; cost: number }> {
    const modelName = this.extractModelName(model);
    const imagesCount = (input.num_outputs as number) || 1;
    const estimatedCost = calculateReplicateCost(modelName, imagesCount);

    try {
      await ensureCredit(
        this.creditService,
        this.userId,
        'replicate',
        estimatedCost
      );
    } catch (error) {
      if (isCreditError(error)) {
        await this.creditService.logUsage(this.userId, {
          provider: 'replicate',
          model: modelName,
          operation: this.operation,
          project_id: this.projectId,
          images_count: imagesCount,
          estimated_cost: estimatedCost,
          status: 'blocked',
          error_message: formatCreditError(error),
        });
      }
      throw error;
    }

    let prediction: Awaited<ReturnType<typeof this.client.predictions.create>>;
    try {
      prediction = await this.client.predictions.create({
        model,
        input,
      });
    } catch (error) {
      await this.creditService.logUsage(this.userId, {
        provider: 'replicate',
        model: modelName,
        operation: this.operation,
        project_id: this.projectId,
        images_count: imagesCount,
        estimated_cost: 0,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }

    // Log the queued prediction
    await this.creditService.logUsage(this.userId, {
      provider: 'replicate',
      model: modelName,
      operation: this.operation,
      project_id: this.projectId,
      images_count: imagesCount,
      estimated_cost: estimatedCost,
      status: 'success',
      metadata: {
        predictionId: prediction.id,
        queued: true,
      },
    });

    return { id: prediction.id, cost: estimatedCost };
  }

  /**
   * Get a prediction by ID
   */
  async getPrediction(id: string) {
    return this.client.predictions.get(id);
  }

  /**
   * Wait for a prediction to complete
   */
  async waitForPrediction(prediction: Awaited<ReturnType<typeof this.client.predictions.get>>) {
    return this.client.wait(prediction);
  }

  /**
   * Cancel a prediction
   */
  async cancelPrediction(id: string) {
    return this.client.predictions.cancel(id);
  }

  /**
   * Get the underlying Replicate client for advanced usage
   * Note: Using this directly bypasses credit management!
   */
  getClient(): Replicate {
    return this.client;
  }
}

/**
 * Create a Replicate wrapper instance
 */
export function createReplicateWrapper(
  options: ReplicateWrapperOptions
): ReplicateWrapper {
  return new ReplicateWrapper(options);
}

// Common Replicate model identifiers
export const REPLICATE_MODELS = {
  FLUX_SCHNELL: 'black-forest-labs/flux-schnell',
  FLUX_DEV: 'black-forest-labs/flux-dev',
  FLUX_PRO: 'black-forest-labs/flux-pro',
  FLUX_1_1_PRO: 'black-forest-labs/flux-1.1-pro',
  SDXL: 'stability-ai/sdxl',
  IDEOGRAM_V2: 'ideogram-ai/ideogram-v2',
} as const;
