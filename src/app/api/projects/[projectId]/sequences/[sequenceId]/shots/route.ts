import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string; sequenceId: string }>;
}

/**
 * GET /api/projects/[projectId]/sequences/[sequenceId]/shots
 * Get all shots in a sequence
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
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

    // Get shots
    const { data: shots, error: shotsError } = await supabase
      .from('shots')
      .select('*')
      .eq('sequence_id', sequenceId)
      .order('sort_order', { ascending: true });

    if (shotsError) {
      console.error('Error fetching shots:', shotsError);
      return NextResponse.json({ error: 'Failed to fetch shots' }, { status: 500 });
    }

    return NextResponse.json({ shots: shots || [] });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/projects/[projectId]/sequences/[sequenceId]/shots
 * Create a new shot in a sequence
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, sequenceId } = await params;
    const body = await request.json();
    const { description = '', duration = 5 } = body;

    console.log('[shots/route] POST called:', { projectId, sequenceId, description, duration });

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

    // Verify sequence belongs to project (either directly or via scene)
    const { data: sequence, error: seqError } = await supabase
      .from('sequences')
      .select('id, project_id, scene_id')
      .eq('id', sequenceId)
      .single();

    console.log('[shots/route] POST sequence lookup:', { sequence, seqError, expectedProjectId: projectId });

    if (seqError || !sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Check if sequence belongs to this project
    // Project-level sequences have project_id set directly
    // Scene-level sequences need to check via scene
    if (sequence.project_id !== projectId) {
      // If not a project-level sequence, it might be a scene-level sequence
      // For now, just check that project_id matches (clip workflow)
      console.log('[shots/route] sequence project_id mismatch:', sequence.project_id, '!==', projectId);
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Get current max sort_order
    const { data: existingShots } = await supabase
      .from('shots')
      .select('sort_order')
      .eq('sequence_id', sequenceId)
      .order('sort_order', { ascending: false })
      .limit(1);

    const nextSortOrder = existingShots && existingShots.length > 0
      ? existingShots[0].sort_order + 1
      : 0;

    // Create shot
    const { data: shot, error: createError } = await supabase
      .from('shots')
      .insert({
        project_id: projectId,
        sequence_id: sequenceId,
        description,
        duration,
        sort_order: nextSortOrder,
        shot_number: nextSortOrder + 1,  // shot_number is NOT NULL
        status: 'draft',
        // Initialize with empty segments array
        segments: [],
      })
      .select()
      .single();

    if (createError || !shot) {
      console.error('Error creating shot:', createError);
      return NextResponse.json({ error: 'Failed to create shot', details: createError?.message }, { status: 500 });
    }

    console.log('[shots/route] POST shot created successfully:', shot.id);
    return NextResponse.json({ shot });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
