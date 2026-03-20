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
    const { data: scene, error } = await supabase
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
    const { title, description } = body;

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
