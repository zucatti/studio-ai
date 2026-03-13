import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string; elementId: string }>;
}

// Helper to verify element belongs to project
async function verifyElementAccess(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  elementId: string,
  projectId: string
): Promise<boolean> {
  const { data: element } = await supabase
    .from('script_elements')
    .select('id, scene_id')
    .eq('id', elementId)
    .single();

  if (!element) return false;

  const { data: scene } = await supabase
    .from('scenes')
    .select('project_id')
    .eq('id', element.scene_id)
    .single();

  return scene?.project_id === projectId;
}

// GET /api/projects/[projectId]/script-elements/[elementId]
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, elementId } = await params;
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

    // Verify element belongs to project
    const hasAccess = await verifyElementAccess(supabase, elementId, projectId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Element not found' }, { status: 404 });
    }

    // Get element
    const { data: element, error } = await supabase
      .from('script_elements')
      .select('*')
      .eq('id', elementId)
      .single();

    if (error || !element) {
      return NextResponse.json({ error: 'Element not found' }, { status: 404 });
    }

    return NextResponse.json({ element });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/projects/[projectId]/script-elements/[elementId]
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, elementId } = await params;
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

    // Verify element belongs to project
    const hasAccess = await verifyElementAccess(supabase, elementId, projectId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Element not found' }, { status: 404 });
    }

    // Build update object
    const updateData: Record<string, unknown> = {};
    if (body.type !== undefined) updateData.type = body.type;
    if (body.content !== undefined) updateData.content = body.content;
    if (body.character_id !== undefined) updateData.character_id = body.character_id;
    if (body.character_name !== undefined) updateData.character_name = body.character_name;
    if (body.parenthetical !== undefined) updateData.parenthetical = body.parenthetical;
    if (body.extension !== undefined) updateData.extension = body.extension;
    if (body.sort_order !== undefined) updateData.sort_order = body.sort_order;

    const { data: element, error } = await supabase
      .from('script_elements')
      .update(updateData)
      .eq('id', elementId)
      .select()
      .single();

    if (error) {
      console.error('Error updating script element:', error);
      return NextResponse.json({ error: 'Failed to update element' }, { status: 500 });
    }

    return NextResponse.json({ element });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/script-elements/[elementId]
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, elementId } = await params;
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

    // Verify element belongs to project
    const hasAccess = await verifyElementAccess(supabase, elementId, projectId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Element not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('script_elements')
      .delete()
      .eq('id', elementId);

    if (error) {
      console.error('Error deleting script element:', error);
      return NextResponse.json({ error: 'Failed to delete element' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
