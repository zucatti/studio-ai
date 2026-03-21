/**
 * API Route: API Usage Logs
 *
 * GET - Fetch paginated usage logs or monthly summary
 */

import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { ApiProvider } from '@/types/database';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export async function GET(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const supabase = createServerSupabaseClient();

    // Check if summary is requested
    const summaryType = searchParams.get('summary');
    const months = parseInt(searchParams.get('months') || '6', 10);

    // Current month spending per provider
    if (summaryType === 'current') {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const { data, error } = await supabase
        .from('api_usage_logs')
        .select('provider, estimated_cost')
        .eq('user_id', session.user.sub)
        .eq('status', 'success')
        .gte('created_at', startOfMonth.toISOString());

      if (error) {
        console.error('Error fetching current spending:', error);
        return NextResponse.json(
          { error: 'Failed to fetch current spending' },
          { status: 500 }
        );
      }

      // Aggregate by provider
      const spending: Record<string, number> = {};
      let total = 0;

      (data || []).forEach((log) => {
        const cost = log.estimated_cost || 0;
        spending[log.provider] = (spending[log.provider] || 0) + cost;
        total += cost;
      });

      return NextResponse.json({
        spending,
        total,
        period: {
          start: startOfMonth.toISOString(),
          end: now.toISOString(),
        },
      });
    }

    if (summaryType === 'monthly') {
      // Calculate start date for monthly history
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months + 1);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('api_usage_logs')
        .select('provider, estimated_cost, created_at')
        .eq('user_id', session.user.sub)
        .eq('status', 'success')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching monthly history:', error);
        return NextResponse.json(
          { error: 'Failed to fetch monthly history' },
          { status: 500 }
        );
      }

      // Group by month
      const monthlyData: Record<string, Record<string, number>> = {};

      (data || []).forEach((log) => {
        const date = new Date(log.created_at);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = {};
        }

        const provider = log.provider;
        monthlyData[monthKey][provider] = (monthlyData[monthKey][provider] || 0) + (log.estimated_cost || 0);
      });

      // Convert to array format
      const monthly = Object.entries(monthlyData)
        .map(([month, providers]) => ({
          month,
          providers,
          total: Object.values(providers).reduce((sum, cost) => sum + cost, 0),
        }))
        .sort((a, b) => a.month.localeCompare(b.month));

      return NextResponse.json({ monthly });
    }

    // Standard paginated logs
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(searchParams.get('limit') || String(DEFAULT_PAGE_SIZE), 10))
    );
    const offset = (page - 1) * limit;

    // Filters
    const provider = searchParams.get('provider') as ApiProvider | null;
    const projectId = searchParams.get('projectId');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build query
    let query = supabase
      .from('api_usage_logs')
      .select('*', { count: 'exact' })
      .eq('user_id', session.user.sub)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (provider) {
      query = query.eq('provider', provider);
    }
    if (projectId) {
      query = query.eq('project_id', projectId);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data: logs, error, count } = await query;

    if (error) {
      console.error('Error fetching usage logs:', error);
      return NextResponse.json(
        { error: 'Failed to fetch usage logs' },
        { status: 500 }
      );
    }

    // Calculate summary statistics
    let summaryQuery = supabase
      .from('api_usage_logs')
      .select('provider, estimated_cost, status')
      .eq('user_id', session.user.sub);

    if (startDate) {
      summaryQuery = summaryQuery.gte('created_at', startDate);
    }
    if (endDate) {
      summaryQuery = summaryQuery.lte('created_at', endDate);
    }

    const { data: summaryData } = await summaryQuery;

    // Aggregate summary by provider
    const summary: Record<string, { totalCost: number; successCount: number; failedCount: number; blockedCount: number }> = {};

    if (summaryData) {
      for (const log of summaryData) {
        if (!summary[log.provider]) {
          summary[log.provider] = { totalCost: 0, successCount: 0, failedCount: 0, blockedCount: 0 };
        }
        if (log.status === 'success') {
          summary[log.provider].totalCost += log.estimated_cost || 0;
          summary[log.provider].successCount++;
        } else if (log.status === 'failed') {
          summary[log.provider].failedCount++;
        } else if (log.status === 'blocked') {
          summary[log.provider].blockedCount++;
        }
      }
    }

    return NextResponse.json({
      logs: logs || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
      summary,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
