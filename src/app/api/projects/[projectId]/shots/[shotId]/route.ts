import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

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
      'suggested_duration',
      'video_provider',
      'video_duration',
      'generation_status',
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
