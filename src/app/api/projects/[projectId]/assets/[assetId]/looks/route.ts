/**
 * API Route for managing selected looks for a project asset
 *
 * POST - Add a look to the project
 * DELETE - Remove a look from the project
 * GET - Get selected looks for an asset
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string; assetId: string }>;
}

// GET - Get selected looks for an asset
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, assetId } = await params;
    const supabase = createServerSupabaseClient();

    // Get the project asset
    const { data: projectAsset, error } = await supabase
      .from('project_assets')
      .select('local_overrides')
      .eq('project_id', projectId)
      .eq('global_asset_id', assetId)
      .single();

    if (error || !projectAsset) {
      return NextResponse.json({ selectedLookIds: [] });
    }

    const localOverrides = projectAsset.local_overrides as Record<string, unknown> | null;
    const selectedLookIds = (localOverrides?.selected_look_ids as string[]) || [];

    return NextResponse.json({ selectedLookIds });
  } catch (error) {
    console.error('Error getting selected looks:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Add a look to the project
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, assetId } = await params;
    const { lookId } = await request.json();

    if (!lookId) {
      return NextResponse.json({ error: 'lookId is required' }, { status: 400 });
    }

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

    // Check if asset is already in project
    const { data: existingAsset } = await supabase
      .from('project_assets')
      .select('id, local_overrides')
      .eq('project_id', projectId)
      .eq('global_asset_id', assetId)
      .single();

    if (existingAsset) {
      // Update existing project_asset
      const currentOverrides = (existingAsset.local_overrides as Record<string, unknown>) || {};
      const currentLooks = (currentOverrides.selected_look_ids as string[]) || [];

      if (!currentLooks.includes(lookId)) {
        const newOverrides = {
          ...currentOverrides,
          selected_look_ids: [...currentLooks, lookId],
        };

        const { error: updateError } = await supabase
          .from('project_assets')
          .update({ local_overrides: newOverrides })
          .eq('id', existingAsset.id);

        if (updateError) {
          console.error('Error updating project asset:', updateError);
          return NextResponse.json({ error: 'Failed to add look' }, { status: 500 });
        }
      }
    } else {
      // Create new project_asset with this look
      const { error: insertError } = await supabase
        .from('project_assets')
        .insert({
          project_id: projectId,
          global_asset_id: assetId,
          local_overrides: { selected_look_ids: [lookId] },
        });

      if (insertError) {
        console.error('Error creating project asset:', insertError);
        return NextResponse.json({ error: 'Failed to add look' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error adding look:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Remove a look from the project
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, assetId } = await params;
    const { searchParams } = new URL(request.url);
    const lookId = searchParams.get('lookId');

    if (!lookId) {
      return NextResponse.json({ error: 'lookId is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Get the project asset
    const { data: projectAsset, error } = await supabase
      .from('project_assets')
      .select('id, local_overrides')
      .eq('project_id', projectId)
      .eq('global_asset_id', assetId)
      .single();

    if (error || !projectAsset) {
      return NextResponse.json({ error: 'Asset not found in project' }, { status: 404 });
    }

    const currentOverrides = (projectAsset.local_overrides as Record<string, unknown>) || {};
    const currentLooks = (currentOverrides.selected_look_ids as string[]) || [];
    const newLooks = currentLooks.filter(id => id !== lookId);

    const newOverrides = {
      ...currentOverrides,
      selected_look_ids: newLooks,
    };

    const { error: updateError } = await supabase
      .from('project_assets')
      .update({ local_overrides: newOverrides })
      .eq('id', projectAsset.id);

    if (updateError) {
      console.error('Error updating project asset:', updateError);
      return NextResponse.json({ error: 'Failed to remove look' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing look:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
