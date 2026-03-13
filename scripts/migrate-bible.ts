import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function migrate() {
  const userId = 'google-oauth2|113084593018690519706';
  const projects = [
    { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', name: 'Court-métrage Sci-Fi' },
    { id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901', name: 'Publicité Produit' },
  ];

  for (const proj of projects) {
    console.log('\n=== Migration: ' + proj.name + ' ===');

    // Get existing characters
    const { data: chars } = await supabase
      .from('characters')
      .select('*')
      .eq('project_id', proj.id);

    for (const char of (chars || [])) {
      // Check if already exists in global_assets
      const { data: existing } = await supabase
        .from('global_assets')
        .select('id')
        .eq('user_id', userId)
        .eq('asset_type', 'character')
        .eq('name', char.name)
        .single();

      let globalAssetId: string;

      if (existing) {
        globalAssetId = existing.id;
        console.log('Character ' + char.name + ' existe déjà');
      } else {
        const { data: newAsset, error } = await supabase
          .from('global_assets')
          .insert({
            user_id: userId,
            asset_type: 'character',
            name: char.name,
            data: {
              description: char.description || char.visual_description || '',
              visual_description: char.visual_description || '',
            },
            reference_images: char.reference_images || [],
            tags: [],
          })
          .select()
          .single();

        if (error) {
          console.error('Erreur création character ' + char.name + ':', error.message);
          continue;
        }
        globalAssetId = newAsset!.id;
        console.log('Character ' + char.name + ' créé');
      }

      // Link to project
      await supabase
        .from('project_assets')
        .upsert({
          project_id: proj.id,
          global_asset_id: globalAssetId,
        }, { onConflict: 'project_id,global_asset_id' });
    }

    // Get existing locations
    const { data: locs } = await supabase
      .from('locations')
      .select('*')
      .eq('project_id', proj.id);

    for (const loc of (locs || [])) {
      const { data: existing } = await supabase
        .from('global_assets')
        .select('id')
        .eq('user_id', userId)
        .eq('asset_type', 'location')
        .eq('name', loc.name)
        .single();

      let globalAssetId: string;

      if (existing) {
        globalAssetId = existing.id;
        console.log('Location ' + loc.name + ' existe déjà');
      } else {
        const { data: newAsset, error } = await supabase
          .from('global_assets')
          .insert({
            user_id: userId,
            asset_type: 'location',
            name: loc.name,
            data: {
              description: loc.description || loc.visual_description || '',
              visual_description: loc.visual_description || '',
              int_ext: 'INT',
            },
            reference_images: loc.reference_images || [],
            tags: [],
          })
          .select()
          .single();

        if (error) {
          console.error('Erreur création location ' + loc.name + ':', error.message);
          continue;
        }
        globalAssetId = newAsset!.id;
        console.log('Location ' + loc.name + ' créé');
      }

      await supabase
        .from('project_assets')
        .upsert({
          project_id: proj.id,
          global_asset_id: globalAssetId,
        }, { onConflict: 'project_id,global_asset_id' });
    }
  }

  // Verify
  console.log('\n=== VÉRIFICATION ===');
  const { data: globalAssets } = await supabase
    .from('global_assets')
    .select('id, name, asset_type')
    .eq('user_id', userId);
  console.log('Global assets: ' + (globalAssets?.length || 0));
  if (globalAssets) {
    for (const a of globalAssets) {
      console.log('  - [' + a.asset_type + '] ' + a.name);
    }
  }

  const { data: projectAssets } = await supabase
    .from('project_assets')
    .select('project_id, global_asset_id');
  console.log('\nProject assets (liaisons): ' + (projectAssets?.length || 0));
}

migrate();
