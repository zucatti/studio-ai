/**
 * Backfill Spending Snapshots API
 *
 * POST - Create historical snapshots for a specific date range
 * Used to reconstruct accurate spending history after fixing the algorithm
 */

import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface BackfillRequest {
  // Create snapshots for these dates (ISO format: YYYY-MM-DD)
  dates: string[];
  // Provider to backfill (currently only 'fal' supported)
  provider?: 'fal';
  // Manual cost override (skips API call, uses this value directly)
  manualCost?: number;
}

/**
 * Fetch fal.ai cumulative usage up to a specific date
 */
async function fetchFalUsageUpTo(endDate: string): Promise<{ cost: number; debug: string }> {
  const adminKey = process.env.AI_FAL_ADMIN_KEY || process.env.AI_FAL_KEY;
  if (!adminKey) throw new Error('No fal.ai API key configured');

  // Use Jan 1st of the target year as start
  const year = new Date(endDate).getFullYear();
  const yearStart = new Date(year, 0, 1).toISOString();
  const endDateTime = new Date(endDate + 'T23:59:59.999Z').toISOString();

  const url = `https://api.fal.ai/v1/models/usage?expand=summary&start=${yearStart}&end=${endDateTime}`;
  const usageRes = await fetch(url, { headers: { Authorization: `Key ${adminKey}` } });

  if (!usageRes.ok) {
    throw new Error(`fal.ai usage API error: ${usageRes.status}`);
  }

  const usageData = await usageRes.json();
  let cumulativeCost = 0;

  // Log for debugging
  const summaryCount = usageData.summary?.length || 0;
  const firstDate = usageData.summary?.[0]?.date || 'none';
  const lastDate = usageData.summary?.[summaryCount - 1]?.date || 'none';

  for (const item of usageData.summary || []) {
    cumulativeCost += parseFloat(item.cost) || 0;
  }

  return {
    cost: Math.round(cumulativeCost * 10000) / 10000,
    debug: `${summaryCount} entries, range: ${firstDate} → ${lastDate}`,
  };
}

/**
 * POST - Backfill historical snapshots
 *
 * Body: {
 *   dates: ["2026-04-01", "2026-04-07", ...],
 *   provider: "fal" (optional, defaults to fal)
 * }
 */
export async function POST(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: BackfillRequest = await request.json();
    const { dates, provider = 'fal', manualCost } = body;

    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return NextResponse.json({ error: 'dates array required' }, { status: 400 });
    }

    if (provider !== 'fal') {
      return NextResponse.json(
        { error: 'Only fal provider supported for backfill' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const userId = session.user.sub;
    const results: Array<{
      date: string;
      cumulativeCost: number;
      success: boolean;
      error?: string;
    }> = [];

    // Process each date
    for (const date of dates) {
      try {
        // Validate date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          results.push({ date, cumulativeCost: 0, success: false, error: 'Invalid date format' });
          continue;
        }

        let cumulativeCost: number;
        let debug: string | undefined;

        if (manualCost !== undefined) {
          // Use manual cost (no API call)
          cumulativeCost = manualCost;
          debug = 'manual entry';
        } else {
          // Add delay between API calls to avoid rate limiting (429)
          if (results.length > 0) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }
          const result = await fetchFalUsageUpTo(date);
          cumulativeCost = result.cost;
          debug = result.debug;
        }

        // Insert backfill snapshot
        const { error } = await supabase.from('provider_balance_snapshots').insert({
          user_id: userId,
          provider: 'fal',
          cumulative_cost: cumulativeCost,
          snapshot_type: manualCost !== undefined ? 'manual' : 'backfill',
          raw_data: { backfill_date: date, calculated_at: new Date().toISOString(), debug },
          // Override created_at to the target date (end of day)
          created_at: new Date(date + 'T23:59:59.999Z').toISOString(),
        });

        if (error) {
          results.push({ date, cumulativeCost, success: false, error: error.message });
        } else {
          results.push({ date, cumulativeCost, success: true });
        }
      } catch (err) {
        results.push({
          date,
          cumulativeCost: 0,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: failed === 0,
      message: `Backfilled ${successful} snapshots, ${failed} failed`,
      results,
    });
  } catch (error) {
    console.error('[Backfill] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper to add delay between API calls to avoid rate limiting
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET - Preview what would be backfilled (dry run)
 *
 * Query: ?dates=2026-04-01,2026-04-07,2026-04-15
 */
export async function GET(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const datesParam = searchParams.get('dates');

    if (!datesParam) {
      return NextResponse.json({ error: 'dates query param required' }, { status: 400 });
    }

    const dates = datesParam.split(',').map((d) => d.trim());
    const results: Array<{ date: string; cumulativeCost: number; debug?: string; error?: string }> = [];

    for (const date of dates) {
      try {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          results.push({ date, cumulativeCost: 0, error: 'Invalid date format' });
          continue;
        }

        // Add delay between API calls to avoid rate limiting (429)
        if (results.length > 0) {
          await delay(3000); // 3 seconds between calls
        }

        const { cost: cumulativeCost, debug } = await fetchFalUsageUpTo(date);
        results.push({ date, cumulativeCost, debug });
      } catch (err) {
        results.push({
          date,
          cumulativeCost: 0,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      preview: true,
      provider: 'fal',
      results,
      totalCostToDate: results.length > 0 ? results[results.length - 1].cumulativeCost : 0,
    });
  } catch (error) {
    console.error('[Backfill Preview] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
