import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { GENERIC_CHARACTERS, isGenericCharacter } from '@/lib/generic-characters';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// Local overrides structure for generic characters
export interface GenericAssetLocalOverrides {
  description?: string;
  visual_description?: string;
  age?: string;
  gender?: string;
  reference_images_metadata?: Array<{
    url: string;
    type: string;
    label: string;
  }>;
  looks?: Array<{
    id: string;
    name: string;
    description: string;
    imageUrl: string;
  }>;
  voice_id?: string;
  voice_name?: string;
}

// GET /api/projects/[projectId]/generic-assets - List imported generic characters for a project
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

    // Get imported generic characters
    const { data: importedAssets, error } = await supabase
      .from('project_generic_assets')
      .select('*')
      .eq('project_id', projectId);

    if (error) {
      // Table might not exist yet, return empty array
      if (error.code === '42P01') {
        return NextResponse.json({ assets: [] });
      }
      console.error('Error fetching generic assets:', error);
      return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
    }

    // Map to full generic character data with local overrides
    const assets = (importedAssets || [])
      .map((pa) => {
        const generic = GENERIC_CHARACTERS.find((g) => g.id === pa.generic_asset_id);
        if (!generic) return null;

        const localOverrides = (pa.local_overrides || {}) as GenericAssetLocalOverrides;
        const referenceImages = localOverrides.reference_images_metadata || [];

        return {
          id: generic.id,
          project_generic_asset_id: pa.id,
          // Use name_override if set, otherwise original name
          name: pa.name_override || generic.name,
          originalName: generic.name,
          nameFr: generic.nameFr,
          // Merge description: use local override if set
          description: localOverrides.description || generic.description,
          originalDescription: generic.description,
          icon: generic.icon,
          created_at: pa.created_at,
          // New fields for customization
          name_override: pa.name_override,
          local_overrides: localOverrides,
          // Computed: has reference images (for Starring vs People distinction)
          hasReferenceImages: referenceImages.length > 0,
          reference_images: referenceImages.map((img) => img.url),
        };
      })
      .filter(Boolean);

    return NextResponse.json({ assets });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/generic-assets - Import a generic character to the project
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { genericAssetId, nameOverride, localOverrides } = body;

    if (!genericAssetId || !isGenericCharacter(genericAssetId)) {
      return NextResponse.json({ error: 'Invalid generic asset ID' }, { status: 400 });
    }

    // Verify the generic character exists
    const genericCharacter = GENERIC_CHARACTERS.find((g) => g.id === genericAssetId);
    if (!genericCharacter) {
      return NextResponse.json({ error: 'Generic character not found' }, { status: 404 });
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

    // Insert the generic character import using RPC (bypasses PostgREST schema cache)
    console.log('[GenericAssets API] Inserting via RPC:', {
      project_id: projectId,
      generic_asset_id: genericAssetId,
      name_override: nameOverride,
    });

    const { data: rpcData, error: rpcError } = await supabase.rpc('insert_project_generic_asset', {
      p_project_id: projectId,
      p_generic_asset_id: genericAssetId,
      p_name_override: nameOverride || null,
      p_local_overrides: localOverrides || {},
    });

    if (rpcError) {
      console.error('[GenericAssets API] RPC error:', {
        code: rpcError.code,
        message: rpcError.message,
        details: rpcError.details,
        hint: rpcError.hint,
      });

      if (rpcError.code === '23505' || rpcError.message?.includes('duplicate key')) {
        return NextResponse.json({ error: 'Asset already in project' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to import asset', details: rpcError.message }, { status: 500 });
    }

    // RPC returns an array with one row
    const projectAsset = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    console.log('[GenericAssets API] Insert success:', projectAsset);

    const overrides = (projectAsset.local_overrides || {}) as GenericAssetLocalOverrides;
    const referenceImages = overrides.reference_images_metadata || [];

    return NextResponse.json({
      projectAsset: {
        id: genericCharacter.id,
        project_generic_asset_id: projectAsset.id,
        name: projectAsset.name_override || genericCharacter.name,
        originalName: genericCharacter.name,
        nameFr: genericCharacter.nameFr,
        description: overrides.description || genericCharacter.description,
        originalDescription: genericCharacter.description,
        icon: genericCharacter.icon,
        created_at: projectAsset.created_at,
        name_override: projectAsset.name_override,
        local_overrides: overrides,
        hasReferenceImages: referenceImages.length > 0,
        reference_images: referenceImages.map((img) => img.url),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/generic-assets - Remove a generic character from the project
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const { searchParams } = new URL(request.url);
    const projectGenericAssetId = searchParams.get('id');

    if (!projectGenericAssetId) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
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

    // Delete the generic asset import
    const { error } = await supabase
      .from('project_generic_assets')
      .delete()
      .eq('id', projectGenericAssetId)
      .eq('project_id', projectId);

    if (error) {
      console.error('Error removing generic asset:', error);
      return NextResponse.json({ error: 'Failed to remove asset' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
