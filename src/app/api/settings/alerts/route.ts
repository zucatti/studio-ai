/**
 * API Route: Credit Alerts
 *
 * GET - Fetch alerts for the current user
 * POST - Acknowledge an alert
 */

import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { createCreditService } from '@/lib/credits';

export async function GET(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const includeAcknowledged = searchParams.get('includeAcknowledged') === 'true';

    const supabase = createServerSupabaseClient();

    let query = supabase
      .from('credit_alerts')
      .select('*')
      .eq('user_id', session.user.sub)
      .order('created_at', { ascending: false });

    if (!includeAcknowledged) {
      query = query.eq('acknowledged', false);
    }

    const { data: alerts, error } = await query;

    if (error) {
      console.error('Error fetching alerts:', error);
      return NextResponse.json(
        { error: 'Failed to fetch alerts' },
        { status: 500 }
      );
    }

    return NextResponse.json({ alerts: alerts || [] });
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
    const { alertId, acknowledgeAll } = body;

    const supabase = createServerSupabaseClient();
    const creditService = createCreditService(supabase);

    if (acknowledgeAll) {
      await creditService.acknowledgeAllAlerts(session.user.sub);
      return NextResponse.json({ success: true, message: 'All alerts acknowledged' });
    }

    if (!alertId) {
      return NextResponse.json(
        { error: 'Alert ID is required' },
        { status: 400 }
      );
    }

    await creditService.acknowledgeAlert(session.user.sub, alertId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
