/**
 * Queue Video Generation API Route
 *
 * New async endpoint that uses BullMQ for background processing.
 * Returns immediately with a job ID that can be polled via /api/jobs.
 *
 * Supports both standard and cinematic modes:
 * - Standard: Uses shot-level fields (animation_prompt, shot_type, etc.)
 * - Cinematic: Uses segments with beats, cinematic_header, character references
 */

import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { enqueueVideoGen, type VideoGenJobData } from '@/lib/bullmq';
import { buildCinematicPrompt, analyzeCharacters, type VideoModelType } from '@/lib/ai/cinematic-prompt-builder';
import { GENERIC_CHARACTERS } from '@/lib/generic-characters';
import { createElevenLabsWrapper, ELEVENLABS_MODELS } from '@/lib/ai/elevenlabs-wrapper';
import { uploadFile, STORAGE_BUCKET } from '@/lib/storage';
import { extractCharacterViews, getBestView, getImageForView, type CharacterView } from '@/lib/character-view-detection';
import type { GlobalAsset } from '@/types/database';
import type { Segment, CinematicHeaderConfig, SegmentElement } from '@/types/cinematic';

// Kling AI limits
const MAX_ELEMENTS = 6;
const MAX_VOICES = 2;

interface RouteParams {
  params: Promise<{ projectId: string; shotId: string }>;
}

// Camera settings mappings for prompt generation
const SHOT_TYPE_PROMPTS: Record<string, string> = {
  wide: 'wide shot',
  medium: 'medium shot',
  close_up: 'close-up shot',
  extreme_close_up: 'extreme close-up',
  over_shoulder: 'over-the-shoulder shot',
  pov: 'POV shot',
};

const CAMERA_ANGLE_PROMPTS: Record<string, string> = {
  eye_level: 'eye level angle',
  low_angle: 'low angle looking up',
  high_angle: 'high angle looking down',
  dutch_angle: 'dutch angle tilted',
  birds_eye: 'birds eye view from above',
  worms_eye: 'worms eye view from below',
};

const CAMERA_MOVEMENT_PROMPTS: Record<string, string> = {
  static: 'static camera',
  slow_dolly_in: 'slow dolly in towards subject',
  slow_dolly_out: 'slow dolly out from subject',
  tracking_forward: 'tracking forward movement',
  tracking_backward: 'tracking backward movement',
  orbit_180: 'orbiting 180 degrees around subject',
  handheld: 'handheld camera subtle movement',
  smooth_zoom_in: 'smooth zoom in',
  smooth_zoom_out: 'smooth zoom out',
};

