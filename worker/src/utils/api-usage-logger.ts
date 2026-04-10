/**
 * API Usage Logger for Worker
 *
 * Logs API calls to the database for tracking spending.
 * This is the worker-side equivalent of logApiUsageFromWorker in src/lib/ai/log-api-usage.ts
 */

import { getSupabase } from '../supabase.js';

// Provider types matching the main app
type ApiProvider = 'claude' | 'fal' | 'runway' | 'elevenlabs' | 'global';

// Pricing configuration (duplicated from src/lib/credits.ts for worker isolation)
const FAL_PRICES: Record<string, number> = {
  // Image generation
  'fal-ai/nano-banana-2': 0.04,
  'nanobanana': 0.04,
  'seedream-5': 0.03,
  'fal-ai/seedream-v4': 0.03,
  'fal-ai/flux/schnell': 0.003,
  'fal-ai/flux/dev': 0.01,
  'fal-ai/ideogram/character': 0.06,
  'fal-ai/kling-image/o1': 0.05,
  'kling-o1': 0.05,
  'fal-ai/image-apps-v2/perspective': 0.02,
  // Video generation (per second)
  'fal-ai/kling-video/v1.6/standard/image-to-video': 0.07,
  'fal-ai/kling-video/v1.6/pro/image-to-video': 0.10,
  'fal-ai/kling-video/v2.0/standard/image-to-video': 0.07,
  'fal-ai/kling-video/v2.0/pro/image-to-video': 0.10,
  'kling-omni': 0.07, // Per second
  'kling-2.5': 0.07,
  'fal-ai/veo-3': 0.40,
  'veo-3': 0.40,
  'fal-ai/minimax-video/image-to-video': 0.15,
  'omnihuman-1': 0.20,
  default: 0.04,
};

const RUNWAY_PRICES: Record<string, number> = {
  'gen4.5': 0.12,
  'gen-4.5': 0.12,
  'gen4': 0.05,
  'gen-4': 0.05,
  'gen4-turbo': 0.05,
  'gen-4-turbo': 0.05,
  'veo-3': 0.40,
  'veo-3.1': 0.25,
  default: 0.05,
};

const ELEVENLABS_PRICES: Record<string, number> = {
  'eleven_multilingual_v2': 0.30,
  'eleven_turbo_v2': 0.15,
  'eleven_monolingual_v1': 0.30,
  'eleven_v3': 0.30,
  default: 0.30,
};

interface LogApiUsageParams {
  provider: ApiProvider;
  operation: string;
  model?: string;
  endpoint?: string;
  estimatedCost?: number;
  projectId?: string;
  status?: 'success' | 'error' | 'pending';
  errorMessage?: string;
  // Provider-specific metrics
  inputTokens?: number;
  outputTokens?: number;
  characters?: number;
  imagesCount?: number;
  videoDuration?: number;
}

/**
 * Calculate cost based on provider and model
 */
function calculateCost(params: LogApiUsageParams): number {
  const model = params.model || params.endpoint || 'default';

  switch (params.provider) {
    case 'fal': {
      const price = FAL_PRICES[model] || FAL_PRICES.default;
      // For video, multiply by duration
      if (params.videoDuration && params.videoDuration > 0) {
        return price * params.videoDuration;
      }
      // For images, multiply by count
      return price * (params.imagesCount || 1);
    }

    case 'runway': {
      const price = RUNWAY_PRICES[model] || RUNWAY_PRICES.default;
      return price * (params.videoDuration || 5);
    }

    case 'elevenlabs': {
      const price = ELEVENLABS_PRICES[model] || ELEVENLABS_PRICES.default;
      return ((params.characters || 0) * price) / 1000;
    }

    default:
      return 0;
  }
}

/**
 * Log API usage from worker context
 *
 * @param userId - The user ID (from job data)
 * @param params - Usage parameters
 */
export async function logApiUsageFromWorker(
  userId: string,
  params: LogApiUsageParams
): Promise<void> {
  try {
    const supabase = getSupabase();

    // Calculate cost if not provided
    let estimatedCost = params.estimatedCost;
    if (estimatedCost === undefined) {
      estimatedCost = calculateCost(params);
    }

    console.log(
      `[ApiUsageLogger] Logging: ${params.provider} ${params.operation} model=${params.model || 'n/a'} cost=$${estimatedCost.toFixed(4)}`
    );

    const { data, error } = await supabase
      .from('api_usage_logs')
      .insert({
        user_id: userId,
        project_id: params.projectId || null,
        provider: params.provider,
        model: params.model || null,
        endpoint: params.endpoint || null,
        operation: params.operation,
        input_tokens: params.inputTokens || null,
        output_tokens: params.outputTokens || null,
        characters: params.characters || null,
        images_count: params.imagesCount || null,
        video_duration: params.videoDuration || null,
        estimated_cost: estimatedCost,
        status: params.status || 'success',
        error_message: params.errorMessage || null,
      })
      .select();

    if (error) {
      console.error(`[ApiUsageLogger] Failed:`, error.message, error.details);
    } else {
      console.log(`[ApiUsageLogger] OK, id: ${data?.[0]?.id}`);
    }
  } catch (error) {
    console.error(`[ApiUsageLogger] Error:`, error);
  }
}

// Convenience functions for specific providers

export async function logFalUsage(
  userId: string,
  options: {
    operation: string;
    model: string;
    projectId?: string;
    imagesCount?: number;
    videoDuration?: number;
    estimatedCost?: number;
  }
): Promise<void> {
  await logApiUsageFromWorker(userId, {
    provider: 'fal',
    operation: options.operation,
    model: options.model,
    endpoint: options.model,
    projectId: options.projectId,
    imagesCount: options.imagesCount,
    videoDuration: options.videoDuration,
    estimatedCost: options.estimatedCost,
  });
}

export async function logElevenLabsUsage(
  userId: string,
  options: {
    operation: string;
    model?: string;
    projectId?: string;
    characters?: number;
    estimatedCost?: number;
  }
): Promise<void> {
  await logApiUsageFromWorker(userId, {
    provider: 'elevenlabs',
    operation: options.operation,
    model: options.model || 'eleven_v3',
    projectId: options.projectId,
    characters: options.characters,
    estimatedCost: options.estimatedCost,
  });
}

export async function logRunwayUsage(
  userId: string,
  options: {
    operation: string;
    model: string;
    projectId?: string;
    videoDuration?: number;
    estimatedCost?: number;
  }
): Promise<void> {
  await logApiUsageFromWorker(userId, {
    provider: 'runway',
    operation: options.operation,
    model: options.model,
    projectId: options.projectId,
    videoDuration: options.videoDuration,
    estimatedCost: options.estimatedCost,
  });
}
