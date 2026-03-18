import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// GET /api/projects/[projectId]/references - List references linked to project
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

    // Get linked references with full data
    const { data: links, error } = await supabase
      .from('project_reference_links')
      .select(`
        id,
        created_at,
        global_reference:global_references (
          id,
          name,
          type,
          image_url,
          description,
          tags
        )
      `)
      .eq('project_id', projectId);

    if (error) {
      console.error('Error fetching project references:', error);
      return NextResponse.json({ error: 'Failed to fetch references' }, { status: 500 });
    }

    // Flatten the response
    const references = (links || []).map(link => ({
      ...link.global_reference,
      link_id: link.id,
      linked_at: link.created_at,
    }));

    return NextResponse.json({ references });
  } catch (error) {
    console.error('Error in GET /projects/[id]/references:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/references - Link a reference to project
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { reference_id } = body;

    if (!reference_id) {
      return NextResponse.json({ error: 'reference_id is required' }, { status: 400 });
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

    // Verify reference exists and belongs to user
    const { data: reference } = await supabase
      .from('global_references')
      .select('id')
      .eq('id', reference_id)
      .eq('user_id', session.user.sub)
      .single();

    if (!reference) {
      return NextResponse.json({ error: 'Reference not found' }, { status: 404 });
    }

    // Create link
    const { data: link, error } = await supabase
      .from('project_reference_links')
      .insert({
        project_id: projectId,
        global_reference_id: reference_id,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Reference already linked to project' }, { status: 409 });
      }
      console.error('Error linking reference:', error);
      return NextResponse.json({ error: 'Failed to link reference' }, { status: 500 });
    }

    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /projects/[id]/references:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
