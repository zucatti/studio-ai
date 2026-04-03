import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.AI_ANTHROPIC || process.env.AI_CLAUDE_KEY,
});

// Language display names for prompts
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
};

interface TranslateDialogueRequest {
  text: string;
  from: string;
  to: string;
  context?: {
    characterName?: string;
    tone?: string;
    sceneContext?: string;
    emotion?: string;
  };
}

/**
 * POST /api/translate-dialogue
 * Translate dialogue using Claude while preserving character voice and tone
 */
export async function POST(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: TranslateDialogueRequest = await request.json();
    const { text, from, to, context } = body;

    // Validate required fields
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    if (!from || !to) {
      return NextResponse.json(
        { error: 'Source (from) and target (to) languages are required' },
        { status: 400 }
      );
    }

    // Handle auto-detection: if from is "auto", let Claude detect the language
    const isAutoDetect = from === 'auto';

    if (!isAutoDetect && from === to) {
      // No translation needed
      return NextResponse.json({ translation: text, unchanged: true });
    }

    const sourceLang = isAutoDetect ? null : (LANGUAGE_NAMES[from] || from);
    const targetLang = LANGUAGE_NAMES[to] || to;

    // Build context section for the prompt
    const contextParts: string[] = [];
    if (context?.characterName) {
      contextParts.push(`Character: ${context.characterName}`);
    }
    if (context?.tone) {
      contextParts.push(`Tone: ${context.tone}`);
    }
    if (context?.emotion) {
      contextParts.push(`Emotion: ${context.emotion}`);
    }
    if (context?.sceneContext) {
      contextParts.push(`Scene: ${context.sceneContext}`);
    }

    const contextSection =
      contextParts.length > 0
        ? `\nContext:\n${contextParts.join('\n')}\n`
        : '';

    // Optimized prompt for dialogue translation
    const systemPrompt = `You are an expert dialogue translator for film and video production. Your task is to translate dialogue while:

1. PRESERVING THE CHARACTER'S VOICE - Maintain their unique way of speaking, vocabulary level, and speech patterns
2. PRESERVING THE TONE - Keep the emotional quality (warm, cold, sarcastic, fearful, etc.)
3. PRESERVING THE TIMING - Keep roughly the same syllable count and rhythm when possible (important for lip-sync)
4. NATURAL SPEECH - Translate idioms and expressions into natural equivalents, not literal translations
5. CONTRACTIONS - Use natural contractions and spoken language patterns for the target language

Respond with ONLY the translated dialogue, nothing else. No quotes, no explanation, just the translation.`;

    const sourceDescription = sourceLang ? `${sourceLang} ` : '';
    const userPrompt = `Translate this ${sourceDescription}dialogue into ${targetLang}:
${contextSection}
Dialogue:
"${text}"

Translated dialogue:`;

    // Use Haiku for speed and cost efficiency (translation is fast)
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    // Extract the translation
    const responseText =
      response.content[0].type === 'text' ? response.content[0].text : '';

    // Clean up the response (remove any accidental quotes or whitespace)
    let translation = responseText.trim();
    if (
      (translation.startsWith('"') && translation.endsWith('"')) ||
      (translation.startsWith("'") && translation.endsWith("'"))
    ) {
      translation = translation.slice(1, -1);
    }

    return NextResponse.json({
      translation,
      from,
      to,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    });
  } catch (error) {
    console.error('Translation error:', error);
    return NextResponse.json(
      { error: 'Failed to translate dialogue' },
      { status: 500 }
    );
  }
}
