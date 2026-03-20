import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// GET /api/projects/[projectId]/shorts - Get all shorts for a project
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const supabase = createServerSupabaseClient();

    // Verify project ownership and type
    const { data: project } = await supabase
      .from('projects')
      .select('id, project_type')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.project_type !== 'shorts_project') {
      return NextResponse.json({ error: 'Not a shorts project' }, { status: 400 });
    }

    // Get all scenes (shorts) with their shots (plans)
    const { data: scenes, error } = await supabase
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
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching shorts:', error);
      return NextResponse.json({ error: 'Failed to fetch shorts' }, { status: 500 });
    }

    // Transform to shorts format
    const shorts = (scenes || []).map((scene) => {
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

      return {
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
      };
    });

    return NextResponse.json({ shorts });
  } catch (error) {
    console.error('Error fetching shorts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/shorts - Create a new short
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { title } = body;

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Verify project ownership and type
    const { data: project } = await supabase
      .from('projects')
      .select('id, project_type')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.project_type !== 'shorts_project') {
      return NextResponse.json({ error: 'Not a shorts project' }, { status: 400 });
    }

    // Get max sort_order and scene_number
    const { data: maxData } = await supabase
      .from('scenes')
      .select('sort_order, scene_number')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxData?.sort_order ?? -1) + 1;
    const nextNumber = (maxData?.scene_number ?? 0) + 1;

    // Create the short (scene)
    const { data: scene, error } = await supabase
      .from('scenes')
      .insert({
        project_id: projectId,
        scene_number: nextNumber,
        title: title.trim(),
        int_ext: 'INT', // Default values for shorts
        location: '',
        time_of_day: 'JOUR',
        sort_order: nextOrder,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating short:', error);
      return NextResponse.json({ error: 'Failed to create short' }, { status: 500 });
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
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating short:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
