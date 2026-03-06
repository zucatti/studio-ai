import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// GET /api/projects/[projectId]/brainstorming
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

    const { data: brainstorming, error } = await supabase
      .from('brainstorming')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching brainstorming:', error);
      return NextResponse.json(
        { error: 'Failed to fetch brainstorming' },
        { status: 500 }
      );
    }

    return NextResponse.json({ brainstorming: brainstorming || { content: '' } });
  } catch (error) {
    console.error('Error fetching brainstorming:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[projectId]/brainstorming
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { content } = body;

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

    // Upsert brainstorming content
    const { data: brainstorming, error } = await supabase
      .from('brainstorming')
      .upsert(
        { project_id: projectId, content: content || '' },
        { onConflict: 'project_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('Error updating brainstorming:', error);
      return NextResponse.json(
        { error: 'Failed to update brainstorming' },
        { status: 500 }
      );
    }

    return NextResponse.json({ brainstorming });
  } catch (error) {
    console.error('Error updating brainstorming:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
