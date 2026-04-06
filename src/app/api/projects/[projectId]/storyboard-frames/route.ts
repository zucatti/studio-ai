import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import type { StoryboardFrameInsert } from '@/types/storyboard';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// GET /api/projects/[projectId]/storyboard-frames
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

    // Fetch frames with context
    const { data: frames, error } = await supabase
      .from('storyboard_frames')
      .select(`
        *,
        scene:scenes(scene_number, int_ext, location, time_of_day),
        script_element:script_elements(type, content, character_name)
      `)
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[StoryboardFrames] Error fetching frames:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ frames: frames || [] });
  } catch (error) {
    console.error('[StoryboardFrames] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/storyboard-frames
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json() as StoryboardFrameInsert;
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
      .from('storyboard_frames')
      .select('sort_order')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxOrder?.sort_order ?? -1) + 1;

    // Create frame
    const { data: frame, error } = await supabase
      .from('storyboard_frames')
      .insert({
        project_id: projectId,
        scene_id: body.scene_id || null,
        script_element_id: body.script_element_id || null,
        description: body.description || '',
        sort_order: body.sort_order ?? nextOrder,
      })
      .select()
      .single();

    if (error) {
      console.error('[StoryboardFrames] Error creating frame:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ frame });
  } catch (error) {
    console.error('[StoryboardFrames] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/storyboard-frames (delete all)
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

    // Delete all frames
    const { error } = await supabase
      .from('storyboard_frames')
      .delete()
      .eq('project_id', projectId);

    if (error) {
      console.error('[StoryboardFrames] Error deleting frames:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[StoryboardFrames] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
