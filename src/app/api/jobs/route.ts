import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { fal } from '@fal-ai/client';

export type JobType = 'image' | 'video' | 'audio' | 'look';
export type JobStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface GenerationJob {
  id: string;
  user_id: string;
  asset_id: string | null;
  asset_type: string | null;
  asset_name: string | null;
  job_type: JobType;
  job_subtype: string | null;
  status: JobStatus;
  progress: number;
  message: string | null;
  fal_request_id: string | null;
  fal_endpoint: string | null;
  input_data: Record<string, unknown>;
  result_data: Record<string, unknown> | null;
  error_message: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  created_at: string;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

/**
 * GET /api/jobs
 * List all jobs for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // Filter by status
    const limit = parseInt(searchParams.get('limit') || '50');
    const includeCompleted = searchParams.get('includeCompleted') === 'true';

    const supabase = createServerSupabaseClient();

    let query = supabase
      .from('generation_jobs')
      .select('*')
      .eq('user_id', session.user.sub)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    } else if (!includeCompleted) {
      // By default, only show active jobs (not completed/failed/cancelled)
      query = query.in('status', ['pending', 'queued', 'running']);
    }

    const { data: jobs, error } = await query;

    if (error) {
      console.error('[Jobs] Error fetching jobs:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ jobs: jobs || [] });
  } catch (error) {
    console.error('[Jobs] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/jobs
 * Create a new generation job and submit to fal.ai queue
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      asset_id,
      asset_type,
      asset_name,
      job_type,
      job_subtype,
      fal_endpoint,
      input_data,
      estimated_cost,
    } = body;

    if (!job_type || !fal_endpoint || !input_data) {
      return NextResponse.json(
        { error: 'Missing required fields: job_type, fal_endpoint, input_data' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Create job in database
    const { data: job, error: insertError } = await supabase
      .from('generation_jobs')
      .insert({
        user_id: session.user.sub,
        asset_id,
        asset_type,
        asset_name,
        job_type,
        job_subtype,
        status: 'pending',
        progress: 0,
        message: 'En attente...',
        fal_endpoint,
        input_data,
        estimated_cost,
      })
      .select()
      .single();

    if (insertError || !job) {
      console.error('[Jobs] Error creating job:', insertError);
      return NextResponse.json({ error: insertError?.message || 'Failed to create job' }, { status: 500 });
    }

    // Submit to fal.ai queue
    try {
      const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://studio.stevencreeks.com'}/api/jobs/webhook`;

      const { request_id } = await fal.queue.submit(fal_endpoint, {
        input: input_data,
        webhookUrl,
      });

      // Update job with fal request ID
      await supabase
        .from('generation_jobs')
        .update({
          fal_request_id: request_id,
          status: 'queued',
          queued_at: new Date().toISOString(),
          message: 'En file d\'attente...',
        })
        .eq('id', job.id);

      return NextResponse.json({
        job: {
          ...job,
          fal_request_id: request_id,
          status: 'queued',
        },
      });
    } catch (falError) {
      // Update job as failed
      await supabase
        .from('generation_jobs')
        .update({
          status: 'failed',
          error_message: falError instanceof Error ? falError.message : 'Failed to submit to queue',
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      console.error('[Jobs] Error submitting to fal queue:', falError);
      return NextResponse.json(
        { error: 'Failed to submit job to queue', details: falError instanceof Error ? falError.message : 'Unknown' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[Jobs] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
