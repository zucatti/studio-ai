import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getSignedFileUrl, parseStorageUrl } from '@/lib/storage';
import { logClaudeUsage } from '@/lib/ai/log-api-usage';
import Anthropic from '@anthropic-ai/sdk';
import type { ReferenceType } from '@/types/database';

// Generate a prompt from the reference image using Claude Vision
async function generateReferencePrompt(
  imageUrl: string,
  type: ReferenceType
): Promise<string> {
  if (!process.env.AI_CLAUDE_KEY) {
    return '';
  }

  // Get a public URL for the image
  let publicUrl = imageUrl;
  if (imageUrl.startsWith('b2://')) {
    const parsed = parseStorageUrl(imageUrl);
    if (parsed) {
      publicUrl = await getSignedFileUrl(parsed.key, 3600);
    }
  }

  const anthropic = new Anthropic({
    apiKey: process.env.AI_CLAUDE_KEY,
  });

  const typeInstructions: Record<ReferenceType, string> = {
    pose: `Describe the body pose in natural, evocative language.

Focus on:
- Overall posture and attitude (standing tall, slouching, leaning, crouching)
- Head position and gaze direction (looking up, head tilted, eyes closed)
- Arm and hand positions (arms crossed, hands on hips, reaching up)
- Leg stance (crossed legs, wide stance, kneeling)
- Emotional quality of the pose (confident, vulnerable, dramatic, relaxed)

Use simple, clear descriptions that paint a picture.
Example: "sitting cross-legged with hands resting on knees, head tilted up, looking curiously at the sky, relaxed shoulders, peaceful expression"
Example: "standing dramatically with head thrown back, one arm raised holding microphone to lips, other arm extended outward, passionate singing pose"`,
    composition: `Describe the visual composition and framing.
Focus on: camera angle, subject placement, depth, foreground/background elements, visual balance.
Example: "low angle shot looking up, subject centered in frame, dramatic sky in background, silhouette lighting from behind"`,
    style: `Describe the artistic style, lighting, and mood.
Focus on: lighting type, color palette, texture, atmosphere, artistic technique.
Example: "dramatic rim lighting, deep shadows, warm orange tones, cinematic grain, high contrast, moody atmosphere"`,
  };

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'url',
                url: publicUrl,
              },
            },
            {
              type: 'text',
              text: `Analyze this image and generate an image generation prompt describing the ${type}.

${typeInstructions[type]}

IMPORTANT RULES:
- Do NOT mention any person's name or identity
- Do NOT describe the person's appearance (face, hair, body type, clothing)
- ONLY describe the ${type} that can be applied to ANY character
- Use natural, evocative language (not technical angles or measurements)
- Use English
- Keep it concise: 20-40 words

Return ONLY the prompt, nothing else.`,
            },
          ],
        },
      ],
    });

    logClaudeUsage({
      operation: 'generate-reference-prompt',
      model: 'claude-sonnet-4-20250514',
      inputTokens: message.usage?.input_tokens || 0,
      outputTokens: message.usage?.output_tokens || 0,
    }).catch(console.error);

    const content = message.content[0];
    if (content.type === 'text') {
      return content.text.trim();
    }
  } catch (error) {
    console.error('Failed to generate reference prompt:', error);
  }

  return '';
}

interface RouteParams {
  params: Promise<{ referenceId: string }>;
}

// GET /api/references/[referenceId]
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { referenceId } = await params;
    const supabase = createServerSupabaseClient();

    const { data: reference, error } = await supabase
      .from('global_references')
      .select('*')
      .eq('id', referenceId)
      .eq('user_id', session.user.sub)
      .single();

    if (error || !reference) {
      return NextResponse.json({ error: 'Reference not found' }, { status: 404 });
    }

    return NextResponse.json({ reference });
  } catch (error) {
    console.error('Error in GET /references/[id]:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PUT /api/references/[referenceId]
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { referenceId } = await params;
    const body = await request.json();
    const supabase = createServerSupabaseClient();

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.type !== undefined) {
      if (!['pose', 'composition', 'style'].includes(body.type)) {
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
      }
      updates.type = body.type as ReferenceType;
    }
    if (body.description !== undefined) updates.description = body.description;
    if (body.tags !== undefined) updates.tags = body.tags;
    if (body.image_url !== undefined) updates.image_url = body.image_url;

    const { data: reference, error } = await supabase
      .from('global_references')
      .update(updates)
      .eq('id', referenceId)
      .eq('user_id', session.user.sub)
      .select()
      .single();

    if (error) {
      console.error('Error updating reference:', error);
      return NextResponse.json({ error: 'Failed to update reference' }, { status: 500 });
    }

    if (!reference) {
      return NextResponse.json({ error: 'Reference not found' }, { status: 404 });
    }

    return NextResponse.json({ reference });
  } catch (error) {
    console.error('Error in PUT /references/[id]:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH /api/references/[referenceId] - Regenerate prompt from image
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { referenceId } = await params;
    const supabase = createServerSupabaseClient();

    // Get the reference
    const { data: reference, error: fetchError } = await supabase
      .from('global_references')
      .select('*')
      .eq('id', referenceId)
      .eq('user_id', session.user.sub)
      .single();

    if (fetchError || !reference) {
      return NextResponse.json({ error: 'Reference not found' }, { status: 404 });
    }

    // Generate new prompt from image
    console.log(`Regenerating ${reference.type} prompt for "${reference.name}"...`);
    const newDescription = await generateReferencePrompt(reference.image_url, reference.type as ReferenceType);
    console.log(`Generated prompt: ${newDescription}`);

    if (!newDescription) {
      return NextResponse.json({ error: 'Failed to generate prompt' }, { status: 500 });
    }

    // Update the reference
    const { data: updated, error: updateError } = await supabase
      .from('global_references')
      .update({ description: newDescription })
      .eq('id', referenceId)
      .eq('user_id', session.user.sub)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating reference:', updateError);
      return NextResponse.json({ error: 'Failed to update reference' }, { status: 500 });
    }

    return NextResponse.json({ reference: updated });
  } catch (error) {
    console.error('Error in PATCH /references/[id]:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/references/[referenceId]
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { referenceId } = await params;
    const supabase = createServerSupabaseClient();

    const { error } = await supabase
      .from('global_references')
      .delete()
      .eq('id', referenceId)
      .eq('user_id', session.user.sub);

    if (error) {
      console.error('Error deleting reference:', error);
      return NextResponse.json({ error: 'Failed to delete reference' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /references/[id]:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
