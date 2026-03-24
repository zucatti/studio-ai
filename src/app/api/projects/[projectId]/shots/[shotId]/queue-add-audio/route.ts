/**
 * Queue Add Audio API Route
 * Queues a job to generate TTS dialogue and merge with video
 */

import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { enqueueAudioGen } from '@/lib/bullmq/queues';

interface RouteParams {
  params: Promise<{ projectId: string; shotId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shotId } = await params;
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

    // Get shot with dialogue info and video
    const { data: shot, error: shotError } = await supabase
      .from('shots')
      .select('*, generated_video_url, has_dialogue, dialogue_text, dialogue_character_id')
      .eq('id', shotId)
      .single();

    if (shotError || !shot) {
      return NextResponse.json({ error: 'Shot not found' }, { status: 404 });
    }

    // Validate requirements
    if (!shot.generated_video_url) {
      return NextResponse.json({ error: 'No video to add audio to. Generate video first.' }, { status: 400 });
    }

    if (!shot.has_dialogue || !shot.dialogue_text) {
      return NextResponse.json({ error: 'No dialogue configured for this shot.' }, { status: 400 });
    }

    if (!shot.dialogue_character_id) {
      return NextResponse.json({ error: 'No character selected for dialogue.' }, { status: 400 });
    }

    // Get character's voice_id
    const { data: character } = await supabase
      .from('global_assets')
      .select('data, name')
      .eq('id', shot.dialogue_character_id)
      .single();

    const voiceId = (character?.data as Record<string, unknown>)?.voice_id as string;

    if (!voiceId) {
      return NextResponse.json({
        error: `Character "${character?.name}" has no voice configured. Add a voice_id in character settings.`,
      }, { status: 400 });
    }

    // Create job in database
    const { data: job, error: jobError } = await supabase
      .from('generation_jobs')
      .insert({
        user_id: session.user.sub,
        project_id: projectId,
        job_type: 'audio-gen',
        status: 'queued',
        metadata: {
          shotId,
          voiceId,
          characterName: character?.name,
          textLength: shot.dialogue_text.length,
          mergeWithVideo: true,
        },
      })
      .select()
      .single();

    if (jobError || !job) {
      console.error('[QueueAddAudio] Failed to create job:', jobError);
      return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
    }

    // Enqueue the job to BullMQ
    await enqueueAudioGen({
      userId: session.user.sub,
      jobId: job.id,
      createdAt: new Date().toISOString(),
      projectId,
      shotId,
      voiceId,
      text: shot.dialogue_text,
      modelId: 'eleven_v3',
      videoUrl: shot.generated_video_url,
      mergeWithVideo: true,
    });

    console.log(`[QueueAddAudio] Job ${job.id} queued for shot ${shotId}`);

    return NextResponse.json({
      success: true,
      jobId: job.id,
      status: 'queued',
      async: true,
      message: 'Audio generation queued',
    });

  } catch (error) {
    console.error('[QueueAddAudio] Error:', error);
    return NextResponse.json(
      { error: 'Failed to queue audio: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
