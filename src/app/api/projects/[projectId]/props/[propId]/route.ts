import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string; propId: string }>;
}

// PATCH - Update prop
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, propId } = await params;
    const body = await request.json();
    const { name, type, visual_description } = body;

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

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (type !== undefined) updates.type = type;
    if (visual_description !== undefined) updates.visual_description = visual_description;

    const { data: prop, error } = await supabase
      .from('props')
      .update(updates)
      .eq('id', propId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) {
      console.error('Error updating prop:', error);
      return NextResponse.json({ error: 'Failed to update prop' }, { status: 500 });
    }

    return NextResponse.json({ success: true, prop });
  } catch (error) {
    console.error('Error updating prop:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete prop
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, propId } = await params;
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

    const { error } = await supabase
      .from('props')
      .delete()
      .eq('id', propId)
      .eq('project_id', projectId);

    if (error) {
      console.error('Error deleting prop:', error);
      return NextResponse.json({ error: 'Failed to delete prop' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting prop:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
