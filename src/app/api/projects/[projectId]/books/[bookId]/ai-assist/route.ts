import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

interface RouteParams {
  params: Promise<{ projectId: string; bookId: string }>;
}

const anthropic = new Anthropic();

type AiAction = 'continue' | 'improve' | 'ideas';

const SYSTEM_PROMPT = `Tu es un assistant d'écriture littéraire expert. Tu aides les auteurs à:
- Continuer leur texte de manière fluide et cohérente
- Améliorer leur style et leur prose
- Générer des idées créatives pour débloquer l'écriture

Tu écris en français par défaut, sauf si le texte fourni est dans une autre langue.
Tu respectes le style et le ton de l'auteur.
Tu évites les clichés et les formulations génériques.`;

const ACTION_PROMPTS: Record<AiAction, string> = {
  continue: `Continue le texte suivant de manière naturelle et fluide. Écris environ 200-300 mots qui s'intègrent parfaitement à la suite du texte. Ne répète pas ce qui a déjà été écrit. Maintiens le style, le ton et la voix de l'auteur.

Texte à continuer:
---
{context}
---

Continuation:`,

  improve: `Réécris le dernier paragraphe du texte suivant pour l'améliorer. Rends-le plus vivant, plus précis, plus évocateur. Garde le sens général mais améliore le style, le rythme et les formulations.

Texte complet (réécris uniquement le dernier paragraphe):
---
{context}
---

Version améliorée du dernier paragraphe:`,

  ideas: `Basé sur le texte suivant, propose 3-5 idées créatives pour la suite de l'histoire. Chaque idée doit être développée en 2-3 phrases. Les idées doivent être variées: une pour l'intrigue, une pour le développement des personnages, une pour une scène d'action ou de dialogue, etc.

Texte actuel:
---
{context}
---

Idées pour continuer:`,
};

// POST /api/projects/[projectId]/books/[bookId]/ai-assist
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, bookId } = await params;
    const body = await request.json();
    const { action, context } = body as { action: AiAction; context: string };

    if (!action || !['continue', 'improve', 'ideas'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (!context || context.trim().length < 50) {
      return NextResponse.json(
        { error: 'Context too short. Need at least 50 characters.' },
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

    // Verify book exists
    const { data: book } = await supabase
      .from('books')
      .select('id, title')
      .eq('id', bookId)
      .eq('project_id', projectId)
      .single();

    if (!book) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    // Build prompt
    const userPrompt = ACTION_PROMPTS[action].replace('{context}', context);

    // Call Claude API
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    // Extract text from response
    const textContent = message.content.find((c) => c.type === 'text');
    const text = textContent && 'text' in textContent ? textContent.text : '';

    return NextResponse.json({ text });
  } catch (error) {
    console.error('AI assist error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
