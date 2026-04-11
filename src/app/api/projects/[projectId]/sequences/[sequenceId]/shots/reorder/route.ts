import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string; sequenceId: string }>;
}

/**
 * POST /api/projects/[projectId]/sequences/[sequenceId]/shots/reorder
 * Reorder shots within a sequence
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, sequenceId } = await params;
    const body = await request.json();
    const { orderedIds } = body;

    if (!Array.isArray(orderedIds)) {
      return NextResponse.json({ error: 'orderedIds must be an array' }, { status: 400 });
    }

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

    // Verify sequence belongs to project
    const { data: sequence, error: seqError } = await supabase
      .from('sequences')
      .select('id')
      .eq('id', sequenceId)
      .eq('project_id', projectId)
      .single();

    if (seqError || !sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Update sort_order for each shot
    const updates = orderedIds.map((id: string, index: number) =>
      supabase
        .from('shots')
        .update({ sort_order: index, shot_number: index + 1 })
        .eq('id', id)
        .eq('sequence_id', sequenceId)
    );

    await Promise.all(updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error reordering shots:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
