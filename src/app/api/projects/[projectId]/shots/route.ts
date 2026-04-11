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
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status'); // Optional: filter by status
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

    const sceneIds = scenes?.map((s) => s.id) || [];

    // Build query for shots - include both scene-based and direct project shots
    let shotsQuery = supabase
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
      `);

    // Include shots from scenes OR direct project shots
    if (sceneIds.length > 0) {
      shotsQuery = shotsQuery.or(`scene_id.in.(${sceneIds.join(',')}),project_id.eq.${projectId}`);
    } else {
      shotsQuery = shotsQuery.eq('project_id', projectId);
    }

    // Apply status filter if provided
    if (statusFilter) {
      shotsQuery = shotsQuery.eq('status', statusFilter);
    }

    const { data: shots, error } = await shotsQuery.order('shot_number');

    if (error) {
      console.error('Error fetching shots:', error);
      return NextResponse.json({ error: 'Failed to fetch shots' }, { status: 500 });
    }

    // Attach scene info to each shot
    const shotsWithScenes = (shots || []).map((shot) => {
      const scene = shot.scene_id ? scenes?.find((s) => s.id === shot.scene_id) : null;
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

    // If scene_id is provided, verify scene belongs to project
    if (body.scene_id) {
      const { data: scene } = await supabase
        .from('scenes')
        .select('id')
        .eq('id', body.scene_id)
        .eq('project_id', projectId)
        .single();

      if (!scene) {
        return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
      }
    }

    // Get max sort_order for this project
    const { data: maxData } = await supabase
      .from('shots')
      .select('sort_order, shot_number')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxData?.sort_order ?? -1) + 1;
    const nextNumber = (maxData?.shot_number ?? 0) + 1;

    // Duration for segments
    const duration = body.duration || 5;

    // Default segment
    const defaultSegment = {
      id: crypto.randomUUID(),
      start_time: 0,
      end_time: duration,
      shot_type: 'medium',
      subject: '',
    };

    // Create the shot
    const { data: shot, error } = await supabase
      .from('shots')
      .insert({
        scene_id: body.scene_id || null,
        sequence_id: body.sequence_id ?? null,
        project_id: projectId,
        shot_number: body.shot_number || nextNumber,
        description: body.description || '',
        duration: duration,
        shot_type: body.shot_type || 'medium',
        camera_angle: body.camera_angle || 'eye_level',
        camera_movement: body.camera_movement || 'static',
        status: body.status || 'draft',
        generation_status: 'not_started',
        sort_order: body.sort_order ?? nextOrder,
        storyboard_image_url: body.storyboard_image_url || null,
        segments: body.segments || [defaultSegment],
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
