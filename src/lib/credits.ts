/**
 * Credit Management Service
 *
 * Handles budget verification, usage logging, and spending tracking
 * for all API providers (Replicate, fal.ai, PiAPI, ElevenLabs, Creatomate)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  ApiProvider,
  BudgetPeriod,
  CreditCheckResult,
  CreditWarningLevel,
  ProviderSpending,
  CreditAllocation,
  ApiUsageLogInsert,
} from '@/types/database';
import { CreditError } from '@/lib/ai/credit-error';

// ============================================================================
// Provider Configuration
// ============================================================================

export interface ProviderConfig {
  name: string;
  displayName: string;
  color: string;
  dashboardUrl: string;
  description: string;
}

// Dashboard providers
export type DashboardProvider = 'claude' | 'replicate' | 'fal' | 'piapi' | 'elevenlabs' | 'creatomate';

export const PROVIDERS: Record<DashboardProvider, ProviderConfig> = {
  claude: {
    name: 'claude',
    displayName: 'Claude',
    color: '#D97706',
    dashboardUrl: 'https://platform.claude.com/settings/billing',
    description: 'Scripts, prompts IA',
  },
  replicate: {
    name: 'replicate',
    displayName: 'Replicate',
    color: '#3B82F6',
    dashboardUrl: 'https://replicate.com/users/zucatti/settings/billing/add-credit?next=/account/billing',
    description: 'Image generation (Flux, SDXL)',
  },
  fal: {
    name: 'fal',
    displayName: 'fal.ai',
    color: '#8B5CF6',
    dashboardUrl: 'https://fal.ai/dashboard/usage-billing/credits',
    description: 'Images (Nano Banana 2, Ideogram) & vidéos (Kling)',
  },
  piapi: {
    name: 'piapi',
    displayName: 'PiAPI',
    color: '#EC4899',
    dashboardUrl: 'https://piapi.ai/workspace/billing',
    description: 'Midjourney API',
  },
  elevenlabs: {
    name: 'elevenlabs',
    displayName: 'ElevenLabs',
    color: '#10B981',
    dashboardUrl: 'https://elevenlabs.io/app/subscription/api',
    description: 'Text-to-speech',
  },
  creatomate: {
    name: 'creatomate',
    displayName: 'Creatomate',
    color: '#F59E0B',
    dashboardUrl: 'https://creatomate.com/projects/2a3d5c8f-8d36-4bbf-9a06-a452fc0d256c',
    description: 'Video templating',
  },
};

// ============================================================================
// Pricing Configuration
// ============================================================================

/**
 * Claude pricing per 1M tokens (in USD) - used internally
 */
export const CLAUDE_PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-4-20250514': { input: 15, output: 75 },
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  default: { input: 3, output: 15 },
};

/**
 * Replicate pricing per prediction (in USD)
 */
export const REPLICATE_PRICES: Record<string, number> = {
  'flux-1.1-pro': 0.04,
  'flux-pro': 0.055,
  'flux-dev': 0.025,
  'flux-schnell': 0.003,
  'sdxl': 0.002,
  'ideogram-v2': 0.08,
  default: 0.03,
};

/**
 * fal.ai pricing per request (in USD)
 */
export const FAL_PRICES: Record<string, number> = {
  // Image generation - Nano Banana 2 (Google Gemini 3.1 Flash)
  'fal-ai/nano-banana-2': 0.08, // Base price at 1K resolution
  'fal-ai/nano-banana-2/0.5K': 0.06, // 0.75x rate
  'fal-ai/nano-banana-2/1K': 0.08, // Standard rate
  'fal-ai/nano-banana-2/2K': 0.12, // 1.5x rate
  'fal-ai/nano-banana-2/4K': 0.16, // 2x rate
  // Image generation - Flux
  'fal-ai/flux/schnell': 0.003,
  'fal-ai/flux/dev': 0.025,
  'fal-ai/flux-pro': 0.05,
  'fal-ai/flux-pro/v1.1': 0.04,
  // Image generation - Ideogram (character consistency)
  'fal-ai/ideogram/character': 0.08,
  'fal-ai/ideogram/v2': 0.08,
  // Image utilities
  'fal-ai/image-apps-v2/perspective': 0.02,
  // Video generation
  'fal-ai/kling-video/v1/standard/image-to-video': 0.10,
  'fal-ai/kling-video/v1/pro/image-to-video': 0.35,
  'fal-ai/minimax-video/image-to-video': 0.30,
  'fal-ai/hunyuan-video': 0.50,
  default: 0.05,
};

