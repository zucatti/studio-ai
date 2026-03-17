import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { buildScriptBreakdown } from '@/lib/script-breakdown';

/**
 * GET /api/projects/[projectId]/breakdown
 * Analyze the script and return a breakdown of all resources
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const supabase = createServerSupabaseClient();

    // Fetch scenes with location info
    const { data: scenes, error: scenesError } = await supabase
      .from('scenes')
      .select('id, scene_number, location, location_id')
      .eq('project_id', projectId)
      .order('scene_number', { ascending: true });

    if (scenesError) throw scenesError;

    // Fetch script elements with scene numbers
    const { data: elements, error: elementsError } = await supabase
      .from('script_elements')
      .select(`
        id,
        scene_id,
        content,
        character_id,
        character_name,
        scenes!inner(scene_number)
      `)
      .in('scene_id', scenes?.map(s => s.id) || []);

    if (elementsError) throw elementsError;

    // Transform elements to include scene_number
    const elementsWithSceneNumber = (elements || []).map(el => ({
      ...el,
      scene_number: (el.scenes as any)?.scene_number || 0,
    }));

    // Fetch Bible assets for this project
    const { data: projectAssets, error: assetsError } = await supabase
      .from('project_assets')
      .select(`
        global_asset_id,
        global_assets!inner(id, name, asset_type)
      `)
      .eq('project_id', projectId);

    if (assetsError) throw assetsError;

    const bibleAssets = (projectAssets || []).map(pa => ({
      id: (pa.global_assets as any).id,
      name: (pa.global_assets as any).name,
      asset_type: (pa.global_assets as any).asset_type,
    }));

    // Fetch generic characters in project
    const { data: projectGenerics, error: genericsError } = await supabase
      .from('project_generic_assets')
      .select('generic_asset_id, generic_asset_name')
      .eq('project_id', projectId);

    if (genericsError) throw genericsError;

    const genericAssets = (projectGenerics || []).map(pg => ({
      id: pg.generic_asset_id,
      name: pg.generic_asset_name,
    }));

    // Build the breakdown
    const breakdown = buildScriptBreakdown(
      scenes || [],
      elementsWithSceneNumber,
      bibleAssets,
      genericAssets
    );

    return NextResponse.json(breakdown);
  } catch (error) {
    console.error('Error analyzing script breakdown:', error);
    return NextResponse.json(
      { error: 'Failed to analyze script' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/[projectId]/breakdown/link
 * Link an extracted resource to a Bible asset or create a new one
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const { resourceType, resourceName, action, assetId, assetData } = body;

    const supabase = createServerSupabaseClient();

    if (action === 'link' && assetId) {
      // Link to existing asset - import it to project if not already
      const { data: existing } = await supabase
        .from('project_assets')
        .select('id')
        .eq('project_id', projectId)
        .eq('global_asset_id', assetId)
        .single();

      if (!existing) {
        const { error } = await supabase
          .from('project_assets')
          .insert({
            project_id: projectId,
            global_asset_id: assetId,
          });

        if (error) throw error;
      }

      return NextResponse.json({ success: true, linked: true });
    }

    if (action === 'create' && assetData) {
      // Create new Bible asset
      const { data: newAsset, error: createError } = await supabase
        .from('global_assets')
        .insert({
          name: assetData.name || resourceName,
          asset_type: resourceType === 'character' ? 'character' : resourceType === 'location' ? 'location' : 'prop',
          data: {
            visual_description: assetData.visual_description || '',
            description: assetData.description || '',
          },
        })
        .select()
        .single();

      if (createError) throw createError;

      // Import to project
      const { error: importError } = await supabase
        .from('project_assets')
        .insert({
          project_id: projectId,
          global_asset_id: newAsset.id,
        });

      if (importError) throw importError;

      return NextResponse.json({ success: true, created: true, assetId: newAsset.id });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error linking resource:', error);
    return NextResponse.json(
      { error: 'Failed to link resource' },
      { status: 500 }
    );
  }
}
