/**
 * Internal API for automated snapshot taking
 * Called by the worker process with a service key
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

// Reuse the same fetchers from the main route
const CLAUDE_PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6-20260301': { input: 5, output: 25 },
  'claude-opus-4-5-20251101': { input: 5, output: 25 },
  'claude-opus-4-1-20250514': { input: 15, output: 75 },
  'claude-opus-4-20250514': { input: 15, output: 75 },
  'claude-sonnet-4-6-20260301': { input: 3, output: 15 },
  'claude-sonnet-4-5-20251022': { input: 3, output: 15 },
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
  'claude-haiku-4-5-20251022': { input: 1, output: 5 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  'claude-3-opus-20240229': { input: 15, output: 75 },
};

interface ProviderSnapshot {
  provider: string;
  balance?: number;
  cumulativeCost?: number;
  cumulativeUsage?: number;
  rawData?: Record<string, unknown>;
}

async function fetchClaudeUsage(): Promise<ProviderSnapshot | null> {
  if (!process.env.AI_CLAUDE_ADMIN_KEY) return null;

  try {
    const startingAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endingAt = new Date().toISOString();

    const url = new URL('https://api.anthropic.com/v1/organizations/usage_report/messages');
    url.searchParams.set('starting_at', startingAt);
    url.searchParams.set('ending_at', endingAt);
    url.searchParams.append('group_by[]', 'model');
    url.searchParams.set('bucket_width', '1d');

    const res = await fetch(url.toString(), {
      headers: {
        'x-api-key': process.env.AI_CLAUDE_ADMIN_KEY,
        'anthropic-version': '2023-06-01',
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    let totalCost = 0;

    for (const bucket of data.data || []) {
      for (const item of bucket.results || []) {
        const model = item.model || 'unknown';
        const inputTokens = (item.uncached_input_tokens || 0) + (item.cache_read_input_tokens || 0);
        const outputTokens = item.output_tokens || 0;
        const prices = CLAUDE_PRICES[model] || { input: 3, output: 15 };
        totalCost += (inputTokens * prices.input + outputTokens * prices.output) / 1000000;
      }
    }

    return {
      provider: 'claude',
      cumulativeCost: Math.round(totalCost * 10000) / 10000,
    };
  } catch {
    return null;
  }
}

async function fetchFalUsage(): Promise<ProviderSnapshot | null> {
  const adminKey = process.env.AI_FAL_ADMIN_KEY || process.env.AI_FAL_KEY;
  if (!adminKey) return null;

  try {
    const [usageRes, billingRes] = await Promise.all([
      fetch(`https://api.fal.ai/v1/models/usage?expand=summary&start=${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()}&end=${new Date().toISOString()}`, {
        headers: { Authorization: `Key ${adminKey}` },
      }),
      fetch('https://api.fal.ai/v1/account/billing?expand=credits', {
        headers: { Authorization: `Key ${adminKey}` },
      }),
    ]);

    let balance: number | undefined;
    let cumulativeCost = 0;

    if (billingRes.ok) {
      const billingData = await billingRes.json();
      balance = billingData.credits?.current_balance;
    }

    if (usageRes.ok) {
      const usageData = await usageRes.json();
      for (const item of usageData.summary || []) {
        cumulativeCost += parseFloat(item.cost) || 0;
      }
    }

    return {
      provider: 'fal',
      balance,
      cumulativeCost: Math.round(cumulativeCost * 10000) / 10000,
    };
  } catch {
    return null;
  }
}

async function fetchRunwayUsage(): Promise<ProviderSnapshot | null> {
  if (!process.env.AI_RUNWAY_ML) return null;

  try {
    const res = await fetch('https://api.dev.runwayml.com/v1/organization', {
      headers: {
        Authorization: `Bearer ${process.env.AI_RUNWAY_ML}`,
        'X-Runway-Version': '2024-11-06',
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const creditBalance = data.creditBalance;
    const balanceInDollars = typeof creditBalance === 'number' ? creditBalance * 0.01 : undefined;

    return {
      provider: 'runway',
      balance: balanceInDollars !== undefined ? Math.round(balanceInDollars * 100) / 100 : undefined,
      rawData: data,
    };
  } catch {
    return null;
  }
}

async function fetchElevenLabsUsage(): Promise<ProviderSnapshot | null> {
  if (!process.env.AI_ELEVEN_LABS) return null;

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': process.env.AI_ELEVEN_LABS },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const characterCount = data.character_count || 0;
    const characterLimit = data.character_limit || 0;

    return {
      provider: 'elevenlabs',
      cumulativeUsage: characterCount,
      rawData: { characterCount, characterLimit },
    };
  } catch {
    return null;
  }
}

/**
 * POST - Take a snapshot (called by worker)
 */
export async function POST(request: Request) {
  try {
    // Verify service key
    const authHeader = request.headers.get('authorization');
    const serviceKey = process.env.INTERNAL_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const snapshotType = body.type || 'periodic';
    const userId = body.userId;

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Fetch all provider data in parallel
    const [claude, fal, runway, elevenlabs] = await Promise.all([
      fetchClaudeUsage(),
      fetchFalUsage(),
      fetchRunwayUsage(),
      fetchElevenLabsUsage(),
    ]);

    const snapshots: ProviderSnapshot[] = [claude, fal, runway, elevenlabs].filter(
      (s): s is ProviderSnapshot => s !== null
    );

    // Insert snapshots
    const inserts = snapshots.map((s) => ({
      user_id: userId,
      provider: s.provider,
      balance: s.balance,
      cumulative_cost: s.cumulativeCost,
      cumulative_usage: s.cumulativeUsage,
      snapshot_type: snapshotType,
      raw_data: s.rawData,
    }));

    if (inserts.length > 0) {
      const { error } = await supabase.from('provider_balance_snapshots').insert(inserts);
      if (error) {
        console.error('[Snapshot] Insert error:', error);
        return NextResponse.json({ error: 'Failed to save snapshots' }, { status: 500 });
      }
    }

    console.log(`[Snapshot] Saved ${snapshotType} snapshot for user ${userId}: ${snapshots.map(s => s.provider).join(', ')}`);

    return NextResponse.json({
      success: true,
      snapshotType,
      providers: snapshots.map((s) => s.provider),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Snapshot] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