/**
 * PiAPI pricing per request (in USD)
 * Midjourney-style API
 */
export const PIAPI_PRICES: Record<string, number> = {
  'midjourney-imagine': 0.04,
  'midjourney-upscale': 0.02,
  'midjourney-variation': 0.03,
  'midjourney-describe': 0.01,
  'stable-diffusion': 0.002,
  default: 0.04,
};

/**
 * ElevenLabs pricing per 1000 characters (in USD)
 */
export const ELEVENLABS_PRICES: Record<string, number> = {
  'eleven_multilingual_v2': 0.30,
  'eleven_turbo_v2': 0.15,
  'eleven_monolingual_v1': 0.30,
  default: 0.30,
};

/**
 * Creatomate pricing per render (in USD)
 * Based on video duration/complexity
 */
export const CREATOMATE_PRICES: Record<string, number> = {
  'video-render': 0.10,
  'image-render': 0.02,
  'gif-render': 0.05,
  default: 0.10,
};

// ============================================================================
// Cost Calculation Functions
// ============================================================================

/**
 * Calculate cost for Claude API calls (internal use)
 */
export function calculateClaudeCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = CLAUDE_PRICES[model] || CLAUDE_PRICES.default;
  const inputCost = (inputTokens * pricing.input) / 1_000_000;
  const outputCost = (outputTokens * pricing.output) / 1_000_000;
  return inputCost + outputCost;
}

export function calculateReplicateCost(model: string, count: number = 1): number {
  const price = REPLICATE_PRICES[model] || REPLICATE_PRICES.default;
  return price * count;
}

export function calculateFalCost(endpoint: string, count: number = 1): number {
  const price = FAL_PRICES[endpoint] || FAL_PRICES.default;
  return price * count;
}

export function calculatePiapiCost(operation: string, count: number = 1): number {
  const price = PIAPI_PRICES[operation] || PIAPI_PRICES.default;
  return price * count;
}

export function calculateElevenLabsCost(model: string, characters: number): number {
  const pricePerThousand = ELEVENLABS_PRICES[model] || ELEVENLABS_PRICES.default;
  return (characters * pricePerThousand) / 1000;
}

export function calculateCreatomateCost(renderType: string, count: number = 1): number {
  const price = CREATOMATE_PRICES[renderType] || CREATOMATE_PRICES.default;
  return price * count;
}

/**
 * Generic cost calculator based on provider
 */
export function calculateCost(
  provider: ApiProvider,
  model: string,
  metrics: {
    characters?: number;
    imagesCount?: number;
    videoDuration?: number;
    requestCount?: number;
  }
): number {
  switch (provider) {
    case 'replicate':
      return calculateReplicateCost(model, metrics.requestCount || metrics.imagesCount || 1);

    case 'fal':
      return calculateFalCost(model, metrics.requestCount || 1);

    case 'piapi':
      return calculatePiapiCost(model, metrics.requestCount || metrics.imagesCount || 1);

    case 'elevenlabs':
      return calculateElevenLabsCost(model, metrics.characters || 0);

    case 'creatomate':
      return calculateCreatomateCost(model, metrics.requestCount || 1);

    default:
      return 0;
  }
}

// ============================================================================
// Budget Period Helpers
// ============================================================================

