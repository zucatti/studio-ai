import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

interface ExtractedCharacter {
  name: string;
  description: string;
  visual_description: string;
  age?: string;
  gender?: string;
}

interface ExtractedProp {
  name: string;
  type: 'object' | 'vehicle' | 'furniture' | 'weapon' | 'food' | 'other';
  visual_description: string;
}

interface ExtractedLocation {
  name: string;
  type: 'interior' | 'exterior';
  visual_description: string;
  lighting?: string;
  mood?: string;
}

interface ExtractionResult {
  characters: ExtractedCharacter[];
  props: ExtractedProp[];
  locations: ExtractedLocation[];
}

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

    // Get scenes with shots, dialogues, actions
    const { data: scenes } = await supabase
      .from('scenes')
      .select(`
        *,
        shots (
          *,
          dialogues (*),
          actions (*)
        )
      `)
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });

    if ((!brainstorming?.content || brainstorming.content.trim() === '') && (!scenes || scenes.length === 0)) {
      return NextResponse.json(
        { error: 'Aucun contenu à analyser. Créez d\'abord un brainstorming ou un script.' },
        { status: 400 }
      );
    }

    // Build content for analysis
    let contentToAnalyze = '';

    if (brainstorming?.content) {
      contentToAnalyze += `=== BRAINSTORMING ===\n${brainstorming.content}\n\n`;
    }

    if (scenes && scenes.length > 0) {
      contentToAnalyze += '=== SCRIPT ===\n';
      for (const scene of scenes) {
        contentToAnalyze += `\nSCÈNE ${scene.scene_number}: ${scene.int_ext}. ${scene.location} - ${scene.time_of_day}\n`;
        if (scene.description) {
          contentToAnalyze += `Description: ${scene.description}\n`;
        }

        for (const shot of scene.shots || []) {
          contentToAnalyze += `  Plan ${shot.shot_number}: ${shot.description}\n`;

          for (const dialogue of shot.dialogues || []) {
            contentToAnalyze += `    ${dialogue.character_name}: "${dialogue.content}"\n`;
          }

          for (const action of shot.actions || []) {
            contentToAnalyze += `    [Action] ${action.content}\n`;
          }
        }
      }
    }

    // Check API key
    if (!process.env.AI_CLAUDE_KEY) {
      return NextResponse.json({ error: 'Claude API key not configured' }, { status: 500 });
    }

    const anthropic = new Anthropic({
      apiKey: process.env.AI_CLAUDE_KEY,
    });

    console.log('Extracting inventory with Claude...');

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: `Tu es un assistant spécialisé dans l'analyse de scripts de films.

Analyse le contenu suivant et extrais :
1. Les PERSONNAGES (characters) - tous les personnages mentionnés
2. Les ACCESSOIRES/OBJETS (props) - objets importants, véhicules, armes, etc.
3. Les LIEUX (locations) - décors et environnements

Pour chaque élément, fournis une description visuelle détaillée qui pourrait être utilisée pour générer une image.

CONTENU À ANALYSER:
${contentToAnalyze}

Réponds UNIQUEMENT avec un JSON valide (sans markdown, sans \`\`\`json) au format suivant:
{
  "characters": [
    {
      "name": "Nom du personnage",
      "description": "Description du rôle et de la personnalité",
      "visual_description": "Description physique détaillée pour génération d'image: apparence, vêtements, traits distinctifs",
      "age": "tranche d'âge estimée",
      "gender": "homme/femme/autre"
    }
  ],
  "props": [
    {
      "name": "Nom de l'objet",
      "type": "object|vehicle|furniture|weapon|food|other",
      "visual_description": "Description visuelle détaillée de l'objet"
    }
  ],
  "locations": [
    {
      "name": "Nom du lieu",
      "type": "interior|exterior",
      "visual_description": "Description visuelle détaillée du lieu",
      "lighting": "Description de l'éclairage",
      "mood": "Ambiance générale"
    }
  ]
}

Important:
- N'invente pas d'éléments non mentionnés dans le contenu
- Les descriptions visuelles doivent être précises et exploitables pour la génération d'images
- Si un personnage n'a pas de description physique dans le script, déduis-la du contexte ou laisse une description générique
- Réponds UNIQUEMENT avec le JSON, rien d'autre`,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      return NextResponse.json({ error: 'Invalid response from Claude' }, { status: 500 });
    }

    let extraction: ExtractionResult;
    try {
      extraction = JSON.parse(content.text);
    } catch (e) {
      console.error('Failed to parse Claude response:', content.text);
      return NextResponse.json({ error: 'Failed to parse extraction result' }, { status: 500 });
    }

    console.log(`Extracted: ${extraction.characters.length} characters, ${extraction.props.length} props, ${extraction.locations.length} locations`);

    // Return extraction for manual validation (don't save yet)
    return NextResponse.json({
      success: true,
      extraction,
      message: `Extraction terminée: ${extraction.characters.length} personnages, ${extraction.props.length} accessoires, ${extraction.locations.length} lieux`,
    });
  } catch (error) {
    console.error('Error extracting inventory:', error);
    return NextResponse.json(
      { error: 'Failed to extract inventory: ' + String(error) },
      { status: 500 }
    );
  }
}
