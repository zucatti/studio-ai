/**
 * API Route: Credit Allocations
 *
 * GET - Fetch all credit allocations for the current user
 * POST - Create or update a credit allocation
 */

import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { createCreditService, getPeriodStartDate } from '@/lib/credits';
import { ApiProvider, BudgetPeriod } from '@/types/database';

export async function GET() {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    const creditService = createCreditService(supabase);

    // Get all allocations for this user
    const spending = await creditService.getCurrentSpending(session.user.sub);

    // Also fetch the raw allocations for full config
    const { data: allocations, error } = await supabase
      .from('credit_allocations')
      .select('*')
      .eq('user_id', session.user.sub)
      .order('provider');

    if (error) {
      console.error('Error fetching allocations:', error);
      return NextResponse.json(
        { error: 'Failed to fetch credit allocations' },
        { status: 500 }
      );
    }

    // Get unacknowledged alerts
    const alerts = await creditService.getUnacknowledgedAlerts(session.user.sub);

    return NextResponse.json({
      allocations: allocations || [],
      spending,
      alerts,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      provider,
      budget_amount,
      budget_period,
      alert_threshold_50,
      alert_threshold_80,
      alert_threshold_100,
      block_on_limit,
    } = body;

    // Validate provider
    const validProviders: ApiProvider[] = ['claude', 'fal', 'wavespeed', 'runway', 'modelslab', 'elevenlabs', 'creatomate', 'global'];
    if (!provider || !validProviders.includes(provider)) {
      return NextResponse.json(
        { error: 'Invalid provider' },
        { status: 400 }
      );
    }

    // Validate budget_amount
    if (budget_amount !== undefined && (typeof budget_amount !== 'number' || budget_amount < 0)) {
      return NextResponse.json(
        { error: 'Budget amount must be a non-negative number' },
        { status: 400 }
      );
    }

    // Validate budget_period
    const validPeriods: BudgetPeriod[] = ['daily', 'weekly', 'monthly'];
    if (budget_period !== undefined && !validPeriods.includes(budget_period)) {
      return NextResponse.json(
        { error: 'Invalid budget period' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const creditService = createCreditService(supabase);

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {};
    if (budget_amount !== undefined) updates.budget_amount = budget_amount;
    if (budget_period !== undefined) updates.budget_period = budget_period;
    if (alert_threshold_50 !== undefined) updates.alert_threshold_50 = alert_threshold_50;
    if (alert_threshold_80 !== undefined) updates.alert_threshold_80 = alert_threshold_80;
    if (alert_threshold_100 !== undefined) updates.alert_threshold_100 = alert_threshold_100;
    if (block_on_limit !== undefined) updates.block_on_limit = block_on_limit;

    // Update or create allocation
    const allocation = await creditService.updateAllocation(
      session.user.sub,
      provider,
      updates
    );

    return NextResponse.json({ allocation });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider') as ApiProvider;

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider is required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Delete the allocation (reset to no budget)
    const { error } = await supabase
      .from('credit_allocations')
      .delete()
      .eq('user_id', session.user.sub)
      .eq('provider', provider);

    if (error) {
      console.error('Error deleting allocation:', error);
      return NextResponse.json(
        { error: 'Failed to delete allocation' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
