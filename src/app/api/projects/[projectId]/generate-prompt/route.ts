import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { logClaudeUsage } from '@/lib/ai/log-api-usage';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

interface WizardData {
  subject: string;
  action: string;
  location: string;
  style: string;
  timeOfDay: string;
  framing: string;
  cameraAngle: string;
  mood: string;
  additionalDetails: string;
}

const STYLE_DESCRIPTIONS: Record<string, string> = {
  photorealistic: 'photorealistic photograph, professional photography',
  cinematic: 'cinematic film still, movie scene aesthetic',
  editorial: 'editorial fashion photography, high-end magazine style',
  fine_art: 'fine art portrait, artistic and expressive',
  cartoon: 'cartoon style, stylized illustration with bold colors',
  anime: 'anime style, Japanese animation aesthetic',
  illustration: 'digital illustration, detailed artwork',
  '3d_render': '3D rendered, CGI quality, detailed texturing',
};

const TIME_DESCRIPTIONS: Record<string, string> = {
  golden_hour: 'golden hour lighting, warm sun, long shadows',
  blue_hour: 'blue hour, soft twilight, cool tones',
  day: 'natural daylight, bright and clear',
  night: 'nighttime, artificial lighting, moody shadows',
  overcast: 'overcast sky, soft diffused lighting, no harsh shadows',
  studio: 'professional studio lighting, controlled environment',
};

const FRAMING_DESCRIPTIONS: Record<string, string> = {
  extreme_closeup: 'extreme close-up, macro detail shot',
  closeup: 'close-up portrait, head and shoulders',
  medium: 'medium shot, waist-up framing',
  full: 'full body shot, complete figure visible',
  wide: 'wide angle shot, subject in environment',
  extreme_wide: 'extreme wide shot, vast landscape with small subject',
};

const ANGLE_DESCRIPTIONS: Record<string, string> = {
  eye_level: 'eye-level camera angle',
  low_angle: 'low angle shot, looking up, heroic perspective',
  high_angle: 'high angle shot, looking down',
  dutch_angle: 'dutch angle, tilted frame, dynamic tension',
  overhead: 'overhead shot, bird\'s eye view',
};

const MOOD_DESCRIPTIONS: Record<string, string> = {
  joyful: 'joyful and bright atmosphere, vibrant energy',
  melancholic: 'melancholic mood, contemplative, wistful',
  mysterious: 'mysterious atmosphere, enigmatic, intriguing',
  dramatic: 'dramatic lighting, intense emotion, high contrast',
  peaceful: 'peaceful and serene, calm, tranquil',
  energetic: 'energetic and dynamic, motion, excitement',
  romantic: 'romantic atmosphere, soft and dreamy',
  dark: 'dark and moody, shadows, noir aesthetic',
};

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const data: WizardData = await request.json();

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

    // Build context for Claude
    const context = {
      style: STYLE_DESCRIPTIONS[data.style] || data.style,
      time: TIME_DESCRIPTIONS[data.timeOfDay] || data.timeOfDay,
      framing: FRAMING_DESCRIPTIONS[data.framing] || data.framing,
      angle: ANGLE_DESCRIPTIONS[data.cameraAngle] || '',
      mood: MOOD_DESCRIPTIONS[data.mood] || data.mood,
    };

    // If no API key, generate locally
    if (!process.env.AI_CLAUDE_KEY) {
      const localPrompt = buildLocalPrompt(data, context);
      return NextResponse.json({ prompt: localPrompt });
    }

    const anthropic = new Anthropic({
      apiKey: process.env.AI_CLAUDE_KEY,
    });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `You are an expert at creating image generation prompts for AI models like Flux and Stable Diffusion.

Create an optimized English prompt for generating an image based on these parameters:

**Subject**: ${data.subject || 'Not specified'}
**Action**: ${data.action || 'Not specified'}
**Location**: ${data.location || 'Not specified'}
**Style**: ${context.style}
**Lighting**: ${context.time}
**Framing**: ${context.framing}
**Camera Angle**: ${context.angle || 'Eye level'}
**Mood**: ${context.mood}
**Additional Details**: ${data.additionalDetails || 'None'}

Rules:
1. Write a single, flowing prompt (no bullet points or categories)
2. Be specific and descriptive
3. Include technical photography terms where appropriate
4. Keep it under 100 words
5. Focus on visual elements that AI can render
6. If @mentions or #mentions are present, keep them as-is (they reference character/location definitions)
7. End with quality tags like "high quality, detailed, 8k"

Return ONLY the optimized prompt, nothing else.`,
        },
      ],
    });

    logClaudeUsage({
      operation: 'generate-prompt-wizard',
      model: 'claude-sonnet-4-20250514',
      inputTokens: message.usage?.input_tokens || 0,
      outputTokens: message.usage?.output_tokens || 0,
      projectId,
    }).catch(console.error);

    const content = message.content[0];
    if (content.type === 'text') {
      return NextResponse.json({ prompt: content.text.trim() });
    }

    // Fallback to local generation
    const localPrompt = buildLocalPrompt(data, context);
    return NextResponse.json({ prompt: localPrompt });
  } catch (error) {
    console.error('Error generating prompt:', error);
    return NextResponse.json(
      { error: 'Failed to generate prompt: ' + String(error) },
      { status: 500 }
    );
  }
}

function buildLocalPrompt(
  data: WizardData,
  context: { style: string; time: string; framing: string; angle: string; mood: string }
): string {
  const parts: string[] = [];

  // Style prefix
  parts.push(context.style);

  // Subject and action
  if (data.subject) {
    parts.push(data.subject);
    if (data.action) {
      parts.push(data.action);
    }
  }

  // Location
  if (data.location) {
    parts.push(`in ${data.location}`);
  }

  // Technical details
  parts.push(context.framing);
  if (context.angle) {
    parts.push(context.angle);
  }
  parts.push(context.time);
  parts.push(context.mood);

  // Additional details
  if (data.additionalDetails) {
    parts.push(data.additionalDetails);
  }

  // Quality tags
  parts.push('high quality, detailed, professional, 8k');

  return parts.filter(Boolean).join(', ');
}
