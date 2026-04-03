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
          generation_status,
          sort_order
        )
      `)
      .eq('id', shortId)
      .eq('project_id', projectId)
      .single();

    if (fullQuery.error && fullQuery.error.message?.includes('column')) {
      // Fallback: cinematic columns don't exist yet
      const basicQuery = await supabase
        .from('scenes')
        .select(`
          id,
          project_id,
          scene_number,
          title,
          description,
          sort_order,
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
            generation_status,
            sort_order
          )
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
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((shot) => ({
        id: shot.id,
        short_id: scene.id,
        shot_number: shot.shot_number,
        description: shot.description || '',
        duration: shot.duration || 5,
        shot_type: shot.shot_type,
        camera_angle: shot.camera_angle,
        camera_movement: shot.camera_movement,
        storyboard_image_url: shot.storyboard_image_url,
        generation_status: shot.generation_status || 'not_started',
        sort_order: shot.sort_order,
      }));

    const totalDuration = plans.reduce((sum, p) => sum + p.duration, 0);

    return NextResponse.json({
      short: {
        id: scene.id,
        project_id: scene.project_id,
        title: scene.title || `Short ${scene.scene_number}`,
        description: scene.description,
        scene_number: scene.scene_number,
        sort_order: scene.sort_order,
        cinematic_header: (scene as Record<string, unknown>).cinematic_header || null,
        character_mappings: (scene as Record<string, unknown>).character_mappings || null,
        generation_mode: (scene as Record<string, unknown>).generation_mode || 'standard',
        dialogue_language: (scene as Record<string, unknown>).dialogue_language || 'en',
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
