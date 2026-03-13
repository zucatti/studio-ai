import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { generateReferenceName } from '@/lib/reference-name';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

interface Entity {
  name: string;
  visual_description: string;
  reference: string;
}

const VALID_SHOT_TYPES = ['wide', 'medium', 'close_up', 'extreme_close_up', 'over_shoulder', 'pov'] as const;
const VALID_CAMERA_ANGLES = ['eye_level', 'low_angle', 'high_angle', 'dutch_angle', 'birds_eye', 'worms_eye'] as const;
const VALID_CAMERA_MOVEMENTS = ['static', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'dolly_in', 'dolly_out', 'tracking', 'crane', 'handheld'] as const;

const VALID_INT_EXT = ['INT', 'EXT', 'INT/EXT'] as const;
const VALID_TIME_OF_DAY = ['JOUR', 'NUIT', 'AUBE', 'CREPUSCULE'] as const;

function validateIntExt(value: string): typeof VALID_INT_EXT[number] {
  const upper = value?.toUpperCase?.() || 'INT';
  if (VALID_INT_EXT.includes(upper as typeof VALID_INT_EXT[number])) {
    return upper as typeof VALID_INT_EXT[number];
  }
  return 'INT';
}

function validateTimeOfDay(value: string): typeof VALID_TIME_OF_DAY[number] {
  const upper = value?.toUpperCase?.() || 'JOUR';
  if (VALID_TIME_OF_DAY.includes(upper as typeof VALID_TIME_OF_DAY[number])) {
    return upper as typeof VALID_TIME_OF_DAY[number];
  }
  return 'JOUR';
}

const SYNOPSIS_GENERATION_PROMPT = `Tu es un scénariste professionnel. À partir du brainstorming fourni, génère un SYNOPSIS structuré en scènes.

Le synopsis est un découpage narratif léger - PAS un script détaillé. Chaque scène doit contenir :
- Un en-tête de scène (INT/EXT, LIEU, MOMENT)
- Une description narrative de ce qui se passe (1-3 paragraphes)

## Valeurs strictes

### Pour int_ext :
- "INT" (intérieur)
- "EXT" (extérieur)
- "INT/EXT" (les deux)

### Pour time_of_day :
- "JOUR"
- "NUIT"
- "AUBE"
- "CREPUSCULE"

## Format JSON de sortie

Réponds UNIQUEMENT avec le JSON, sans texte avant ou après :

{
  "scenes": [
    {
      "scene_number": 1,
      "int_ext": "EXT",
      "location": "FORÊT - CLAIRIÈRE",
      "time_of_day": "AUBE",
      "description": "Marie traverse la clairière brumeuse..."
    }
  ]
}

## Brainstorming à transformer :

`;

function validateShotType(value: string): typeof VALID_SHOT_TYPES[number] {
  const lower = value?.toLowerCase?.() || '';
  if (VALID_SHOT_TYPES.includes(lower as typeof VALID_SHOT_TYPES[number])) {
    return lower as typeof VALID_SHOT_TYPES[number];
  }
  return 'medium';
}

function validateCameraAngle(value: string): typeof VALID_CAMERA_ANGLES[number] {
  const lower = value?.toLowerCase?.() || '';
  if (VALID_CAMERA_ANGLES.includes(lower as typeof VALID_CAMERA_ANGLES[number])) {
    return lower as typeof VALID_CAMERA_ANGLES[number];
  }
  return 'eye_level';
}

function validateCameraMovement(value: string): typeof VALID_CAMERA_MOVEMENTS[number] {
  const lower = value?.toLowerCase?.() || '';
  if (VALID_CAMERA_MOVEMENTS.includes(lower as typeof VALID_CAMERA_MOVEMENTS[number])) {
    return lower as typeof VALID_CAMERA_MOVEMENTS[number];
  }
  return 'static';
}

