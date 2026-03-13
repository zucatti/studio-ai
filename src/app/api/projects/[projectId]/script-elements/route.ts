import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// GET /api/projects/[projectId]/script-elements - List all script elements for project
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
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

    // Get all scenes for this project
    const { data: scenes } = await supabase
      .from('scenes')
      .select('id')
      .eq('project_id', projectId);

    if (!scenes || scenes.length === 0) {
      return NextResponse.json({ elements: [] });
    }

    const sceneIds = scenes.map((s) => s.id);

    // Get all script elements for these scenes
    const { data: elements, error } = await supabase
      .from('script_elements')
      .select('*')
      .in('scene_id', sceneIds)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching script elements:', error);
      return NextResponse.json({ error: 'Failed to fetch elements' }, { status: 500 });
    }

    return NextResponse.json({ elements });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/script-elements - Create a new script element
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
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

    // Verify scene belongs to project
    const { data: scene } = await supabase
      .from('scenes')
      .select('id')
      .eq('id', body.scene_id)
      .eq('project_id', projectId)
      .single();

    if (!scene) {
      return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
    }

    // Create the element
    const { data: element, error } = await supabase
      .from('script_elements')
      .insert({
        scene_id: body.scene_id,
        type: body.type,
        content: body.content || '',
        character_id: body.character_id || null,
        character_name: body.character_name || null,
        parenthetical: body.parenthetical || null,
        extension: body.extension || null,
        sort_order: body.sort_order || 0,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating script element:', error);
      return NextResponse.json({ error: 'Failed to create element' }, { status: 500 });
    }

    return NextResponse.json({ element }, { status: 201 });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
