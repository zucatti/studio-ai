import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { cleanupShotStorage } from '@/lib/storage/b2-utils';

interface RouteParams {
  params: Promise<{ projectId: string; shotId: string }>;
}

// GET a single shot
export async function GET(request: Request, { params }: RouteParams) {
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

    const { data: shot, error } = await supabase
      .from('shots')
      .select('*')
      .eq('id', shotId)
      .single();

    if (error || !shot) {
      return NextResponse.json({ error: 'Shot not found' }, { status: 404 });
    }

    return NextResponse.json(shot);
  } catch (error) {
    console.error('Error fetching shot:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shot: ' + String(error) },
      { status: 500 }
    );
  }
}

// PATCH - update a shot
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shotId } = await params;
    const body = await request.json();
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

    // Allowed fields to update
    const allowedFields = [
      'description',
      'shot_type',
      'camera_angle',
      'camera_movement',
      'camera_notes',
      'first_frame_url',
      'last_frame_url',
      'first_frame_prompt',
      'last_frame_prompt',
      'storyboard_image_url',
      'suggested_duration',
      'duration',
      'video_provider',
      'video_duration',
      'generation_status',
      'status', // Shot status: draft, selected, rush, archived
      // Animation prompt for video generation
      'animation_prompt',
      // Dialogue fields
      'has_dialogue',
      'dialogue_text',
      'dialogue_character_id',
      'dialogue_audio_url',
      // Audio timeline fields
      'start_time',
      'end_time',
      'has_vocals',
      'lip_sync_enabled',
      'singing_character_id',
      // Audio/Music mode fields
      'audio_mode',
      'audio_asset_id',
      'audio_start',
      'audio_end',
      // Cinematic fields
      'title',
      'cinematic_header',
      'segments',
    ];

    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data: shot, error } = await supabase
      .from('shots')
      .update(updates)
      .eq('id', shotId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(shot);
  } catch (error) {
    console.error('Error updating shot:', error);
    return NextResponse.json(
      { error: 'Failed to update shot: ' + String(error) },
      { status: 500 }
    );
  }
}

// DELETE - delete a shot
export async function DELETE(request: Request, { params }: RouteParams) {
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

    // Get shot data to retrieve file URLs for cleanup
    const { data: shot } = await supabase
      .from('shots')
      .select('storyboard_image_url, first_frame_url, last_frame_url, generated_video_url, dialogue_audio_url')
      .eq('id', shotId)
      .single();

    // Clean up S3/B2 storage files
    if (shot) {
      try {
        const deletedCount = await cleanupShotStorage(
          session.user.sub,
          projectId,
          shotId,
          {
            storyboardImageUrl: shot.storyboard_image_url,
            firstFrameUrl: shot.first_frame_url,
            lastFrameUrl: shot.last_frame_url,
            generatedVideoUrl: shot.generated_video_url,
            dialogueAudioUrl: shot.dialogue_audio_url,
          }
        );
        console.log(`[Shot Delete] Cleaned up ${deletedCount} files from S3`);
      } catch (storageError) {
        // Log but don't fail - DB deletion is more important
        console.error('[Shot Delete] Storage cleanup error:', storageError);
      }
    }

    // Delete related data first (dialogues, actions)
    await supabase.from('dialogues').delete().eq('shot_id', shotId);
    await supabase.from('actions').delete().eq('shot_id', shotId);

    // Delete the shot
    const { error } = await supabase
      .from('shots')
      .delete()
      .eq('id', shotId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting shot:', error);
    return NextResponse.json(
      { error: 'Failed to delete shot: ' + String(error) },
      { status: 500 }
    );
  }
}
