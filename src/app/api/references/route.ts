import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { uploadFile, getSignedFileUrl, parseStorageUrl, STORAGE_BUCKET } from '@/lib/storage';
import { logClaudeUsage } from '@/lib/ai/log-api-usage';
import Anthropic from '@anthropic-ai/sdk';
import type { ReferenceType } from '@/types/database';

// Generate a prompt from the reference image using Claude Vision
async function generateReferencePrompt(
  imageUrl: string,
  type: ReferenceType,
  name: string
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

// GET /api/references - List all global references for the user
export async function GET() {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();

    const { data: references, error } = await supabase
      .from('global_references')
      .select('*')
      .eq('user_id', session.user.sub)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching global references:', error);
      return NextResponse.json({ error: 'Failed to fetch references' }, { status: 500 });
    }

    return NextResponse.json({ references });
  } catch (error) {
    console.error('Error in GET /references:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST /api/references - Create a new global reference
export async function POST(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    const contentType = request.headers.get('content-type') || '';

    let name: string;
    let type: ReferenceType;
    let description: string | null = null;
    let tags: string[] = [];
    let imageUrl: string | null = null;
    let poseLibraryId: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      name = formData.get('name') as string;
      type = formData.get('type') as ReferenceType;
      description = formData.get('description') as string | null;
      const tagsStr = formData.get('tags') as string;
      tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];

      const imageFile = formData.get('image') as File | null;

      // Image required for composition and style, optional for pose
      if (!imageFile && type !== 'pose') {
        return NextResponse.json({ error: 'Image is required' }, { status: 400 });
      }

      if (imageFile) {
        // Upload image to B2
        const sanitizedUserId = session.user.sub.replace(/[|]/g, '_');
        const timestamp = Date.now();
        const ext = imageFile.name.split('.').pop() || 'png';
        const storageKey = `references/${sanitizedUserId}/${timestamp}_${name.replace(/\s+/g, '_')}.${ext}`;

        const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
        await uploadFile(storageKey, imageBuffer, imageFile.type);

        imageUrl = `b2://${STORAGE_BUCKET}/${storageKey}`;
      }
    } else {
      const body = await request.json();
      name = body.name;
      type = body.type;
      description = body.description || null;
      tags = body.tags || [];
      imageUrl = body.image_url || null;
      poseLibraryId = body.pose_library_id || null;

      // Image required for composition and style, optional for pose
      if (!imageUrl && type !== 'pose') {
        return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
      }
    }

    if (!name || !type) {
      return NextResponse.json({ error: 'Name and type are required' }, { status: 400 });
    }

    if (!['pose', 'composition', 'style'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    // Generate prompt from image using Claude Vision (only if image exists and no description)
    console.log('\n========== REFERENCE IMPORT DEBUG ==========');
    console.log('Name:', name);
    console.log('Type:', type);
    console.log('Description provided:', JSON.stringify(description));
    console.log('Image URL:', imageUrl ? imageUrl.substring(0, 50) + '...' : '(none - pose from library)');
    console.log('Pose Library ID:', poseLibraryId || '(none)');

    let finalDescription = description;
    if (!finalDescription && imageUrl) {
      console.log('No description provided, generating with Claude Vision...');
      finalDescription = await generateReferencePrompt(imageUrl, type as ReferenceType, name);
      console.log('Generated prompt:', finalDescription);
    } else {
      console.log('Using provided description, skipping generation');
    }
    console.log('Final description:', finalDescription);
    console.log('==============================================\n');

    const { data: reference, error } = await supabase
      .from('global_references')
      .insert({
        user_id: session.user.sub,
        name,
        type,
        image_url: imageUrl,
        description: finalDescription,
        tags,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating global reference:', error);
      return NextResponse.json({ error: 'Failed to create reference' }, { status: 500 });
    }

    return NextResponse.json({ reference }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /references:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
