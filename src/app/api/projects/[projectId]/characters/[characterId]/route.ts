import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string; characterId: string }>;
}

// PATCH - Update character
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, characterId } = await params;
    const body = await request.json();
    const { name, description, visual_description, age, gender } = body;

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
    if (description !== undefined) updates.description = description;
    if (visual_description !== undefined) updates.visual_description = visual_description;
    if (age !== undefined) updates.age = age || null;
    if (gender !== undefined) updates.gender = gender || null;

    const { data: character, error } = await supabase
      .from('characters')
      .update(updates)
      .eq('id', characterId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) {
      console.error('Error updating character:', error);
      return NextResponse.json({ error: 'Failed to update character' }, { status: 500 });
    }

    return NextResponse.json({ success: true, character });
  } catch (error) {
    console.error('Error updating character:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete character
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, characterId } = await params;
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
      .from('characters')
      .delete()
      .eq('id', characterId)
      .eq('project_id', projectId);

    if (error) {
      console.error('Error deleting character:', error);
      return NextResponse.json({ error: 'Failed to delete character' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting character:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
