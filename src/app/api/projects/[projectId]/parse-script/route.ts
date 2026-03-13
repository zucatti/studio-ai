import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

const anthropic = new Anthropic();

// POST /api/projects/[projectId]/parse-script - Parse free text into structured elements
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { sceneId, content } = body;

    if (!sceneId || !content) {
      return NextResponse.json(
        { error: 'sceneId and content are required' },
        { status: 400 }
      );
    }

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

    // Verify scene belongs to project
    const { data: scene } = await supabase
      .from('scenes')
      .select('id')
      .eq('id', sceneId)
      .eq('project_id', projectId)
      .single();

    if (!scene) {
      return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
    }

    // Get existing characters for reference
    const { data: characters } = await supabase
      .from('characters')
      .select('id, name')
      .eq('project_id', projectId);

    const characterNames = characters?.map((c) => c.name) || [];

    // Use Claude to parse the free text
    const systemPrompt = `Tu es un assistant specialise dans l'analyse de scenarios cinematographiques.
Tu recois du texte brut et tu dois l'organiser en elements structures.

Types d'elements possibles:
- "action": Description d'action/scene (texte descriptif)
- "dialogue": Parole d'un personnage (format: NOM DU PERSONNAGE + texte)
- "transition": Transition cinematographique (CUT TO:, FONDU, etc.)
- "note": Note ou commentaire du scenariste

Pour les dialogues, identifie:
- character_name: Le nom du personnage (en MAJUSCULES)
- extension: V.O., O.S., CONT'D, FILTERED, PRE-LAP (si present)
- parenthetical: Indication de jeu entre parentheses (si presente)
- content: Le texte du dialogue

Personnages connus dans ce projet: ${characterNames.join(', ') || 'Aucun'}

Reponds UNIQUEMENT avec un JSON valide de la forme:
{
  "elements": [
    {
      "type": "action|dialogue|transition|note",
      "content": "...",
      "character_name": "NOM" (pour dialogues),
      "extension": "V.O." (si applicable),
      "parenthetical": "indication" (si applicable)
    }
  ]
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Analyse et structure ce texte de scenario:\n\n${content}`,
        },
      ],
    });

    // Extract JSON from response
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 });
    }

    let parsedElements;
    try {
      // Try to find JSON in the response
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedElements = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      return NextResponse.json(
        { error: 'Failed to parse AI response' },
        { status: 500 }
      );
    }

    if (!parsedElements.elements || !Array.isArray(parsedElements.elements)) {
      return NextResponse.json(
        { error: 'Invalid response format' },
        { status: 500 }
      );
    }

    // Delete existing elements for this scene
    await supabase
      .from('script_elements')
      .delete()
      .eq('scene_id', sceneId);

    // Insert new elements
    const elementsToInsert = parsedElements.elements.map(
      (el: Record<string, unknown>, index: number) => {
        // Try to match character to existing character
        let characterId = null;
        if (el.type === 'dialogue' && el.character_name) {
          const matchedChar = characters?.find(
            (c) =>
              c.name.toLowerCase() === String(el.character_name).toLowerCase()
          );
          if (matchedChar) {
            characterId = matchedChar.id;
          }
        }

        return {
          scene_id: sceneId,
          type: el.type,
          content: el.content || '',
          character_id: characterId,
          character_name: el.character_name || null,
          parenthetical: el.parenthetical || null,
          extension: el.extension || null,
          sort_order: index,
        };
      }
    );

    const { data: insertedElements, error: insertError } = await supabase
      .from('script_elements')
      .insert(elementsToInsert)
      .select();

    if (insertError) {
      console.error('Error inserting elements:', insertError);
      return NextResponse.json(
        { error: 'Failed to save elements' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: insertedElements?.length || 0,
      elements: insertedElements,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