function buildPrompt(
  sceneHeader: string,
  sceneDescription: string,
  characters: Entity[],
  props: Entity[],
  locations: Entity[]
): string {
  let entitiesSection = '';

  if (characters.length > 0 || props.length > 0 || locations.length > 0) {
    entitiesSection = `
## IMPORTANT : Entités du Repérage

Tu DOIS utiliser les @références ci-dessous dans les descriptions au lieu de décrire les personnages/props/décors. Ces références seront remplacées par leurs descriptions visuelles lors de la génération.

`;

    if (characters.length > 0) {
      entitiesSection += `### Personnages\n`;
      for (const char of characters) {
        entitiesSection += `- **${char.reference}** = "${char.name}" : ${char.visual_description}\n`;
      }
      entitiesSection += '\n';
    }

    if (props.length > 0) {
      entitiesSection += `### Props/Objets\n`;
      for (const prop of props) {
        entitiesSection += `- **${prop.reference}** = "${prop.name}" : ${prop.visual_description}\n`;
      }
      entitiesSection += '\n';
    }

    if (locations.length > 0) {
      entitiesSection += `### Décors/Lieux\n`;
      for (const loc of locations) {
        entitiesSection += `- **${loc.reference}** = "${loc.name}" : ${loc.visual_description}\n`;
      }
      entitiesSection += '\n';
    }

    entitiesSection += `**Exemple** : Au lieu d'écrire "Un lapin blanc aux longues oreilles court sur la route", écris "@LeLapinBlanc court sur @RouteDesertique".

`;
  }

  return `Tu es un scénariste professionnel. À partir d'une scène de synopsis, génère les PLANS (shots) détaillés pour la production vidéo IA.

## Scène à détailler

En-tête: ${sceneHeader}
Description narrative:
${sceneDescription}
${entitiesSection}
## Valeurs strictes

### Pour shot_type :
- "wide" (plan large)
- "medium" (plan moyen)
- "close_up" (gros plan)
- "extreme_close_up" (très gros plan)
- "over_shoulder" (par-dessus l'épaule)
- "pov" (point de vue)

### Pour camera_angle :
- "eye_level" (hauteur des yeux)
- "low_angle" (contre-plongée)
- "high_angle" (plongée)
- "dutch_angle" (angle hollandais)
- "birds_eye" (vue aérienne)
- "worms_eye" (contre-plongée extrême)

### Pour camera_movement :
- "static" (fixe)
- "pan_left" / "pan_right" (panoramique)
- "tilt_up" / "tilt_down" (tilt)
- "dolly_in" / "dolly_out" (travelling)
- "tracking" (travelling latéral)
- "crane" (grue)
- "handheld" (épaule)

## Format JSON de sortie

Réponds UNIQUEMENT avec le JSON :

{
  "shots": [
    {
      "shot_number": 1,
      "description": "@Personnage fait quelque chose dans @Lieu. Utilise les @références pour les personnages et décors.",
      "shot_type": "medium",
      "camera_angle": "eye_level",
      "camera_movement": "static",
      "dialogues": [
        {
          "character_name": "MARIE",
          "content": "Texte du dialogue",
          "parenthetical": "(doucement)"
        }
      ],
      "actions": [
        {
          "content": "@Personnage se lève et s'approche de @Objet"
        }
      ]
    }
  ]
}

## Règles

1. **@Références OBLIGATOIRES** : Utilise TOUJOURS les @références fournies ci-dessus pour les personnages, props et décors. Ne décris JAMAIS leur apparence physique - elle sera injectée automatiquement.

2. **Descriptions de plans** : Décris uniquement :
   - Ce que font les personnages (actions, expressions, postures)
   - Les interactions entre personnages et objets
   - L'éclairage et l'ambiance
   - La composition du plan

3. **Découpage** : 3-8 plans par scène selon la complexité.

4. **Dialogues** : Noms en MAJUSCULES. Utilise les noms d'affichage (pas les @références).

5. **Actions** : Courtes et visuelles, avec @références.

Génère maintenant les plans pour cette scène :
`;
}

