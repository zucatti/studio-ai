import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string; shortId: string }>;
}

// GET /api/projects/[projectId]/shorts/[shortId]/sequences - Get all sequences for a short
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shortId } = await params;
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

    // Verify short exists in project
    const { data: scene } = await supabase
      .from('scenes')
      .select('id')
      .eq('id', shortId)
      .eq('project_id', projectId)
      .single();

    if (!scene) {
      return NextResponse.json({ error: 'Short not found' }, { status: 404 });
    }

    // Get all sequences for this short
    const { data: sequences, error } = await supabase
      .from('sequences')
      .select('*')
      .eq('scene_id', shortId)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching sequences:', error);
      return NextResponse.json({ error: 'Failed to fetch sequences' }, { status: 500 });
    }

    return NextResponse.json({ sequences: sequences || [] });
  } catch (error) {
    console.error('Error fetching sequences:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/shorts/[shortId]/sequences - Create a new sequence
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shortId } = await params;
    const body = await request.json();
    const { title, transition_in, transition_out, transition_duration } = body;

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

    // Verify short exists in project
    const { data: scene } = await supabase
      .from('scenes')
      .select('id')
      .eq('id', shortId)
      .eq('project_id', projectId)
      .single();

    if (!scene) {
      return NextResponse.json({ error: 'Short not found' }, { status: 404 });
    }

    // Get max sort_order for sequences in this short
    const { data: maxData } = await supabase
      .from('sequences')
      .select('sort_order')
      .eq('scene_id', shortId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxData?.sort_order ?? -1) + 1;

    // Create the sequence
    const { data: sequence, error } = await supabase
      .from('sequences')
      .insert({
        scene_id: shortId,
        title: title || null,
        sort_order: nextOrder,
        transition_in: transition_in || null,
        transition_out: transition_out || null,
        transition_duration: transition_duration ?? 0.5,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating sequence:', error);
      return NextResponse.json({ error: 'Failed to create sequence' }, { status: 500 });
    }

    return NextResponse.json({ sequence }, { status: 201 });
  } catch (error) {
    console.error('Error creating sequence:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
