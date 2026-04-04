import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { GENERIC_CHARACTERS } from '@/lib/generic-characters';
import type { GenericAssetLocalOverrides } from '../route';

interface RouteParams {
  params: Promise<{ projectId: string; projectGenericAssetId: string }>;
}

// GET /api/projects/[projectId]/generic-assets/[projectGenericAssetId] - Get a single imported generic character
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, projectGenericAssetId } = await params;
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

    // Get the generic asset
    const { data: projectAsset, error } = await supabase
      .from('project_generic_assets')
      .select('*')
      .eq('id', projectGenericAssetId)
      .eq('project_id', projectId)
      .single();

    if (error || !projectAsset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const generic = GENERIC_CHARACTERS.find((g) => g.id === projectAsset.generic_asset_id);
    if (!generic) {
      return NextResponse.json({ error: 'Generic character not found' }, { status: 404 });
    }

    const localOverrides = (projectAsset.local_overrides || {}) as GenericAssetLocalOverrides;
    const referenceImages = localOverrides.reference_images_metadata || [];

    return NextResponse.json({
      asset: {
        id: generic.id,
        project_generic_asset_id: projectAsset.id,
        name: projectAsset.name_override || generic.name,
        originalName: generic.name,
        nameFr: generic.nameFr,
        description: localOverrides.description || generic.description,
        originalDescription: generic.description,
        icon: generic.icon,
        created_at: projectAsset.created_at,
        name_override: projectAsset.name_override,
        local_overrides: localOverrides,
        hasReferenceImages: referenceImages.length > 0,
        reference_images: referenceImages.map((img) => img.url),
      },
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/projects/[projectId]/generic-assets/[projectGenericAssetId] - Update a generic character's overrides
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, projectGenericAssetId } = await params;
    const body = await request.json();
    const { nameOverride, localOverrides } = body;

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

    // Get current asset
    const { data: currentAsset, error: fetchError } = await supabase
      .from('project_generic_assets')
      .select('*')
      .eq('id', projectGenericAssetId)
      .eq('project_id', projectId)
      .single();

    if (fetchError || !currentAsset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    // Build update object
    const updates: Record<string, unknown> = {};

    if (nameOverride !== undefined) {
      updates.name_override = nameOverride || null;
    }

    if (localOverrides !== undefined) {
      // Merge with existing local_overrides
      const existingOverrides = currentAsset.local_overrides || {};
      updates.local_overrides = { ...existingOverrides, ...localOverrides };
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    // Update the asset
    const { data: updatedAsset, error: updateError } = await supabase
      .from('project_generic_assets')
      .update(updates)
      .eq('id', projectGenericAssetId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating generic asset:', updateError);
      if (updateError.code === '23505') {
        return NextResponse.json({ error: 'A character with this name already exists in the project' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to update asset' }, { status: 500 });
    }

    const generic = GENERIC_CHARACTERS.find((g) => g.id === updatedAsset.generic_asset_id);
    if (!generic) {
      return NextResponse.json({ error: 'Generic character not found' }, { status: 404 });
    }

    const finalOverrides = (updatedAsset.local_overrides || {}) as GenericAssetLocalOverrides;
    const referenceImages = finalOverrides.reference_images_metadata || [];

    return NextResponse.json({
      asset: {
        id: generic.id,
        project_generic_asset_id: updatedAsset.id,
        name: updatedAsset.name_override || generic.name,
        originalName: generic.name,
        nameFr: generic.nameFr,
        description: finalOverrides.description || generic.description,
        originalDescription: generic.description,
        icon: generic.icon,
        created_at: updatedAsset.created_at,
        name_override: updatedAsset.name_override,
        local_overrides: finalOverrides,
        hasReferenceImages: referenceImages.length > 0,
        reference_images: referenceImages.map((img) => img.url),
      },
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/generic-assets/[projectGenericAssetId] - Remove a generic character from project
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, projectGenericAssetId } = await params;
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
