import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string; shortId: string; sequenceId: string }>;
}

// GET /api/projects/[projectId]/shorts/[shortId]/sequences/[sequenceId] - Get a single sequence
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shortId, sequenceId } = await params;
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

    // Get the sequence
    const { data: sequence, error } = await supabase
      .from('sequences')
      .select('*')
      .eq('id', sequenceId)
      .eq('scene_id', shortId)
      .single();

    if (error || !sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Get plans (shots) assigned to this sequence
    const { data: plans } = await supabase
      .from('shots')
      .select('id, shot_number, description, duration, sort_order')
      .eq('sequence_id', sequenceId)
      .order('sort_order', { ascending: true });

    return NextResponse.json({
      sequence: {
        ...sequence,
        plans: plans || [],
      },
    });
  } catch (error) {
    console.error('Error fetching sequence:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/projects/[projectId]/shorts/[shortId]/sequences/[sequenceId] - Update a sequence
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shortId, sequenceId } = await params;
    const body = await request.json();
    const { title, cinematic_header, transition_in, transition_out, transition_duration } = body;

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

    // Verify sequence exists and belongs to the short
    const { data: existing } = await supabase
      .from('sequences')
      .select('id')
      .eq('id', sequenceId)
      .eq('scene_id', shortId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Build update object
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (cinematic_header !== undefined) updates.cinematic_header = cinematic_header;
    if (transition_in !== undefined) updates.transition_in = transition_in;
    if (transition_out !== undefined) updates.transition_out = transition_out;
    if (transition_duration !== undefined) updates.transition_duration = transition_duration;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const { data: sequence, error } = await supabase
      .from('sequences')
      .update(updates)
      .eq('id', sequenceId)
      .select()
      .single();

    if (error) {
      console.error('Error updating sequence:', error);
      return NextResponse.json({ error: 'Failed to update sequence' }, { status: 500 });
    }

    return NextResponse.json({ sequence });
  } catch (error) {
    console.error('Error updating sequence:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/shorts/[shortId]/sequences/[sequenceId] - Delete a sequence
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shortId, sequenceId } = await params;
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

    // Verify sequence exists and belongs to the short
    const { data: existing } = await supabase
      .from('sequences')
      .select('id')
      .eq('id', sequenceId)
      .eq('scene_id', shortId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Unassign all plans from this sequence (set sequence_id to null)
    await supabase
      .from('shots')
      .update({ sequence_id: null })
      .eq('sequence_id', sequenceId);

    // Delete the sequence
    const { error } = await supabase
      .from('sequences')
      .delete()
      .eq('id', sequenceId);

    if (error) {
      console.error('Error deleting sequence:', error);
      return NextResponse.json({ error: 'Failed to delete sequence' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting sequence:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