export async function POST(request: Request, { params }: RouteParams) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: 'info' | 'success' | 'error' | 'claude' | 'done', message: string, data?: Record<string, unknown>) => {
        const event = JSON.stringify({ type, message, data, timestamp: new Date().toISOString() });
        controller.enqueue(encoder.encode(`data: ${event}\n\n`));
      };

      try {
        send('info', 'Demarrage de la generation...');

        const session = await auth0.getSession();
        if (!session?.user) {
          send('error', 'Non autorise');
          controller.close();
          return;
        }

        const { projectId } = await params;
        const supabase = createServerSupabaseClient();

        send('info', 'Verification du projet...');

        const { data: project } = await supabase
          .from('projects')
          .select('id')
          .eq('id', projectId)
          .eq('user_id', session.user.sub)
          .single();

        if (!project) {
          send('error', 'Projet non trouve');
          controller.close();
          return;
        }

        const anthropic = new Anthropic({
          apiKey: process.env.AI_CLAUDE_KEY,
        });

        // Get synopsis scenes
        let { data: scenes, error: scenesError } = await supabase
          .from('scenes')
          .select('*')
          .eq('project_id', projectId)
          .order('sort_order');

        // If no scenes exist, generate them from brainstorming first
        if (scenesError || !scenes || scenes.length === 0) {
          send('info', 'Aucune scene trouvee, lecture du brainstorming...');

          const { data: brainstorming } = await supabase
            .from('brainstorming')
            .select('content')
            .eq('project_id', projectId)
            .single();

          if (!brainstorming?.content || brainstorming.content.trim() === '') {
            send('error', 'Aucun brainstorming trouve. Ajoutez du contenu au brainstorming avant de generer.');
            controller.close();
            return;
          }

          send('claude', 'Claude analyse le brainstorming et cree les scenes...');

          const synopsisMessage = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            messages: [
              {
                role: 'user',
                content: SYNOPSIS_GENERATION_PROMPT + brainstorming.content,
              },
            ],
          });

          const synopsisText = synopsisMessage.content[0].type === 'text' ? synopsisMessage.content[0].text : '';

          let synopsisData;
          try {
            const jsonMatch = synopsisText.match(/```(?:json)?\s*([\s\S]*?)```/);
            let jsonString = jsonMatch ? jsonMatch[1].trim() : synopsisText.trim();

            if (!jsonString.startsWith('{')) {
              const jsonStart = jsonString.indexOf('{');
              const jsonEnd = jsonString.lastIndexOf('}');
              if (jsonStart !== -1 && jsonEnd !== -1) {
                jsonString = jsonString.substring(jsonStart, jsonEnd + 1);
              }
            }

            synopsisData = JSON.parse(jsonString);
          } catch {
            send('error', 'Erreur lors du parsing des scenes generees');
            controller.close();
            return;
          }

          if (!synopsisData.scenes || !Array.isArray(synopsisData.scenes)) {
            send('error', 'Le contenu genere ne contient pas de scenes valides');
            controller.close();
            return;
          }

          send('success', `${synopsisData.scenes.length} scenes generees par Claude`);

          const savedScenes = [];
          for (let i = 0; i < synopsisData.scenes.length; i++) {
            const sceneData = synopsisData.scenes[i];

            const { data: scene, error } = await supabase
              .from('scenes')
              .insert({
                project_id: projectId,
                scene_number: sceneData.scene_number || i + 1,
                int_ext: validateIntExt(sceneData.int_ext),
                location: (sceneData.location || 'LIEU').toUpperCase(),
                time_of_day: validateTimeOfDay(sceneData.time_of_day),
                description: sceneData.description || '',
                sort_order: i,
              })
              .select()
              .single();

            if (!error && scene) {
              send('info', `Scene ${scene.scene_number}: ${scene.location}`);
              savedScenes.push(scene);
            }
          }

          scenes = savedScenes;
        } else {
          send('info', `${scenes.length} scenes existantes trouvees`);
        }

        // Fetch entities from Repérage
        const [charactersRes, propsRes, locationsRes] = await Promise.all([
          supabase.from('characters').select('name, visual_description').eq('project_id', projectId),
          supabase.from('props').select('name, visual_description').eq('project_id', projectId),
          supabase.from('locations').select('name, visual_description').eq('project_id', projectId),
        ]);

        const characters: Entity[] = (charactersRes.data || []).map(c => ({
          name: c.name,
          visual_description: c.visual_description || '',
          reference: generateReferenceName(c.name),
        }));

        const props: Entity[] = (propsRes.data || []).map(p => ({
          name: p.name,
          visual_description: p.visual_description || '',
          reference: generateReferenceName(p.name),
        }));

        const locations: Entity[] = (locationsRes.data || []).map(l => ({
          name: l.name,
          visual_description: l.visual_description || '',
          reference: generateReferenceName(l.name),
        }));

        if (characters.length > 0 || props.length > 0 || locations.length > 0) {
          send('info', `Reperage: ${characters.length} personnages, ${props.length} props, ${locations.length} decors`);
        }

        let totalShots = 0;

        // Generate shots for each scene
        for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex++) {
          const scene = scenes[sceneIndex];

          send('claude', `Claude genere les plans pour Scene ${scene.scene_number}: ${scene.location}...`);

          // Delete existing shots and script_elements for this scene
          const { data: existingShots } = await supabase
            .from('shots')
            .select('id')
            .eq('scene_id', scene.id);

          if (existingShots && existingShots.length > 0) {
            const shotIds = existingShots.map(s => s.id);
            await supabase.from('dialogues').delete().in('shot_id', shotIds);
            await supabase.from('actions').delete().in('shot_id', shotIds);
            await supabase.from('shots').delete().eq('scene_id', scene.id);
          }

          // Delete existing script_elements for this scene
          await supabase.from('script_elements').delete().eq('scene_id', scene.id);

          let elementSortOrder = 0;

          const sceneHeader = `SCÈNE ${scene.scene_number} - ${scene.int_ext}. ${scene.location} - ${scene.time_of_day}`;

          const prompt = buildPrompt(
            sceneHeader,
            scene.description || 'Pas de description',
            characters,
            props,
            locations
          );

          const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
          });

          const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

          let shotsData;
          try {
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            let jsonString = jsonMatch ? jsonMatch[1].trim() : responseText.trim();

            if (!jsonString.startsWith('{')) {
              const jsonStart = jsonString.indexOf('{');
              const jsonEnd = jsonString.lastIndexOf('}');
              if (jsonStart !== -1 && jsonEnd !== -1) {
                jsonString = jsonString.substring(jsonStart, jsonEnd + 1);
              }
            }

            shotsData = JSON.parse(jsonString);
          } catch {
            send('error', `Erreur parsing plans scene ${scene.scene_number}`);
            continue;
          }

          if (!shotsData.shots || !Array.isArray(shotsData.shots)) {
            send('error', `Pas de plans valides pour scene ${scene.scene_number}`);
            continue;
          }

          let sceneShotCount = 0;

          for (let j = 0; j < shotsData.shots.length; j++) {
            const shotData = shotsData.shots[j];

            const { data: shot, error: shotError } = await supabase
              .from('shots')
              .insert({
                scene_id: scene.id,
                shot_number: shotData.shot_number || j + 1,
                description: shotData.description || '',
                shot_type: validateShotType(shotData.shot_type),
                camera_angle: validateCameraAngle(shotData.camera_angle),
                camera_movement: validateCameraMovement(shotData.camera_movement),
                sort_order: j,
              })
              .select()
              .single();

            if (shotError) {
              continue;
            }

            sceneShotCount++;
            totalShots++;

            // Insert dialogues
            if (shotData.dialogues && Array.isArray(shotData.dialogues)) {
              for (let k = 0; k < shotData.dialogues.length; k++) {
                const dialogue = shotData.dialogues[k];
                if (dialogue.content) {
                  await supabase.from('dialogues').insert({
                    shot_id: shot.id,
                    character_name: (dialogue.character_name || 'PERSONNAGE').toUpperCase(),
                    content: dialogue.content,
                    parenthetical: dialogue.parenthetical || null,
                    sort_order: k,
                  });
                }
              }
            }

            // Insert actions
            if (shotData.actions && Array.isArray(shotData.actions)) {
              for (let k = 0; k < shotData.actions.length; k++) {
                const action = shotData.actions[k];
                if (action.content) {
                  await supabase.from('actions').insert({
                    shot_id: shot.id,
                    content: action.content,
                    sort_order: k,
                  });
                }
              }
            }

            // Also create script_elements for the script editor view
            // First, add action elements for the shot description and actions
            if (shotData.description) {
              await supabase.from('script_elements').insert({
                scene_id: scene.id,
                type: 'action',
                content: shotData.description,
                sort_order: elementSortOrder++,
              });
            }

            // Add action elements for each action
            if (shotData.actions && Array.isArray(shotData.actions)) {
              for (const action of shotData.actions) {
                if (action.content) {
                  await supabase.from('script_elements').insert({
                    scene_id: scene.id,
                    type: 'action',
                    content: action.content,
                    sort_order: elementSortOrder++,
                  });
                }
              }
            }

            // Add dialogue elements
            if (shotData.dialogues && Array.isArray(shotData.dialogues)) {
              for (const dialogue of shotData.dialogues) {
                if (dialogue.content) {
                  await supabase.from('script_elements').insert({
                    scene_id: scene.id,
                    type: 'dialogue',
                    content: dialogue.content,
                    character_name: (dialogue.character_name || 'PERSONNAGE').toUpperCase(),
                    parenthetical: dialogue.parenthetical || null,
                    sort_order: elementSortOrder++,
                  });
                }
              }
            }
          }

          send('success', `Scene ${scene.scene_number}: ${sceneShotCount} plans crees`);
        }

        // Update project step
        await supabase
          .from('projects')
          .update({ current_step: 'script' })
          .eq('id', projectId);

        send('done', `Generation terminee: ${totalShots} plans pour ${scenes.length} scenes`, {
          scenes_count: scenes.length,
          shots_count: totalShots,
        });

        controller.close();
      } catch (error) {
        const send = (type: string, message: string) => {
          const event = JSON.stringify({ type, message, timestamp: new Date().toISOString() });
          controller.enqueue(encoder.encode(`data: ${event}\n\n`));
        };
        send('error', error instanceof Error ? error.message : 'Erreur inconnue');
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
