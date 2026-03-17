import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { createClaudeWrapper, extractTextContent, isCreditError, formatCreditError } from '@/lib/ai';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

type AssistAction = 'ideas' | 'develop' | 'alternatives' | 'structure' | 'challenge';

const ACTION_PROMPTS: Record<AssistAction, string> = {
  ideas: `Tu es un assistant créatif pour l'écriture de scénarios vidéo.

Basé sur le brainstorming ci-dessous, propose 3-5 nouvelles idées créatives qui pourraient enrichir le projet.
Sois original, surprenant, mais reste cohérent avec le ton et le style suggérés.

Format ta réponse en bullet points avec des idées concises mais inspirantes.`,

  develop: `Tu es un assistant créatif pour l'écriture de scénarios vidéo.

Développe et enrichis le contenu ci-dessous. Ajoute des détails, des nuances, des éléments visuels ou narratifs qui pourraient renforcer l'idée.

Si du texte est sélectionné, concentre-toi sur ce passage. Sinon, développe les points les plus prometteurs du brainstorming.`,

  alternatives: `Tu es un assistant créatif pour l'écriture de scénarios vidéo.

Propose 2-3 alternatives ou variations au contenu ci-dessous. Explore des angles différents, des approches opposées, ou des twists inattendus.

Chaque alternative doit être distincte et offrir une nouvelle perspective sur le projet.`,

  structure: `Tu es un assistant créatif pour l'écriture de scénarios vidéo.

Aide à structurer et organiser le brainstorming ci-dessous. Propose une structure claire avec :
- Les éléments clés identifiés
- Une organisation logique des idées
- Les points à développer davantage
- Les questions à résoudre

Utilise des titres et sous-titres en Markdown.`,

  challenge: `Tu es un assistant créatif mais critique pour l'écriture de scénarios vidéo.

Analyse le brainstorming ci-dessous de manière constructive :
- Identifie les faiblesses ou les clichés potentiels
- Pose des questions qui poussent à approfondir
- Suggère des améliorations concrètes

Sois bienveillant mais honnête - le but est d'améliorer le projet.`,
};

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { action, content, selectedText } = body as {
      action: AssistAction;
      content: string;
      selectedText?: string;
    };

    if (!action || !ACTION_PROMPTS[action]) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (!content?.trim()) {
      return NextResponse.json({ error: 'No content provided' }, { status: 400 });
    }

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
      operation: `brainstorming-assist-${action}`,
    });

    // Build the prompt
    const systemPrompt = ACTION_PROMPTS[action];
    const userContent = selectedText
      ? `## Brainstorming complet:\n${content}\n\n## Texte sélectionné (à traiter en priorité):\n${selectedText}`
      : content;

    const result = await claudeWrapper.createMessage({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: `${systemPrompt}\n\n---\n\n${userContent}`,
        },
      ],
    });

    const suggestion = extractTextContent(result.message);

    return NextResponse.json({
      success: true,
      suggestion,
      action,
    });
  } catch (error) {
    console.error('Error in brainstorming assist:', error);

    if (isCreditError(error)) {
      return NextResponse.json(
        { error: formatCreditError(error), code: error.code },
        { status: 402 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate suggestion' },
      { status: 500 }
    );
  }
}
