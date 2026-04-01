import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import type { CinematicHeaderConfig } from '@/types/cinematic';

/**
 * GET /api/cinematic-presets
 * List user's cinematic presets
 * Query params:
 *   - project_id: Filter by project (optional, omit for global presets)
 */
export async function GET(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');

    const supabase = createServerSupabaseClient();

    let query = supabase
      .from('cinematic_presets')
      .select('*')
      .eq('user_id', session.user.sub)
      .order('created_at', { ascending: false });

    if (projectId) {
      // Get both project-specific and global presets
      query = query.or(`project_id.eq.${projectId},project_id.is.null`);
    } else {
      // Only global presets
      query = query.is('project_id', null);
    }

    const { data: presets, error } = await query;

    if (error) {
      console.error('Error fetching presets:', error);
      return NextResponse.json({ error: 'Failed to fetch presets' }, { status: 500 });
    }

    return NextResponse.json({ presets: presets || [] });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/cinematic-presets
 * Create a new cinematic preset
 * Body: { name, description?, config, project_id?, is_default? }
 */
export async function POST(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, config, project_id, is_default } = body as {
      name: string;
      description?: string;
      config: CinematicHeaderConfig;
      project_id?: string;
      is_default?: boolean;
    };

    if (!name || !config) {
      return NextResponse.json({ error: 'Name and config are required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // If setting as default, unset other defaults first
    if (is_default) {
      await supabase
        .from('cinematic_presets')
        .update({ is_default: false })
        .eq('user_id', session.user.sub)
        .eq('project_id', project_id || null);
    }

    const { data: preset, error } = await supabase
      .from('cinematic_presets')
      .insert({
        user_id: session.user.sub,
        project_id: project_id || null,
        name,
        description,
        config,
        is_default: is_default || false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating preset:', error);
      return NextResponse.json({ error: 'Failed to create preset' }, { status: 500 });
    }

    return NextResponse.json({ preset });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/cinematic-presets
 * Update a preset
 * Body: { id, name?, description?, config?, is_default? }
 */
export async function PATCH(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, name, description, config, is_default } = body as {
      id: string;
      name?: string;
      description?: string;
      config?: CinematicHeaderConfig;
      is_default?: boolean;
    };

    if (!id) {
      return NextResponse.json({ error: 'Preset ID is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Verify ownership
    const { data: existing } = await supabase
      .from('cinematic_presets')
      .select('id, project_id')
      .eq('id', id)
      .eq('user_id', session.user.sub)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }

    // If setting as default, unset other defaults first
    if (is_default) {
      await supabase
        .from('cinematic_presets')
        .update({ is_default: false })
        .eq('user_id', session.user.sub)
        .eq('project_id', existing.project_id);
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (config !== undefined) updateData.config = config;
    if (is_default !== undefined) updateData.is_default = is_default;

    const { data: preset, error } = await supabase
      .from('cinematic_presets')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating preset:', error);
      return NextResponse.json({ error: 'Failed to update preset' }, { status: 500 });
    }

    return NextResponse.json({ preset });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/cinematic-presets
 * Delete a preset
 * Query params: id
 */
export async function DELETE(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Preset ID is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Verify ownership
    const { data: existing } = await supabase
      .from('cinematic_presets')
      .select('id')
      .eq('id', id)
      .eq('user_id', session.user.sub)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('cinematic_presets')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting preset:', error);
      return NextResponse.json({ error: 'Failed to delete preset' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
