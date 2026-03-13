/**
 * Seed script to populate a demo project with sample data.
 *
 * Run with: npx tsx scripts/seed-demo-project.ts
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

// Demo user ID - you may need to change this to match your Auth0 user
const DEMO_USER_ID = process.argv[2] || 'demo-user';

async function seed() {
  console.log('Seeding demo project...\n');
  console.log(`Using user_id: ${DEMO_USER_ID}\n`);

  // 1. Create demo project
  console.log('1. Creating project...');
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      user_id: DEMO_USER_ID,
      name: 'Le Dernier Cafe',
      description: 'Court-metrage noir - Un detective fatigue rencontre une femme mysterieuse dans un cafe de nuit.',
      status: 'in_progress',
      current_step: 'script',
    })
    .select()
    .single();

  if (projectError) {
    console.error('Error creating project:', projectError);
    return;
  }
  console.log(`   Created project: ${project.name} (${project.id})\n`);

  const projectId = project.id;

  // 2. Create brainstorming content
  console.log('2. Creating brainstorming...');
  await supabase.from('brainstorming').insert({
    project_id: projectId,
    content: `# Le Dernier Cafe

## Concept
Un court-metrage noir de 5 minutes. Atmosphere annees 50, eclairage clair-obscur.

## Themes
- La solitude urbaine
- Les secrets du passe
- La redemption

## Ton
Film noir classique, dialogues ciseles, ambiance jazz.

## References visuelles
- Casablanca
- The Maltese Falcon
- Blade Runner (pour l'eclairage)

## Notes
- Tournage en noir et blanc ou desature
- Beaucoup de contre-jours et ombres portees
- Musique jazz melancolique`,
  });
  console.log('   Created brainstorming content\n');

  // 3. Create characters
  console.log('3. Creating characters...');
  const characters = [
    {
      project_id: projectId,
      name: 'Victor Marlowe',
      description: 'Detective prive fatigue, hante par son passe. Cynique mais au fond idealiste.',
      visual_description: 'Homme 45 ans, cheveux grisonnants, cicatrice sourcil gauche, trench-coat beige use, chapeau fedora, cigarette aux levres',
      age: '45',
      gender: 'male',
    },
    {
      project_id: projectId,
      name: 'Elena Vargas',
      description: 'Femme mysterieuse avec un secret. Elegante et dangereuse.',
      visual_description: 'Femme 30 ans, cheveux noirs ondules, robe rouge sombre, levres rouge vif, regard perçant, bijoux art deco',
      age: '30',
      gender: 'female',
    },
    {
      project_id: projectId,
      name: 'Tony',
      description: 'Barman du cafe, confident de Marlowe.',
      visual_description: 'Homme 55 ans, chauve, tablier blanc, noeud papillon noir, moustache fine, visage bienveillant',
      age: '55',
      gender: 'male',
    },
  ];

  const { data: insertedChars } = await supabase
    .from('characters')
    .insert(characters)
    .select();
  console.log(`   Created ${insertedChars?.length} characters\n`);

  // 4. Create locations
  console.log('4. Creating locations...');
  const locations = [
    {
      project_id: projectId,
      name: 'Cafe de Minuit',
      type: 'interior' as const,
      visual_description: 'Cafe art deco annees 50, comptoir en zinc, tabourets hauts, miroirs ternis, neons bleus et rouges, fumee de cigarette, jukebox dans le coin',
      lighting: 'Clair-obscur, neons colores, lampes pendantes basses',
      mood: 'Melancolique, intime, mysterieux',
    },
    {
      project_id: projectId,
      name: 'Rue Pluvieuse',
      type: 'exterior' as const,
      visual_description: 'Ruelle pavee mouillée, reflets des enseignes au neon, poubelles, escalier de secours, brume legere',
      lighting: 'Nuit, enseignes au neon, lampadaire unique',
      mood: 'Dangereux, solitaire, cinematique',
    },
  ];

  await supabase.from('locations').insert(locations);
  console.log(`   Created ${locations.length} locations\n`);

  // 5. Create props
  console.log('5. Creating props...');
  const props = [
    {
      project_id: projectId,
      name: 'Revolver',
      type: 'weapon' as const,
      visual_description: 'Colt Detective Special, chrome use, crosse en bois',
    },
    {
      project_id: projectId,
      name: 'Photo ancienne',
      type: 'object' as const,
      visual_description: 'Photo noir et blanc froissee, couple devant une maison, annees 40',
    },
    {
      project_id: projectId,
      name: 'Verre de whisky',
      type: 'object' as const,
      visual_description: 'Verre a whisky en cristal, liquide ambre, glacons',
    },
    {
      project_id: projectId,
      name: 'Briquet Zippo',
      type: 'object' as const,
      visual_description: 'Zippo argent grave, use par le temps',
    },
  ];

  await supabase.from('props').insert(props);
  console.log(`   Created ${props.length} props\n`);

  // 6. Create scenes
  console.log('6. Creating scenes...');
  const scenes = [
    {
      project_id: projectId,
      scene_number: 1,
      int_ext: 'INT' as const,
      location: 'CAFE DE MINUIT',
      time_of_day: 'NUIT' as const,
      description: 'Marlowe seul au comptoir, pensif. Le cafe est presque vide.',
      sort_order: 1,
    },
    {
      project_id: projectId,
      scene_number: 2,
      int_ext: 'INT' as const,
      location: 'CAFE DE MINUIT',
      time_of_day: 'NUIT' as const,
      description: 'Elena entre dans le cafe. Leurs regards se croisent.',
      sort_order: 2,
    },
    {
      project_id: projectId,
      scene_number: 3,
      int_ext: 'INT' as const,
      location: 'CAFE DE MINUIT',
      time_of_day: 'NUIT' as const,
      description: 'Elena rejoint Marlowe au comptoir. Conversation tendue.',
      sort_order: 3,
    },
    {
      project_id: projectId,
      scene_number: 4,
      int_ext: 'EXT' as const,
      location: 'RUE PLUVIEUSE',
      time_of_day: 'NUIT' as const,
      description: 'Marlowe et Elena quittent le cafe. Danger dans l\'ombre.',
      sort_order: 4,
    },
  ];

  const { data: insertedScenes } = await supabase
    .from('scenes')
    .insert(scenes)
    .select();
  console.log(`   Created ${insertedScenes?.length} scenes\n`);

  // 7. Create script elements for each scene
  console.log('7. Creating script elements...');
  const sceneMap = new Map(insertedScenes?.map(s => [s.scene_number, s.id]) || []);

  const scriptElements = [
    // Scene 1
    { scene_id: sceneMap.get(1), type: 'action', content: 'La fumee de cigarette monte lentement vers le plafond. Le jukebox joue un vieux standard de jazz. @Victor est assis seul au comptoir, son @Whisky a moitie vide devant lui.', sort_order: 0 },
    { scene_id: sceneMap.get(1), type: 'action', content: '@Tony essuie un verre, jetant des regards discrets vers son ami.', sort_order: 1 },
    { scene_id: sceneMap.get(1), type: 'dialogue', character_name: 'TONY', content: 'Tu comptes rester plante la toute la nuit, Vic ?', sort_order: 2 },
    { scene_id: sceneMap.get(1), type: 'dialogue', character_name: 'VICTOR', content: 'T\'as mieux a proposer ?', parenthetical: 'sans lever les yeux', sort_order: 3 },
    { scene_id: sceneMap.get(1), type: 'dialogue', character_name: 'TONY', content: 'Rentrer chez toi. Dormir. Des trucs normaux.', sort_order: 4 },
    { scene_id: sceneMap.get(1), type: 'action', content: '@Victor sirote son whisky, le regard perdu dans le miroir derriere le bar.', sort_order: 5 },

    // Scene 2
    { scene_id: sceneMap.get(2), type: 'action', content: 'La porte du cafe s\'ouvre. Une silhouette feminine se decoupe dans la lumiere du neon exterieur.', sort_order: 0 },
    { scene_id: sceneMap.get(2), type: 'action', content: '@Elena entre, sa robe rouge sombre captant la lumiere. Elle balaye la salle du regard.', sort_order: 1 },
    { scene_id: sceneMap.get(2), type: 'action', content: '@Victor la remarque dans le miroir. Il ne se retourne pas, mais son corps se raidit imperceptiblement.', sort_order: 2 },
    { scene_id: sceneMap.get(2), type: 'action', content: 'Leurs regards se croisent dans le reflet. Un instant suspendu.', sort_order: 3 },
    { scene_id: sceneMap.get(2), type: 'action', content: '@Elena esquisse un demi-sourire et s\'avance vers le comptoir.', sort_order: 4 },

    // Scene 3
    { scene_id: sceneMap.get(3), type: 'action', content: '@Elena s\'installe sur le tabouret a cote de @Victor. Elle pose son sac a main sur le comptoir.', sort_order: 0 },
    { scene_id: sceneMap.get(3), type: 'dialogue', character_name: 'ELENA', content: 'Vous etes Victor Marlowe.', sort_order: 1 },
    { scene_id: sceneMap.get(3), type: 'action', content: 'Ce n\'est pas une question.', sort_order: 2 },
    { scene_id: sceneMap.get(3), type: 'dialogue', character_name: 'VICTOR', content: 'Et vous etes quelqu\'un qui cherche des ennuis.', parenthetical: 'allumant une cigarette', sort_order: 3 },
    { scene_id: sceneMap.get(3), type: 'dialogue', character_name: 'ELENA', content: 'Les ennuis, je les ai deja trouves. C\'est une solution que je cherche.', sort_order: 4 },
    { scene_id: sceneMap.get(3), type: 'action', content: 'Elle sort la @Photo de son sac et la glisse vers lui.', sort_order: 5 },
    { scene_id: sceneMap.get(3), type: 'action', content: '@Victor regarde la photo. Son visage se ferme.', sort_order: 6 },
    { scene_id: sceneMap.get(3), type: 'dialogue', character_name: 'VICTOR', content: 'Ou avez-vous trouve ca ?', parenthetical: 'voix tendue', sort_order: 7 },
    { scene_id: sceneMap.get(3), type: 'dialogue', character_name: 'ELENA', content: 'Dans les affaires de mon pere. Avant qu\'ils le tuent.', sort_order: 8 },
    { scene_id: sceneMap.get(3), type: 'transition', content: 'CUT TO:', sort_order: 9 },

    // Scene 4
    { scene_id: sceneMap.get(4), type: 'action', content: '@Victor et @Elena sortent du cafe. La pluie fine cree des halos autour des lampadaires.', sort_order: 0 },
    { scene_id: sceneMap.get(4), type: 'dialogue', character_name: 'VICTOR', content: 'Vous n\'auriez pas du venir me trouver.', sort_order: 1 },
    { scene_id: sceneMap.get(4), type: 'dialogue', character_name: 'ELENA', content: 'Vous etiez le seul a qui il faisait confiance.', sort_order: 2 },
    { scene_id: sceneMap.get(4), type: 'action', content: 'Un bruit de pas dans l\'ombre. @Victor s\'immobilise, la main glissant vers son @Revolver.', sort_order: 3 },
    { scene_id: sceneMap.get(4), type: 'dialogue', character_name: 'VICTOR', content: 'Ne bougez pas.', parenthetical: 'murmure', sort_order: 4 },
    { scene_id: sceneMap.get(4), type: 'action', content: 'La lumiere d\'un neon clignote. Une silhouette menacante se decoupe au bout de la ruelle.', sort_order: 5 },
    { scene_id: sceneMap.get(4), type: 'transition', content: 'FADE TO BLACK.', sort_order: 6 },
  ];

  await supabase.from('script_elements').insert(
    scriptElements.map(el => ({ ...el, type: el.type as 'action' | 'dialogue' | 'transition' | 'note' }))
  );
  console.log(`   Created ${scriptElements.length} script elements\n`);

  // 8. Create shots for decoupage
  console.log('8. Creating shots (decoupage)...');
  const shots = [
    // Scene 1 shots
    { scene_id: sceneMap.get(1), shot_number: 1, description: 'Plan large du cafe vide. Fumee, neons, jukebox. @Victor seul au comptoir.', shot_type: 'wide', camera_angle: 'eye_level', camera_movement: 'slow_dolly_in', sort_order: 1 },
    { scene_id: sceneMap.get(1), shot_number: 2, description: 'Gros plan sur le verre de @Whisky. Reflets des neons dans le liquide.', shot_type: 'extreme_close_up', camera_angle: 'eye_level', camera_movement: 'static', sort_order: 2 },
    { scene_id: sceneMap.get(1), shot_number: 3, description: 'Plan moyen @Tony essuyant un verre, regardant @Victor.', shot_type: 'medium', camera_angle: 'eye_level', camera_movement: 'static', sort_order: 3 },
    { scene_id: sceneMap.get(1), shot_number: 4, description: 'Gros plan @Victor, visage fatigue, regard dans le vide.', shot_type: 'close_up', camera_angle: 'eye_level', camera_movement: 'static', sort_order: 4 },

    // Scene 2 shots
    { scene_id: sceneMap.get(2), shot_number: 1, description: 'Silhouette @Elena dans l\'embrasure de la porte, contre-jour neon.', shot_type: 'wide', camera_angle: 'low_angle', camera_movement: 'static', sort_order: 1 },
    { scene_id: sceneMap.get(2), shot_number: 2, description: '@Elena avance, la lumiere revele progressivement son visage.', shot_type: 'medium', camera_angle: 'eye_level', camera_movement: 'tracking_backward', sort_order: 2 },
    { scene_id: sceneMap.get(2), shot_number: 3, description: 'Insert: reflet de @Victor dans le miroir du bar.', shot_type: 'close_up', camera_angle: 'eye_level', camera_movement: 'static', sort_order: 3 },
    { scene_id: sceneMap.get(2), shot_number: 4, description: 'Leurs regards se croisent dans le miroir. Split focus.', shot_type: 'medium', camera_angle: 'eye_level', camera_movement: 'rack_focus', sort_order: 4 },

    // Scene 3 shots
    { scene_id: sceneMap.get(3), shot_number: 1, description: 'Plan a deux, @Elena s\'assoit pres de @Victor. Tension palpable.', shot_type: 'medium', camera_angle: 'eye_level', camera_movement: 'static', sort_order: 1 },
    { scene_id: sceneMap.get(3), shot_number: 2, description: 'Gros plan @Elena, regard determine.', shot_type: 'close_up', camera_angle: 'eye_level', camera_movement: 'static', sort_order: 2 },
    { scene_id: sceneMap.get(3), shot_number: 3, description: 'Over shoulder @Elena, @Victor allume sa cigarette.', shot_type: 'over_shoulder', camera_angle: 'eye_level', camera_movement: 'static', sort_order: 3 },
    { scene_id: sceneMap.get(3), shot_number: 4, description: 'Insert: la @Photo glisse sur le comptoir.', shot_type: 'extreme_close_up', camera_angle: 'high_angle', camera_movement: 'static', sort_order: 4 },
    { scene_id: sceneMap.get(3), shot_number: 5, description: 'Reaction @Victor: son visage se ferme. Gros plan.', shot_type: 'close_up', camera_angle: 'eye_level', camera_movement: 'slow_dolly_in', sort_order: 5 },

    // Scene 4 shots
    { scene_id: sceneMap.get(4), shot_number: 1, description: 'Plan large rue mouillée. @Victor et @Elena sortent du cafe.', shot_type: 'wide', camera_angle: 'high_angle', camera_movement: 'crane_down', sort_order: 1 },
    { scene_id: sceneMap.get(4), shot_number: 2, description: 'Plan moyen, ils marchent. Reflets des neons sur les paves mouilles.', shot_type: 'medium', camera_angle: 'eye_level', camera_movement: 'tracking_side', sort_order: 2 },
    { scene_id: sceneMap.get(4), shot_number: 3, description: 'Gros plan main de @Victor sur son @Revolver.', shot_type: 'extreme_close_up', camera_angle: 'eye_level', camera_movement: 'static', sort_order: 3 },
    { scene_id: sceneMap.get(4), shot_number: 4, description: 'POV @Victor: silhouette menacante au bout de la ruelle, neon clignotant.', shot_type: 'pov', camera_angle: 'eye_level', camera_movement: 'handheld', sort_order: 4 },
    { scene_id: sceneMap.get(4), shot_number: 5, description: 'Plan large final: les deux protagonistes face a la menace. Fade to black.', shot_type: 'wide', camera_angle: 'low_angle', camera_movement: 'static', sort_order: 5 },
  ];

  await supabase.from('shots').insert(
    shots.map(s => ({
      ...s,
      shot_type: s.shot_type as any,
      camera_angle: s.camera_angle as any,
      camera_movement: s.camera_movement as any,
      generation_status: 'not_started',
    }))
  );
  console.log(`   Created ${shots.length} shots\n`);

  // Summary
  console.log('='.repeat(50));
  console.log('Demo project seeded successfully!');
  console.log('='.repeat(50));
  console.log(`
Project: ${project.name}
ID: ${project.id}

Content:
  - 1 brainstorming document
  - ${characters.length} characters
  - ${locations.length} locations
  - ${props.length} props
  - ${scenes.length} scenes
  - ${scriptElements.length} script elements
  - ${shots.length} shots

To view, go to: /project/${project.id}/brainstorming
`);
}

seed().catch(console.error);
