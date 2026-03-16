import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { uploadFile, getSignedFileUrl, parseStorageUrl, STORAGE_BUCKET } from '@/lib/storage';
import Anthropic from '@anthropic-ai/sdk';
import { hasReference, generateReferenceName, replaceReferencesWithDescriptions } from '@/lib/reference-name';

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
    const { frameType, visualStyle } = body; // frameType: 'first', 'last', or 'both'

    if (!frameType || !['first', 'last', 'both'].includes(frameType)) {
      return NextResponse.json({ error: 'Invalid frameType' }, { status: 400 });
    }

    // Map visual style to prompt enhancement
    const stylePrompts: Record<string, string> = {
      photorealistic: 'cinematic photography, photorealistic, high quality, detailed lighting, 35mm film',
      cartoon: 'colorful cartoon style, vibrant colors, cel shaded, animated movie style',
      anime: 'anime style, Japanese animation, detailed anime art, studio ghibli inspired',
      illustration: 'digital illustration, artistic, detailed artwork, concept art style',
      pixar: 'Pixar 3D animation style, Disney quality, CGI render, smooth 3D characters',
      watercolor: 'watercolor painting, soft colors, artistic brushstrokes, painted style',
      oil_painting: 'oil painting style, classical art, rich colors, painterly brushwork',
      noir: 'film noir style, high contrast black and white, dramatic shadows, cinematic',
    };

    const selectedStylePrompt = stylePrompts[visualStyle] || stylePrompts.photorealistic;

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

    // Get props for reference
    const { data: props } = await supabase
      .from('props')
      .select('name, visual_description, reference_images')
      .eq('project_id', projectId);

    // Get location for this scene
    const { data: locations } = await supabase
      .from('locations')
      .select('name, visual_description, reference_images')
      .eq('project_id', projectId);

    // Check API key
    if (!process.env.AI_FAL_KEY) {
      return NextResponse.json({ error: 'AI_FAL_KEY not configured' }, { status: 500 });
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
      props: props || [],
      locations: locations || [],
      style: project.visual_style || 'photorealistic',
    };

    // Generate prompts using Claude
    const prompts = await generateFramePrompts(context, frameType);

    // DEBUG: Log what Claude generated
    console.log('=== SHOT DESCRIPTION ===');
    console.log(context.shot.description);
    console.log('=== CLAUDE GENERATED PROMPTS ===');
    console.log('First frame:', prompts.firstFrame);
    console.log('Last frame:', prompts.lastFrame);

    const results: { firstFrame?: string; lastFrame?: string } = {};

    // Helper to wait
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Helper to upload images to fal.ai storage (handles B2, local, and public URLs)
    const uploadToFalStorage = async (imageUrl: string): Promise<string> => {
      // If already on fal.ai, return as-is
      if (imageUrl.includes('fal.media') || imageUrl.includes('fal-cdn')) {
        return imageUrl;
      }

      const { fal } = await import('@fal-ai/client');
      fal.config({ credentials: process.env.AI_FAL_KEY });

      // Convert B2 URLs to signed URLs first
      let fetchUrl = imageUrl;
      if (imageUrl.startsWith('b2://')) {
        const parsed = parseStorageUrl(imageUrl);
        if (parsed) {
          console.log(`Converting b2:// URL to signed URL: ${imageUrl}`);
          fetchUrl = await getSignedFileUrl(parsed.key);
        }
      }

      // Check if it's a local URL that needs uploading
      const isLocalUrl = fetchUrl.includes('localhost') ||
                         fetchUrl.includes('127.0.0.1') ||
                         fetchUrl.includes('0.0.0.0');

      // For public remote URLs (not local, not B2), return as-is
      if (!isLocalUrl && !imageUrl.startsWith('b2://')) {
        return imageUrl;
      }

      console.log(`Uploading image to fal.ai storage...`);
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const blob = await response.blob();
      const uploadedUrl = await fal.storage.upload(blob);
      console.log(`Uploaded to fal.ai: ${uploadedUrl}`);

      return uploadedUrl;
    };

    // Helper to upload image to B2
    const uploadToB2 = async (imageUrl: string, suffix: string): Promise<string> => {
      const imageResponse = await fetch(imageUrl);
      const imageBlob = await imageResponse.blob();
      const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());

      const sanitizedUserId = session.user.sub.replace(/[|]/g, '_');
      const storageKey = `frames/${sanitizedUserId}/${projectId}/${shotId}_${suffix}_${Date.now()}.webp`;

      await uploadFile(storageKey, imageBuffer, 'image/webp');

      // Return B2 URL format for database storage
      return `b2://${STORAGE_BUCKET}/${storageKey}`;
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
    // Supports @LeLapin (PascalCase reference) or "Le lapin" (full name)
    const findCharactersInShot = (): typeof characters => {
      const matchedCharacters: typeof characters = [];

      // Combine all text sources
      const allText = [
        context.shot.description || '',
        ...context.dialogues.map((d: any) => `${d.character_name || ''} ${d.content || ''}`),
        ...context.actions.map((a: any) => a.content || ''),
      ].join(' ');

      for (const char of characters || []) {
        if (hasReference(allText, char.name) && getRefImages(char.reference_images).length > 0) {
          matchedCharacters.push(char);
          console.log(`Found character: ${char.name} (${generateReferenceName(char.name)})`);
        }
      }

      return matchedCharacters;
    };

    // Find props present in this shot (from actions, description, and dialogues)
    // Supports @LeRevolver (PascalCase reference) or "Le revolver" (full name)
    const findPropsInShot = (): typeof props => {
      const matchedProps: typeof props = [];

      // Combine all text sources
      const allText = [
        context.shot.description || '',
        ...context.dialogues.map((d: any) => d.content || ''),
        ...context.actions.map((a: any) => a.content || ''),
      ].join(' ');

      for (const prop of props || []) {
        if (hasReference(allText, prop.name) && getRefImages(prop.reference_images).length > 0) {
          matchedProps.push(prop);
          console.log(`Found prop: ${prop.name} (${generateReferenceName(prop.name)})`);
        }
      }

      return matchedProps;
    };

    const shotCharacters = findCharactersInShot() || [];
    const shotProps = findPropsInShot() || [];
    console.log(`Found ${shotCharacters.length} characters with reference images in shot`);
    console.log(`Found ${shotProps.length} props with reference images in shot`);

    // Select the best pose based on camera angle
    // Convention: reference_images = [front, back, profile] or [front] if only one
    const selectPoseForAngle = (refImages: string[], cameraAngle: string): string => {
      if (refImages.length === 0) return '';
      if (refImages.length === 1) return refImages[0]; // Only one pose available

      // Map camera angles to pose indices
      // 0 = front, 1 = back, 2 = profile (side)
      const angleToIndex: Record<string, number> = {
        // Front-facing angles
        'eye_level': 0,
        'low_angle': 0,
        'high_angle': 0,
        'dutch_angle': 0,
        'extreme_low_angle': 0,
        'extreme_high_angle': 0,
        'birds_eye': 0,
        'worms_eye': 0,
        // Back-facing angles
        'over_shoulder': 1,
        'behind': 1,
        'back': 1,
        // Profile/side angles
        'profile': 2,
        'side': 2,
        'three_quarter': 0, // 3/4 is closer to front
      };

      const poseIndex = angleToIndex[cameraAngle] ?? 0;

      // Use available pose, fallback to front if not available
      if (poseIndex < refImages.length) {
        console.log(`Selected pose ${poseIndex} (${['front', 'back', 'profile'][poseIndex]}) for camera angle: ${cameraAngle}`);
        return refImages[poseIndex];
      }

      console.log(`Pose ${poseIndex} not available, using front pose for angle: ${cameraAngle}`);
      return refImages[0];
    };

    // Collect character reference images for consistency with pose selection
    const getCharacterReferenceImages = (): string[] => {
      const refImages: string[] = [];
      const cameraAngle = shot.camera_angle || 'eye_level';

      for (const char of shotCharacters) {
        const images = getRefImages(char.reference_images);
        if (images.length > 0) {
          const selectedPose = selectPoseForAngle(images, cameraAngle);
          refImages.push(selectedPose);
          console.log(`Character ${char.name}: selected pose for ${cameraAngle}`);
        }
      }
      return refImages;
    };

    // Get ALL character reference images (all poses) for multi-reference
    const getAllCharacterReferenceImages = (): string[] => {
      const refImages: string[] = [];
      for (const char of shotCharacters) {
        const images = getRefImages(char.reference_images);
        refImages.push(...images);
      }
      return refImages;
    };

    const characterRefImages = getCharacterReferenceImages();
    const allCharacterRefImages = getAllCharacterReferenceImages();
    console.log(`Found ${characterRefImages.length} character reference images (pose-selected)`);
    console.log(`Total character poses available: ${allCharacterRefImages.length}`);

    // Combine all entities for reference replacement
    const allEntities = [
      ...(characters || []).map(c => ({ name: c.name, visual_description: c.visual_description })),
      ...(props || []).map(p => ({ name: p.name, visual_description: p.visual_description })),
      ...(locations || []).map(l => ({ name: l.name, visual_description: l.visual_description })),
    ];

    // Sanitize prompt to avoid triggering known cartoon characters
    // Replace generic animal terms with neutral descriptions
    const sanitizePromptForCharacterConsistency = (prompt: string): string => {
      const replacements: [RegExp, string][] = [
        // Avoid Looney Tunes / Tex Avery associations
        [/\bcoyote\b/gi, 'orange canine creature'],
        [/\brabbit\b/gi, 'small white long-eared mammal'],
        [/\blapin\b/gi, 'small white long-eared mammal'],
        [/\bbunny\b/gi, 'small long-eared mammal'],
        [/\bwolf\b/gi, 'canine creature'],
        [/\bloup\b/gi, 'canine creature'],
        // Avoid Road Runner associations
        [/\broadrunner\b/gi, 'fast running bird'],
        [/\bbird\b/gi, 'feathered creature'],
        // Avoid other cartoon associations
        [/\bmouse\b/gi, 'small rodent'],
        [/\bsouris\b/gi, 'small rodent'],
        [/\bcat\b/gi, 'feline'],
        [/\bchat\b/gi, 'feline'],
        [/\bduck\b/gi, 'waterfowl'],
        [/\bcanard\b/gi, 'waterfowl'],
      ];

      let sanitized = prompt;
      for (const [pattern, replacement] of replacements) {
        sanitized = sanitized.replace(pattern, replacement);
      }

      // Add negative guidance
      sanitized += '. NOT Wile E. Coyote, NOT Bugs Bunny, NOT Looney Tunes, NOT Warner Bros style, original character design only.';

      return sanitized;
    };

    // Build explicit positioning prompt for chase scenes and multi-character shots
    const buildPositioningPrompt = (basePrompt: string, isLastFrame: boolean): string => {
      // Detect if this is a chase scene
      const chaseKeywords = ['chase', 'poursuite', 'poursuit', 'court après', 'fuit', 'running after', 'chasing'];
      const isChaseScene = chaseKeywords.some(kw => basePrompt.toLowerCase().includes(kw));

      if (isChaseScene && shotCharacters.length >= 2) {
        // Use visual descriptions instead of names to avoid triggering known characters
        const char1Desc = shotCharacters[0].visual_description || 'first character';
        const char2Desc = shotCharacters[1].visual_description || 'second character';

        // Build VERY explicit spatial and action positioning
        // Screen positions: LEFT (0-33%), CENTER (33-66%), RIGHT (66-100%)
        const positioning = isLastFrame
          ? `COMPOSITION: On the LEFT side of frame (position 20% from left edge): ${char1Desc} in dynamic running pose, legs extended, body leaning forward, arms pumping. On the RIGHT side of frame (position 70% from left edge): ${char2Desc} running away, looking back over shoulder, legs in mid-stride. Both characters running from LEFT to RIGHT direction. Chaser is BEHIND the target. Dust clouds under feet. Motion blur on extremities.`
          : `COMPOSITION: On the LEFT side of frame (position 15% from left edge): ${char1Desc} starting to run, determined expression, body angled forward. On the RIGHT side of frame (position 75% from left edge): ${char2Desc} ahead, running away, looking scared. Clear separation between characters. Both facing RIGHT (direction of movement). The first character is CHASING the second character.`;

        console.log(`Chase scene detected. Adding explicit positioning.`);
        return `${positioning}. Original action: ${basePrompt}`;
      }

      return basePrompt;
    };

    // Generate image with character consistency using Flux Redux
    // Redux generates variations while preserving the subject's style and appearance
    // Better than Kontext for cartoon character consistency in new scenes
    const generateWithFluxRedux = async (
      basePrompt: string,
      referenceImageUrl?: string,
      isLastFrame = false
    ): Promise<string> => {
      const { fal } = await import('@fal-ai/client');
      fal.config({ credentials: process.env.AI_FAL_KEY });

      // Apply positioning for chase scenes
      let sceneDescription = buildPositioningPrompt(basePrompt, isLastFrame);

      // CRITICAL: Sanitize prompt to avoid triggering known cartoon characters
      sceneDescription = sanitizePromptForCharacterConsistency(sceneDescription);

      // Build character context WITHOUT names that trigger known characters
      const characterContext = shotCharacters
        .map(c => sanitizePromptForCharacterConsistency(c.visual_description || ''))
        .filter(Boolean)
        .join(', ');

      // Build props context
      const propsContext = shotProps
        .map(p => p.visual_description)
        .filter(Boolean)
        .join(', ');

      // Build location context
      const matchedLocations = (locations || []).filter(l =>
        hasReference(basePrompt, l.name) && l.visual_description
      );
      const locationContext = matchedLocations
        .map(l => l.visual_description)
        .join('. ');

      // Determine reference image
      const refImage = referenceImageUrl || characterRefImages[0];
      const isUsingFirstFrameAsRef = !!referenceImageUrl;

      // Build prompt emphasizing character preservation
      const fullPrompt = [
        selectedStylePrompt,
        isUsingFirstFrameAsRef
          ? `Continue the scene from reference. Same characters, same style, show movement progression.`
          : `Place the EXACT character from reference into this new scene. Preserve all visual details.`,
        characterContext ? `Characters: ${characterContext}` : '',
        `Scene: ${sceneDescription}`,
        propsContext ? `With: ${propsContext}` : '',
        locationContext ? `Setting: ${locationContext}` : '',
        `cinematic, consistent character design, no text, no watermark`,
      ].filter(Boolean).join('. ');

      console.log(`Generating with Flux Redux (${isLastFrame ? 'last frame' : 'first frame'})...`);
      console.log(`Reference image: ${refImage.substring(0, 100)}...`);
      console.log('Sanitized prompt:', fullPrompt.substring(0, 400) + '...');

      // Flux Redux: Generates variations preserving subject style
      // redux_strength: 0.0 = pure generation, 1.0 = exact copy
      // For character consistency in new scenes, use 0.6-0.8
      const result = await fal.subscribe('fal-ai/flux-pro/v1.1-ultra/redux', {
        input: {
          prompt: fullPrompt,
          image_url: refImage,
          redux_strength: isUsingFirstFrameAsRef ? 0.7 : 0.6, // Higher for sequential frames
          aspect_ratio: '16:9',
          num_images: 1,
          output_format: 'jpeg',
          safety_tolerance: 6,
        } as any,
        logs: true,
        onQueueUpdate: async (update) => {
          console.log(`Flux Redux progress: ${update.status}`);
          const statusMap: Record<string, string> = {
            'IN_QUEUE': 'queued',
            'IN_PROGRESS': 'generating',
            'COMPLETED': 'completed',
          };
          const mappedStatus = statusMap[update.status] || update.status;
          await supabase.from('shots').update({
            frame_generation_status: JSON.stringify({
              status: mappedStatus,
              mode: 'flux_redux',
              reference: refImage.substring(0, 100),
              frameType: isLastFrame ? 'last' : 'first',
            }),
          }).eq('id', shotId);
        },
      });

      const data = result.data as any;
      console.log('Flux Redux response:', JSON.stringify(data, null, 2).substring(0, 500));

      const imageUrl = data?.images?.[0]?.url || data?.image?.url;
      if (!imageUrl) throw new Error('No image URL in Flux Redux response: ' + JSON.stringify(data));
      return imageUrl;
    };

    // Fallback: Generate with Flux Kontext if IP-Adapter fails
    const generateWithKontext = async (
      basePrompt: string,
      referenceImageUrl?: string,
      isLastFrame = false
    ): Promise<string> => {
      const { fal } = await import('@fal-ai/client');
      fal.config({ credentials: process.env.AI_FAL_KEY });

      // Apply positioning and sanitization
      let sceneDescription = buildPositioningPrompt(basePrompt, isLastFrame);
      sceneDescription = sanitizePromptForCharacterConsistency(sceneDescription);

      const characterContext = shotCharacters
        .map(c => sanitizePromptForCharacterConsistency(c.visual_description || ''))
        .filter(Boolean)
        .join(', ');

      const refImage = referenceImageUrl || characterRefImages[0];

      const fullPrompt = [
        selectedStylePrompt,
        `Preserve the EXACT character from the reference image.`,
        characterContext ? `Characters: ${characterContext}` : '',
        `Scene: ${sceneDescription}`,
        `cinematic, no text, no watermark`,
      ].filter(Boolean).join('. ');

      console.log('Fallback: Generating with Flux Kontext...');

      const result = await fal.subscribe('fal-ai/flux-pro/kontext', {
        input: {
          prompt: fullPrompt,
          image_url: refImage,
          guidance_scale: 4.0,
        } as any,
        logs: true,
      });

      const data = result.data as any;
      const imageUrl = data?.images?.[0]?.url || data?.image?.url;
      if (!imageUrl) throw new Error('No image URL in Kontext response');
      return imageUrl;
    };

    // Generate image with Grok Aurora (xAI) - Best for character consistency
    const generateWithGrokAurora = async (
      basePrompt: string,
      referenceImageUrl?: string,
      isLastFrame = false
    ): Promise<string> => {
      if (!process.env.AI_X_KEY) {
        throw new Error('AI_X_KEY not configured');
      }

      // Apply positioning for chase scenes
      let sceneDescription = buildPositioningPrompt(basePrompt, isLastFrame);

      // Build detailed character descriptions
      const characterDescriptions = shotCharacters
        .map(c => {
          const desc = c.visual_description || '';
          return `Character "${c.name}": ${desc}`;
        })
        .join('\n');

      // Build props descriptions
      const propsDescriptions = shotProps
        .map(p => p.visual_description)
        .filter(Boolean)
        .join(', ');

      // Build location context
      const matchedLocations = (locations || []).filter(l =>
        hasReference(basePrompt, l.name) && l.visual_description
      );
      const locationContext = matchedLocations
        .map(l => l.visual_description)
        .join('. ');

      // Build comprehensive prompt with character details
      const fullPrompt = [
        selectedStylePrompt,
        `IMPORTANT: Generate these EXACT characters with these EXACT visual designs:`,
        characterDescriptions,
        ``,
        `Scene description: ${sceneDescription}`,
        propsDescriptions ? `Props in scene: ${propsDescriptions}` : '',
        locationContext ? `Environment: ${locationContext}` : '',
        ``,
        `Style: Pixar 3D animation, CGI render, cinematic lighting`,
        `Technical: 16:9 aspect ratio, high quality, no text, no watermark`,
        isLastFrame ? `This is the END of the shot - show progression from the starting position.` : `This is the START of the shot.`,
      ].filter(Boolean).join('\n');

      console.log(`Generating with Grok Aurora (${isLastFrame ? 'last frame' : 'first frame'})...`);
      console.log('Prompt:', fullPrompt.substring(0, 500) + '...');

      await supabase.from('shots').update({
        frame_generation_status: JSON.stringify({
          status: 'generating',
          mode: 'grok_aurora',
          frameType: isLastFrame ? 'last' : 'first',
        }),
      }).eq('id', shotId);

      // Use xAI Images API directly
      // Try different model names - xAI has changed the name several times
      const modelNames = ['grok-2-image', 'grok-imagine-image', 'aurora'];
      let response: Response | null = null;
      let lastError = '';

      for (const modelName of modelNames) {
        console.log(`Trying xAI model: ${modelName}`);
        response = await fetch('https://api.x.ai/v1/images/generations', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.AI_X_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelName,
            prompt: fullPrompt,
            n: 1,
            response_format: 'url',
          }),
        });

        if (response.ok) {
          console.log(`Success with model: ${modelName}`);
          break;
        }

        lastError = await response.text();
        console.log(`Model ${modelName} failed: ${lastError.substring(0, 100)}`);
        response = null;
      }

      if (!response) {
        throw new Error(`All xAI models failed. Last error: ${lastError}`);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Grok API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('Grok Aurora response:', JSON.stringify(data).substring(0, 300));

      // Extract image URL from response
      const imageUrl = data.data?.[0]?.url;
      if (!imageUrl) {
        throw new Error('No image URL in Grok response: ' + JSON.stringify(data));
      }

      console.log('Grok Aurora image URL:', imageUrl.substring(0, 100) + '...');
      return imageUrl;
    };

    // Generate with Kling O1 Image - supports multiple character elements like their web interface
    const generateWithKlingO1 = async (
      basePrompt: string,
      referenceImageUrl?: string,
      isLastFrame = false
    ): Promise<string> => {
      const { fal } = await import('@fal-ai/client');
      fal.config({ credentials: process.env.AI_FAL_KEY });

      // Build elements array - one element per character with their reference images
      const elements: Array<{ reference_image_urls: string[]; frontal_image_url?: string }> = [];

      // Map character names to element numbers for prompt replacement
      const characterToElement: Record<string, string> = {};

      for (let i = 0; i < shotCharacters.length; i++) {
        const char = shotCharacters[i];
        const charRefImages = getRefImages(char.reference_images);

        if (charRefImages.length > 0) {
          // Upload reference images to fal.ai storage
          const uploadedRefs: string[] = [];
          for (const refUrl of charRefImages.slice(0, 3)) { // Max 3 per element
            const uploaded = await uploadToFalStorage(refUrl);
            uploadedRefs.push(uploaded);
          }

          elements.push({
            frontal_image_url: uploadedRefs[0], // First image as frontal
            reference_image_urls: uploadedRefs.slice(1), // Rest as additional refs
          });

          // Map @CharacterName to @Element{N}
          const refName = generateReferenceName(char.name);
          characterToElement[refName] = `@Element${i + 1}`;
          characterToElement[char.name] = `@Element${i + 1}`;
          console.log(`Character "${char.name}" (${refName}) -> @Element${i + 1}`);
        }
      }

      if (elements.length === 0) {
        throw new Error('No character elements available');
      }

      console.log(`Using ${elements.length} character element(s) for Kling O1`);

      // First: Replace @Props and @Locations with their visual descriptions
      // These are NOT elements, so we need to expand them to text
      const propsAndLocations = [
        ...(props || []).map(p => ({ name: p.name, visual_description: p.visual_description })),
        ...(locations || []).map(l => ({ name: l.name, visual_description: l.visual_description })),
      ];
      let klingPrompt = replaceReferencesWithDescriptions(basePrompt, propsAndLocations);

      // Then: Replace @CharacterName with @Element1, @Element2, etc.
      for (const [charRef, elementRef] of Object.entries(characterToElement)) {
        const regex = new RegExp(charRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        klingPrompt = klingPrompt.replace(regex, elementRef);
      }

      // Add style
      klingPrompt = `${selectedStylePrompt}. ${klingPrompt}. Cinematic composition, 16:9, no text, no watermark.`;

      console.log(`Generating with Kling O1 (${isLastFrame ? 'last' : 'first'} frame)...`);
      console.log(`Elements: ${elements.length}`);
      console.log(`=== FULL PROMPT TO KLING O1 ===`);
      console.log(klingPrompt);
      console.log(`=== END PROMPT ===`);

      await supabase.from('shots').update({
        frame_generation_status: JSON.stringify({
          status: 'generating',
          mode: 'kling_o1',
          frameType: isLastFrame ? 'last' : 'first',
        }),
      }).eq('id', shotId);

      // Log the input for debugging
      const klingInput = {
        prompt: klingPrompt,
        elements: elements,
        resolution: '2K',
        aspect_ratio: '16:9',
        num_images: 1,
        output_format: 'png',
      };
      console.log('=== KLING O1 INPUT ===');
      console.log(JSON.stringify(klingInput, null, 2));
      console.log('=== END INPUT ===');

      // Use Kling O1 Image with elements for character consistency
      const result = await fal.subscribe('fal-ai/kling-image/o1', {
        input: klingInput as any,
        logs: true,
        onQueueUpdate: async (update) => {
          console.log(`Kling O1: ${update.status}`);
        },
      });

      const data = result.data as any;
      const imageUrl = data?.images?.[0]?.url;
      if (!imageUrl) {
        throw new Error('No image in Kling O1 response: ' + JSON.stringify(data));
      }

      console.log('Kling O1 success');
      return imageUrl;
    };

    // Main character consistency function
    const generateWithCharacterConsistency = async (
      basePrompt: string,
      referenceImageUrl?: string,
      isLastFrame = false
    ): Promise<string> => {
      // Use Kling O1 Image - same system as Kling web interface with @Element references
      return await generateWithKlingO1(basePrompt, referenceImageUrl, isLastFrame);
    };

    // Generate image using Nano Banana 2 (fallback when no character references)
    const generateWithNanoBanana = async (basePrompt: string, isLastFrame = false): Promise<string> => {
      const { fal } = await import('@fal-ai/client');
      fal.config({ credentials: process.env.AI_FAL_KEY });

      // Apply positioning for chase scenes
      const positionedPrompt = buildPositioningPrompt(basePrompt, isLastFrame);

      // Replace all @mentions with their visual descriptions
      let prompt = replaceReferencesWithDescriptions(positionedPrompt, allEntities);

      // Sanitize to avoid known cartoon characters
      prompt = sanitizePromptForCharacterConsistency(prompt);
      console.log(`Replaced @mentions and sanitized prompt`);

      // Add location context if found
      const matchedLocations = (locations || []).filter(l =>
        hasReference(basePrompt, l.name) && l.visual_description
      );
      if (matchedLocations.length > 0) {
        const locationDescriptions = matchedLocations
          .map(l => l.visual_description)
          .join('. ');
        prompt = `${prompt}. Environment: ${locationDescriptions}`;
        console.log(`Enhanced prompt with ${matchedLocations.length} location descriptions`);
      }

      const fullPrompt = `${selectedStylePrompt}, ${prompt}, no text, no labels, no watermark`;

      console.log(`Generating with Nano Banana 2 (1K HD 16:9) - ${isLastFrame ? 'last' : 'first'} frame...`);
      console.log('Prompt:', fullPrompt.substring(0, 300) + '...');

      const result = await fal.subscribe('fal-ai/nano-banana-2', {
        input: {
          prompt: fullPrompt,
          resolution: '1K',
          aspect_ratio: '16:9',
          num_images: 1,
          output_format: 'png',
        } as any,
        logs: true,
        onQueueUpdate: async (update) => {
          console.log(`Nano Banana 2 progress: ${update.status}`);
          const statusMap: Record<string, string> = {
            'IN_QUEUE': 'queued',
            'IN_PROGRESS': 'generating',
            'COMPLETED': 'completed',
          };
          const mappedStatus = statusMap[update.status] || update.status;
          await supabase.from('shots').update({
            frame_generation_status: JSON.stringify({
              status: mappedStatus,
              frameType: isLastFrame ? 'last' : 'first',
            }),
          }).eq('id', shotId);
        },
      });

      const imageUrl = (result.data as any)?.images?.[0]?.url;
      if (!imageUrl) throw new Error('No image URL in Nano Banana 2 response');
      return imageUrl;
    };

    // Track which provider was actually used
    let actualProvider = 'nano-banana-2';
    let generationMode = 'standard';

    // Generate first frame - uses character reference
    const generateFirstFrame = async (prompt: string): Promise<string> => {
      let imageUrl: string;

      if (characterRefImages.length > 0) {
        console.log(`Using character consistency for first frame with ${characterRefImages.length} reference(s)`);
        try {
          imageUrl = await generateWithCharacterConsistency(prompt, undefined, false);
          actualProvider = 'kling-o1';
          generationMode = 'character_consistency';
        } catch (error) {
          console.error('Kling O1 failed for first frame, falling back to Nano Banana 2:', error);
          imageUrl = await generateWithNanoBanana(prompt, false);
          actualProvider = 'nano-banana-2 (fallback)';
        }
      } else {
        console.log('No character references found, using Nano Banana 2 for first frame');
        imageUrl = await generateWithNanoBanana(prompt, false);
        actualProvider = 'nano-banana-2';
      }

      return uploadToB2(imageUrl, 'first');
    };

    // Generate last frame - uses SAME character references as first frame (NOT the first frame itself)
    // Using first frame as reference confuses Ideogram Character and causes character duplication
    const generateLastFrame = async (
      prompt: string,
      _firstFrameUrl?: string // Kept for API compatibility but NOT used
    ): Promise<string> => {
      let imageUrl: string;

      // Use character references directly (same as first frame)
      // Do NOT use first frame as reference - it confuses Ideogram Character
      if (characterRefImages.length > 0) {
        console.log('Using character consistency for last frame (independent generation)');
        try {
          imageUrl = await generateWithCharacterConsistency(prompt, undefined, true);
          actualProvider = 'kling-o1';
          generationMode = 'character_consistency';
        } catch (error) {
          console.error('Character consistency failed for last frame, falling back to Nano Banana 2:', error);
          imageUrl = await generateWithNanoBanana(prompt, true);
          actualProvider = 'nano-banana-2 (fallback)';
        }
      } else {
        console.log('No references available, using Nano Banana 2 for last frame');
        imageUrl = await generateWithNanoBanana(prompt, true);
        actualProvider = 'nano-banana-2';
      }

      return uploadToB2(imageUrl, 'last');
    };

    // Generate frames with sequential logic
    const updates: any = {};
    let firstFramePublicUrl: string | undefined;

    if (frameType === 'first' || frameType === 'both') {
      console.log('=== Generating first frame ===');
      results.firstFrame = await generateFirstFrame(prompts.firstFrame);
      updates.first_frame_url = results.firstFrame;
      updates.first_frame_prompt = prompts.firstFrame;
      firstFramePublicUrl = results.firstFrame;
    }

    if (frameType === 'last' || frameType === 'both') {
      if (frameType === 'both') {
        // Wait between generations to avoid rate limits
        console.log('Waiting 5s before generating last frame...');
        await sleep(5000);
      }
      console.log('=== Generating last frame ===');
      // Pass the first frame URL for sequential generation
      results.lastFrame = await generateLastFrame(prompts.lastFrame, firstFramePublicUrl);
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
      provider: actualProvider,
      mode: generationMode,
      resolution: '16:9',
      charactersUsed: shotCharacters.map(c => c.name),
      characterReferencesUsed: characterRefImages.length,
      totalPosesAvailable: allCharacterRefImages.length,
      propsUsed: shotProps.map(p => p.name),
      independentFrames: true, // Both frames generated independently with same character refs
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

CRITICAL: AI image models do NOT understand abstract actions. You MUST describe SPATIAL COMPOSITION explicitly.

ALWAYS USE THIS STRUCTURE:
1. Camera position and angle first
2. FOREGROUND: what's closest to camera (larger)
3. MIDGROUND: middle distance elements
4. BACKGROUND: what's furthest (smaller)
5. Direction relative to camera: "facing camera", "back to camera", "moving toward/away"
6. REPEAT spatial relationships 2-3 times for clarity

EXAMPLES BY SHOT TYPE:

CHASE SCENE:
"Camera low, ground level, facing HEAD-ON.
FOREGROUND: rabbit running TOWARD camera, scared, ears back.
DIRECTLY BEHIND: coyote chasing, hungry eyes, reaching forward.
The coyote is BEHIND the rabbit. Rabbit is BETWEEN coyote and camera.
Dust trails behind both toward horizon. Desert road, bright daylight."

DIALOGUE/CONVERSATION:
"Camera at eye level, medium shot.
LEFT SIDE OF FRAME: woman in red dress, facing RIGHT, speaking.
RIGHT SIDE OF FRAME: man in suit, facing LEFT, listening intently.
They face EACH OTHER. The woman is slightly closer to camera.
Coffee shop interior, warm lighting, blurred patrons in background."

ACTION/FIGHT:
"Camera low angle, dynamic.
FOREGROUND: hero's fist, large, swinging RIGHT.
MIDGROUND: villain recoiling backward, surprise on face.
Hero is CLOSER to camera than villain. Villain is being pushed BACK.
Urban alley, night, neon reflections on wet ground."

ESTABLISHING SHOT:
"Camera high, wide aerial view.
FOREGROUND: rooftops of buildings, detailed.
MIDGROUND: main street with tiny cars and people.
BACKGROUND: mountains on horizon, hazy.
City spreads FROM camera TOWARD distant mountains. Golden hour lighting."

CLOSE-UP REACTION:
"Camera at eye level, tight close-up.
FILLING THE FRAME: character's face, eyes wide with shock.
Mouth slightly open. Single tear on left cheek.
Character faces DIRECTLY toward camera. Shallow depth of field.
Dark room, single light source from screen off-frame illuminating face."

NEVER use abstract verbs alone (chase, fight, talk). ALWAYS describe spatial positions and directions relative to camera.`;

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

CHARACTERS IN PROJECT (use the @Reference in descriptions):
${context.characters.map((c: any) => `- "${c.name}" ${generateReferenceName(c.name)}: ${c.visual_description}`).join('\n') || 'None'}

PROPS IN PROJECT (use the @Reference in descriptions):
${context.props?.map((p: any) => `- "${p.name}" ${generateReferenceName(p.name)}: ${p.visual_description}`).join('\n') || 'None'}

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
    // Static
    static: 'No camera movement. First and last frame should be identical in framing.',

    // Dolly movements
    slow_dolly_in: 'Camera slowly moves closer. First frame is a wider shot, last frame is closer/tighter on the subject.',
    slow_dolly_out: 'Camera slowly moves back. First frame is closer, last frame is wider revealing more environment.',
    fast_dolly_in: 'Camera rushes toward subject. First frame is wide, last frame is very close.',
    dolly_zoom: 'Dolly zoom (Vertigo effect). Subject stays same size but background warps dramatically between frames.',

    // Zoom movements
    macro_zoom: 'Extreme zoom into detail. First frame shows full subject, last frame shows extreme close-up detail.',
    hyper_zoom: 'Continuous zoom from far to close. First frame is very wide, last frame is tight.',
    smooth_zoom_in: 'Optical zoom in. First frame wider, last frame tighter. Camera position stays fixed.',
    smooth_zoom_out: 'Optical zoom out. First frame tighter, last frame wider revealing context.',
    snap_zoom: 'Aggressive snap zoom. First frame normal, last frame sudden extreme close-up on eyes/face.',

    // Special shots
    over_the_shoulder: 'OTS framing. Blurred shoulder/head in foreground, subject sharp in background.',
    fisheye: 'Fisheye lens distortion. Curved edges, exaggerated perspective.',
    reveal_wipe: 'Lateral wipe reveal. First frame blocked by foreground, last frame reveals subject.',
    fly_through: 'Camera flies through opening. First frame looking at opening, last frame through it.',
    reveal_blur: 'Focus pull reveal. First frame all blurry bokeh, last frame sharp focus on subject.',
    rack_focus: 'Rack focus. First frame sharp foreground/blurry back, last frame sharp background/blurry front.',

    // Tilt movements
    tilt_up: 'Camera tilts upward. First frame shows feet/lower portion, last frame shows face/upper portion.',
    tilt_down: 'Camera tilts downward. First frame shows face/upper portion, last frame shows feet/lower portion.',

    // Truck movements
    truck_left: 'Camera slides left. Subject shifts right in frame between first and last.',
    truck_right: 'Camera slides right. Subject shifts left in frame between first and last.',

    // Orbit movements
    orbit_180: 'Camera orbits 180 degrees around subject. Completely different background between frames.',
    orbit_360_fast: 'Fast 360 orbit. Background completely different, subject from opposite angle.',
    slow_arc: 'Slow arc around subject. Subtle angle change, same general background.',

    // Pedestal movements
    pedestal_down: 'Camera lowers. First frame at eye level, last frame at waist level looking up.',
    pedestal_up: 'Camera rises. First frame at waist level looking up, last frame at eye level.',

    // Crane movements
    crane_up: 'Crane rises up. First frame ground level, last frame elevated looking down.',
    crane_down: 'Crane descends. First frame elevated, last frame ground level.',

    // Drone movements
    drone_flyover: 'High altitude flyover. First frame one side of scene, last frame other side.',
    drone_reveal: 'Drone rises to reveal. First frame behind obstacle, last frame high showing horizon.',
    drone_orbit: 'Wide aerial orbit. First and last frames show subject from different aerial angles.',
    drone_topdown: 'God\'s eye top-down view. Looking straight down, subject centered.',
    fpv_dive: 'FPV dive down structure. First frame at top, last frame at bottom near subject.',

    // Tracking movements
    tracking_backward: 'Camera retreats facing subject who approaches. Subject gets larger in frame.',
    tracking_forward: 'Camera follows behind subject. Subject\'s back visible, moving away.',
    tracking_side: 'Side tracking. Subject profile visible, background slides past.',
    pov_walk: 'First-person POV walking. Subtle movement, shadow or hand edge in frame.',

    // Other movements
    handheld: 'Handheld organic movement. Slight natural variation between frames.',
    whip_pan: 'Fast whip pan. First frame one subject, last frame different subject, motion blur between.',
    dutch_roll: 'Dutch angle roll. Tilted horizon, disorienting composition.',
  };

  return instructions[movement] || 'Standard framing for both frames.';
}
