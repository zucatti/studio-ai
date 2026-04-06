import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string; shortId: string }>;
}

// GET /api/projects/[projectId]/shorts/[shortId] - Get a single short
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shortId } = await params;
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

    // Get the short (scene) with its plans (shots)
    // Try with cinematic columns first, fall back if they don't exist
    let scene;
    let queryError;

    const fullQuery = await supabase
      .from('scenes')
      .select(`
        id,
        project_id,
        scene_number,
        title,
        description,
        sort_order,
        cinematic_header,
        character_mappings,
        generation_mode,
        dialogue_language,
        style_bible,
        music_asset_id,
        music_volume,
        music_fade_in,
        music_fade_out,
        assembled_video_url,
        assembled_video_duration,
        created_at,
        updated_at,
        shots (
          id,
          shot_number,
          description,
          duration,
          shot_type,
          camera_angle,
          camera_movement,
          storyboard_image_url,
          first_frame_url,
          last_frame_url,
          generated_video_url,
          generation_status,
          sort_order,
          title,
          segments,
          sequence_id,
          video_rushes,
          animation_prompt,
          has_dialogue,
          dialogue_text,
          dialogue_character_id,
          dialogue_audio_url,
          audio_mode,
          audio_asset_id,
          audio_start,
          audio_end,
          audio_offset,
          audio_volume
        )
      `)
      .eq('id', shortId)
      .eq('project_id', projectId)
      .single();

    if (fullQuery.error && fullQuery.error.message?.includes('column')) {
      // Fallback: some columns don't exist yet - use wildcard
      const basicQuery = await supabase
        .from('scenes')
        .select(`
          *,
          shots (*)
        `)
        .eq('id', shortId)
        .eq('project_id', projectId)
        .single();

      scene = basicQuery.data;
      queryError = basicQuery.error;
    } else {
      scene = fullQuery.data;
      queryError = fullQuery.error;
    }

    const error = queryError;

    if (error || !scene) {
      return NextResponse.json({ error: 'Short not found' }, { status: 404 });
    }

    const plans = (scene.shots || [])
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
        (a.sort_order as number) - (b.sort_order as number)
      )
      .map((shot: Record<string, unknown>) => ({
        id: shot.id,
        short_id: scene.id,
        shot_number: shot.shot_number,
        description: shot.description || '',
        duration: shot.duration || 5,
        shot_type: shot.shot_type,
        camera_angle: shot.camera_angle,
        camera_movement: shot.camera_movement,
        storyboard_image_url: shot.storyboard_image_url,
        first_frame_url: shot.first_frame_url || null,
        last_frame_url: shot.last_frame_url || null,
        generated_video_url: shot.generated_video_url || null,
        generation_status: shot.generation_status || 'not_started',
        sort_order: shot.sort_order,
        title: shot.title || null,
        segments: shot.segments || [],
        sequence_id: shot.sequence_id || null,
        video_rushes: shot.video_rushes || null,
        animation_prompt: shot.animation_prompt || null,
        has_dialogue: shot.has_dialogue || false,
        dialogue_text: shot.dialogue_text || null,
        dialogue_character_id: shot.dialogue_character_id || null,
        dialogue_audio_url: shot.dialogue_audio_url || null,
        audio_mode: shot.audio_mode || 'mute',
        audio_asset_id: shot.audio_asset_id || null,
        audio_start: shot.audio_start || 0,
        audio_end: shot.audio_end || null,
        audio_offset: shot.audio_offset || 0,
        audio_volume: shot.audio_volume ?? 1,
      }));

    const totalDuration = plans.reduce((sum: number, p: { duration: number }) => sum + p.duration, 0);

    const sceneData = scene as Record<string, unknown>;
    return NextResponse.json({
      short: {
        id: scene.id,
        project_id: scene.project_id,
        title: scene.title || `Short ${scene.scene_number}`,
        description: scene.description,
        scene_number: scene.scene_number,
        sort_order: scene.sort_order,
        cinematic_header: sceneData.cinematic_header || null,
        character_mappings: sceneData.character_mappings || null,
        generation_mode: sceneData.generation_mode || 'standard',
        dialogue_language: sceneData.dialogue_language || 'en',
        style_bible: sceneData.style_bible || null,
        music_asset_id: sceneData.music_asset_id || null,
        music_volume: sceneData.music_volume ?? 0.5,
        music_fade_in: sceneData.music_fade_in ?? 0,
        music_fade_out: sceneData.music_fade_out ?? 0,
        assembled_video_url: sceneData.assembled_video_url || null,
        assembled_video_duration: sceneData.assembled_video_duration || null,
        plans,
        totalDuration,
        created_at: scene.created_at,
        updated_at: scene.updated_at,
      },
    });
  } catch (error) {
    console.error('Error fetching short:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/projects/[projectId]/shorts/[shortId] - Update a short
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shortId } = await params;
    const body = await request.json();
    const {
      title,
      description,
      cinematic_header,
      character_mappings,
      generation_mode,
      dialogue_language,
      // Music settings for Editly
      music_asset_id,
      music_volume,
      music_fade_in,
      music_fade_out,
    } = body;

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

    // Build update object
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (cinematic_header !== undefined) updates.cinematic_header = cinematic_header;
    if (character_mappings !== undefined) updates.character_mappings = character_mappings;
    if (generation_mode !== undefined) updates.generation_mode = generation_mode;
    if (dialogue_language !== undefined) updates.dialogue_language = dialogue_language;
    // Music settings for Editly
    if (music_asset_id !== undefined) updates.music_asset_id = music_asset_id;
    if (music_volume !== undefined) updates.music_volume = music_volume;
    if (music_fade_in !== undefined) updates.music_fade_in = music_fade_in;
    if (music_fade_out !== undefined) updates.music_fade_out = music_fade_out;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const { data: scene, error } = await supabase
      .from('scenes')
      .update(updates)
      .eq('id', shortId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) {
      console.error('Error updating short:', error);
      return NextResponse.json({ error: 'Failed to update short' }, { status: 500 });
    }

    return NextResponse.json({
      short: {
        id: scene.id,
        project_id: scene.project_id,
        title: scene.title,
        description: scene.description,
        scene_number: scene.scene_number,
        sort_order: scene.sort_order,
        cinematic_header: (scene as Record<string, unknown>).cinematic_header || null,
        character_mappings: (scene as Record<string, unknown>).character_mappings || null,
        generation_mode: (scene as Record<string, unknown>).generation_mode || 'standard',
        dialogue_language: (scene as Record<string, unknown>).dialogue_language || 'en',
        created_at: scene.created_at,
        updated_at: scene.updated_at,
      },
    });
  } catch (error) {
    console.error('Error updating short:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/shorts/[shortId] - Delete a short
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shortId } = await params;
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

    // Delete all shots (plans) for this scene first
    await supabase
      .from('shots')
      .delete()
      .eq('scene_id', shortId);

    // Delete the scene (short)
    const { error } = await supabase
      .from('scenes')
      .delete()
      .eq('id', shortId)
      .eq('project_id', projectId);

    if (error) {
      console.error('Error deleting short:', error);
      return NextResponse.json({ error: 'Failed to delete short' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting short:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
