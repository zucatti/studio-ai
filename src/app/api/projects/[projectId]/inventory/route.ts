import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// GET - Fetch current inventory
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
      .select('id, visual_style, auto_extract_inventory, inventory_extracted_at')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Fetch characters, props, locations
    const [charactersRes, propsRes, locationsRes] = await Promise.all([
      supabase.from('characters').select('*').eq('project_id', projectId).order('name'),
      supabase.from('props').select('*').eq('project_id', projectId).order('name'),
      supabase.from('locations').select('*').eq('project_id', projectId).order('name'),
    ]);

    return NextResponse.json({
      project: {
        visual_style: project.visual_style,
        auto_extract_inventory: project.auto_extract_inventory,
        inventory_extracted_at: project.inventory_extracted_at,
      },
      characters: charactersRes.data || [],
      props: propsRes.data || [],
      locations: locationsRes.data || [],
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Save inventory (from extraction)
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { characters, props, locations, clearExisting = true } = body;

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

    // Clear existing inventory if requested
    if (clearExisting) {
      await Promise.all([
        supabase.from('characters').delete().eq('project_id', projectId),
        supabase.from('props').delete().eq('project_id', projectId),
        supabase.from('locations').delete().eq('project_id', projectId),
      ]);
    }

    // Insert characters
    if (characters && characters.length > 0) {
      const { error: charError } = await supabase
        .from('characters')
        .insert(characters.map((c: any) => ({
          project_id: projectId,
          name: c.name,
          description: c.description || '',
          visual_description: c.visual_description || '',
          age: c.age || null,
          gender: c.gender || null,
        })));
      if (charError) console.error('Error inserting characters:', charError);
    }

    // Insert props
    if (props && props.length > 0) {
      const { error: propError } = await supabase
        .from('props')
        .insert(props.map((p: any) => ({
          project_id: projectId,
          name: p.name,
          type: p.type || 'object',
          visual_description: p.visual_description || '',
        })));
      if (propError) console.error('Error inserting props:', propError);
    }

    // Insert locations
    if (locations && locations.length > 0) {
      const { error: locError } = await supabase
        .from('locations')
        .insert(locations.map((l: any) => ({
          project_id: projectId,
          name: l.name,
          type: l.type || 'interior',
          visual_description: l.visual_description || '',
          lighting: l.lighting || null,
          mood: l.mood || null,
        })));
      if (locError) console.error('Error inserting locations:', locError);
    }

    // Update project
    await supabase
      .from('projects')
      .update({
        inventory_extracted_at: new Date().toISOString(),
        current_step: 'library',
      })
      .eq('id', projectId);

    return NextResponse.json({
      success: true,
      message: 'Inventaire sauvegardé',
      counts: {
        characters: characters?.length || 0,
        props: props?.length || 0,
        locations: locations?.length || 0,
      },
    });
  } catch (error) {
    console.error('Error saving inventory:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Update project settings (visual style, auto extract)
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { visual_style, auto_extract_inventory } = body;

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

    const updates: any = {};
    if (visual_style !== undefined) updates.visual_style = visual_style;
    if (auto_extract_inventory !== undefined) updates.auto_extract_inventory = auto_extract_inventory;

    const { error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', projectId);

    if (error) {
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
