/**
 * Assemble V2 API Route (Editly)
 *
 * Uses Editly for video assembly with:
 * - Sequences with transitions
 * - Background music at short level
 * - Color matching within sequences
 */

import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { enqueueEditly, type EditlyJobData } from '@/lib/bullmq';

interface RouteParams {
  params: Promise<{ projectId: string; shortId: string }>;
}

/**
 * POST - Queue an Editly assembly job for a short
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shortId } = await params;
    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, aspect_ratio')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return Response.json(
        { error: 'Project not found', details: projectError },
        { status: 404 }
      );
    }

    // Get the short (scene) with sequences, shots, and music settings
    const { data: scene, error: sceneError } = await supabase
      .from('scenes')
      .select(`
        id,
        title,
        music_asset_id,
        music_volume,
        music_fade_in,
        music_fade_out,
        shots (
          id,
          shot_number,
          generated_video_url,
          duration,
          sort_order,
          sequence_id
        )
      `)
      .eq('id', shortId)
      .eq('project_id', projectId)
      .single();

    if (sceneError || !scene) {
      return Response.json(
        { error: 'Short not found', details: sceneError },
        { status: 404 }
      );
    }

    // Get sequences for this short
    const { data: sequences, error: seqError } = await supabase
      .from('sequences')
      .select('*')
      .eq('scene_id', shortId)
      .order('sort_order', { ascending: true });

    if (seqError) {
      console.warn('[AssembleV2] Error fetching sequences:', seqError);
    }

    // Get music asset URL if set
    let musicUrl: string | null = null;
    if (scene.music_asset_id) {
      const { data: musicAsset } = await supabase
        .from('global_assets')
        .select('file_url')
        .eq('id', scene.music_asset_id)
        .single();

      if (musicAsset?.file_url) {
        musicUrl = musicAsset.file_url;
      }
    }

    // Filter shots with videos
    interface Shot {
      id: string;
      generated_video_url: string | null;
      duration: number;
      sort_order: number;
      sequence_id: string | null;
    }

    const shotsWithVideos = ((scene.shots || []) as Shot[])
      .filter((s) => s.generated_video_url)
      .sort((a, b) => a.sort_order - b.sort_order);

    if (shotsWithVideos.length === 0) {
      return Response.json(
        { error: 'Aucune vidéo à assembler' },
        { status: 400 }
      );
    }

    // Build sequence data for the job
    // If no sequences exist, create a default one with all shots
    interface SequenceData {
      id: string;
      title: string | null;
      sort_order: number;
      transition_in: string | null;
      transition_out: string | null;
      transition_duration: number;
      plans: Array<{
        id: string;
        video_url: string;
        duration: number;
        sort_order: number;
      }>;
    }

    let sequenceData: SequenceData[] = [];

    if (sequences && sequences.length > 0) {
      // Group shots by sequence
      const shotsBySequence = new Map<string | null, Shot[]>();

      for (const shot of shotsWithVideos) {
        const seqId = shot.sequence_id;
        if (!shotsBySequence.has(seqId)) {
          shotsBySequence.set(seqId, []);
        }
        shotsBySequence.get(seqId)!.push(shot);
      }

      // Build sequence data
      for (const seq of sequences) {
        const seqShots = shotsBySequence.get(seq.id) || [];
        if (seqShots.length > 0) {
          sequenceData.push({
            id: seq.id,
            title: seq.title,
            sort_order: seq.sort_order,
            transition_in: seq.transition_in,
            transition_out: seq.transition_out,
            transition_duration: seq.transition_duration ?? 0.5,
            plans: seqShots.map((shot) => ({
              id: shot.id,
              video_url: shot.generated_video_url!,
              duration: shot.duration,
              sort_order: shot.sort_order,
            })),
          });
        }
      }

      // Add unassigned shots as a default sequence
      const unassignedShots = shotsBySequence.get(null) || [];
      if (unassignedShots.length > 0) {
        sequenceData.push({
          id: 'default',
          title: 'Unassigned',
          sort_order: sequenceData.length,
          transition_in: null,
          transition_out: null,
          transition_duration: 0.5,
          plans: unassignedShots.map((shot) => ({
            id: shot.id,
            video_url: shot.generated_video_url!,
            duration: shot.duration,
            sort_order: shot.sort_order,
          })),
        });
      }
    } else {
      // No sequences defined - put all shots in a single default sequence
      sequenceData = [{
        id: 'default',
        title: null,
        sort_order: 0,
        transition_in: null,
        transition_out: null,
        transition_duration: 0.5,
        plans: shotsWithVideos.map((shot) => ({
          id: shot.id,
          video_url: shot.generated_video_url!,
          duration: shot.duration,
          sort_order: shot.sort_order,
        })),
      }];
    }

    // Sort sequences by sort_order
    sequenceData.sort((a, b) => a.sort_order - b.sort_order);

    // Create job record in Supabase
    const { data: job, error: jobError } = await supabase
      .from('generation_jobs')
      .insert({
        user_id: session.user.sub,
        asset_type: 'short',
        asset_name: scene.title || `Short ${shortId.substring(0, 8)}`,
        job_type: 'video',
        job_subtype: 'editly-assembly',
        status: 'queued',
        progress: 0,
        message: 'En file d\'attente (Editly)...',
        input_data: {
          projectId,
          shortId,
          sequenceCount: sequenceData.length,
          clipCount: shotsWithVideos.length,
          hasMusic: !!musicUrl,
        },
        queued_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error('[AssembleV2] Failed to create job:', jobError);
      return Response.json(
        { error: 'Failed to create job', details: jobError },
        { status: 500 }
      );
    }

    // Build job data for BullMQ
    const jobData: Omit<EditlyJobData, 'type'> = {
      userId: session.user.sub,
      jobId: job.id,
      createdAt: new Date().toISOString(),
      operation: 'assemble-short',
      projectId,
      shortId,
      sequences: sequenceData,
      ...(musicUrl && {
        music: {
          asset_url: musicUrl,
          volume: scene.music_volume ?? 0.3,
          fade_in: scene.music_fade_in ?? 0,
          fade_out: scene.music_fade_out ?? 2,
        },
      }),
    };

    // Enqueue the job
    try {
      await enqueueEditly(jobData);
      console.log(`[AssembleV2] Job ${job.id} enqueued for short ${shortId}`);
    } catch (queueError) {
      console.error('[AssembleV2] Failed to enqueue:', queueError);

      await supabase
        .from('generation_jobs')
        .update({
          status: 'failed',
          error_message: queueError instanceof Error ? queueError.message : 'Failed to enqueue',
        })
        .eq('id', job.id);

      return Response.json(
        { error: 'Failed to enqueue job', details: queueError instanceof Error ? queueError.message : 'Unknown' },
        { status: 500 }
      );
    }

    // Clear any old assembled video
    await supabase
      .from('scenes')
      .update({
        assembled_video_url: null,
      })
      .eq('id', shortId);

    // Return job ID for polling
    return Response.json({
      jobId: job.id,
      status: 'queued',
      message: 'Editly assembly job enqueued successfully',
      sequenceCount: sequenceData.length,
      clipCount: shotsWithVideos.length,
      hasMusic: !!musicUrl,
    });

  } catch (error) {
    console.error('[AssembleV2] Unexpected error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
