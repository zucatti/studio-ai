import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string; sectionId: string }>;
}

/**
 * GET /api/projects/[projectId]/sections/[sectionId]/sequence
 * Get the sequence linked to this music section, with its shots
 */
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

    // Get section with sequence_id
    const { data: section, error: sectionError } = await supabase
      .from('music_sections')
      .select('id, sequence_id, start_time, end_time, name')
      .eq('id', sectionId)
      .eq('project_id', projectId)
      .single();

    if (sectionError || !section) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }

    if (!section.sequence_id) {
      return NextResponse.json({ sequence: null, shots: [] });
    }

    // Get sequence
    const { data: sequence, error: sequenceError } = await supabase
      .from('sequences')
      .select('*')
      .eq('id', section.sequence_id)
      .single();

    if (sequenceError || !sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Get shots in this sequence
    const { data: shots, error: shotsError } = await supabase
      .from('shots')
      .select('*')
      .eq('sequence_id', section.sequence_id)
      .order('sort_order', { ascending: true });

    if (shotsError) {
      console.error('Error fetching shots:', shotsError);
    }

    return NextResponse.json({
      sequence,
      shots: shots || [],
      sectionDuration: section.end_time - section.start_time,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/projects/[projectId]/sections/[sectionId]/sequence
 * Create a new sequence for this music section, or link to an existing one
 *
 * Body: { title?: string, existingSequenceId?: string }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, sectionId } = await params;
    const body = await request.json();
    const { title, existingSequenceId } = body;

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

    // Get section
    const { data: section, error: sectionError } = await supabase
      .from('music_sections')
      .select('id, sequence_id, name, start_time, end_time')
      .eq('id', sectionId)
      .eq('project_id', projectId)
      .single();

    if (sectionError || !section) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }

    let sequenceId: string;

    if (existingSequenceId) {
      // Link to existing sequence
      // Verify the sequence exists and belongs to this project
      const { data: existingSeq, error: seqError } = await supabase
        .from('sequences')
        .select('id')
        .eq('id', existingSequenceId)
        .eq('project_id', projectId)
        .single();

      if (seqError || !existingSeq) {
        return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
      }

      sequenceId = existingSequenceId;
    } else {
      // Create new sequence
      const sequenceTitle = title || section.name || 'Séquence';

      const { data: newSequence, error: createError } = await supabase
        .from('sequences')
        .insert({
          project_id: projectId,
          title: sequenceTitle,
          sort_order: 0,
          transition_duration: 0.5,
        })
        .select()
        .single();

      if (createError || !newSequence) {
        console.error('Error creating sequence:', createError);
        return NextResponse.json({ error: 'Failed to create sequence' }, { status: 500 });
      }

      sequenceId = newSequence.id;
    }

    // Link sequence to section
    const { data: updatedSection, error: updateError } = await supabase
      .from('music_sections')
      .update({ sequence_id: sequenceId })
      .eq('id', sectionId)
      .select()
      .single();

    if (updateError) {
      console.error('Error linking sequence:', updateError);
      return NextResponse.json({ error: 'Failed to link sequence' }, { status: 500 });
    }

    // Get the full sequence
    const { data: sequence } = await supabase
      .from('sequences')
      .select('*')
      .eq('id', sequenceId)
      .single();

    return NextResponse.json({
      section: updatedSection,
      sequence,
      sectionDuration: section.end_time - section.start_time,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/projects/[projectId]/sections/[sectionId]/sequence
 * Unlink the sequence from this section (doesn't delete the sequence)
 */
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

    // Unlink sequence from section
    const { data: section, error: updateError } = await supabase
      .from('music_sections')
      .update({ sequence_id: null })
      .eq('id', sectionId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (updateError) {
      console.error('Error unlinking sequence:', updateError);
      return NextResponse.json({ error: 'Failed to unlink sequence' }, { status: 500 });
    }

    return NextResponse.json({ section });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
