import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// POST /api/projects/[projectId]/import-asset - Import a global asset to the project
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
      return NextResponse.json(
        { error: 'globalAssetId is required' },
        { status: 400 }
      );
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

    // Verify global asset ownership
    const { data: globalAsset } = await supabase
      .from('global_assets')
      .select('id')
      .eq('id', globalAssetId)
      .eq('user_id', session.user.sub)
      .single();

    if (!globalAsset) {
      return NextResponse.json({ error: 'Global asset not found' }, { status: 404 });
    }

    // Check if already imported
    const { data: existing } = await supabase
      .from('project_assets')
      .select('id')
      .eq('project_id', projectId)
      .eq('global_asset_id', globalAssetId)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Asset already imported to this project' },
        { status: 409 }
      );
    }

    // Create project asset link
    const { data: projectAsset, error } = await supabase
      .from('project_assets')
      .insert({
        project_id: projectId,
        global_asset_id: globalAssetId,
        local_overrides: localOverrides || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error importing asset:', error);
      return NextResponse.json({ error: 'Failed to import asset' }, { status: 500 });
    }

    return NextResponse.json({ projectAsset }, { status: 201 });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
