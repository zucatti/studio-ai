import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { logClaudeUsage } from '@/lib/ai/log-api-usage';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

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
- Les personnages mentionnés avec @NomDuPersonnage pour les identifier

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
      "description": "@Marie traverse la clairière brumeuse. Elle porte un manteau sombre et tient une lanterne. Le sol est couvert de feuilles mortes qui craquent sous ses pas.\\n\\nElle s'arrête devant un vieux chêne et regarde autour d'elle, cherchant quelque chose - ou quelqu'un."
    }
  ]
}

## Règles

1. **Descriptions narratives** : Écris comme un roman, pas comme un script technique. Décris l'ambiance, les émotions, ce que font les personnages.

2. **@Mentions** : Utilise @NomDuPersonnage la première fois qu'un personnage apparaît dans une scène.

3. **Lieux** : Toujours en MAJUSCULES (CAFÉ, APPARTEMENT - SALON, RUE - PARIS)

4. **Pas de détails techniques** : Pas d'angles de caméra, pas de types de plans. Juste la narration.

5. **Structure** : Découpe logiquement selon les changements de lieu ou de temps.

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
        { error: 'Le brainstorming est vide. Ajoutez du contenu avant de générer le synopsis.' },
        { status: 400 }
      );
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: process.env.AI_CLAUDE_KEY,
    });

    // Generate synopsis with Claude
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: SYNOPSIS_GENERATION_PROMPT + brainstorming.content,
        },
      ],
    });

    // Log API usage
    logClaudeUsage({
      operation: 'generate-synopsis',
      model: 'claude-sonnet-4-20250514',
      inputTokens: message.usage?.input_tokens || 0,
      outputTokens: message.usage?.output_tokens || 0,
      projectId,
    }).catch(console.error);

    // Extract the text response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse JSON from response
    let synopsisData;
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

      synopsisData = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Failed to parse synopsis JSON:', parseError);
      return NextResponse.json(
        { error: 'Erreur lors du parsing du synopsis généré.' },
        { status: 500 }
      );
    }

    if (!synopsisData.scenes || !Array.isArray(synopsisData.scenes)) {
      return NextResponse.json(
        { error: 'Le synopsis généré ne contient pas de scènes valides.' },
        { status: 500 }
      );
    }

    // Delete existing scenes (and their shots via cascade will be handled by generate-script-from-synopsis)
    const { data: existingScenes } = await supabase
      .from('scenes')
      .select('id')
      .eq('project_id', projectId);

    if (existingScenes && existingScenes.length > 0) {
      const sceneIds = existingScenes.map(s => s.id);

      // Delete related data
      const { data: existingShots } = await supabase
        .from('shots')
        .select('id')
        .in('scene_id', sceneIds);

      if (existingShots && existingShots.length > 0) {
        const shotIds = existingShots.map(s => s.id);
        await supabase.from('dialogues').delete().in('shot_id', shotIds);
        await supabase.from('actions').delete().in('shot_id', shotIds);
        await supabase.from('shots').delete().in('scene_id', sceneIds);
      }

      await supabase.from('scenes').delete().eq('project_id', projectId);
    }

    // Insert new synopsis scenes
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

      if (error) {
        console.error('Error inserting scene:', error);
        continue;
      }

      savedScenes.push(scene);
    }

    // Update project step
    await supabase
      .from('projects')
      .update({ current_step: 'synopsis', status: 'in_progress' })
      .eq('id', projectId);

    return NextResponse.json({
      success: true,
      scenes: savedScenes,
      message: `Synopsis généré avec ${savedScenes.length} scènes`,
    });
  } catch (error) {
    console.error('Error generating synopsis:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la génération du synopsis' },
      { status: 500 }
    );
  }
}
