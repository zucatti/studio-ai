import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// GET /api/projects/[projectId]/assets - List all assets for a project
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      console.log('[Assets API] Unauthorized - no session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    console.log('[Assets API] Fetching assets for project:', projectId, 'user:', session.user.sub);
    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      console.log('[Assets API] Project not found');
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get project assets with their global asset data
    const { data: projectAssets, error } = await supabase
      .from('project_assets')
      .select('*, global_assets(*)')
      .eq('project_id', projectId);

    if (error) {
      console.error('[Assets API] Error fetching project assets:', error);
      return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
    }

    console.log('[Assets API] Raw project assets:', projectAssets?.length || 0, JSON.stringify(projectAssets, null, 2));

    // Flatten the data for easier consumption
    const assets = (projectAssets || []).map((pa: any) => {
      const localOverrides = pa.local_overrides || {};
      // Ensure reference_images is always a proper array
      const refImages = pa.global_assets?.reference_images;
      const safeRefImages = Array.isArray(refImages) ? refImages : [];
      return {
        id: pa.global_assets?.id || pa.global_asset_id,
        project_asset_id: pa.id,
        name: pa.global_assets?.name || '',
        asset_type: pa.global_assets?.asset_type || '',
        data: { ...(pa.global_assets?.data || {}), ...localOverrides },
        reference_images: safeRefImages,
        tags: Array.isArray(pa.global_assets?.tags) ? pa.global_assets.tags : [],
        created_at: pa.created_at,
        // Extract selected_look_ids for easy access
        selected_look_ids: localOverrides.selected_look_ids || [],
      };
    });

    console.log('[Assets API] Returning flattened assets:', assets.length);

    return NextResponse.json({ assets });
  } catch (error) {
    console.error('[Assets API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/assets - Add an asset to a project
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { globalAssetId, localOverrides } = body;

    if (!globalAssetId) {
      return NextResponse.json({ error: 'globalAssetId is required' }, { status: 400 });
    }

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

    // Verify global asset belongs to user
    const { data: globalAsset } = await supabase
      .from('global_assets')
      .select('id')
      .eq('id', globalAssetId)
      .eq('user_id', session.user.sub)
      .single();

    if (!globalAsset) {
      return NextResponse.json({ error: 'Global asset not found' }, { status: 404 });
    }

    // Create project asset link
    const { data: projectAsset, error } = await supabase
      .from('project_assets')
      .insert({
        project_id: projectId,
        global_asset_id: globalAssetId,
        local_overrides: localOverrides || null,
      })
      .select('*, global_assets(*)')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Asset already in project' }, { status: 409 });
      }
      console.error('Error adding asset to project:', error);
      return NextResponse.json({ error: 'Failed to add asset' }, { status: 500 });
    }

    return NextResponse.json({ projectAsset }, { status: 201 });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/assets?id=xxx - Remove an asset from a project
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const url = new URL(request.url);
    const projectAssetId = url.searchParams.get('id');

    if (!projectAssetId) {
      return NextResponse.json({ error: 'Project asset ID is required' }, { status: 400 });
    }

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

    // Verify the project asset belongs to this project
    const { data: projectAsset } = await supabase
      .from('project_assets')
      .select('id')
      .eq('id', projectAssetId)
      .eq('project_id', projectId)
      .single();

    if (!projectAsset) {
      return NextResponse.json({ error: 'Project asset not found' }, { status: 404 });
    }

    // Delete the project asset link
    const { error } = await supabase
      .from('project_assets')
      .delete()
      .eq('id', projectAssetId);

    if (error) {
      console.error('Error removing asset from project:', error);
      return NextResponse.json({ error: 'Failed to remove asset' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
