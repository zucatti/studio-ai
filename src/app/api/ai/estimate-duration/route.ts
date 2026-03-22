import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.AI_ANTHROPIC || process.env.AI_CLAUDE_KEY,
});

/**
 * POST /api/ai/estimate-duration
 * Estimate the spoken duration of dialogue text using Claude
 */
export async function POST(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { text } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    // Clean the text (remove mentions, tags)
    const cleanedText = text
      .replace(/@\w+/g, '')
      .replace(/#\w+/g, '')
      .replace(/!\w+/g, '')
      .replace(/&in\b/gi, '')
      .replace(/&out\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanedText) {
      return NextResponse.json({ error: 'No speakable text after cleaning' }, { status: 400 });
    }

    // Use Claude to estimate duration
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: `Estimate how many seconds it would take to speak this dialogue naturally (not too fast, not too slow, with natural pauses for emotion and punctuation). Return ONLY a number (integer seconds).

Dialogue: "${cleanedText}"

Duration in seconds:`,
        },
      ],
    });

    // Extract the number from the response
    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    const match = responseText.match(/(\d+)/);
    const duration = match ? parseInt(match[1], 10) : null;

    if (!duration || duration < 1 || duration > 300) {
      // Fallback: estimate based on word count (~150 words per minute = 2.5 words per second)
      const wordCount = cleanedText.split(/\s+/).length;
      const fallbackDuration = Math.max(3, Math.ceil(wordCount / 2.5));
      return NextResponse.json({ duration: fallbackDuration, method: 'fallback' });
    }

    return NextResponse.json({ duration, method: 'claude' });

  } catch (error) {
    console.error('[EstimateDuration] Error:', error);

    // Fallback on error
    try {
      const { text } = await request.clone().json();
      const cleanedText = text?.replace(/[@#!&]\w+/g, '').trim() || '';
      const wordCount = cleanedText.split(/\s+/).length;
      const fallbackDuration = Math.max(3, Math.ceil(wordCount / 2.5));
      return NextResponse.json({ duration: fallbackDuration, method: 'fallback' });
    } catch {
      return NextResponse.json({ duration: 5, method: 'default' });
    }
  }
}
