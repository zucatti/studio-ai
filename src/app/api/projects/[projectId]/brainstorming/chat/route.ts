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
}

// Canvas of questions to guide the brainstorming
const QUESTION_CANVAS = [
  { id: 'pitch', question: "C'est quoi ton projet en une phrase ?", keywords: ['concept', 'idée', 'histoire', 'pitch'] },
  { id: 'emotion', question: "Quelle émotion tu veux que le spectateur ressente ?", keywords: ['émotion', 'ressenti', 'sentiment', 'feeling'] },
  { id: 'audience', question: "C'est pour qui ? Qui va regarder ça ?", keywords: ['public', 'audience', 'cible', 'spectateur'] },
  { id: 'format', question: "Tu vois ça comment ? Court/long ? Rythmé/contemplatif ?", keywords: ['format', 'durée', 'rythme', 'tempo'] },
  { id: 'characters', question: "Il y a des personnages ? Parle-moi d'eux", keywords: ['personnage', 'character', 'protagoniste', 'héros'] },
  { id: 'visual', question: "Tu as des références visuelles ? Un style en tête ?", keywords: ['visuel', 'style', 'esthétique', 'référence', 'couleur'] },
  { id: 'tone', question: "C'est plutôt sérieux, décalé, poétique ?", keywords: ['ton', 'ambiance', 'mood', 'atmosphère'] },
  { id: 'constraints', question: "Il y a des contraintes techniques ou de budget ?", keywords: ['contrainte', 'budget', 'technique', 'limite'] },
];

const SYSTEM_PROMPT = `Tu es un consultant créatif expérimenté qui aide à développer des projets vidéo. Tu travailles en mode interview : tu poses UNE SEULE question à la fois pour guider l'utilisateur dans son brainstorming.

## Ton approche
- Tu es bienveillant, enthousiaste mais professionnel
- Tu poses des questions ouvertes qui stimulent la créativité
- Tu reformules et valides ce que l'utilisateur dit pour montrer que tu comprends
- Tu suggères des pistes quand l'utilisateur bloque, sans imposer

## Canvas de questions (à couvrir progressivement)
${QUESTION_CANVAS.map((q, i) => `${i + 1}. ${q.question}`).join('\n')}

## Format de réponse
Tu dois TOUJOURS répondre en JSON valide avec cette structure exacte :
{
  "response": "Ta réponse textuelle ici (réaction + question suivante)",
  "suggestion": "Contenu à ajouter au brainstorming (optionnel, null si rien à ajouter)",
  "coveredTopics": ["pitch", "emotion"] // IDs des sujets déjà couverts dans la conversation
}

## Règles pour les suggestions
- Propose une "suggestion" quand l'utilisateur donne une info substantielle à garder
- La suggestion doit être formatée en Markdown propre (## titres, - listes)
- Ne suggère PAS de contenu vide ou redondant
- Si rien de nouveau à ajouter, mets null

## Important
- Une seule question par message
- Après avoir couvert 5-6 sujets, propose de faire une synthèse globale
- Adapte-toi si l'utilisateur veut changer de sujet`;

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { messages, brainstormingContent } = body as {
      messages: ChatMessage[];
      brainstormingContent?: string;
    };

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

    // Create Claude wrapper with credit management
    const claudeWrapper = createClaudeWrapper({
      userId: session.user.sub,
      supabase,
      operation: 'brainstorming-chat',
    });

    // Build context with current brainstorming if available
    let contextualSystem = SYSTEM_PROMPT;
    if (brainstormingContent?.trim()) {
      contextualSystem += `\n\n## Contexte actuel du brainstorming
L'utilisateur a déjà noté ceci dans sa zone de brainstorming :
---
${brainstormingContent}
---
Tiens compte de ces éléments. Mets à jour "coveredTopics" en fonction de ce qui est déjà présent.`;
    }

    // If no messages yet, start the conversation
    const apiMessages = messages.length === 0
      ? [{ role: 'user' as const, content: 'Salut, je veux développer un projet vidéo.' }]
      : messages.map(m => ({ role: m.role, content: m.content }));

    const result = await claudeWrapper.createMessage({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: contextualSystem,
      messages: apiMessages,
    });

    const rawResponse = extractTextContent(result.message);

    // Parse JSON response
    let parsedResponse: {
      response: string;
      suggestion: string | null;
      coveredTopics: string[];
    };

    try {
      // Try to extract JSON from the response
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback if no JSON found
        parsedResponse = {
          response: rawResponse,
          suggestion: null,
          coveredTopics: [],
        };
      }
    } catch {
      // If JSON parsing fails, use raw response
      parsedResponse = {
        response: rawResponse,
        suggestion: null,
        coveredTopics: [],
      };
    }

    // Calculate remaining topics
    const remainingTopics = QUESTION_CANVAS.filter(
      q => !parsedResponse.coveredTopics.includes(q.id)
    );

    // Save chat to database
    const timestampedMessages: ChatMessage[] = [
      ...messages.map(m => ({ ...m, timestamp: m.timestamp || new Date().toISOString() })),
    ];

    // Add the new messages
    if (messages.length === 0) {
      timestampedMessages.push({
        role: 'user',
        content: 'Salut, je veux développer un projet vidéo.',
        timestamp: new Date().toISOString(),
      });
    }
    timestampedMessages.push({
      role: 'assistant',
      content: parsedResponse.response,
      timestamp: new Date().toISOString(),
    });

    // Update chat in database
    await supabase
      .from('brainstorming')
      .update({ chat_messages: timestampedMessages })
      .eq('project_id', projectId);

    return NextResponse.json({
      success: true,
      message: parsedResponse.response,
      suggestion: parsedResponse.suggestion,
      coveredTopics: parsedResponse.coveredTopics,
      remainingTopics: remainingTopics.map(t => t.id),
      questionCanvas: QUESTION_CANVAS,
    });
  } catch (error) {
    console.error('Error in brainstorming chat:', error);

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
