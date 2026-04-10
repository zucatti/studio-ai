/**
 * Spending Snapshots API
 *
 * GET - Get spending summary with diffs (today, this week, this month) + monthly history
 * POST - Take a new snapshot of current provider balances
 */

import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

// Provider API fetchers
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
      rawData: data,
    };
  } catch {
    return null;
  }
}

async function fetchFalUsage(): Promise<ProviderSnapshot | null> {
  const adminKey = process.env.AI_FAL_ADMIN_KEY || process.env.AI_FAL_KEY;
  if (!adminKey) return null;

  try {
    // Use Jan 1st of current year as start date for cumulative tracking
    // This gives us a stable reference point unaffected by auto-recharges
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
    const now = new Date().toISOString();

    const [usageRes, billingRes] = await Promise.all([
      fetch(`https://api.fal.ai/v1/models/usage?expand=summary&start=${yearStart}&end=${now}`, {
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
 * POST - Take a snapshot of all provider balances
 */
export async function POST(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const snapshotType = body.type || 'manual';

    const supabase = createServerSupabaseClient();
    const userId = session.user.sub;

    // Track results for each provider
    const results: Record<string, { success: boolean; data?: ProviderSnapshot; error?: string }> = {};

    // Fetch all provider data in parallel with error tracking
    const [claudeResult, falResult, runwayResult, elevenlabsResult] = await Promise.allSettled([
      fetchClaudeUsage(),
      fetchFalUsage(),
      fetchRunwayUsage(),
      fetchElevenLabsUsage(),
    ]);

    // Process results
    const claude = claudeResult.status === 'fulfilled' ? claudeResult.value : null;
    const fal = falResult.status === 'fulfilled' ? falResult.value : null;
    const runway = runwayResult.status === 'fulfilled' ? runwayResult.value : null;
    const elevenlabs = elevenlabsResult.status === 'fulfilled' ? elevenlabsResult.value : null;

    results.claude = claude ? { success: true, data: claude } : { success: false, error: claudeResult.status === 'rejected' ? String(claudeResult.reason) : 'No data returned' };
    results.fal = fal ? { success: true, data: fal } : { success: false, error: falResult.status === 'rejected' ? String(falResult.reason) : 'No data returned' };
    results.runway = runway ? { success: true, data: runway } : { success: false, error: runwayResult.status === 'rejected' ? String(runwayResult.reason) : 'No data returned' };
    results.elevenlabs = elevenlabs ? { success: true, data: elevenlabs } : { success: false, error: elevenlabsResult.status === 'rejected' ? String(elevenlabsResult.reason) : 'No data returned' };

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
        console.error('[Snapshots] Insert error:', error);
        return NextResponse.json({ error: 'Failed to save snapshots' }, { status: 500 });
      }
    }

    console.log(`[Snapshots] Saved: ${snapshots.map(s => s.provider).join(', ') || 'none'}`);

    return NextResponse.json({
      success: true,
      snapshotType,
      providers: snapshots.map((s) => s.provider),
      details: Object.fromEntries(
        Object.entries(results).map(([k, v]) => [
          k,
          v.success
            ? { success: true, balance: v.data?.balance, cumulativeCost: v.data?.cumulativeCost, cumulativeUsage: v.data?.cumulativeUsage }
            : { success: false, error: v.error }
        ])
      ),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Snapshots] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET - Get spending summary with diffs + monthly history
 */
export async function GET() {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    const userId = session.user.sub;

    // Fetch current values from provider APIs
    const [claude, fal, runway, elevenlabs] = await Promise.all([
      fetchClaudeUsage(),
      fetchFalUsage(),
      fetchRunwayUsage(),
      fetchElevenLabsUsage(),
    ]);

    const current: Record<string, ProviderSnapshot> = {};
    if (claude) current.claude = claude;
    if (fal) current.fal = fal;
    if (runway) current.runway = runway;
    if (elevenlabs) current.elevenlabs = elevenlabs;

    // Get reference snapshots for period calculations
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Fetch ALL snapshots for the year (for monthly history)
    const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();
    const { data: allSnapshots } = await supabase
      .from('provider_balance_snapshots')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', yearStart)
      .order('created_at', { ascending: true });

    // Filter to just this month for period calculations
    const thisMonthSnapshots = allSnapshots?.filter(s => s.created_at >= monthStart) || [];

    // Find reference snapshots for each period
    const findClosestSnapshot = (provider: string, afterDate: string) => {
      return thisMonthSnapshots.find(
        (s) => s.provider === provider && s.created_at >= afterDate
      );
    };

    // Calculate spending for each provider
    const spending: Record<string, {
      current: number;
      today: number;
      thisWeek: number;
      thisMonth: number;
      unit: string;
      balance?: number;
      characterCount?: number;
      characterLimit?: number;
      status: 'connected' | 'not_configured';
    }> = {};

    for (const [provider, data] of Object.entries(current)) {
      const todaySnap = findClosestSnapshot(provider, todayStart);
      const weekSnap = findClosestSnapshot(provider, weekStart);
      const monthSnap = findClosestSnapshot(provider, monthStart);

      // Provider categories:
      // - fal: uses cumulative_cost from API (unaffected by auto-recharges)
      // - runway: uses balance (no auto-recharge mechanism)
      // - claude: uses cumulative_cost
      // - elevenlabs: uses cumulative_usage (characters)
      const isBalanceBased = provider === 'runway'; // Only runway uses balance now
      const usesCumulativeCost = provider === 'fal' || provider === 'claude';

      let currentValue = 0;
      let todayRef = 0;
      let weekRef = 0;
      let monthRef = 0;
      let unit = '$';

      if (provider === 'elevenlabs') {
        currentValue = data.cumulativeUsage || 0;
        todayRef = todaySnap?.cumulative_usage || currentValue;
        weekRef = weekSnap?.cumulative_usage || currentValue;
        monthRef = monthSnap?.cumulative_usage || currentValue;
        unit = 'chars';

        spending[provider] = {
          current: currentValue,
          today: Math.max(0, currentValue - todayRef),
          thisWeek: Math.max(0, currentValue - weekRef),
          thisMonth: Math.max(0, currentValue - monthRef),
          unit,
          characterCount: (data.rawData as { characterCount?: number })?.characterCount,
          characterLimit: (data.rawData as { characterLimit?: number })?.characterLimit,
          status: 'connected',
        };
      } else if (usesCumulativeCost) {
        // fal.ai and Claude use cumulative cost (increases with usage)
        // This approach is immune to auto-recharges for fal.ai
        currentValue = data.cumulativeCost || 0;
        todayRef = todaySnap?.cumulative_cost || 0;
        weekRef = weekSnap?.cumulative_cost || 0;
        monthRef = monthSnap?.cumulative_cost || 0;

        spending[provider] = {
          current: currentValue,
          today: Math.max(0, currentValue - todayRef),
          thisWeek: Math.max(0, currentValue - weekRef),
          thisMonth: Math.max(0, currentValue - monthRef),
          unit,
          balance: data.balance, // Still include balance for display
          status: 'connected',
        };
      } else if (isBalanceBased) {
        // Runway uses balance (no auto-recharge)
        currentValue = data.balance || 0;
        todayRef = todaySnap?.balance ?? currentValue;
        weekRef = weekSnap?.balance ?? currentValue;
        monthRef = monthSnap?.balance ?? currentValue;

        spending[provider] = {
          current: currentValue,
          today: Math.max(0, todayRef - currentValue),
          thisWeek: Math.max(0, weekRef - currentValue),
          thisMonth: Math.max(0, monthRef - currentValue),
          unit,
          balance: data.balance,
          status: 'connected',
        };
      }
    }

    // Build monthly history from snapshots
    // For each month, we calculate spending as: first_snapshot - last_snapshot (for balance) or last - first (for cumulative)
    const monthlyHistory: Array<{
      month: string;
      providers: Record<string, number>;
      total: number;
    }> = [];

    // Group snapshots by month
    const snapshotsByMonth: Record<string, typeof allSnapshots> = {};
    for (const snap of allSnapshots || []) {
      const monthKey = snap.created_at.slice(0, 7); // YYYY-MM
      if (!snapshotsByMonth[monthKey]) {
        snapshotsByMonth[monthKey] = [];
      }
      snapshotsByMonth[monthKey]!.push(snap);
    }

    // Calculate spending for each month
    const currentMonth = now.toISOString().slice(0, 7);
    for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
      const monthDate = new Date(now.getFullYear(), monthIndex, 1);
      const monthKey = `${now.getFullYear()}-${String(monthIndex + 1).padStart(2, '0')}`;
      const monthSnapshots = snapshotsByMonth[monthKey] || [];

      const providers: Record<string, number> = {};

      // For the current month, use the calculated thisMonth values
      if (monthKey === currentMonth) {
        for (const [provider, data] of Object.entries(spending)) {
          if (data.unit === '$') {
            providers[provider] = data.thisMonth;
          }
        }
      } else if (monthSnapshots.length >= 2) {
        // For past months, calculate from first to last snapshot
        for (const provider of ['claude', 'fal', 'runway']) {
          const providerSnaps = monthSnapshots.filter(s => s.provider === provider);
          if (providerSnaps.length >= 2) {
            const first = providerSnaps[0];
            const last = providerSnaps[providerSnaps.length - 1];

            if (provider === 'claude' || provider === 'fal') {
              // Cumulative cost: last - first (fal now uses cumulative_cost too)
              providers[provider] = Math.max(0, (last.cumulative_cost || 0) - (first.cumulative_cost || 0));
            } else {
              // Balance-based (runway): first - last
              providers[provider] = Math.max(0, (first.balance || 0) - (last.balance || 0));
            }
          }
        }
      }

      monthlyHistory.push({
        month: monthKey,
        providers,
        total: Object.values(providers).reduce((sum, v) => sum + v, 0),
      });
    }

    // Get last snapshot time
    const { data: lastSnapshot } = await supabase
      .from('provider_balance_snapshots')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      spending,
      monthlyHistory,
      lastSnapshotAt: lastSnapshot?.created_at,
      currentTime: now.toISOString(),
    });
  } catch (error) {
    console.error('[Snapshots] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
