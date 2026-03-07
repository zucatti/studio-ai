import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

interface RouteParams {
  params: Promise<{ projectId: string; shotId: string }>;
}

// Generate first and/or last frame for a shot
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shotId } = await params;
    const body = await request.json();
    const { frameType } = body; // 'first', 'last', or 'both'

    if (!frameType || !['first', 'last', 'both'].includes(frameType)) {
      return NextResponse.json({ error: 'Invalid frameType' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id, visual_style')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get shot with scene info
    const { data: shot } = await supabase
      .from('shots')
      .select(`
        *,
        scene:scenes(*)
      `)
      .eq('id', shotId)
      .single();

    if (!shot) {
      return NextResponse.json({ error: 'Shot not found' }, { status: 404 });
    }

    // Get dialogues and actions for this shot
    const [dialoguesRes, actionsRes] = await Promise.all([
      supabase.from('dialogues').select('*').eq('shot_id', shotId).order('sort_order'),
      supabase.from('actions').select('*').eq('shot_id', shotId).order('sort_order'),
    ]);

    // Get characters for reference
    const { data: characters } = await supabase
      .from('characters')
      .select('name, visual_description, reference_images')
      .eq('project_id', projectId);

    // Get location for this scene
    const { data: locations } = await supabase
      .from('locations')
      .select('name, visual_description, reference_images')
      .eq('project_id', projectId);

    // Check API key (prefer fal.ai, fallback to Replicate)
    if (!process.env.AI_FAL_KEY && !process.env.AI_REPLICATE_KEY) {
      return NextResponse.json({ error: 'No image API configured (AI_FAL_KEY or AI_REPLICATE_KEY)' }, { status: 500 });
    }

    // Build context for prompt generation
    const context = {
      shot: {
        description: shot.description,
        shotType: shot.shot_type,
        cameraAngle: shot.camera_angle,
        cameraMovement: shot.camera_movement,
      },
      scene: shot.scene ? {
        location: shot.scene.location,
        timeOfDay: shot.scene.time_of_day,
        intExt: shot.scene.int_ext,
      } : null,
      dialogues: dialoguesRes.data || [],
      actions: actionsRes.data || [],
      characters: characters || [],
      locations: locations || [],
      style: project.visual_style || 'photorealistic',
    };

    // Generate prompts using Claude
    const prompts = await generateFramePrompts(context, frameType);

    const results: { firstFrame?: string; lastFrame?: string } = {};

    // Helper to wait
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Helper to upload image to Supabase
    const uploadToSupabase = async (imageUrl: string, suffix: string): Promise<string> => {
      const imageResponse = await fetch(imageUrl);
      const imageBlob = await imageResponse.blob();
      const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());

      const fileName = `${session.user.sub.replace(/[|]/g, '_')}/${projectId}/${shotId}_${suffix}_${Date.now()}.webp`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('project-assets')
        .upload(fileName, imageBuffer, {
          contentType: 'image/webp',
          upsert: true,
        });

      if (uploadError) throw new Error('Upload failed: ' + uploadError.message);

      const { data: urlData } = supabase.storage
        .from('project-assets')
        .getPublicUrl(uploadData.path);

      return urlData.publicUrl;
    };

    // Helper to ensure reference_images is an array
    const getRefImages = (refImages: any): string[] => {
      if (!refImages) return [];
      if (Array.isArray(refImages)) return refImages;
      if (typeof refImages === 'string') {
        try {
          const parsed = JSON.parse(refImages);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };

    // Find characters present in this shot (from dialogues, actions, and description)
    // Supports @Elena or Elena notation
    const findCharactersInShot = (): typeof characters => {
      const matchedCharacters: typeof characters = [];

      for (const char of characters || []) {
        const charName = char.name.toLowerCase().trim();
        const charNameAt = `@${charName}`;
        let found = false;

        // Check in dialogues (character_name field)
        for (const d of context.dialogues) {
          const dialogueName = d.character_name?.toLowerCase().trim();
          if (dialogueName === charName || dialogueName === charNameAt) {
            found = true;
            break;
          }
        }

        // Check in actions (look for @Name or Name as whole word)
        if (!found) {
          for (const a of context.actions) {
            const content = a.content?.toLowerCase() || '';
            // Match @elena or elena as word boundary
            const regex = new RegExp(`(^|\\s|@)${charName}(\\s|$|[.,!?;:])`, 'i');
            if (regex.test(content)) {
              found = true;
              break;
            }
          }
        }

        // Check in shot description
        if (!found) {
          const desc = context.shot.description?.toLowerCase() || '';
          const regex = new RegExp(`(^|\\s|@)${charName}(\\s|$|[.,!?;:])`, 'i');
          if (regex.test(desc)) {
            found = true;
          }
        }

        if (found && getRefImages(char.reference_images).length > 0) {
          matchedCharacters.push(char);
        }
      }

      return matchedCharacters;
    };

    const shotCharacters = findCharactersInShot();
    console.log(`Found ${shotCharacters.length} characters with reference images in shot`);

    // Generate image using fal.ai with character consistency
    const generateWithFal = async (prompt: string): Promise<string> => {
      const { fal } = await import('@fal-ai/client');
      fal.config({ credentials: process.env.AI_FAL_KEY });

      // If we have character reference images, use PuLID for face consistency
      const charRefImages = shotCharacters.length > 0 ? getRefImages(shotCharacters[0].reference_images) : [];

      if (charRefImages.length > 0) {
        console.log(`Using InstantID for character consistency (${shotCharacters[0].name})...`);
        console.log(`Reference images: ${charRefImages.join(', ')}`);

        // Get first reference image (front face is best)
        const refUrl = charRefImages[0];

        // Upload reference image to fal.ai storage if it's a Supabase URL
        let uploadedRef = refUrl;
        if (refUrl.includes('supabase') || refUrl.includes('127.0.0.1') || refUrl.includes('localhost')) {
          console.log(`Uploading reference image to fal.ai: ${refUrl}`);
          const response = await fetch(refUrl);
          if (!response.ok) {
            console.error(`Failed to fetch reference image: ${refUrl}`);
          } else {
            const blob = await response.blob();
            uploadedRef = await fal.storage.upload(blob);
            console.log(`Uploaded to fal.ai: ${uploadedRef}`);
          }
        }

        if (uploadedRef) {
          console.log(`Using InstantID with face reference`);

          const result = await fal.subscribe('fal-ai/instantid', {
            input: {
              prompt,
              face_image_url: uploadedRef,
              ip_adapter_scale: 0.8,
              identity_controlnet_conditioning_scale: 0.9, // High identity preservation
              enhance_face_region: true,
              image_size: 'landscape_16_9',
              num_images: 1,
            },
            logs: true,
            onQueueUpdate: async (update) => {
              console.log(`InstantID progress: ${update.status}`);
              // Save real status to database for polling
              const statusMap: Record<string, string> = {
                'IN_QUEUE': 'queued',
                'IN_PROGRESS': 'generating',
                'COMPLETED': 'completed',
              };
              const mappedStatus = statusMap[update.status] || update.status;
              await supabase.from('shots').update({
                frame_generation_status: JSON.stringify({ status: mappedStatus }),
              }).eq('id', shotId);
            },
          });

          const imageUrl = result.data?.images?.[0]?.url;
          if (imageUrl) return imageUrl;
          console.error('No image URL in InstantID response, falling back');
        }
      }

      // Fallback: standard Flux Pro without character consistency
      console.log('Generating with fal.ai Flux Pro (1920x1080 Full HD 16:9)...');

      const result = await fal.subscribe('fal-ai/flux-pro/v1.1', {
        input: {
          prompt,
          image_size: 'landscape_16_9',
          num_images: 1,
          output_format: 'jpeg',
        },
        logs: true,
        onQueueUpdate: async (update) => {
          console.log(`Flux Pro progress: ${update.status}`);
          const statusMap: Record<string, string> = {
            'IN_QUEUE': 'queued',
            'IN_PROGRESS': 'generating',
            'COMPLETED': 'completed',
          };
          const mappedStatus = statusMap[update.status] || update.status;
          await supabase.from('shots').update({
            frame_generation_status: JSON.stringify({ status: mappedStatus }),
          }).eq('id', shotId);
        },
      });

      const imageUrl = result.data?.images?.[0]?.url;
      if (!imageUrl) throw new Error('No image URL in fal.ai response');
      return imageUrl;
    };

    // Fallback: Generate image using Replicate
    const generateWithReplicate = async (prompt: string, retryCount = 0): Promise<string> => {
      const Replicate = (await import('replicate')).default;
      const replicate = new Replicate({ auth: process.env.AI_REPLICATE_KEY });

      const maxRetries = 5;
      const baseDelay = 5000;

      try {
        // Flux 1.1 Pro max width is 1440, so we use 1440x810 (exact 16:9)
        console.log('Generating with Replicate (1440x810 16:9)...');

        const output = await replicate.run('black-forest-labs/flux-1.1-pro', {
          input: {
            prompt,
            width: 1440,
            height: 810,
            output_format: 'webp',
            output_quality: 95,
          },
        });

        const outputItem = Array.isArray(output) ? output[0] : output;
        let imageUrl: string | null = null;

        if (typeof outputItem === 'string') {
          imageUrl = outputItem;
        } else if (outputItem && typeof outputItem === 'object') {
          const obj = outputItem as any;
          if (typeof obj.url === 'function') {
            const urlObj = obj.url();
            imageUrl = urlObj?.href || null;
          } else if (obj.href) {
            imageUrl = obj.href;
          } else if (obj.url) {
            imageUrl = obj.url;
          }
        }

        if (!imageUrl) throw new Error('No image URL generated');
        return imageUrl;
      } catch (error: any) {
        const isRateLimit = error?.message?.includes('429') ||
                           error?.message?.includes('rate limit') ||
                           error?.message?.includes('throttled');

        if (isRateLimit && retryCount < maxRetries) {
          const delay = baseDelay * Math.pow(2, retryCount);
          console.log(`Rate limited, retrying in ${delay / 1000}s (attempt ${retryCount + 1}/${maxRetries})...`);
          await sleep(delay);
          return generateWithReplicate(prompt, retryCount + 1);
        }

        throw error;
      }
    };

    // Main generate function - prefer fal.ai, fallback to Replicate
    const generateImage = async (prompt: string, suffix: string): Promise<string> => {
      let imageUrl: string;

      if (process.env.AI_FAL_KEY) {
        imageUrl = await generateWithFal(prompt);
      } else {
        imageUrl = await generateWithReplicate(prompt);
      }

      // Upload to Supabase storage
      return uploadToSupabase(imageUrl, suffix);
    };

    // Generate frames
    const updates: any = {};

    if (frameType === 'first' || frameType === 'both') {
      console.log('Generating first frame...');
      results.firstFrame = await generateImage(prompts.firstFrame, 'first');
      updates.first_frame_url = results.firstFrame;
      updates.first_frame_prompt = prompts.firstFrame;
    }

    if (frameType === 'last' || frameType === 'both') {
      if (frameType === 'both') {
        // Wait between generations to avoid rate limits
        console.log('Waiting 5s before generating last frame...');
        await sleep(5000);
      }
      console.log('Generating last frame...');
      results.lastFrame = await generateImage(prompts.lastFrame, 'last');
      updates.last_frame_url = results.lastFrame;
      updates.last_frame_prompt = prompts.lastFrame;
    }

    // Update shot
    await supabase
      .from('shots')
      .update(updates)
      .eq('id', shotId);

    return NextResponse.json({
      success: true,
      provider: process.env.AI_FAL_KEY ? 'fal.ai' : 'replicate',
      resolution: process.env.AI_FAL_KEY ? '1920x1080' : '1440x810',
      characterConsistency: shotCharacters.length > 0,
      charactersUsed: shotCharacters.map(c => c.name),
      ...results,
    });
  } catch (error) {
    console.error('Error generating frames:', error);
    return NextResponse.json(
      { error: 'Failed to generate frames: ' + String(error) },
      { status: 500 }
    );
  }
}

// Generate frame prompts using Claude
async function generateFramePrompts(
  context: any,
  frameType: string
): Promise<{ firstFrame: string; lastFrame: string }> {
  if (!process.env.AI_CLAUDE_KEY) {
    // Fallback to basic prompt
    return {
      firstFrame: context.shot.description,
      lastFrame: context.shot.description,
    };
  }

  const anthropic = new Anthropic({
    apiKey: process.env.AI_CLAUDE_KEY,
  });

  const cameraMovementInstructions = getCameraMovementInstructions(context.shot.cameraMovement);

  const systemPrompt = `You are an expert cinematographer creating prompts for AI image generation.
You must create prompts for FIRST FRAME and LAST FRAME of a shot that will be used to generate video through interpolation.

Style: ${context.style}
The prompts should be in English, detailed, and focus on visual elements.`;

  const userPrompt = `Create prompts for a shot with:

SHOT DESCRIPTION:
${context.shot.description}

CAMERA:
- Type: ${context.shot.shotType}
- Angle: ${context.shot.cameraAngle}
- Movement: ${context.shot.cameraMovement}

SCENE:
- Location: ${context.scene?.location || 'Unknown'}
- Time: ${context.scene?.timeOfDay || 'Day'}
- Int/Ext: ${context.scene?.intExt || 'INT'}

DIALOGUES:
${context.dialogues.map((d: any) => `${d.character_name}: "${d.content}"`).join('\n') || 'None'}

ACTIONS:
${context.actions.map((a: any) => a.content).join('\n') || 'None'}

CHARACTERS IN PROJECT (for visual consistency):
${context.characters.map((c: any) => `- ${c.name}: ${c.visual_description}`).join('\n') || 'None'}

CAMERA MOVEMENT INSTRUCTIONS:
${cameraMovementInstructions}

Return ONLY a JSON object with this format:
{
  "firstFrame": "detailed prompt for the start of the shot...",
  "lastFrame": "detailed prompt for the end of the shot..."
}`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [
      { role: 'user', content: userPrompt },
    ],
    system: systemPrompt,
  });

  const content = message.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type');
  }

  try {
    // Extract JSON from response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    // Fallback
    return {
      firstFrame: context.shot.description,
      lastFrame: context.shot.description,
    };
  }
}

function getCameraMovementInstructions(movement: string): string {
  const instructions: Record<string, string> = {
    static: 'No camera movement. First and last frame should be identical in framing.',
    pan_left: 'Camera pans left. First frame shows right side of scene, last frame shows left side.',
    pan_right: 'Camera pans right. First frame shows left side of scene, last frame shows right side.',
    tilt_up: 'Camera tilts up. First frame shows lower portion, last frame shows upper portion.',
    tilt_down: 'Camera tilts down. First frame shows upper portion, last frame shows lower portion.',
    dolly_in: 'Camera moves closer. First frame is wider shot, last frame is closer/tighter.',
    dolly_out: 'Camera moves back. First frame is closer, last frame is wider.',
    tracking: 'Camera tracks subject. Subject position changes between frames while staying in frame.',
    crane: 'Crane movement. First frame at one height, last frame at different height with perspective change.',
    handheld: 'Handheld style. Slight variation in framing between frames, organic feel.',
  };

  return instructions[movement] || 'Standard framing for both frames.';
}
