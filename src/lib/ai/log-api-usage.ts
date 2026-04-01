/**
 * Simple API Usage Logger
 *
 * Helper function to log API usage from existing routes without requiring
 * a full refactor. Call this after successful API operations.
 */

import { createServerSupabaseClient } from '@/lib/supabase';
import { ApiProvider, ApiCallStatus } from '@/types/database';
import {
  calculateFalCost,
  calculateRunwayCost,
  calculateElevenLabsCost,
  calculateClaudeCost,
} from '@/lib/credits';
import { auth0 } from '@/lib/auth0';

interface LogApiUsageParams {
  provider: ApiProvider;
  operation: string;
  model?: string;
  endpoint?: string;
  estimatedCost?: number;
  projectId?: string;
  status?: ApiCallStatus;
  errorMessage?: string;
  // Provider-specific metrics
  inputTokens?: number;
  outputTokens?: number;
  characters?: number;
  imagesCount?: number;
  videoDuration?: number;
}

/**
 * Log API usage to the database
 *
 * This is a fire-and-forget function - errors are logged but won't throw
 */
export async function logApiUsage(params: LogApiUsageParams): Promise<void> {
  try {
    const session = await auth0.getSession();

    if (!session?.user) {
      console.warn('[logApiUsage] No authenticated user');
      return;
    }

    const supabase = createServerSupabaseClient();

    // Calculate cost if not provided
    let estimatedCost = params.estimatedCost;
    if (estimatedCost === undefined) {
      estimatedCost = calculateCostForProvider(params);
    }

    console.log('[logApiUsage] Logging:', params.provider, params.operation, 'cost:', estimatedCost);

    const { data, error } = await supabase.from('api_usage_logs').insert({
      user_id: session.user.sub,
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
    }).select();

    if (error) {
      console.error('[logApiUsage] Failed:', error.message, error.details, error.hint);
    } else {
      console.log('[logApiUsage] OK, id:', data?.[0]?.id);
    }
  } catch (error) {
    console.error('[logApiUsage] Error:', error);
  }
}

function calculateCostForProvider(params: LogApiUsageParams): number {
  const model = params.model || params.endpoint || 'default';

  switch (params.provider) {
    case 'fal':
      return calculateFalCost(model, params.imagesCount || 1);

    case 'runway':
      return calculateRunwayCost(model, params.videoDuration || 5);

    case 'elevenlabs':
      return calculateElevenLabsCost(model, params.characters || 0);

    case 'claude':
      return calculateClaudeCost(
        model,
        params.inputTokens || 0,
        params.outputTokens || 0
      );

    default:
      return 0;
  }
}

// Convenience functions for specific providers

export async function logFalUsage(options: {
  operation: string;
  model: string;
  imagesCount?: number;
  videoDuration?: number;
  projectId?: string;
  estimatedCost?: number;
}): Promise<void> {
  await logApiUsage({
    provider: 'fal',
    operation: options.operation,
    model: options.model,
    endpoint: options.model,
    imagesCount: options.imagesCount,
    videoDuration: options.videoDuration,
    projectId: options.projectId,
    estimatedCost: options.estimatedCost,
  });
}

export async function logRunwayUsage(options: {
  operation: string;
  model: string;
  videoDuration?: number;
  projectId?: string;
  estimatedCost?: number;
}): Promise<void> {
  await logApiUsage({
    provider: 'runway',
    operation: options.operation,
    model: options.model,
    videoDuration: options.videoDuration,
    projectId: options.projectId,
    estimatedCost: options.estimatedCost,
  });
}

export async function logElevenLabsUsage(options: {
  operation: string;
  model?: string;
  characters?: number;
  projectId?: string;
  estimatedCost?: number;
}): Promise<void> {
  await logApiUsage({
    provider: 'elevenlabs',
    operation: options.operation,
    model: options.model || 'eleven_multilingual_v2',
    characters: options.characters,
    projectId: options.projectId,
    estimatedCost: options.estimatedCost,
  });
}

export async function logClaudeUsage(options: {
  operation: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  projectId?: string;
}): Promise<void> {
  await logApiUsage({
    provider: 'claude',
    operation: options.operation,
    model: options.model,
    inputTokens: options.inputTokens,
    outputTokens: options.outputTokens,
    projectId: options.projectId,
  });
}
