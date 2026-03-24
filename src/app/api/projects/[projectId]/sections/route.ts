import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import type { MusicSectionType } from '@/types/database';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// Section type colors
const SECTION_COLORS: Record<MusicSectionType, string> = {
  intro: '#6366f1',      // Indigo
  verse: '#8b5cf6',      // Violet
  chorus: '#ec4899',     // Pink
  bridge: '#f59e0b',     // Amber
  outro: '#6366f1',      // Indigo
  instrumental: '#10b981', // Emerald
  custom: '#64748b',     // Slate
};

// GET /api/projects/[projectId]/sections - List all sections
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, project_type')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Fetch sections
    const { data: sections, error } = await supabase
      .from('music_sections')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching sections:', error);
      return NextResponse.json({ error: 'Failed to fetch sections' }, { status: 500 });
    }

    return NextResponse.json({ sections: sections || [] });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/sections - Create a new section
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { name, section_type, start_time, end_time, mood, notes } = body;

    // Validate required fields
    if (!name || start_time === undefined || end_time === undefined) {
      return NextResponse.json(
        { error: 'name, start_time, and end_time are required' },
        { status: 400 }
      );
    }

    if (start_time >= end_time) {
      return NextResponse.json(
        { error: 'start_time must be less than end_time' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, project_type')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get the highest sort_order
    const { data: maxOrder } = await supabase
      .from('music_sections')
      .select('sort_order')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const sortOrder = (maxOrder?.sort_order ?? -1) + 1;
    const sectionType: MusicSectionType = section_type || 'custom';

    // Create section
    const { data: section, error } = await supabase
      .from('music_sections')
      .insert({
        project_id: projectId,
        name,
        section_type: sectionType,
        start_time,
        end_time,
        color: SECTION_COLORS[sectionType],
        mood: mood || null,
        notes: notes || null,
        sort_order: sortOrder,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating section:', error);
      return NextResponse.json({ error: 'Failed to create section' }, { status: 500 });
    }

    return NextResponse.json({ section }, { status: 201 });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/sections - Delete all sections (bulk)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
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

    // Delete all sections for this project
    const { error } = await supabase
      .from('music_sections')
      .delete()
      .eq('project_id', projectId);

    if (error) {
      console.error('Error deleting sections:', error);
      return NextResponse.json({ error: 'Failed to delete sections' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
