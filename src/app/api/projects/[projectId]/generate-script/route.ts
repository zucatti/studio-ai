import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// Valid enum values from database schema
const VALID_INT_EXT = ['INT', 'EXT', 'INT/EXT'] as const;
const VALID_TIME_OF_DAY = ['JOUR', 'NUIT', 'AUBE', 'CREPUSCULE'] as const;
const VALID_SHOT_TYPES = ['wide', 'medium', 'close_up', 'extreme_close_up', 'over_shoulder', 'pov'] as const;
const VALID_CAMERA_ANGLES = ['eye_level', 'low_angle', 'high_angle', 'dutch_angle', 'birds_eye', 'worms_eye'] as const;
const VALID_CAMERA_MOVEMENTS = ['static', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'dolly_in', 'dolly_out', 'tracking', 'crane', 'handheld'] as const;

// Validation helpers
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

function validateShotType(value: string): typeof VALID_SHOT_TYPES[number] | null {
  const lower = value?.toLowerCase?.() || '';
  if (VALID_SHOT_TYPES.includes(lower as typeof VALID_SHOT_TYPES[number])) {
    return lower as typeof VALID_SHOT_TYPES[number];
  }
  return 'medium';
}

function validateCameraAngle(value: string): typeof VALID_CAMERA_ANGLES[number] | null {
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

const SCRIPT_GENERATION_PROMPT = `Tu es un scénariste professionnel spécialisé dans l'écriture de scripts pour la production vidéo IA.

À partir du brainstorming fourni, génère un script structuré au format JSON. Le script doit être découpé en SCÈNES, et chaque scène en PLANS (shots).

## IMPORTANT : Valeurs strictes à utiliser

Tu DOIS utiliser UNIQUEMENT ces valeurs exactes (en respectant la casse) :

### Pour int_ext (lieu intérieur/extérieur) :
- "INT" (intérieur)
- "EXT" (extérieur)
- "INT/EXT" (les deux)

### Pour time_of_day (moment de la journée) :
- "JOUR"
- "NUIT"
- "AUBE"
- "CREPUSCULE"

### Pour shot_type (type de plan) :
- "wide" (plan large/général)
- "medium" (plan moyen/américain)
- "close_up" (gros plan)
- "extreme_close_up" (très gros plan/insert)
- "over_shoulder" (par-dessus l'épaule)
- "pov" (point de vue subjectif)

### Pour camera_angle (angle de caméra) :
- "eye_level" (hauteur des yeux)
- "low_angle" (contre-plongée)
- "high_angle" (plongée)
- "dutch_angle" (angle hollandais/penché)
- "birds_eye" (vue aérienne/zénithale)
- "worms_eye" (contre-plongée extrême)

### Pour camera_movement (mouvement de caméra) :
- "static" (caméra fixe)
- "pan_left" (panoramique gauche)
- "pan_right" (panoramique droite)
- "tilt_up" (tilt vers le haut)
- "tilt_down" (tilt vers le bas)
- "dolly_in" (travelling avant)
- "dolly_out" (travelling arrière)
- "tracking" (travelling latéral)
- "crane" (mouvement de grue)
- "handheld" (caméra portée/épaule)

## Format JSON de sortie

Réponds UNIQUEMENT avec le JSON, sans aucun texte avant ou après :

{
  "scenes": [
    {
      "scene_number": 1,
      "int_ext": "INT",
      "location": "APPARTEMENT - SALON",
      "time_of_day": "JOUR",
      "description": "Description générale de ce qui se passe dans la scène",
      "shots": [
        {
          "shot_number": 1,
          "description": "Description visuelle détaillée pour l'IA de génération vidéo. Inclure : les personnages présents et leur apparence, ce qu'ils font, l'environnement visible, l'éclairage, l'ambiance, les couleurs dominantes.",
          "shot_type": "medium",
          "camera_angle": "eye_level",
          "camera_movement": "static",
          "dialogues": [
            {
              "character_name": "MARIE",
              "content": "Le texte du dialogue.",
              "parenthetical": "(doucement)"
            }
          ],
          "actions": [
            {
              "content": "Marie se lève et s'approche de la fenêtre."
            }
          ]
        }
      ]
    }
  ]
}

## Règles de création

1. **Descriptions de plans** : Chaque description doit être suffisamment riche et visuelle pour qu'une IA de génération vidéo puisse créer l'image. Décris précisément :
   - Les personnages : apparence physique, vêtements, expressions
   - L'environnement : décor, objets, éclairage, couleurs
   - L'action : ce qui se passe visuellement
   - L'ambiance : atmosphère, mood

2. **Découpage** : Change de plan quand l'angle change, un nouveau personnage apparaît, ou pour accentuer une émotion.

3. **Location** : Toujours en MAJUSCULES (ex: "CAFÉ - TERRASSE", "FORÊT - CLAIRIÈRE")

4. **Dialogues** : Noms de personnages en MAJUSCULES. Les parenthétiques sont optionnelles.

5. **Actions** : Décris les actions de façon visuelle et dynamique.

6. **Structure** : Vise 3-8 plans par scène pour une vidéo courte.

## Brainstorming à transformer :

`;

export async function POST(request: Request, { params }: RouteParams) {
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
      .select('id, name')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get brainstorming content
    const { data: brainstorming } = await supabase
      .from('brainstorming')
      .select('content')
      .eq('project_id', projectId)
      .single();

    if (!brainstorming?.content || brainstorming.content.trim() === '') {
      return NextResponse.json(
        { error: 'Le brainstorming est vide. Ajoutez du contenu avant de générer le script.' },
        { status: 400 }
      );
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: process.env.AI_CLAUDE_KEY,
    });

    // Generate script with Claude
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: SCRIPT_GENERATION_PROMPT + brainstorming.content,
        },
      ],
    });

    // Extract the text response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse JSON from response (handle markdown code blocks)
    let scriptData;
    try {
      // Try to extract JSON from markdown code block first
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      let jsonString = jsonMatch ? jsonMatch[1].trim() : responseText.trim();

      // If still not valid JSON, try to find JSON object
      if (!jsonString.startsWith('{')) {
        const jsonStart = jsonString.indexOf('{');
        const jsonEnd = jsonString.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          jsonString = jsonString.substring(jsonStart, jsonEnd + 1);
        }
      }

      scriptData = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Failed to parse script JSON:', parseError);
      console.error('Response text:', responseText.substring(0, 500));
      return NextResponse.json(
        { error: 'Erreur lors du parsing du script généré. Veuillez réessayer.' },
        { status: 500 }
      );
    }

    // Validate that we have scenes
    if (!scriptData.scenes || !Array.isArray(scriptData.scenes) || scriptData.scenes.length === 0) {
      return NextResponse.json(
        { error: 'Le script généré ne contient pas de scènes valides.' },
        { status: 500 }
      );
    }

    // Delete existing scenes and shots for this project
    const { data: existingScenes } = await supabase
      .from('scenes')
      .select('id')
      .eq('project_id', projectId);

    if (existingScenes && existingScenes.length > 0) {
      const sceneIds = existingScenes.map((s) => s.id);

      // Delete dialogues and actions for all shots in these scenes
      const { data: existingShots } = await supabase
        .from('shots')
        .select('id')
        .in('scene_id', sceneIds);

      if (existingShots && existingShots.length > 0) {
        const shotIds = existingShots.map((s) => s.id);
        await supabase.from('dialogues').delete().in('shot_id', shotIds);
        await supabase.from('actions').delete().in('shot_id', shotIds);
      }

      await supabase.from('shots').delete().in('scene_id', sceneIds);
      await supabase.from('scenes').delete().eq('project_id', projectId);
    }

    // Insert new scenes and shots with validation
    let totalShots = 0;

    for (let i = 0; i < scriptData.scenes.length; i++) {
      const sceneData = scriptData.scenes[i];

      // Validate and sanitize scene data
      const validatedScene = {
        project_id: projectId,
        scene_number: sceneData.scene_number || i + 1,
        int_ext: validateIntExt(sceneData.int_ext),
        location: (sceneData.location || 'LIEU NON DÉFINI').toUpperCase(),
        time_of_day: validateTimeOfDay(sceneData.time_of_day),
        description: sceneData.description || '',
        sort_order: i,
      };

      // Insert scene
      const { data: scene, error: sceneError } = await supabase
        .from('scenes')
        .insert(validatedScene)
        .select()
        .single();

      if (sceneError) {
        console.error('Error inserting scene:', sceneError);
        continue;
      }

      // Insert shots for this scene
      if (sceneData.shots && Array.isArray(sceneData.shots)) {
        for (let j = 0; j < sceneData.shots.length; j++) {
          const shotData = sceneData.shots[j];

          // Validate and sanitize shot data
          const validatedShot = {
            scene_id: scene.id,
            shot_number: shotData.shot_number || j + 1,
            description: shotData.description || '',
            shot_type: validateShotType(shotData.shot_type),
            camera_angle: validateCameraAngle(shotData.camera_angle),
            camera_movement: validateCameraMovement(shotData.camera_movement),
            sort_order: j,
          };

          const { data: shot, error: shotError } = await supabase
            .from('shots')
            .insert(validatedShot)
            .select()
            .single();

          if (shotError) {
            console.error('Error inserting shot:', shotError);
            continue;
          }

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
        }
      }
    }

    // Update project current step to 'script'
    await supabase
      .from('projects')
      .update({ current_step: 'script', status: 'in_progress' })
      .eq('id', projectId);

    return NextResponse.json({
      success: true,
      message: 'Script généré avec succès',
      scenes_count: scriptData.scenes.length,
      shots_count: totalShots,
    });
  } catch (error) {
    console.error('Error generating script:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la génération du script' },
      { status: 500 }
    );
  }
}
