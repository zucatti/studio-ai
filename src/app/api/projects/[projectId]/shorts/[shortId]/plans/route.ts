import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { randomUUID } from 'crypto';

interface RouteParams {
  params: Promise<{ projectId: string; shortId: string }>;
}

// POST /api/projects/[projectId]/shorts/[shortId]/plans - Create a new plan
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shortId } = await params;
    const body = await request.json();
    const { description = '', duration = 5 } = body;

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
    const { data: scene } = await supabase
      .from('scenes')
      .select('id')
      .eq('id', shortId)
      .eq('project_id', projectId)
      .single();

    if (!scene) {
      return NextResponse.json({ error: 'Short not found' }, { status: 404 });
    }

    // Get max sort_order and shot_number for this scene
    const { data: maxData } = await supabase
      .from('shots')
      .select('sort_order, shot_number')
      .eq('scene_id', shortId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxData?.sort_order ?? -1) + 1;
    const nextNumber = (maxData?.shot_number ?? 0) + 1;

    // Create default segment that fills the entire plan duration
    const defaultSegment = {
      id: randomUUID(),
      start_time: 0,
      end_time: duration,
      shot_type: 'medium',
      subject: '',
    };

    // Create the plan (shot) with default segment
    const { data: shot, error } = await supabase
      .from('shots')
      .insert({
        scene_id: shortId,
        project_id: projectId,
        shot_number: nextNumber,
        description: description,
        duration: duration,
        sort_order: nextOrder,
        status: 'draft',
        generation_status: 'not_started',
        segments: [defaultSegment],
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating plan:', error);
      return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 });
    }

    return NextResponse.json({
      plan: {
        id: shot.id,
        short_id: shortId,
        shot_number: shot.shot_number,
        description: shot.description || '',
        duration: shot.duration || 5,
        shot_type: shot.shot_type,
        camera_angle: shot.camera_angle,
        camera_movement: shot.camera_movement,
        storyboard_image_url: shot.storyboard_image_url,
        generation_status: shot.generation_status || 'not_started',
        sort_order: shot.sort_order,
        // Cinematic fields
        title: shot.title,
        cinematic_header: shot.cinematic_header,
        segments: shot.segments || [defaultSegment],
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating plan:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
