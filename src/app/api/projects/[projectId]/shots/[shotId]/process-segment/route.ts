/**
 * Process Segment API Route
 *
 * Called on Save Shot to:
 * 1. Translate all elements to English (if not already)
 * 2. Evaluate and suggest optimal shot duration based on content
 *
 * Returns the processed segment with:
 * - content_en populated for all elements
 * - suggested_duration based on Claude's analysis
 */

import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import Anthropic from '@anthropic-ai/sdk';
import type { SegmentElement, ElementType } from '@/types/cinematic';

interface RouteParams {
  params: Promise<{ projectId: string; shotId: string }>;
}

interface ProcessSegmentRequest {
  elements: SegmentElement[];
  description?: string;
  camera_movement?: string;
}

interface ProcessedElement extends SegmentElement {
  content_en: string;
}

interface ProcessSegmentResponse {
  elements: ProcessedElement[];
  suggested_duration: number;
  duration_reasoning?: string;
}

// System prompt for Claude
const SYSTEM_PROMPT = `You are a professional film production assistant helping with video generation prompts.

Your tasks:
1. TRANSLATE: Convert any non-English text to natural, fluent English suitable for video AI prompts
2. EVALUATE DURATION: Based on all elements (dialogue, actions, SFX, etc.), estimate the optimal shot duration

IMPORTANT for translation:
- Only translate the actual content text, NOT the metadata/tags I provide for context
- The metadata like [DIALOGUE], [ACTION], (character: Name), [off-screen] is just context info
- Your content_en should contain ONLY the translated human-readable text
- Example: If I give you "[DIALOGUE] (character: John): "Bonjour, comment ça va?""
  Your content_en should be: "Hello, how are you?" (NOT "[DIALOGUE] (character: John): "Hello..."")

For duration estimation, consider:
- Dialogue: ~2.5 words/second (adjust for tone - whispers are slower, shouts are faster)
- Actions: Simple actions 2-3s, complex actions 4-6s
- Focus shots: 2-4s depending on dramatic weight
- SFX/Physics/Lighting: Add 0.5-1.5s if they need time to be visible
- Multiple simultaneous elements don't add duration (they happen at the same time)
- But overlapping dialogue + complex action may need more time

Always respond with valid JSON only, no markdown.`;

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shotId } = await params;
    const body: ProcessSegmentRequest = await request.json();
    const { elements, description, camera_movement } = body;

    if (!elements || elements.length === 0) {
      return NextResponse.json({
        elements: [],
        suggested_duration: 5,
      });
    }

    // Build the prompt for Claude
    // Separate metadata from content to avoid Claude including tags in translation
    const elementsDescription = elements.map((el, i) => {
      const metadata: string[] = [];
      metadata.push(`type: ${el.type}`);
      if (el.character_name) metadata.push(`character: ${el.character_name}`);
      if (el.tone) metadata.push(`tone: ${el.tone}`);
      if (el.presence === 'off') metadata.push(`presence: off-screen`);

      return `${i + 1}. [Metadata: ${metadata.join(', ')}]\n   Content to translate: "${el.content}"`;
    }).join('\n\n');

    const contextInfo = [
      description ? `Shot description: ${description}` : null,
      camera_movement && camera_movement !== 'static' ? `Camera movement: ${camera_movement}` : null,
    ].filter(Boolean).join('\n');

    const userPrompt = `Process these shot elements for video generation:

${elementsDescription}

${contextInfo ? `\nContext:\n${contextInfo}` : ''}

IMPORTANT: For content_en, translate ONLY the "Content to translate" text. Do NOT include the metadata (type, character, tone, presence) in your translation - those are just context for duration estimation.

Respond with JSON:
{
  "translations": [
    { "index": 0, "content_en": "Just the translated text, nothing else", "was_translated": true/false },
    ...
  ],
  "suggested_duration": <number in seconds, between 3 and 15>,
  "duration_reasoning": "Brief explanation of why this duration"
}`;

    // Call Claude
    const anthropic = new Anthropic({
      apiKey: process.env.AI_CLAUDE_KEY,
    });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    });

    // Parse response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    let parsed: {
      translations: Array<{ index: number; content_en: string; was_translated: boolean }>;
      suggested_duration: number;
      duration_reasoning?: string;
    };

    try {
      // Try to extract JSON from the response (in case Claude wraps it)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('[ProcessSegment] Failed to parse Claude response:', responseText);
      // Fallback: keep originals, suggest 5s
      return NextResponse.json({
        elements: elements.map(el => ({
          ...el,
          content_en: el.content_en || el.content,
        })),
        suggested_duration: 5,
      });
    }

    // Apply translations to elements
    const processedElements: ProcessedElement[] = elements.map((el, index) => {
      const translation = parsed.translations.find(t => t.index === index);
      return {
        ...el,
        content_en: translation?.content_en || el.content_en || el.content,
      };
    });

    // Clamp duration to valid range
    const suggestedDuration = Math.max(3, Math.min(15, Math.round(parsed.suggested_duration * 10) / 10));

    const response: ProcessSegmentResponse = {
      elements: processedElements,
      suggested_duration: suggestedDuration,
      duration_reasoning: parsed.duration_reasoning,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('[ProcessSegment] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
