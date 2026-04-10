import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string; sceneId: string }>;
}

// GET /api/projects/[projectId]/scenes/[sceneId]/timeline
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

    // Get scene with timeline data
    const { data: scene, error } = await supabase
      .from('scenes')
      .select('id, timeline_data')
      .eq('id', sceneId)
      .eq('project_id', projectId)
      .single();

    if (error || !scene) {
      return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
    }

    return NextResponse.json({
      sceneId: scene.id,
      timelineData: scene.timeline_data,
    });
  } catch (error) {
    console.error('Error fetching timeline:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/projects/[projectId]/scenes/[sceneId]/timeline
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, sceneId } = await params;
    const body = await request.json();
    const { timelineData } = body;

    if (!timelineData) {
      return NextResponse.json({ error: 'Missing timelineData' }, { status: 400 });
    }

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

    // Update timeline data
    const { error } = await supabase
      .from('scenes')
      .update({ timeline_data: timelineData })
      .eq('id', sceneId);

    if (error) {
      console.error('Error saving timeline:', error);
      return NextResponse.json({ error: 'Failed to save timeline' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving timeline:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
