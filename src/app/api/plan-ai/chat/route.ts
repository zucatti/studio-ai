import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { Segment } from '@/types/cinematic';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RequestBody {
  projectId: string;
  messages: ChatMessage[];
  frameInBase64?: string;
  frameOutBase64?: string;
  bibleContext: string;
  currentSegments: Segment[];
  planDuration: number;
}

const SYSTEM_PROMPT = `Tu es un assistant créatif pour la création de plans vidéo. Tu aides à créer des segments (actions, dialogues, mouvements de caméra) pour un plan de vidéo.

CONTEXTE DU PROJET:
{bibleContext}

DURÉE DU PLAN: {planDuration} secondes

SEGMENTS ACTUELS:
{currentSegments}

RÈGLES:
1. Utilise les références de la Bible (@Personnage, #Lieu, !Look) dans tes descriptions
2. Crée des segments réalistes qui s'enchaînent naturellement
3. La somme des durées (end_time - start_time) doit être égale à la durée du plan
4. Chaque segment a un shot_framing (wide, medium, close_up, etc.)
5. Les elements contiennent les actions et dialogues

SHOT_FRAMING disponibles: extreme_wide, wide, medium_wide, medium, medium_close_up, close_up, extreme_close_up, insert

FORMAT DE RÉPONSE:
Si tu proposes des segments, termine ta réponse par un bloc JSON avec le format exact suivant:
\`\`\`json
{
  "segments": [
    {
      "id": "seg-1",
      "start_time": 0,
      "end_time": 2.5,
      "shot_framing": "medium",
      "description": "Description visuelle du plan",
      "elements": [
        {
          "id": "elem-1",
          "type": "action",
          "content": "@Noah s'avance prudemment"
        }
      ],
      "camera_movement": "dolly_in"
    },
    {
      "id": "seg-2",
      "start_time": 2.5,
      "end_time": 5,
      "shot_framing": "close_up",
      "description": "Gros plan sur le visage",
      "elements": [
        {
          "id": "elem-2",
          "type": "dialogue",
          "content": "Cet endroit est étrange...",
          "character_name": "@Noah"
        }
      ]
    }
  ]
}
\`\`\`

CAMERA_MOVEMENT disponibles: static, dolly_in, dolly_out, truck_left, truck_right, pan_left, pan_right, tilt_up, tilt_down, crane_up, crane_down, orbit_cw, orbit_ccw, handheld, zoom_in, zoom_out

Réponds en français. Sois concis et créatif.`;

function buildSystemPrompt(bibleContext: string, planDuration: number, currentSegments: Segment[]): string {
  const segmentsStr = currentSegments.length > 0
    ? currentSegments.map((s, i) => {
        const duration = (s.end_time - s.start_time).toFixed(1);
        const hasDialogue = s.elements?.some(e => e.type === 'dialogue');
        const typeLabel = hasDialogue ? 'dialogue' : 'action';
        return `${i + 1}. [${typeLabel}] ${s.description || s.elements?.[0]?.content || ''} (${duration}s)`;
      }).join('\n')
    : 'Aucun segment pour l\'instant';

  return SYSTEM_PROMPT
    .replace('{bibleContext}', bibleContext || 'Aucun élément de Bible défini')
    .replace('{planDuration}', planDuration.toString())
    .replace('{currentSegments}', segmentsStr);
}

function extractSegmentsFromResponse(text: string): Segment[] | null {
  // Look for JSON block in response
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[1]);
    if (!parsed.segments || !Array.isArray(parsed.segments)) return null;

    return parsed.segments.map((s: Record<string, unknown>, idx: number) => {
      const elements = Array.isArray(s.elements)
        ? (s.elements as Array<Record<string, unknown>>).map((e, eIdx) => ({
            id: (e.id as string) || `ai-elem-${Date.now()}-${idx}-${eIdx}`,
            type: (e.type as 'action' | 'dialogue' | 'focus' | 'sfx' | 'physics' | 'lighting') || 'action',
            content: (e.content as string) || '',
            character_id: e.character_id as string | undefined,
            character_name: e.character_name as string | undefined,
            tone: e.tone as string | undefined,
          }))
        : [];

      return {
        id: (s.id as string) || `ai-seg-${Date.now()}-${idx}`,
        start_time: typeof s.start_time === 'number' ? s.start_time : idx * 2,
        end_time: typeof s.end_time === 'number' ? s.end_time : (idx + 1) * 2,
        shot_framing: (s.shot_framing as string) || 'medium',
        shot_composition: s.shot_composition as string | undefined,
        description: (s.description as string) || '',
        elements,
        camera_movement: s.camera_movement as string | undefined,
        camera_notes: s.camera_notes as string | undefined,
      };
    }) as Segment[];
  } catch (e) {
    console.error('[PlanAI] Failed to parse segments JSON:', e);
    return null;
  }
}

function cleanResponseText(text: string): string {
  // Remove JSON block from displayed text
  return text.replace(/```json\s*[\s\S]*?\s*```/g, '').trim();
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    const {
      messages,
      frameInBase64,
      frameOutBase64,
      bibleContext,
      currentSegments,
      planDuration,
    } = body;

    // Build system prompt
    const systemPrompt = buildSystemPrompt(bibleContext, planDuration, currentSegments);

    // Build messages for Claude
    const claudeMessages: Anthropic.MessageParam[] = [];

    // Add conversation history
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === 'user') {
        // For the first user message, include images
        if (i === 0 && (frameInBase64 || frameOutBase64)) {
          const content: Anthropic.ContentBlockParam[] = [];

          // Add frame images
          if (frameInBase64) {
            const base64Data = frameInBase64.replace(/^data:image\/\w+;base64,/, '');
            content.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Data,
              },
            });
            content.push({
              type: 'text',
              text: '[Frame In - Image de début du plan]',
            });
          }

          if (frameOutBase64) {
            const base64Data = frameOutBase64.replace(/^data:image\/\w+;base64,/, '');
            content.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Data,
              },
            });
            content.push({
              type: 'text',
              text: '[Frame Out - Image de fin du plan]',
            });
          }

          content.push({
            type: 'text',
            text: msg.content,
          });

          claudeMessages.push({ role: 'user', content });
        } else {
          claudeMessages.push({ role: 'user', content: msg.content });
        }
      } else {
        claudeMessages.push({ role: 'assistant', content: msg.content });
      }
    }

    // Call Claude Haiku (fast and cheap)
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 1024,
      system: systemPrompt,
      messages: claudeMessages,
    });

    // Extract text from response
    const responseText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    // Extract segments if present
    const segments = extractSegmentsFromResponse(responseText);
    const cleanedMessage = cleanResponseText(responseText);

    return NextResponse.json({
      message: cleanedMessage || responseText,
      segments,
    });
  } catch (error) {
    console.error('[PlanAI] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
