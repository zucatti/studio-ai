import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// GET /api/projects/[projectId]/scenes
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
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

    const { data: scenes, error } = await supabase
      .from('scenes')
      .select(`
        *,
        shots (
          *,
          dialogues (*),
          actions (*)
        )
      `)
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching scenes:', error);
      return NextResponse.json(
        { error: 'Failed to fetch scenes' },
        { status: 500 }
      );
    }

    return NextResponse.json({ scenes });
  } catch (error) {
    console.error('Error fetching scenes:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[projectId]/scenes
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
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

    // Get max sort_order
    const { data: maxOrder } = await supabase
      .from('scenes')
      .select('sort_order')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxOrder?.sort_order ?? -1) + 1;

    const { data: scene, error } = await supabase
      .from('scenes')
      .insert({
        project_id: projectId,
        scene_number: scene_number || nextOrder + 1,
        int_ext: int_ext || 'INT',
        location: location || '',
        time_of_day: time_of_day || 'JOUR',
        description: description || null,
        sort_order: nextOrder,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating scene:', error);
      return NextResponse.json(
        { error: 'Failed to create scene' },
        { status: 500 }
      );
    }

    return NextResponse.json({ scene }, { status: 201 });
  } catch (error) {
    console.error('Error creating scene:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[projectId]/scenes - Delete all scenes (script) for a project
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
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

    // Get all scene IDs for this project
    const { data: scenes } = await supabase
      .from('scenes')
      .select('id')
      .eq('project_id', projectId);

    if (scenes && scenes.length > 0) {
      const sceneIds = scenes.map((s) => s.id);

      // Get all shot IDs for these scenes
      const { data: shots } = await supabase
        .from('shots')
        .select('id')
        .in('scene_id', sceneIds);

      if (shots && shots.length > 0) {
        const shotIds = shots.map((s) => s.id);

        // Delete dialogues and actions
        await supabase.from('dialogues').delete().in('shot_id', shotIds);
        await supabase.from('actions').delete().in('shot_id', shotIds);
      }

      // Delete shots
      await supabase.from('shots').delete().in('scene_id', sceneIds);

      // Delete scenes
      await supabase.from('scenes').delete().eq('project_id', projectId);
    }

    // Update project step back to brainstorming
    await supabase
      .from('projects')
      .update({ current_step: 'brainstorming' })
      .eq('id', projectId);

    return NextResponse.json({ success: true, message: 'Script supprimé' });
  } catch (error) {
    console.error('Error deleting scenes:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
