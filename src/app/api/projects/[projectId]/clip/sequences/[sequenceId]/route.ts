import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string; sequenceId: string }>;
}

/**
 * PATCH /api/projects/[projectId]/clip/sequences/[sequenceId]
 * Update a project-level sequence
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, sequenceId } = await params;
    const body = await request.json();

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

    // Build update object - only include allowed fields
    const allowedFields = [
      'title',
      'cinematic_header',
      'transition_in',
      'transition_out',
      'transition_duration',
      'sort_order',
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Update sequence
    const { data: sequence, error: updateError } = await supabase
      .from('sequences')
      .update(updateData)
      .eq('id', sequenceId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating sequence:', updateError);
      return NextResponse.json({ error: 'Failed to update sequence' }, { status: 500 });
    }

    // If timing is being updated, also update the linked music section
    if (body.startTime !== undefined || body.endTime !== undefined) {
      const timingUpdate: Record<string, unknown> = {};
      if (body.startTime !== undefined) timingUpdate.start_time = body.startTime;
      if (body.endTime !== undefined) timingUpdate.end_time = body.endTime;
      if (body.title !== undefined) timingUpdate.name = body.title;

      await supabase
        .from('music_sections')
        .update(timingUpdate)
        .eq('sequence_id', sequenceId);
    }

    return NextResponse.json({ sequence });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/projects/[projectId]/clip/sequences/[sequenceId]
 * Delete a project-level sequence
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, sequenceId } = await params;
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

    // Unlink music sections from this sequence
    await supabase
      .from('music_sections')
      .update({ sequence_id: null })
      .eq('sequence_id', sequenceId);

    // Delete the sequence (cascade will delete shots)
    const { error: deleteError } = await supabase
      .from('sequences')
      .delete()
      .eq('id', sequenceId)
      .eq('project_id', projectId);

    if (deleteError) {
      console.error('Error deleting sequence:', deleteError);
      return NextResponse.json({ error: 'Failed to delete sequence' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
