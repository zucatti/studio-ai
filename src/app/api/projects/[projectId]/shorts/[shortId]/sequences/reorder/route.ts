import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string; shortId: string }>;
}

// POST /api/projects/[projectId]/shorts/[shortId]/sequences/reorder - Reorder sequences
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shortId } = await params;
    const body = await request.json();
    const { orderedIds } = body;

    if (!Array.isArray(orderedIds)) {
      return NextResponse.json({ error: 'orderedIds must be an array' }, { status: 400 });
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

    // Verify short exists
    const { data: scene } = await supabase
      .from('scenes')
      .select('id')
      .eq('id', shortId)
      .eq('project_id', projectId)
      .single();

    if (!scene) {
      return NextResponse.json({ error: 'Short not found' }, { status: 404 });
    }

    // Update sort_order for each sequence
    const updates = orderedIds.map((id: string, index: number) => ({
      id,
      sort_order: index,
    }));

    for (const update of updates) {
      const { error } = await supabase
        .from('sequences')
        .update({ sort_order: update.sort_order })
        .eq('id', update.id)
        .eq('scene_id', shortId);

      if (error) {
        console.error('Error updating sequence order:', error);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error reordering sequences:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
