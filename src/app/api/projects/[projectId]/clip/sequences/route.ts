import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/clip/sequences
 * Get all project-level sequences (for music video workflow)
 */
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
      .select('id')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get project-level sequences (where scene_id is null and project_id matches)
    const { data: sequences, error: seqError } = await supabase
      .from('sequences')
      .select('*')
      .eq('project_id', projectId)
      .is('scene_id', null)
      .order('sort_order', { ascending: true });

    if (seqError) {
      console.error('Error fetching sequences:', seqError);
      return NextResponse.json({ error: 'Failed to fetch sequences' }, { status: 500 });
    }

    // Get music sections to enrich sequences with timing
    const { data: musicSections } = await supabase
      .from('music_sections')
      .select('id, sequence_id, start_time, end_time')
      .eq('project_id', projectId);

    // Map timing from music sections to sequences
    const enrichedSequences = (sequences || []).map(seq => {
      const linkedSection = musicSections?.find(s => s.sequence_id === seq.id);
      return {
        ...seq,
        start_time: linkedSection?.start_time ?? null,
        end_time: linkedSection?.end_time ?? null,
      };
    });

    return NextResponse.json({ sequences: enrichedSequences });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/projects/[projectId]/clip/sequences
 * Create a new project-level sequence (from waveform selection)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { title, startTime, endTime } = body;

    if (typeof startTime !== 'number' || typeof endTime !== 'number') {
      return NextResponse.json({ error: 'startTime and endTime are required' }, { status: 400 });
    }

    if (endTime <= startTime) {
      return NextResponse.json({ error: 'endTime must be greater than startTime' }, { status: 400 });
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

    // Get current max sort_order for project sequences
    const { data: existingSequences } = await supabase
      .from('sequences')
      .select('sort_order')
      .eq('project_id', projectId)
      .is('scene_id', null)
      .order('sort_order', { ascending: false })
      .limit(1);

    const nextSortOrder = existingSequences && existingSequences.length > 0
      ? existingSequences[0].sort_order + 1
      : 0;

    // Generate title if not provided
    const sequenceTitle = title || `Sequence ${nextSortOrder + 1}`;

    // Create the sequence
    const { data: sequence, error: createError } = await supabase
      .from('sequences')
      .insert({
        project_id: projectId,
        scene_id: null, // Project-level sequence
        title: sequenceTitle,
        sort_order: nextSortOrder,
        transition_duration: 0.5,
      })
      .select()
      .single();

    if (createError || !sequence) {
      console.error('Error creating sequence:', createError);
      return NextResponse.json({ error: 'Failed to create sequence' }, { status: 500 });
    }

    // Optionally create a music section linked to this sequence
    // This stores the timing information
    const { error: sectionError } = await supabase
      .from('music_sections')
      .insert({
        project_id: projectId,
        name: sequenceTitle,
        section_type: 'custom',
        start_time: startTime,
        end_time: endTime,
        color: '#8b5cf6', // Purple
        sequence_id: sequence.id,
      });

    if (sectionError) {
      console.error('Error creating music section:', sectionError);
      // Don't fail - sequence was created successfully
    }

    return NextResponse.json({
      sequence: {
        ...sequence,
        start_time: startTime,
        end_time: endTime,
      },
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
