import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import type { MusicSectionType } from '@/types/database';

interface RouteParams {
  params: Promise<{ projectId: string; sectionId: string }>;
}

// Section type colors
const SECTION_COLORS: Record<MusicSectionType, string> = {
  intro: '#6366f1',
  verse: '#8b5cf6',
  chorus: '#ec4899',
  bridge: '#f59e0b',
  outro: '#6366f1',
  instrumental: '#10b981',
  custom: '#64748b',
};

// GET /api/projects/[projectId]/sections/[sectionId] - Get a single section with its shots
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, sectionId } = await params;
    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Fetch section
    const { data: section, error: sectionError } = await supabase
      .from('music_sections')
      .select('*')
      .eq('id', sectionId)
      .eq('project_id', projectId)
      .single();

    if (sectionError || !section) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }

    // Fetch shots for this section
    const { data: shots, error: shotsError } = await supabase
      .from('shots')
      .select('*')
      .eq('section_id', sectionId)
      .order('relative_start', { ascending: true });

    if (shotsError) {
      console.error('Error fetching shots:', shotsError);
    }

    return NextResponse.json({ section, shots: shots || [] });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/projects/[projectId]/sections/[sectionId] - Update a section
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, sectionId } = await params;
    const body = await request.json();
    const { name, section_type, start_time, end_time, mood, notes, sort_order } = body;

    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Build update object
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (section_type !== undefined) {
      updateData.section_type = section_type;
      updateData.color = SECTION_COLORS[section_type as MusicSectionType] || SECTION_COLORS.custom;
    }
    if (start_time !== undefined) updateData.start_time = start_time;
    if (end_time !== undefined) updateData.end_time = end_time;
    if (mood !== undefined) updateData.mood = mood;
    if (notes !== undefined) updateData.notes = notes;
    if (sort_order !== undefined) updateData.sort_order = sort_order;

    // Validate times if both provided
    if (updateData.start_time !== undefined && updateData.end_time !== undefined) {
      if ((updateData.start_time as number) >= (updateData.end_time as number)) {
        return NextResponse.json(
          { error: 'start_time must be less than end_time' },
          { status: 400 }
        );
      }
    }

    // Update section
    const { data: section, error } = await supabase
      .from('music_sections')
      .update(updateData)
      .eq('id', sectionId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) {
      console.error('Error updating section:', error);
      return NextResponse.json({ error: 'Failed to update section' }, { status: 500 });
    }

    return NextResponse.json({ section });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/sections/[sectionId] - Delete a section
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, sectionId } = await params;
    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // First, unlink any shots from this section
    await supabase
      .from('shots')
      .update({ section_id: null })
      .eq('section_id', sectionId);

    // Delete section
    const { error } = await supabase
      .from('music_sections')
      .delete()
      .eq('id', sectionId)
      .eq('project_id', projectId);

    if (error) {
      console.error('Error deleting section:', error);
      return NextResponse.json({ error: 'Failed to delete section' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
