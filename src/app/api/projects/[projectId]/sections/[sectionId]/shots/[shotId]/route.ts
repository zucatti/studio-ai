import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string; sectionId: string; shotId: string }>;
}

// PATCH /api/projects/[projectId]/sections/[sectionId]/shots/[shotId] - Update a shot
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, sectionId, shotId } = await params;
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

    // Verify section exists
    const { data: section, error: sectionError } = await supabase
      .from('music_sections')
      .select('id')
      .eq('id', sectionId)
      .eq('project_id', projectId)
      .single();

    if (sectionError || !section) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }

    // Build update object - all allowed fields
    const allowedFields = [
      'relative_start',
      'duration', // Important: keep in sync with relative_start
      'description',
      'animation_prompt',
      'storyboard_image_url',
      'first_frame_url',
      'last_frame_url',
      'generated_video_url',
      'shot_type',
      'camera_angle',
      'camera_movement',
      'transition_type',
      'transition_duration',
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Handle sort_order for relative_start changes
    if (typeof body.relative_start === 'number') {
      updateData.sort_order = Math.round(body.relative_start * 1000);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Update the shot
    const { data: shot, error: updateError } = await supabase
      .from('shots')
      .update(updateData)
      .eq('id', shotId)
      .eq('section_id', sectionId)
      .select('id, description, relative_start, sort_order, animation_prompt, storyboard_image_url, first_frame_url, last_frame_url, generated_video_url, shot_type, camera_angle, camera_movement, storyboard_prompt, first_frame_prompt, last_frame_prompt, transition_type, transition_duration')
      .single();

    if (updateError) {
      console.error('Error updating shot:', updateError);
      return NextResponse.json({ error: 'Failed to update shot' }, { status: 500 });
    }

    if (!shot) {
      return NextResponse.json({ error: 'Shot not found' }, { status: 404 });
    }

    return NextResponse.json({ shot });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/sections/[sectionId]/shots/[shotId] - Delete a shot
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, sectionId, shotId } = await params;
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

    // Verify section exists
    const { data: section, error: sectionError } = await supabase
      .from('music_sections')
      .select('id')
      .eq('id', sectionId)
      .eq('project_id', projectId)
      .single();

    if (sectionError || !section) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }

    // Delete the shot
    const { error: deleteError } = await supabase
      .from('shots')
      .delete()
      .eq('id', shotId)
      .eq('section_id', sectionId);

    if (deleteError) {
      console.error('Error deleting shot:', deleteError);
      return NextResponse.json({ error: 'Failed to delete shot' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
