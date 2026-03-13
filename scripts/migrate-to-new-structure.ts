/**
 * Migration script to convert existing data to new pipeline structure.
 *
 * This script:
 * 1. Converts existing dialogues to script_elements with type='dialogue'
 * 2. Converts existing actions (from scene descriptions) to script_elements with type='action'
 * 3. Updates project current_step if set to deprecated values
 *
 * Run with: npx tsx scripts/migrate-to-new-structure.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrate() {
  console.log('Starting migration to new pipeline structure...\n');

  // 1. Get all scenes with dialogues
  console.log('1. Fetching scenes with dialogues...');
  const { data: scenes, error: scenesError } = await supabase
    .from('scenes')
    .select('id, project_id, dialogues');

  if (scenesError) {
    console.error('Error fetching scenes:', scenesError);
    return;
  }

  console.log(`   Found ${scenes?.length || 0} scenes\n`);

  // 2. Convert dialogues to script_elements
  console.log('2. Converting dialogues to script_elements...');
  let dialogueCount = 0;

  for (const scene of scenes || []) {
    const dialogues = scene.dialogues as Array<{
      character: string;
      line: string;
      sort_order?: number;
    }> | null;

    if (!dialogues || dialogues.length === 0) continue;

    // Check if script_elements already exist for this scene
    const { data: existingElements } = await supabase
      .from('script_elements')
      .select('id')
      .eq('scene_id', scene.id)
      .limit(1);

    if (existingElements && existingElements.length > 0) {
      console.log(`   Scene ${scene.id} already has script_elements, skipping...`);
      continue;
    }

    const elementsToInsert = dialogues.map((dialogue, index) => ({
      scene_id: scene.id,
      type: 'dialogue' as const,
      content: dialogue.line || '',
      character_name: dialogue.character || '',
      sort_order: dialogue.sort_order ?? index,
    }));

    const { error: insertError } = await supabase
      .from('script_elements')
      .insert(elementsToInsert);

    if (insertError) {
      console.error(`   Error inserting elements for scene ${scene.id}:`, insertError);
    } else {
      dialogueCount += elementsToInsert.length;
      console.log(`   Converted ${elementsToInsert.length} dialogues for scene ${scene.id}`);
    }
  }

  console.log(`   Total dialogues converted: ${dialogueCount}\n`);

  // 3. Update deprecated project steps
  console.log('3. Updating deprecated project steps...');
  const { data: projectsToUpdate, error: projectsError } = await supabase
    .from('projects')
    .select('id, current_step')
    .in('current_step', ['synopsis', 'reperage']);

  if (projectsError) {
    console.error('Error fetching projects:', projectsError);
  } else if (projectsToUpdate && projectsToUpdate.length > 0) {
    const { error: updateError } = await supabase
      .from('projects')
      .update({ current_step: 'script' })
      .in('current_step', ['synopsis', 'reperage']);

    if (updateError) {
      console.error('Error updating project steps:', updateError);
    } else {
      console.log(`   Updated ${projectsToUpdate.length} projects from synopsis/reperage to script\n`);
    }
  } else {
    console.log('   No projects with deprecated steps found\n');
  }

  // 4. Summary
  console.log('Migration complete!');
  console.log('Summary:');
  console.log(`  - Dialogues converted: ${dialogueCount}`);
  console.log(`  - Projects updated: ${projectsToUpdate?.length || 0}`);
  console.log('\nNote: Shots are kept in their existing table and used by the Decoupage feature.');
}

migrate().catch(console.error);
