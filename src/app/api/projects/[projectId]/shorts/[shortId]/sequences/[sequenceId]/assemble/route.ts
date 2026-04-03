import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { enqueueFFmpeg } from '@/lib/bullmq/queues';

// Compute hash of plans to detect changes
function computePlanHash(plans: Array<{ generated_video_url: string | null; duration: number; sort_order: number }>): string {
  const data = plans
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(p => `${p.generated_video_url || ''}:${p.duration}:${p.sort_order}`)
    .join('|');
  return crypto.createHash('md5').update(data).digest('hex');
}

interface RouteParams {
  params: Promise<{
    projectId: string;
    shortId: string;
    sequenceId: string;
  }>;
}

// GET: Check if assembly is needed
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { projectId, shortId, sequenceId } = await params;
  const supabase = createServerSupabaseClient();

  // Verify project ownership
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', session.user.sub)
    .single();

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Get sequence
  const { data: sequence } = await supabase
    .from('sequences')
    .select('id, assembled_video_url, assembled_plan_hash, assembled_at')
    .eq('id', sequenceId)
    .eq('scene_id', shortId)
    .single();

  if (!sequence) {
    return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
  }

  // Get plans
  const { data: plans } = await supabase
    .from('shots')
    .select('id, generated_video_url, duration, sort_order')
    .eq('sequence_id', sequenceId)
    .order('sort_order');

  const plansWithVideos = (plans || []).filter(p => p.generated_video_url);

  if (plansWithVideos.length === 0) {
    return NextResponse.json({
      needsAssembly: false,
      reason: 'no_videos',
      assembledVideoUrl: null,
    });
  }

  const currentHash = computePlanHash(plansWithVideos);
  const needsAssembly = sequence.assembled_plan_hash !== currentHash;

  return NextResponse.json({
    needsAssembly,
    currentHash,
    storedHash: sequence.assembled_plan_hash,
    assembledVideoUrl: needsAssembly ? null : sequence.assembled_video_url,
    assembledAt: sequence.assembled_at,
    planCount: plansWithVideos.length,
  });
}

// POST: Queue sequence assembly job
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shortId, sequenceId } = await params;
    const userId = session.user.sub;
    const supabase = createServerSupabaseClient();

    // Check for force parameter
    let force = false;
    try {
      const body = await request.json();
      force = body?.force === true;
    } catch {
      // No body or invalid JSON, default to no force
    }

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get sequence with title
    const { data: sequence } = await supabase
      .from('sequences')
      .select('id, scene_id, title, assembled_plan_hash')
      .eq('id', sequenceId)
      .eq('scene_id', shortId)
      .single();

    if (!sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Get plans with videos
    const { data: plans } = await supabase
      .from('shots')
      .select('id, generated_video_url, duration, sort_order')
      .eq('sequence_id', sequenceId)
      .not('generated_video_url', 'is', null)
      .order('sort_order');

    if (!plans || plans.length === 0) {
      return NextResponse.json({ error: 'No plans with videos to assemble' }, { status: 400 });
    }

    // Compute current hash
    const currentHash = computePlanHash(plans);

    // Check if already assembled with same hash (skip if force=true)
    if (!force && sequence.assembled_plan_hash === currentHash) {
      return NextResponse.json({
        status: 'already_assembled',
        message: 'Sequence already assembled with current plans',
      });
    }

    const shotIds = plans.map(p => p.id);

    // Create job record in Supabase (following existing pattern)
    const { data: job, error: jobError } = await supabase
      .from('generation_jobs')
      .insert({
        user_id: userId,
        asset_type: 'sequence',
        asset_name: sequence.title || `Sequence ${sequenceId.substring(0, 8)}`,
        job_type: 'video',
        job_subtype: 'sequence-assembly',
        status: 'queued',
        progress: 0,
        message: 'En file d\'attente...',
        input_data: {
          projectId,
          shortId,
          sequenceId,
          shotIds,
          shotCount: shotIds.length,
          planHash: currentHash,
        },
        queued_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error('[SequenceAssemble] Failed to create job:', jobError);
      return NextResponse.json(
        { error: 'Failed to create job', details: jobError },
        { status: 500 }
      );
    }

    // Queue FFmpeg assembly job with color matching
    try {
      await enqueueFFmpeg({
        userId,
        jobId: job.id,
        createdAt: new Date().toISOString(),
        operation: 'assemble-sequence',
        projectId,
        shortId,
        sequenceId,
        shotIds,
        planHash: currentHash,
      });
      console.log(`[SequenceAssemble] Job ${job.id} enqueued for sequence ${sequenceId}`);
    } catch (queueError) {
      console.error('[SequenceAssemble] Failed to enqueue:', queueError);

      await supabase
        .from('generation_jobs')
        .update({
          status: 'failed',
          error_message: queueError instanceof Error ? queueError.message : 'Failed to enqueue',
        })
        .eq('id', job.id);

      return NextResponse.json(
        { error: 'Failed to enqueue job', details: queueError instanceof Error ? queueError.message : 'Unknown' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: 'queued',
      jobId: job.id,
      planHash: currentHash,
      planCount: plans.length,
    });

  } catch (error) {
    console.error('[SequenceAssemble] Unexpected error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