// Clean dialogue text for TTS - remove mention tags that shouldn't be spoken
function cleanDialogueForTTS(text: string): string {
  return text
    // Remove @mentions (characters)
    .replace(/@\w+/g, '')
    // Remove #mentions (locations)
    .replace(/#\w+/g, '')
    // Remove !mentions (looks/styles)
    .replace(/!\w+/g, '')
    // Remove &in/&out references
    .replace(/&in\b/gi, '')
    .replace(/&out\b/gi, '')
    // Clean up extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// Build optimized video prompt
function buildVideoPrompt(opts: {
  animation?: string | null;
  description?: string | null;
  shotType?: string | null;
  cameraAngle?: string | null;
  cameraMovement?: string | null;
}): string {
  const parts: string[] = [];

  if (opts.shotType && SHOT_TYPE_PROMPTS[opts.shotType]) {
    parts.push(SHOT_TYPE_PROMPTS[opts.shotType]);
  }
  if (opts.cameraAngle && CAMERA_ANGLE_PROMPTS[opts.cameraAngle]) {
    parts.push(CAMERA_ANGLE_PROMPTS[opts.cameraAngle]);
  }
  if (opts.cameraMovement && CAMERA_MOVEMENT_PROMPTS[opts.cameraMovement]) {
    parts.push(CAMERA_MOVEMENT_PROMPTS[opts.cameraMovement]);
  }

  let mainPrompt = opts.animation || opts.description || '';
  mainPrompt = mainPrompt.replace(/&in\b/gi, 'the starting frame');
  mainPrompt = mainPrompt.replace(/&out\b/gi, 'the ending frame');
  mainPrompt = mainPrompt.replace(/Character speaks:.*$/i, '').trim();

  if (mainPrompt) {
    parts.push(mainPrompt);
  }

  if (parts.length === 0) {
    return 'Smooth cinematic motion';
  }

  return parts.join(', ');
}

/**
 * POST - Queue a video generation job
 * Returns immediately with the job ID for polling
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shotId } = await params;
    const body = await request.json();
    const { duration, model: requestedModel, provider: requestedProvider, dryRun } = body;

    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, aspect_ratio')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return Response.json(
        { error: 'Project not found', details: projectError },
        { status: 404 }
      );
    }

    // Get shot data with segments and cinematic_header
    const { data: shot, error: shotError } = await supabase
      .from('shots')
      .select(`
        *,
        animation_prompt,
        has_dialogue,
        dialogue_text,
        dialogue_character_id,
        dialogue_audio_url,
        dialogue_text_hash,
        audio_mode,
        audio_asset_id,
        audio_start,
        audio_end,
        segments,
        cinematic_header
      `)
      .eq('id', shotId)
      .single();

    if (!shot) {
      return Response.json(
        { error: 'Shot not found', details: shotError },
        { status: 404 }
      );
    }

    // Check if this is cinematic mode (has segments)
    const hasSegments = !!(shot.segments && Array.isArray(shot.segments) && shot.segments.length > 0);
    const hasFrameIn = !!(shot.first_frame_url || shot.storyboard_image_url);

    // Validate: need either a frame OR segments (text-to-video with Kling Omni)
    if (!hasFrameIn && !hasSegments) {
      return Response.json(
        { error: 'Frame In ou au moins un segment requis pour générer la vidéo' },
        { status: 400 }
      );
    }

    // Determine provider and model
    const videoProvider = (requestedProvider && ['fal', 'runway'].includes(requestedProvider))
      ? requestedProvider
      : 'fal';
    const videoModel = requestedModel || (videoProvider === 'runway' ? 'gen4' : 'kling-omni');
    const videoDuration = duration || shot.suggested_duration || 5;

    // Map aspect ratio
    const aspectRatioMap: Record<string, '9:16' | '16:9' | '1:1'> = {
      '9:16': '9:16',
      '16:9': '16:9',
      '1:1': '1:1',
      '4:5': '9:16',
      '2:3': '9:16',
      '21:9': '16:9',
    };
    const aspectRatio = aspectRatioMap[project.aspect_ratio] || '16:9';

    // Check if this is cinematic mode (has segments)
    const segments = shot.segments as Segment[] | null;
    const isCinematicMode = !!(segments && segments.length > 0);

    // Deep merge cinematic_header: Sequence (base) + Shot (overrides)
    // Plan inherits from Sequence by default, but can override specific fields
    let cinematicHeader: CinematicHeaderConfig | null = null;

    if (shot.sequence_id) {
      const { data: sequence } = await supabase
        .from('sequences')
        .select('cinematic_header')
        .eq('id', shot.sequence_id)
        .single();

      if (sequence?.cinematic_header) {
        // Start with sequence's header as base
        cinematicHeader = { ...sequence.cinematic_header } as CinematicHeaderConfig;
        console.log('[QueueVideo] Base cinematic_header from sequence:', shot.sequence_id);
      }
    }

    // Deep merge shot's cinematic_header (Plan-level overrides)
    const shotHeader = shot.cinematic_header as CinematicHeaderConfig | null;
    if (shotHeader) {
      if (cinematicHeader) {
        // Merge: shot fields override sequence fields (only non-null/undefined values)
        cinematicHeader = {
          ...cinematicHeader,
          ...Object.fromEntries(
            Object.entries(shotHeader).filter(([_, v]) => v !== null && v !== undefined)
          ),
        } as CinematicHeaderConfig;
        console.log('[QueueVideo] Merged shot-level overrides into cinematic_header');
      } else {
        // No sequence header, use shot header directly
        cinematicHeader = shotHeader;
      }
    }

    if (cinematicHeader) {
      console.log('[QueueVideo] Effective cinematic_header:', JSON.stringify(cinematicHeader, null, 2));
    }

    let prompt: string;
    let characterMap = new Map<string, GlobalAsset>();

    if (isCinematicMode) {
      console.log('[QueueVideo] Cinematic mode detected, building cinematic prompt...');

      // Get all project characters for reference (global assets)
      const { data: projectAssets } = await supabase
        .from('project_assets')
        .select(`global_asset:global_assets (*)`)
        .eq('project_id', projectId);

      const globalCharacters = (projectAssets || [])
        .map(pa => pa.global_asset as unknown as GlobalAsset)
        .filter(a => a && a.asset_type === 'character')
        .map(char => {
          // Ensure visual_description has a fallback for CHARACTER LEGEND
          const charData = char.data as Record<string, unknown> | null;
          if (!charData?.visual_description) {
            const fallbackDesc = (charData?.description as string) || char.name;
            return {
              ...char,
              data: {
                ...(charData || {}),
                visual_description: fallbackDesc,
              },
            } as GlobalAsset;
          }
          return char;
        });

      // Also get generic characters from project_generic_assets
      // Note: generic_asset_id is a TEXT field (e.g., "generic:woman"), not a FK
      // We use GENERIC_CHARACTERS in-memory array to look up character data
      const { data: projectGenericAssets } = await supabase
        .from('project_generic_assets')
        .select('*')
        .eq('project_id', projectId);

      const genericCharacters = (projectGenericAssets || [])
        .map(pga => {
          // Look up the generic character from in-memory array
          const genericChar = GENERIC_CHARACTERS.find(g => g.id === pga.generic_asset_id);
          if (!genericChar) return null;

          // Get local overrides (may have reference images and character matrix)
          const localOverrides = (pga.local_overrides || {}) as {
            reference_images_metadata?: Array<{ url: string }>;
            visual_description?: string;
            description?: string;  // User's description fallback
            fal_voice_id?: string;
            character_matrix_url?: string;  // 2048x2048 composite with all views
          };
          const referenceImages = (localOverrides.reference_images_metadata || []).map(img => img.url);

          // Convert to GlobalAsset-like structure (partial, cast through unknown)
          // Use pga.id (UUID) as the unique identifier - NOT generic_asset_id which is shared by all variants
          return {
            id: pga.id,  // UUID from project_generic_assets (unique per imported character)
            name: pga.name_override || genericChar.name,  // Use name_override if set (e.g., "OldWoman#1")
            asset_type: 'character' as const,
            reference_images: referenceImages,
            data: {
              // Fallback chain: visual_description > description (user's) > generic description
              visual_description: localOverrides.visual_description
                || localOverrides.description
                || genericChar.description,
              fal_voice_id: localOverrides.fal_voice_id,
              // Character matrix: single image with front/profile/3-4/back views
              character_matrix_url: localOverrides.character_matrix_url,
            },
          } as unknown as GlobalAsset;
        })
        .filter((a): a is GlobalAsset => a !== null);

      // Merge both character sources
      const allCharacters = [...globalCharacters, ...genericCharacters];

      console.log('[QueueVideo] Global characters:', globalCharacters.map(c => c.name));
      console.log('[QueueVideo] Generic characters:', genericCharacters.map(c => c.name));
      console.log('[QueueVideo] All characters available:', allCharacters.map(c => ({ id: c.id, name: c.name, hasFalVoice: !!(c.data as Record<string, unknown>)?.fal_voice_id })));
      console.log('[QueueVideo] Segments to scan:', JSON.stringify(segments, null, 2));

      // Auto-detect characters from segments
      for (const segment of segments) {
        // New format: segment.elements
        if (segment.elements && Array.isArray(segment.elements)) {
          for (const element of segment.elements) {
            if (element.character_id) {
              const char = allCharacters.find(c => c.id === element.character_id);
              if (char) {
                characterMap.set(char.id, char);
                console.log(`[QueueVideo] Found character in element: ${char.name} (${char.id})`);
              }
            }
          }
        }
        // Legacy format: segment.beats
        if (segment.beats && Array.isArray(segment.beats)) {
          for (const beat of segment.beats) {
            if (beat.character_id) {
              const char = allCharacters.find(c => c.id === beat.character_id);
              if (char) {
                characterMap.set(char.id, char);
                console.log(`[QueueVideo] Found character in beat: ${char.name} (${char.id})`);
              }
            }
          }
        }
        // Legacy dialogue field
        if (segment.dialogue?.character_id) {
          const char = allCharacters.find(c => c.id === segment.dialogue!.character_id);
          if (char) {
            characterMap.set(char.id, char);
            console.log(`[QueueVideo] Found character in dialogue: ${char.name} (${char.id})`);
          }
        }
      }

      console.log('[QueueVideo] Detected characters:', Array.from(characterMap.values()).map(c => c.name));

      // Build cinematic prompt using the prompt builder
      // Pass hasStartFrame so the prompt builder knows the image budget
      const mockShort = { dialogue_language: 'en' };
      const mockPlan = {
        id: shotId,
        shot_number: shot.shot_number || 1,
        duration: shot.duration || videoDuration,
        sort_order: 0,
        segments,
        cinematic_header: cinematicHeader,
        // Include shot-level fields as fallback for segments without action
        description: shot.description,
        action: shot.action,
        animation_prompt: shot.animation_prompt,
      };

      prompt = buildCinematicPrompt(mockShort as never, [mockPlan] as never, characterMap, hasFrameIn, videoModel as VideoModelType);

      console.log('[QueueVideo] Cinematic prompt built:');
      console.log('--- START PROMPT ---');
      console.log(prompt);
      console.log('--- END PROMPT ---');
    } else {
      // Standard mode: use basic prompt builder
      prompt = buildVideoPrompt({
        animation: shot.animation_prompt,
        description: shot.description,
        shotType: shot.shot_type,
        cameraAngle: shot.camera_angle,
        cameraMovement: shot.camera_movement,
      });
    }

    // Create job record in Supabase
    const { data: job, error: jobError } = await supabase
      .from('generation_jobs')
      .insert({
        user_id: session.user.sub,
        // Note: asset_id is FK to global_assets, not shots - shotId is in input_data
        asset_type: 'shot',
        asset_name: `Plan ${shot.shot_number || 1}`,
        job_type: 'video',
        job_subtype: videoModel,
        status: 'queued',
        progress: 0,
        message: 'En file d\'attente...',
        fal_endpoint: videoProvider,
        input_data: {
          projectId,
          shotId,
          videoModel,
          duration: videoDuration,
          aspectRatio,
          prompt,
        },
        queued_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error('[QueueVideo] Failed to create job:', jobError);
      return Response.json(
        { error: 'Failed to create job', details: jobError },
        { status: 500 }
      );
    }

    // Get character reference images
    let characterReferenceImages: string[] = [];

    // Cinematic elements and voices for Kling Omni
    let cinematicElements: Array<{
      characterId: string;
      characterName: string;
      frontalImageUrl: string;
      referenceImageUrls?: string[];
    }> = [];
    let cinematicVoices: Array<{
      characterId: string;
      voiceId: string;
    }> = [];
    // Seedance audio references (pre-rendered ElevenLabs TTS for stars)
    let cinematicAudios: Array<{
      characterId: string;
      audioUrl: string;
    }> = [];

    if (isCinematicMode && characterMap.size > 0) {
      // Cinematic mode: use analyzeCharacters for smart image distribution
      console.log('[QueueVideo] Building cinematic elements for', characterMap.size, 'characters');

      // Extract character view hints from segment descriptions
      // Supports @Character:vue syntax (e.g., @Morgana:profil)
      const allSegmentText = segments
        .map(seg => [
          seg.description || '',
          ...(seg.elements || seg.beats || []).map((el: SegmentElement) => el.content || ''),
        ].join(' '))
        .join(' ');
      const manualViews = extractCharacterViews(allSegmentText);
      console.log('[QueueVideo] Manual view hints:', Object.fromEntries(manualViews));

      // Get shot framing from first segment
      const shotFraming = segments[0]?.shot_framing;

      // Analyze characters to determine Stars vs Figurants and image budget
      // Pass videoModel so it uses the correct config (Seedance vs Kling)
      const analysis = analyzeCharacters(characterMap, hasFrameIn, videoModel as VideoModelType);

      console.log('[QueueVideo] Character analysis:');
      console.log(`[QueueVideo] - Stars (with images): ${analysis.stars.length}`);
      console.log(`[QueueVideo] - Figurants (no images): ${analysis.figurants.length}`);
      console.log(`[QueueVideo] - Images per star: ${analysis.imagesPerStar}`);
      console.log(`[QueueVideo] - Has start frame: ${hasFrameIn}`);

      // Build elements only for Stars (characters with reference images)
      for (const star of analysis.stars) {
        if (cinematicElements.length >= MAX_ELEMENTS) {
          console.log(`[QueueVideo] - Max ${MAX_ELEMENTS} elements reached, skipping remaining stars`);
          break;
        }

        const char = characterMap.get(star.id);
        if (!char) continue;

        const charData = char.data as Record<string, unknown> | null;
        const refImages = char.reference_images || [];

        // Check for character matrix (single 2048x2048 composite image with all views)
        const characterMatrixUrl = charData?.character_matrix_url as string | undefined;

        // Get typed reference images for Kling (needs individual views, not matrix)
        const refImagesMetadata = (charData?.reference_images_metadata || []) as Array<{ url: string; type: string }>;

        console.log(`[QueueVideo] Processing star: ${star.name} (${star.id})`);
        console.log(`[QueueVideo] - character_matrix_url: ${characterMatrixUrl || 'none'}`);
        console.log(`[QueueVideo] - reference_images available: ${refImages.length}`);
        console.log(`[QueueVideo] - images to use: ${analysis.imagesPerStar}`);
        console.log(`[QueueVideo] - video model: ${videoModel}`);

        let frontalImage: string;
        let additionalImages: string[] = [];

        const isKling = videoModel.startsWith('kling');
        const isGrokOrSeedance = videoModel.startsWith('grok') || videoModel.startsWith('seedance');

        if (isKling && refImagesMetadata.length > 0) {
          // Kling: use smart view selection based on context
          // Determines optimal view from: manual @Char:vue hint > action keywords > shot framing > default

          // Get all action text for this character
          const characterActions = segments
            .flatMap(seg => (seg.elements || seg.beats || []) as SegmentElement[])
            .filter(el => el.character_name?.toLowerCase() === char.name.toLowerCase())
            .map(el => el.content || '')
            .join(' ');

          // Determine best view for this character
          const bestView = getBestView(char.name, {
            manualViews,
            action: characterActions || allSegmentText,
            shotFraming,
            numCharacters: characterMap.size,
          });

          // Get the image for this view
          const viewImage = getImageForView(refImagesMetadata, bestView);
          frontalImage = viewImage?.url || refImages[0];

          // Kling reference-to-video REQUIRES reference_image_urls with at least 1 image
          // Include other views as additional references for better character consistency
          additionalImages = refImagesMetadata
            .filter(img => img.url !== frontalImage)
            .map(img => img.url)
            .slice(0, 3); // Max 3 additional refs per character

          // If no other views, use the frontal image as reference too
          if (additionalImages.length === 0) {
            additionalImages = [frontalImage];
          }

          console.log(`[QueueVideo] - Kling smart view: ${bestView} for ${char.name}, +${additionalImages.length} refs`);
        } else if (isGrokOrSeedance && characterMatrixUrl) {
          // Grok/Seedance: use character matrix (single image with all views)
          // This counts as 1 reference instead of 3-4, freeing slots for other characters
          frontalImage = characterMatrixUrl;
          console.log(`[QueueVideo] - Using character matrix (1 slot instead of ${refImages.length})`);
        } else if (characterMatrixUrl && !isKling) {
          // Other models with matrix support
          frontalImage = characterMatrixUrl;
          console.log(`[QueueVideo] - Using character matrix`);
        } else {
          // Fallback: use smart image distribution (front image + additional based on budget)
          frontalImage = refImages[0];
          additionalImages = refImages.slice(1, analysis.imagesPerStar);
          console.log(`[QueueVideo] - Fallback: using ${1 + additionalImages.length} individual images`);
        }

        cinematicElements.push({
          characterId: char.id,
          characterName: char.name,
          frontalImageUrl: frontalImage,
          referenceImageUrls: additionalImages.length > 0 ? additionalImages : undefined,
        });

        // Add all used images to reference images array
        characterReferenceImages.push(frontalImage);
        if (additionalImages.length > 0) {
          characterReferenceImages.push(...additionalImages);
        }

        console.log(`[QueueVideo] - Added element ${cinematicElements.length}: frontal + ${additionalImages.length} additional`);

        // Add voice if character has fal_voice_id (max 2 voices)
        const falVoiceId = charData?.fal_voice_id as string | undefined;
        console.log(`[QueueVideo] - fal_voice_id:`, falVoiceId || 'none');
        if (falVoiceId && cinematicVoices.length < MAX_VOICES) {
          cinematicVoices.push({
            characterId: char.id,
            voiceId: falVoiceId,
          });
          console.log(`[QueueVideo] - Added voice ${cinematicVoices.length}: ${falVoiceId}`);
        }
      }

      console.log('[QueueVideo] Cinematic elements built:', cinematicElements.length);
      console.log('[QueueVideo] Cinematic voices built:', cinematicVoices.map(v => `${v.characterId}: ${v.voiceId}`));
      console.log('[QueueVideo] Total reference images:', characterReferenceImages.length);

      // =====================================================================
      // SEEDANCE 2.0: Generate ElevenLabs TTS for stars with dialogue
      // Stars = characters with reference images (will be in @Image1, @Image2, etc.)
      // Figurants = characters without images (use Seedance native English TTS)
      //
      // IMPORTANT: The order of audio generation must match the order of audioIndex
      // assignment in the prompt builder (analysis.stars order with audioIndex set).
      // This ensures @Audio1 in the prompt corresponds to the first audio file.
      // =====================================================================
      const isSeedance = videoModel.startsWith('seedance-2');
      if (isSeedance && analysis.stars.length > 0 && segments) {
        console.log('[QueueVideo] Seedance 2.0: Checking for star dialogues to generate TTS...');

        // First, collect all dialogues from segments, grouped by character
        const allDialogues = new Map<string, string[]>();

        for (const segment of segments) {
          const elements = segment.elements || segment.beats || [];
          for (const element of elements) {
            if (element.type === 'dialogue' && element.character_id) {
              // Get dialogue text (prefer English translation if available)
              const dialogueText = element.content_en || element.content;
              if (!dialogueText) continue;

              // Clean the dialogue for TTS
              const cleanedDialogue = cleanDialogueForTTS(dialogueText);
              if (!cleanedDialogue) continue;

              // Add to character's dialogues
              if (!allDialogues.has(element.character_id)) {
                allDialogues.set(element.character_id, []);
              }
              allDialogues.get(element.character_id)!.push(cleanedDialogue);
            }
          }
        }

        // Now iterate over stars in the same order as audioIndex was assigned
        // (analysis.stars with audioIndex set, in order)
        const starsWithAudioIndex = analysis.stars.filter(s => s.audioIndex !== undefined);
        console.log(`[QueueVideo] Stars with audioIndex: ${starsWithAudioIndex.map(s => `${s.name}(@Audio${s.audioIndex})`).join(', ')}`);

        for (const star of starsWithAudioIndex) {
          // Check if this star has dialogues
          const dialogues = allDialogues.get(star.id);
          if (!dialogues || dialogues.length === 0) {
            console.log(`[QueueVideo] Star ${star.name} (@Audio${star.audioIndex}) has no dialogues, skipping`);
            continue;
          }

          // Get the character's ElevenLabs voice_id
          const char = characterMap.get(star.id);
          if (!char) continue;

          const charData = char.data as Record<string, unknown> | null;
          const elevenLabsVoiceId = charData?.voice_id as string | undefined;

          if (!elevenLabsVoiceId) {
            console.log(`[QueueVideo] Star ${star.name} has no ElevenLabs voice_id, skipping TTS`);
            continue;
          }

          // Combine all dialogues for this character into one audio file
          const fullDialogue = dialogues.join(' ... ');
          console.log(`[QueueVideo] Generating TTS for ${star.name} (@Audio${star.audioIndex}): "${fullDialogue.substring(0, 100)}..."`);

          try {
            // Create ElevenLabs wrapper
            const elevenlabs = createElevenLabsWrapper({
              userId: session.user.sub,
              projectId,
              supabase,
              operation: 'seedance-dialogue-tts',
            });

            // Generate TTS using eleven_v3 model (supports audio tags like [laughs])
            const audioResult = await elevenlabs.textToSpeech({
              voiceId: elevenLabsVoiceId,
              text: fullDialogue,
              modelId: ELEVENLABS_MODELS.V3,
            });

            console.log(`[QueueVideo] TTS generated: ${audioResult.audio.byteLength} bytes`);

            // Upload to B2
            const sanitizedUserId = session.user.sub.replace(/[|]/g, '_');
            const timestamp = Date.now();
            const audioKey = `audio/${sanitizedUserId}/${projectId}/${shotId}_seedance_${star.id}_${timestamp}.mp3`;

            await uploadFile(audioKey, Buffer.from(audioResult.audio), 'audio/mpeg');
            const audioUrl = `b2://${STORAGE_BUCKET}/${audioKey}`;

            console.log(`[QueueVideo] Audio uploaded: ${audioUrl}`);

            // Add to cinematicAudios array (in order matching audioIndex)
            cinematicAudios.push({
              characterId: star.id,
              audioUrl,
            });

            console.log(`[QueueVideo] Added @Audio${cinematicAudios.length} for ${star.name}`);

          } catch (ttsError) {
            console.error(`[QueueVideo] TTS generation failed for ${star.name}:`, ttsError);
            // Continue with other characters, don't fail the whole request
          }
        }

        console.log(`[QueueVideo] Seedance TTS complete: ${cinematicAudios.length} audio files generated`);
      }
    } else if (isCinematicMode && characterMap.size === 0) {
      console.log('[QueueVideo] WARNING: Cinematic mode but no characters detected!');
      console.log('[QueueVideo] - Segments exist:', !!segments);
      console.log('[QueueVideo] - Segments length:', segments?.length || 0);
    } else if (shot.dialogue_character_id) {
      // Standard mode: use dialogue character
      const { data: character } = await supabase
        .from('global_assets')
        .select('reference_images')
        .eq('id', shot.dialogue_character_id)
        .single();

      if (character?.reference_images && character.reference_images.length > 0) {
        characterReferenceImages = character.reference_images.slice(0, 4);
      }
    }

    // Build job data for BullMQ
    console.log('[QueueVideo] Building jobData:');
    console.log('[QueueVideo] - isCinematicMode:', isCinematicMode);
    console.log('[QueueVideo] - characterMap.size:', characterMap.size);
    console.log('[QueueVideo] - cinematicElements:', JSON.stringify(cinematicElements, null, 2));
    console.log('[QueueVideo] - cinematicVoices:', JSON.stringify(cinematicVoices, null, 2));
    console.log('[QueueVideo] - cinematicAudios:', JSON.stringify(cinematicAudios, null, 2));

    // Determine cinematicAudios to pass:
    // 1. Use generated Seedance TTS audios if available
    // 2. Fall back to legacy shot.dialogue_audio_url if present
    const finalCinematicAudios = cinematicAudios.length > 0
      ? cinematicAudios
      : shot.dialogue_audio_url
        ? [{ characterId: shot.dialogue_character_id || 'narrator', audioUrl: shot.dialogue_audio_url }]
        : undefined;

    const jobData: Omit<VideoGenJobData, 'type'> = {
      userId: session.user.sub,
      jobId: job.id,
      createdAt: new Date().toISOString(),
      projectId,
      shotId,
      shotNumber: shot.shot_number || 1,
      model: videoModel as VideoGenJobData['model'],
      provider: videoProvider as VideoGenJobData['provider'],
      duration: videoDuration,
      aspectRatio: aspectRatio as VideoGenJobData['aspectRatio'],
      prompt,
      // firstFrameUrl is optional for text-to-video (ensure undefined, not null)
      firstFrameUrl: shot.first_frame_url || shot.storyboard_image_url || undefined,
      lastFrameUrl: shot.last_frame_url || undefined,
      characterReferenceImages,
      hasDialogue: !!shot.has_dialogue,
      dialogueText: shot.dialogue_text || undefined,
      dialogueCharacterId: shot.dialogue_character_id || undefined,
      dialogueAudioUrl: shot.dialogue_audio_url || undefined,
      audioMode: shot.audio_mode || undefined,
      audioAssetId: shot.audio_asset_id || undefined,
      audioStart: shot.audio_start || undefined,
      audioEnd: shot.audio_end || undefined,
      // Cinematic mode settings
      isCinematicMode,
      cinematicElements: isCinematicMode ? cinematicElements : undefined,
      cinematicVoices: isCinematicMode ? cinematicVoices : undefined,
      // Dialogue audio for lip-sync (@Audio1, @Audio2, @Audio3 in prompt)
      // For Seedance: generated ElevenLabs TTS for stars
      // For other models or fallback: legacy shot.dialogue_audio_url
      cinematicAudios: finalCinematicAudios,
      // Dry run mode
      dryRun: !!dryRun,
    };

    // Enqueue the job
    try {
      console.log('[QueueVideo] Full jobData being enqueued:');
      console.log(JSON.stringify(jobData, null, 2));
      await enqueueVideoGen(jobData);
      console.log(`[QueueVideo] Job ${job.id} enqueued for shot ${shotId}`);
    } catch (queueError) {
      // If queuing fails, update job status
      console.error('[QueueVideo] Failed to enqueue:', queueError);

      await supabase
        .from('generation_jobs')
        .update({
          status: 'failed',
          error_message: queueError instanceof Error ? queueError.message : 'Failed to enqueue',
        })
        .eq('id', job.id);

      return Response.json(
        { error: 'Failed to enqueue job', details: queueError instanceof Error ? queueError.message : 'Unknown' },
        { status: 500 }
      );
    }

    // Update shot status
    // Note: video_prompt will be saved once migration 20260328000001_video_prompt.sql is run
    await supabase
      .from('shots')
      .update({
        generation_status: 'queued',
        video_provider: videoModel,
        video_duration: videoDuration,
      })
      .eq('id', shotId);

    // Return job ID for polling
    return Response.json({
      jobId: job.id,
      status: 'queued',
      message: 'Job enqueued successfully',
    });

  } catch (error) {
    console.error('[QueueVideo] Unexpected error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