export function getPeriodStartDate(period: BudgetPeriod): Date {
  const now = new Date();

  switch (period) {
    case 'daily':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());

    case 'weekly': {
      const dayOfWeek = now.getDay();
      const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - daysToSubtract);
      monday.setHours(0, 0, 0, 0);
      return monday;
    }

    case 'monthly':
      return new Date(now.getFullYear(), now.getMonth(), 1);

    default:
      return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

export function shouldResetPeriod(
  periodStartDate: Date | string,
  period: BudgetPeriod
): boolean {
  const startDate = new Date(periodStartDate);
  const now = new Date();

  switch (period) {
    case 'daily':
      return now.getTime() - startDate.getTime() >= 24 * 60 * 60 * 1000;

    case 'weekly':
      return now.getTime() - startDate.getTime() >= 7 * 24 * 60 * 60 * 1000;

    case 'monthly': {
      const nextMonth = new Date(startDate);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      return now >= nextMonth;
    }

    default:
      return false;
  }
}

// ============================================================================
// Credit Service Class
// ============================================================================

export class CreditService {
  constructor(private supabase: SupabaseClient) {}

  async checkCredit(
    userId: string,
    provider: ApiProvider,
    estimatedCost: number
  ): Promise<CreditCheckResult> {
    const { data: allocation, error } = await this.supabase
      .from('credit_allocations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .single();

    if (error || !allocation) {
      return {
        allowed: true,
        remainingBudget: Infinity,
        warningLevel: 'none',
        spentPercent: 0,
        budgetAmount: 0,
        currentSpent: 0,
      };
    }

    let currentSpent = allocation.current_period_spent;
    if (shouldResetPeriod(allocation.period_start_date, allocation.budget_period)) {
      await this.supabase
        .from('credit_allocations')
        .update({
          current_period_spent: 0,
          period_start_date: getPeriodStartDate(allocation.budget_period).toISOString(),
        })
        .eq('id', allocation.id);
      currentSpent = 0;
    }

    const budgetAmount = allocation.budget_amount;
    const remainingBudget = Math.max(0, budgetAmount - currentSpent);
    const spentPercent = budgetAmount > 0 ? (currentSpent / budgetAmount) * 100 : 0;

    let warningLevel: CreditWarningLevel = 'none';
    if (spentPercent >= 100) {
      warningLevel = 'critical_100';
    } else if (spentPercent >= 80) {
      warningLevel = 'warning_80';
    } else if (spentPercent >= 50) {
      warningLevel = 'warning_50';
    }

    const wouldExceed = currentSpent + estimatedCost > budgetAmount;
    const alreadyExceeded = currentSpent >= budgetAmount;
    const shouldBlock = allocation.block_on_limit && (wouldExceed || alreadyExceeded);

    if (shouldBlock) {
      return {
        allowed: false,
        remainingBudget,
        warningLevel,
        spentPercent,
        budgetAmount,
        currentSpent,
        message: alreadyExceeded
          ? `Budget ${provider} épuisé. Utilisé: $${currentSpent.toFixed(2)} / $${budgetAmount.toFixed(2)}`
          : `Cette opération dépasserait le budget ${provider}. Coût estimé: $${estimatedCost.toFixed(4)}, Restant: $${remainingBudget.toFixed(2)}`,
      };
    }

    // Check global budget
    const { data: globalAllocation } = await this.supabase
      .from('credit_allocations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'global')
      .single();

    if (globalAllocation && globalAllocation.block_on_limit) {
      let globalSpent = globalAllocation.current_period_spent;
      if (shouldResetPeriod(globalAllocation.period_start_date, globalAllocation.budget_period)) {
        await this.supabase
          .from('credit_allocations')
          .update({
            current_period_spent: 0,
            period_start_date: getPeriodStartDate(globalAllocation.budget_period).toISOString(),
          })
          .eq('id', globalAllocation.id);
        globalSpent = 0;
      }

      const globalBudget = globalAllocation.budget_amount;
      const globalRemaining = Math.max(0, globalBudget - globalSpent);
      const globalWouldExceed = globalSpent + estimatedCost > globalBudget;
      const globalAlreadyExceeded = globalSpent >= globalBudget;

      if (globalWouldExceed || globalAlreadyExceeded) {
        const globalSpentPercent = globalBudget > 0 ? (globalSpent / globalBudget) * 100 : 0;
        return {
          allowed: false,
          remainingBudget: Math.min(remainingBudget, globalRemaining),
          warningLevel: globalSpentPercent >= 100 ? 'critical_100' : 'warning_80',
          spentPercent: globalSpentPercent,
          budgetAmount: globalBudget,
          currentSpent: globalSpent,
          message: globalAlreadyExceeded
            ? `Budget global épuisé. Utilisé: $${globalSpent.toFixed(2)} / $${globalBudget.toFixed(2)}`
            : `Cette opération dépasserait le budget global. Coût estimé: $${estimatedCost.toFixed(4)}, Restant: $${globalRemaining.toFixed(2)}`,
        };
      }
    }

    return {
      allowed: true,
      remainingBudget,
      warningLevel,
      spentPercent,
      budgetAmount,
      currentSpent,
    };
  }

  async logUsage(
    userId: string,
    log: Omit<ApiUsageLogInsert, 'user_id'>
  ): Promise<void> {
    const insertData = {
      ...log,
      user_id: userId,
    };
    console.log('[CreditService] Logging usage:', log.provider, log.operation);

    const { data, error } = await this.supabase
      .from('api_usage_logs')
      .insert(insertData)
      .select();

    if (error) {
      console.error('[CreditService] Failed to log API usage:', error.message, error.details, error.hint);
    } else {
      console.log('[CreditService] Logged usage OK, id:', data?.[0]?.id);
    }
  }

  async getCurrentSpending(
    userId: string,
    provider?: ApiProvider
  ): Promise<ProviderSpending[]> {
    let query = this.supabase
      .from('credit_allocations')
      .select('*')
      .eq('user_id', userId);

    if (provider) {
      query = query.eq('provider', provider);
    }

    const { data: allocations, error } = await query;

    if (error || !allocations) {
      return [];
    }

    return allocations.map((allocation: CreditAllocation) => {
      let currentSpent = allocation.current_period_spent;

      if (shouldResetPeriod(allocation.period_start_date, allocation.budget_period)) {
        currentSpent = 0;
      }

      return {
        provider: allocation.provider,
        spent: currentSpent,
        budget: allocation.budget_amount,
        period: allocation.budget_period,
        spentPercent: allocation.budget_amount > 0
          ? (currentSpent / allocation.budget_amount) * 100
          : 0,
        periodStartDate: allocation.period_start_date,
      };
    });
  }

  async getOrCreateAllocation(
    userId: string,
    provider: ApiProvider
  ): Promise<CreditAllocation> {
    const { data: existing } = await this.supabase
      .from('credit_allocations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .single();

    if (existing) {
      return existing;
    }

    const { data: created, error } = await this.supabase
      .from('credit_allocations')
      .insert({
        user_id: userId,
        provider,
        budget_amount: 0,
        budget_period: 'monthly',
        alert_threshold_50: true,
        alert_threshold_80: true,
        alert_threshold_100: true,
        block_on_limit: false,
        current_period_spent: 0,
        period_start_date: getPeriodStartDate('monthly').toISOString(),
      })
      .select()
      .single();

    if (error || !created) {
      throw new Error(`Failed to create allocation: ${error?.message}`);
    }

    return created;
  }

  async updateAllocation(
    userId: string,
    provider: ApiProvider,
    updates: {
      budget_amount?: number;
      budget_period?: BudgetPeriod;
      alert_threshold_50?: boolean;
      alert_threshold_80?: boolean;
      alert_threshold_100?: boolean;
      block_on_limit?: boolean;
    }
  ): Promise<CreditAllocation> {
    await this.getOrCreateAllocation(userId, provider);

    const updateData: Record<string, unknown> = { ...updates };
    if (updates.budget_period) {
      updateData.period_start_date = getPeriodStartDate(updates.budget_period).toISOString();
      updateData.current_period_spent = 0;
    }

    const { data, error } = await this.supabase
      .from('credit_allocations')
      .update(updateData)
      .eq('user_id', userId)
      .eq('provider', provider)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to update allocation: ${error?.message}`);
    }

    return data;
  }

  async getUnacknowledgedAlerts(userId: string) {
    const { data, error } = await this.supabase
      .from('credit_alerts')
      .select('*')
      .eq('user_id', userId)
      .eq('acknowledged', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch alerts:', error);
      return [];
    }

    return data || [];
  }

  async acknowledgeAlert(userId: string, alertId: string): Promise<void> {
    const { error } = await this.supabase
      .from('credit_alerts')
      .update({
        acknowledged: true,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', alertId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to acknowledge alert: ${error.message}`);
    }
  }

  async acknowledgeAllAlerts(userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('credit_alerts')
      .update({
        acknowledged: true,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('acknowledged', false);

    if (error) {
      throw new Error(`Failed to acknowledge alerts: ${error.message}`);
    }
  }

  /**
   * Get monthly spending history for all providers
   */
  async getMonthlyHistory(
    userId: string,
    months: number = 6
  ): Promise<Array<{ month: string; providers: Record<string, number>; total: number }>> {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months + 1);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const { data, error } = await this.supabase
      .from('api_usage_logs')
      .select('provider, estimated_cost, created_at')
      .eq('user_id', userId)
      .eq('status', 'success')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (error || !data) {
      return [];
    }

    // Group by month
    const monthlyData: Record<string, Record<string, number>> = {};

    data.forEach((log) => {
      const date = new Date(log.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {};
      }

      const provider = log.provider;
      monthlyData[monthKey][provider] = (monthlyData[monthKey][provider] || 0) + log.estimated_cost;
    });

    // Convert to array and calculate totals
    return Object.entries(monthlyData)
      .map(([month, providers]) => ({
        month,
        providers,
        total: Object.values(providers).reduce((sum, cost) => sum + cost, 0),
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * Get real balance from provider API (if available)
   * Returns null if not available
   */
  async getProviderBalance(provider: ApiProvider): Promise<number | null> {
    // For now, we don't fetch real balances from providers
    // This could be implemented per-provider if they have balance APIs
    return null;
  }

  /**
   * Get total spending across all providers for current period
   */
  async getTotalSpending(userId: string): Promise<{ total: number; byProvider: Record<string, number> }> {
    const spending = await this.getCurrentSpending(userId);

    const byProvider: Record<string, number> = {};
    let total = 0;

    spending.forEach((s) => {
      if (s.provider !== 'global') {
        byProvider[s.provider] = s.spent;
        total += s.spent;
      }
    });

    return { total, byProvider };
  }
}

export function createCreditService(supabase: SupabaseClient): CreditService {
  return new CreditService(supabase);
}

export async function ensureCredit(
  service: CreditService,
  userId: string,
  provider: ApiProvider,
  estimatedCost: number
): Promise<CreditCheckResult> {
  const result = await service.checkCredit(userId, provider, estimatedCost);

  if (!result.allowed) {
    throw new CreditError({
      code: result.currentSpent >= result.budgetAmount ? 'BUDGET_EXCEEDED' : 'BUDGET_WOULD_EXCEED',
      message: result.message || 'Budget exceeded',
      provider,
      budgetAmount: result.budgetAmount,
      currentSpent: result.currentSpent,
      estimatedCost,
    });
  }

  return result;
}
