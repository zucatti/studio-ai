import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// GET /api/projects/[projectId]/shots - Get all shots for a project
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

    // Get all scenes for the project
    const { data: scenes } = await supabase
      .from('scenes')
      .select('id, scene_number, int_ext, location, time_of_day')
      .eq('project_id', projectId)
      .order('scene_number');

    if (!scenes || scenes.length === 0) {
      return NextResponse.json({ shots: [] });
    }

    // Get all shots for these scenes with their dialogues
    const sceneIds = scenes.map((s) => s.id);
    const { data: shots, error } = await supabase
      .from('shots')
      .select(`
        *,
        dialogues (
          id,
          character_name,
          content,
          parenthetical,
          sort_order
        )
      `)
      .in('scene_id', sceneIds)
      .order('shot_number');

    if (error) {
      console.error('Error fetching shots:', error);
      return NextResponse.json({ error: 'Failed to fetch shots' }, { status: 500 });
    }

    // Attach scene info to each shot
    const shotsWithScenes = (shots || []).map((shot) => {
      const scene = scenes.find((s) => s.id === shot.scene_id);
      return {
        ...shot,
        scene,
        dialogues: shot.dialogues?.sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order) || [],
      };
    });

    return NextResponse.json({ shots: shotsWithScenes });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/shots - Create a new shot
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
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

    // Verify scene belongs to project
    const { data: scene } = await supabase
      .from('scenes')
      .select('id')
      .eq('id', body.scene_id)
      .eq('project_id', projectId)
      .single();

    if (!scene) {
      return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
    }

    // Create the shot
    const { data: shot, error } = await supabase
      .from('shots')
      .insert({
        scene_id: body.scene_id,
        shot_number: body.shot_number || 1,
        description: body.description || '',
        shot_type: body.shot_type || 'medium',
        camera_angle: body.camera_angle || 'eye_level',
        camera_movement: body.camera_movement || 'static',
        sort_order: body.shot_number || 1,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating shot:', error);
      return NextResponse.json({ error: 'Failed to create shot' }, { status: 500 });
    }

    return NextResponse.json({ shot }, { status: 201 });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
