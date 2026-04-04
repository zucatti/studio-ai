import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { createClaudeWrapper, extractTextContent, isCreditError, formatCreditError } from '@/lib/ai';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  suggestion?: ScriptSuggestion | null;
}

interface ScriptSuggestion {
  type: 'scene' | 'dialogue' | 'action' | 'transition' | 'full';
  content: string;
  targetScene?: number;
  position?: 'start' | 'end' | 'replace';
}

interface ExtractedEntity {
  type: 'character' | 'location';
  name: string;
  description?: string;
}

interface SceneInfo {
  number: number;
  heading: string;
}

const SYSTEM_PROMPT = `Tu es un scenariste professionnel et coach d'ecriture qui aide a construire des scripts de films/courts-metrages en format Fountain. Tu travailles de maniere conversationnelle, en posant des questions et en proposant du contenu structure.

## Ton approche
- Tu es creatif, enthousiaste et professionnel
- Tu guides l'utilisateur etape par etape dans la construction de son script
- Tu proposes du contenu concret et utilisable en format Fountain
- Tu t'adaptes au ton et au style souhaite par l'utilisateur

## Format Fountain (rappel)
- Scene heading: INT./EXT. LIEU - MOMENT (ex: INT. APPARTEMENT MARIE - JOUR)
- Action: Description en paragraphes (temps present)
- Dialogue: NOM DU PERSONNAGE en majuscules, suivi du texte
- Parenthetiques: (entre parentheses) pour les indications de jeu
- Transitions: CUT TO:, FADE OUT., etc.

## Format de reponse
Tu dois TOUJOURS repondre en JSON valide avec cette structure exacte :
{
  "response": "Ta reponse conversationnelle (questions, commentaires, conseils)",
  "suggestion": {
    "type": "scene|dialogue|action|transition|full",
    "content": "Le contenu Fountain a inserer",
    "targetScene": null ou numero de scene,
    "position": "end"
  } ou null si pas de suggestion,
  "extractedEntities": [
    {"type": "character", "name": "MARIE", "description": "Protagoniste, 30 ans"},
    {"type": "location", "name": "Appartement de Marie", "description": "Studio parisien"}
  ] ou []
}

## Regles pour les suggestions
- Propose une "suggestion" quand tu as assez d'infos pour ecrire du contenu Fountain
- type "scene" = nouveau scene heading + description
- type "dialogue" = bloc de dialogue complet
- type "action" = paragraphe d'action
- type "full" = scene complete avec actions et dialogues
- targetScene = numero de la scene cible (null = nouvelle scene)
- position = "end" pour ajouter a la fin, "start" pour le debut

## Regles pour les entites
- Detecte les personnages mentionnes et propose de les ajouter a la Bible
- Detecte les lieux importants et propose de les ajouter
- Ne re-propose pas des entites deja mentionnees

## Important
- Commence par comprendre le projet global avant de plonger dans les details
- Propose des scenes courtes et punchy pour commencer
- Encourage l'utilisateur a developper ses idees`;

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { messages, currentScript, scenes } = body as {
      messages: ChatMessage[];
      currentScript?: string;
      scenes?: SceneInfo[];
    };

    const supabase = createServerSupabaseClient();

    // Verify project ownership and get project info
    const { data: project } = await supabase
      .from('projects')
      .select('id, name, synopsis')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get existing characters and locations to avoid duplicates
    const [charactersRes, locationsRes] = await Promise.all([
      supabase.from('characters').select('name').eq('project_id', projectId),
      supabase.from('locations').select('name').eq('project_id', projectId),
    ]);

    const existingCharacters = (charactersRes.data || []).map(c => c.name.toLowerCase());
    const existingLocations = (locationsRes.data || []).map(l => l.name.toLowerCase());

    // Create Claude wrapper
    const claudeWrapper = createClaudeWrapper({
      userId: session.user.sub,
      supabase,
      operation: 'script-workshop-chat',
    });

    // Build contextual system prompt
    let contextualSystem = SYSTEM_PROMPT;

    contextualSystem += `\n\n## Contexte du projet
Nom du projet: ${project.name}`;

    if (project.synopsis) {
      contextualSystem += `\n\nSynopsis:\n${project.synopsis}`;
    }

    if (currentScript && currentScript.trim()) {
      contextualSystem += `\n\n## Script actuel (Fountain)
---
${currentScript}
---`;
    }

    if (scenes && scenes.length > 0) {
      contextualSystem += `\n\n## Scenes existantes
${scenes.map(s => `- Scene ${s.number}: ${s.heading}`).join('\n')}`;
    }

    if (existingCharacters.length > 0) {
      contextualSystem += `\n\n## Personnages deja dans la Bible
${existingCharacters.join(', ')}
(Ne pas les re-proposer dans extractedEntities)`;
    }

    if (existingLocations.length > 0) {
      contextualSystem += `\n\n## Lieux deja dans la Bible
${existingLocations.join(', ')}
(Ne pas les re-proposer dans extractedEntities)`;
    }

    // Prepare messages for API
    const apiMessages = messages.length === 0
      ? [{ role: 'user' as const, content: 'Salut ! Je veux ecrire le script de mon projet. Par ou on commence ?' }]
      : messages.map(m => ({ role: m.role, content: m.content }));

    const result = await claudeWrapper.createMessage({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: contextualSystem,
      messages: apiMessages,
    });

    const rawResponse = extractTextContent(result.message);

    // Parse JSON response
    let parsedResponse: {
      response: string;
      suggestion: ScriptSuggestion | null;
      extractedEntities: ExtractedEntity[];
    };

    try {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        parsedResponse = {
          response: rawResponse,
          suggestion: null,
          extractedEntities: [],
        };
      }
    } catch {
      parsedResponse = {
        response: rawResponse,
        suggestion: null,
        extractedEntities: [],
      };
    }

    // Filter out already existing entities
    const newEntities = (parsedResponse.extractedEntities || []).filter(entity => {
      const nameLower = entity.name.toLowerCase();
      if (entity.type === 'character') {
        return !existingCharacters.includes(nameLower);
      } else {
        return !existingLocations.includes(nameLower);
      }
    });

    // Save chat to database
    const timestampedMessages: ChatMessage[] = [
      ...messages.map(m => ({
        ...m,
        timestamp: m.timestamp || new Date().toISOString(),
      })),
    ];

    if (messages.length === 0) {
      timestampedMessages.push({
        role: 'user',
        content: 'Salut ! Je veux ecrire le script de mon projet. Par ou on commence ?',
        timestamp: new Date().toISOString(),
      });
    }

    timestampedMessages.push({
      role: 'assistant',
      content: parsedResponse.response,
      suggestion: parsedResponse.suggestion,
      timestamp: new Date().toISOString(),
    });

    await supabase
      .from('projects')
      .update({ script_workshop_messages: timestampedMessages })
      .eq('id', projectId);

    return NextResponse.json({
      success: true,
      message: parsedResponse.response,
      suggestion: parsedResponse.suggestion,
      extractedEntities: newEntities,
    });
  } catch (error) {
    console.error('Error in script workshop chat:', error);

    if (isCreditError(error)) {
      return NextResponse.json(
        { error: formatCreditError(error), code: error.code },
        { status: 402 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to get response' },
      { status: 500 }
    );
  }
}
