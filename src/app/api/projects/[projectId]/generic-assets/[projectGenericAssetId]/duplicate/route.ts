import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { GENERIC_CHARACTERS } from '@/lib/generic-characters';
import type { GenericAssetLocalOverrides } from '../../route';

interface RouteParams {
  params: Promise<{ projectId: string; projectGenericAssetId: string }>;
}

// POST /api/projects/[projectId]/generic-assets/[projectGenericAssetId]/duplicate
// Duplicate a generic character with a new name (cinema best practice: "FEMME AGEE", "POLICIER #1")
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, projectGenericAssetId } = await params;
    const body = await request.json();
    const { newName } = body;

    if (!newName || typeof newName !== 'string' || newName.trim().length === 0) {
      return NextResponse.json({ error: 'newName is required' }, { status: 400 });
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

    // Get the source asset to duplicate
    const { data: sourceAsset, error: fetchError } = await supabase
      .from('project_generic_assets')
      .select('*')
      .eq('id', projectGenericAssetId)
      .eq('project_id', projectId)
      .single();

    if (fetchError || !sourceAsset) {
      return NextResponse.json({ error: 'Source asset not found' }, { status: 404 });
    }

    // Create duplicate with new name using RPC
    const { data: rpcData, error: rpcError } = await supabase.rpc('insert_project_generic_asset', {
      p_project_id: projectId,
      p_generic_asset_id: sourceAsset.generic_asset_id,
      p_name_override: newName.trim(),
      p_local_overrides: sourceAsset.local_overrides || {},
    });

    if (rpcError) {
      console.error('[GenericAssets API] Duplicate RPC error:', {
        code: rpcError.code,
        message: rpcError.message,
      });

      if (rpcError.code === '23505' || rpcError.message?.includes('duplicate key')) {
        return NextResponse.json({ error: 'A character with this name already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to duplicate asset', details: rpcError.message }, { status: 500 });
    }

    // RPC returns an array with one row
    const newAsset = Array.isArray(rpcData) ? rpcData[0] : rpcData;

    const generic = GENERIC_CHARACTERS.find((g) => g.id === newAsset.generic_asset_id);
    if (!generic) {
      return NextResponse.json({ error: 'Generic character not found' }, { status: 404 });
    }

    const localOverrides = (newAsset.local_overrides || {}) as GenericAssetLocalOverrides;
    const referenceImages = localOverrides.reference_images_metadata || [];

    return NextResponse.json({
      asset: {
        id: generic.id,
        project_generic_asset_id: newAsset.id,
        name: newAsset.name_override || generic.name,
        originalName: generic.name,
        nameFr: generic.nameFr,
        description: localOverrides.description || generic.description,
        originalDescription: generic.description,
        icon: generic.icon,
        created_at: newAsset.created_at,
        name_override: newAsset.name_override,
        local_overrides: localOverrides,
        hasReferenceImages: referenceImages.length > 0,
        reference_images: referenceImages.map((img) => img.url),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
