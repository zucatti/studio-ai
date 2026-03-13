import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string; sceneId: string }>;
}

// GET /api/projects/[projectId]/scenes/[sceneId]
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, sceneId } = await params;
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

    const { data: scene, error } = await supabase
      .from('scenes')
      .select('*')
      .eq('id', sceneId)
      .eq('project_id', projectId)
      .single();

    if (error || !scene) {
      return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
    }

    return NextResponse.json({ scene });
  } catch (error) {
    console.error('Error fetching scene:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/projects/[projectId]/scenes/[sceneId]
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, sceneId } = await params;
    const body = await request.json();
    const { scene_number, int_ext, location, time_of_day, description } = body;

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

    // Verify scene exists
    const { data: existingScene } = await supabase
      .from('scenes')
      .select('id')
      .eq('id', sceneId)
      .eq('project_id', projectId)
      .single();

    if (!existingScene) {
      return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
    }

    // Build update object
    const updates: Record<string, unknown> = {};
    if (scene_number !== undefined) updates.scene_number = scene_number;
    if (int_ext !== undefined) updates.int_ext = int_ext;
    if (location !== undefined) updates.location = location;
    if (time_of_day !== undefined) updates.time_of_day = time_of_day;
    if (description !== undefined) updates.description = description || null;

    const { data: scene, error } = await supabase
      .from('scenes')
      .update(updates)
      .eq('id', sceneId)
      .select()
      .single();

    if (error) {
      console.error('Error updating scene:', error);
      return NextResponse.json({ error: 'Failed to update scene' }, { status: 500 });
    }

    return NextResponse.json({ scene });
  } catch (error) {
    console.error('Error updating scene:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/scenes/[sceneId]
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, sceneId } = await params;
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

    // Get all shots for this scene
    const { data: shots } = await supabase
      .from('shots')
      .select('id')
      .eq('scene_id', sceneId);

    if (shots && shots.length > 0) {
      const shotIds = shots.map((s) => s.id);

      // Delete dialogues and actions
      await supabase.from('dialogues').delete().in('shot_id', shotIds);
      await supabase.from('actions').delete().in('shot_id', shotIds);
    }

    // Delete shots
    await supabase.from('shots').delete().eq('scene_id', sceneId);

    // Delete script elements
    await supabase.from('script_elements').delete().eq('scene_id', sceneId);

    // Delete scene
    const { error } = await supabase
      .from('scenes')
      .delete()
      .eq('id', sceneId)
      .eq('project_id', projectId);

    if (error) {
      console.error('Error deleting scene:', error);
      return NextResponse.json({ error: 'Failed to delete scene' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting scene:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
