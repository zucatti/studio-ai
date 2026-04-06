import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import type { StoryboardFrameUpdate } from '@/types/storyboard';

interface RouteParams {
  params: Promise<{ projectId: string; frameId: string }>;
}

// GET /api/projects/[projectId]/storyboard-frames/[frameId]
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, frameId } = await params;
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

    // Fetch frame with context
    const { data: frame, error } = await supabase
      .from('storyboard_frames')
      .select(`
        *,
        scene:scenes(scene_number, int_ext, location, time_of_day),
        script_element:script_elements(type, content, character_name)
      `)
      .eq('id', frameId)
      .eq('project_id', projectId)
      .single();

    if (error || !frame) {
      return NextResponse.json({ error: 'Frame not found' }, { status: 404 });
    }

    return NextResponse.json({ frame });
  } catch (error) {
    console.error('[StoryboardFrame] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/projects/[projectId]/storyboard-frames/[frameId]
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, frameId } = await params;
    const body = await request.json() as StoryboardFrameUpdate;
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

    // Update frame
    const { data: frame, error } = await supabase
      .from('storyboard_frames')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', frameId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) {
      console.error('[StoryboardFrame] Error updating frame:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ frame });
  } catch (error) {
    console.error('[StoryboardFrame] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/storyboard-frames/[frameId]
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, frameId } = await params;
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

    // Delete frame
    const { error } = await supabase
      .from('storyboard_frames')
      .delete()
      .eq('id', frameId)
      .eq('project_id', projectId);

    if (error) {
      console.error('[StoryboardFrame] Error deleting frame:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[StoryboardFrame] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
