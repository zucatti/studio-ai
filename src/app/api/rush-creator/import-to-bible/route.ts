/**
 * Rush Creator - Import to Bible API
 *
 * Import a rush media item as a location or prop in the Bible (global assets)
 */

import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    // Auth check
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, mediaUrl, type, name } = body as {
      projectId: string;
      mediaUrl: string;
      type: 'location' | 'prop';
      name: string;
    };

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    if (!mediaUrl) {
      return NextResponse.json({ error: 'mediaUrl is required' }, { status: 400 });
    }

    if (!type || !['location', 'prop'].includes(type)) {
      return NextResponse.json({ error: 'type must be location or prop' }, { status: 400 });
    }

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found', details: projectError },
        { status: 404 }
      );
    }

    // Create global asset
    const assetData = type === 'location'
      ? {
          visual_description: `Imported from Rush Creator`,
          type: 'interior' as const, // Default, user can change later
        }
      : {
          visual_description: `Imported from Rush Creator`,
          type: 'object' as const, // Default, user can change later
        };

    const { data: asset, error: assetError } = await supabase
      .from('global_assets')
      .insert({
        user_id: session.user.sub,
        asset_type: type,
        name: name.trim(),
        data: assetData,
        reference_images: [mediaUrl],
        tags: ['rush-creator', 'imported'],
      })
      .select('id, name, asset_type')
      .single();

    if (assetError || !asset) {
      console.error('[RushCreator/ImportToBible] Failed to create asset:', assetError);
      return NextResponse.json(
        { error: 'Failed to create asset', details: assetError },
        { status: 500 }
      );
    }

    console.log(`[RushCreator/ImportToBible] Created ${type}: ${asset.name} (${asset.id})`);

    // Link asset to project
    const { error: linkError } = await supabase
      .from('project_assets')
      .insert({
        project_id: projectId,
        global_asset_id: asset.id,
      });

    if (linkError) {
      console.error('[RushCreator/ImportToBible] Failed to link asset:', linkError);
      // Asset was created but not linked - this is not critical
    } else {
      console.log(`[RushCreator/ImportToBible] Linked asset to project ${projectId}`);
    }

    return NextResponse.json({
      success: true,
      asset: {
        id: asset.id,
        name: asset.name,
        type: asset.asset_type,
      },
    });

  } catch (error) {
    console.error('[RushCreator/ImportToBible] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
