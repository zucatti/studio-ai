import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import {
  createFalWrapper,
  generateKlingOmniVideoFal,
  generateKlingLipSyncFal,
} from '@/lib/ai/fal-wrapper';
import {
  buildCinematicPrompt,
  validateCinematicConfig,
  type CinematicShort,
  type CinematicPlan,
} from '@/lib/ai/cinematic-prompt-builder';
import type { GlobalAsset } from '@/types/database';
import { uploadFile } from '@/lib/storage';

import type { Segment } from '@/types/cinematic';

/**
 * Extract @mentions from text (e.g., @Morgana, @KaelBlackThorne)
 */
function extractMentions(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(/@(\w+)/g);
  return matches ? matches.map(m => m.slice(1)) : [];
}

/**
 * Translate dialogue text using the translate-dialogue API
 */
async function translateDialogue(
  text: string,
  from: string,
  to: string,
  context?: { characterName?: string; tone?: string }
): Promise<string> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
    const response = await fetch(`${baseUrl}/api/translate-dialogue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, from, to, context }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.translation || text;
    }
  } catch (error) {
    console.error('[Cinematic] Translation failed:', error);
  }
  return text; // Fallback to original
}

/**
 * Process segments and translate dialogues to English if needed
 */
async function translateSegmentDialogues(
  segments: Segment[],
  sourceLanguage: string,
  characterMap: Map<string, GlobalAsset>
): Promise<Segment[]> {
  if (sourceLanguage === 'en') {
    return segments; // No translation needed
  }

  const translatedSegments: Segment[] = [];

  for (const segment of segments) {
    if (segment.dialogue && segment.dialogue.text) {
      const character = segment.dialogue.character_id
        ? characterMap.get(segment.dialogue.character_id)
        : null;

      const translatedText = await translateDialogue(
        segment.dialogue.text,
        sourceLanguage,
        'en',
        {
          characterName: character?.name || segment.dialogue.character_name,
          tone: segment.dialogue.tone,
        }
      );

      translatedSegments.push({
        ...segment,
        dialogue: {
          ...segment.dialogue,
          text_en: translatedText,
        },
      });
    } else {
      translatedSegments.push(segment);
    }
  }

  return translatedSegments;
}

/**
 * Auto-detect characters from @mentions in prompts, segments, and dialogues
 * Returns characters in order of first appearance (max 4 for Elements)
 */
function autoDetectCharacters(
  plans: CinematicPlan[],
  allCharacters: GlobalAsset[]
): { character: GlobalAsset; hasDialogue: boolean }[] {
  const mentionedNames = new Set<string>();
  const charactersWithDialogue = new Set<string>();

  // Scan all plans for @mentions
  for (const plan of plans) {
    // Check animation_prompt
    for (const name of extractMentions(plan.animation_prompt)) {
      mentionedNames.add(name.toLowerCase());
    }
    // Check description
    for (const name of extractMentions(plan.description)) {
      mentionedNames.add(name.toLowerCase());
    }
    // Check dialogue_text (legacy)
    for (const name of extractMentions(plan.dialogue_text)) {
      mentionedNames.add(name.toLowerCase());
      charactersWithDialogue.add(name.toLowerCase());
    }
    // Also mark characters assigned to dialogue (legacy)
    if (plan.dialogue_character_id) {
      const char = allCharacters.find(c => c.id === plan.dialogue_character_id);
      if (char) {
        mentionedNames.add(char.name.toLowerCase());
        charactersWithDialogue.add(char.name.toLowerCase());
      }
    }

    // NEW: Check segments for @mentions, dialogues, and beats
    const segments = (plan as unknown as { segments?: Segment[] }).segments;
    if (segments && Array.isArray(segments)) {
      for (const segment of segments) {
        // Check segment subject for @mentions
        for (const name of extractMentions(segment.subject)) {
          mentionedNames.add(name.toLowerCase());
        }
        // Check segment description for @mentions
        for (const name of extractMentions(segment.description)) {
          mentionedNames.add(name.toLowerCase());
        }
        // Check segment action for @mentions
        for (const name of extractMentions(segment.action)) {
          mentionedNames.add(name.toLowerCase());
        }

        // Check segment.beats (NEW format)
        if (segment.beats && Array.isArray(segment.beats)) {
          for (const beat of segment.beats) {
            // Check beat content for @mentions
            for (const name of extractMentions(beat.content)) {
              mentionedNames.add(name.toLowerCase());
            }
            // If beat has character_id, add directly
            if (beat.character_id) {
              const char = allCharacters.find(c => c.id === beat.character_id);
              if (char) {
                mentionedNames.add(char.name.toLowerCase());
                if (beat.type === 'dialogue') {
                  charactersWithDialogue.add(char.name.toLowerCase());
                }
              }
            }
          }
        }

        // Check segment.dialogue (LEGACY format)
        if (segment.dialogue?.character_id) {
          const char = allCharacters.find(c => c.id === segment.dialogue!.character_id);
          if (char) {
            mentionedNames.add(char.name.toLowerCase());
            charactersWithDialogue.add(char.name.toLowerCase());
          }
        }
        if (segment.dialogue?.character_name) {
          mentionedNames.add(segment.dialogue.character_name.toLowerCase());
          charactersWithDialogue.add(segment.dialogue.character_name.toLowerCase());
        }
      }
    }
  }

  // Match mentioned names to actual characters (fuzzy match)
  // Normalize by removing spaces for comparison (e.g., "Kael Blackthorne" matches "@KaelBlackthorne")
  const result: { character: GlobalAsset; hasDialogue: boolean }[] = [];

  for (const char of allCharacters) {
    const charNameLower = char.name.toLowerCase();
    const charNameNoSpaces = charNameLower.replace(/\s+/g, '');

    // Check if any mention matches this character (full name, partial, or without spaces)
    const isMatched = Array.from(mentionedNames).some(mention => {
      const mentionNoSpaces = mention.replace(/\s+/g, '');
      return charNameLower.includes(mention) ||
             mention.includes(charNameLower) ||
             charNameNoSpaces === mentionNoSpaces ||
             charNameNoSpaces.includes(mentionNoSpaces) ||
             mentionNoSpaces.includes(charNameNoSpaces);
    });

    if (isMatched) {
      const hasDialogue = Array.from(charactersWithDialogue).some(mention => {
        const mentionNoSpaces = mention.replace(/\s+/g, '');
        return charNameLower.includes(mention) ||
               mention.includes(charNameLower) ||
               charNameNoSpaces === mentionNoSpaces ||
               charNameNoSpaces.includes(mentionNoSpaces) ||
               mentionNoSpaces.includes(charNameNoSpaces);
      });
      result.push({ character: char, hasDialogue });
    }
  }

  // Sort: characters with dialogue first, then limit to 4
  result.sort((a, b) => {
    if (a.hasDialogue && !b.hasDialogue) return -1;
    if (!a.hasDialogue && b.hasDialogue) return 1;
    return 0;
  });

  return result.slice(0, 4); // Max 4 Elements for Kling
}

interface RouteParams {
  params: Promise<{ projectId: string; shortId: string }>;
}

/**
 * POST /api/projects/[projectId]/shorts/[shortId]/generate-cinematic
 *
 * Generate a cinematic video sequence using Kling Omni with:
 * - Multi-character elements (@Element1-4)
 * - Voice sync (<<<voice_1>>>, <<<voice_2>>>)
 * - Mega-prompt with timing and shot breakdown
 *
 * For French dialogue: post-processes with OmniHuman/Kling LipSync
 * For English dialogue: uses native Kling audio generation
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shortId } = await params;
    const supabase = createServerSupabaseClient();

    // Get project to verify ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id, aspect_ratio')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get the short (scene) with cinematic fields and shots (plans with segments)
    const { data: scene, error: sceneError } = await supabase
      .from('scenes')
      .select(`
        id,
        title,
        description,
        cinematic_header,
        character_mappings,
        generation_mode,
        dialogue_language,
        shots (
          id,
          shot_number,
          title,
          description,
          duration,
          shot_type,
          camera_angle,
          camera_movement,
          storyboard_image_url,
          first_frame_url,
          last_frame_url,
          animation_prompt,
          has_dialogue,
          dialogue_text,
          dialogue_character_id,
          sort_order,
          shot_subject,
          framing,
          action,
          environment,
          dialogue_tone,
          start_time,
          cinematic_header,
          segments,
          translations
        )
      `)
      .eq('id', shortId)
      .eq('project_id', projectId)
      .single();

    if (sceneError || !scene) {
      return NextResponse.json({ error: 'Short not found' }, { status: 404 });
    }

    // Cast to cinematic types
    const short = scene as unknown as CinematicShort;
    const plans = (scene.shots || []) as unknown as CinematicPlan[];

    // Sort plans by sort_order or start_time
    plans.sort((a, b) => (a.start_time ?? a.sort_order * 5) - (b.start_time ?? b.sort_order * 5));

    // Fetch sequences to get cinematic_header for each plan
    const { data: sequences } = await supabase
      .from('sequences')
      .select('id, cinematic_header')
      .eq('scene_id', shortId);

    // Build a map of sequence_id -> cinematic_header
    const sequenceHeaders = new Map<string, unknown>();
    (sequences || []).forEach((seq) => {
      if (seq.cinematic_header) {
        sequenceHeaders.set(seq.id, seq.cinematic_header);
      }
    });

    // Inherit cinematic_header from sequence for each plan
    for (const plan of plans) {
      const planAny = plan as unknown as { sequence_id?: string; cinematic_header?: unknown };
      if (planAny.sequence_id && sequenceHeaders.has(planAny.sequence_id)) {
        planAny.cinematic_header = sequenceHeaders.get(planAny.sequence_id);
        console.log(`[Cinematic] Plan ${plan.id} inherits cinematic_header from sequence ${planAny.sequence_id}`);
      }
    }

    // Fetch ALL project characters for auto-detection
    const { data: projectAssets } = await supabase
      .from('project_assets')
      .select(`
        global_asset:global_assets (*)
      `)
      .eq('project_id', projectId);

    const allCharacters = (projectAssets || [])
      .map(pa => pa.global_asset as unknown as GlobalAsset)
      .filter(a => a && a.asset_type === 'character');

    // Auto-detect characters from @mentions in prompts
    const detectedCharacters = autoDetectCharacters(plans, allCharacters);
    console.log('[Cinematic] Auto-detected characters:', detectedCharacters.map(d => d.character.name));

    // Build character map for prompt building
    const characterMap = new Map<string, GlobalAsset>();
    detectedCharacters.forEach(({ character }) => {
      characterMap.set(character.id, character);
    });

    // Validate configuration
    const validation = validateCinematicConfig(short, plans, characterMap);
    if (!validation.valid) {
      return NextResponse.json({
        error: 'Invalid cinematic configuration',
        details: validation.errors,
      }, { status: 400 });
    }

    // Log warnings (non-blocking)
    if (validation.warnings && validation.warnings.length > 0) {
      console.log('[Cinematic] Warnings:', validation.warnings);
    }

    // Build elements array for Kling Omni (auto from detected characters)
    const elements: Array<{
      frontalImageUrl: string;
      referenceImageUrls?: string[];
    }> = [];

    // Build voices array for Kling Omni (only for characters with dialogue)
    const voices: Array<{ voiceId: string }> = [];

    // Process detected characters - assign Element slots (1-4) and voice slots (1-2)
    let voiceSlot = 0;
    for (const { character, hasDialogue } of detectedCharacters) {
      const charData = character.data as Record<string, unknown> | null;

      // Get reference images for Element
      const referenceImages = character.reference_images || [];
      if (referenceImages.length > 0) {
        // Sign B2 URLs
        const signedUrls: string[] = [];
        for (const imgUrl of referenceImages.slice(0, 5)) {
          if (imgUrl.startsWith('b2://')) {
            const signRes = await fetch(
              `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/storage/sign`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urls: [imgUrl] }),
              }
            );
            if (signRes.ok) {
              const signData = await signRes.json();
              signedUrls.push(signData.signedUrls?.[imgUrl] || imgUrl);
            } else {
              signedUrls.push(imgUrl);
            }
          } else {
            signedUrls.push(imgUrl);
          }
        }

        elements.push({
          frontalImageUrl: signedUrls[0],
          referenceImageUrls: signedUrls.slice(1),
        });
      }

      // Add voice if character has dialogue and has fal_voice_id (max 2 voices)
      if (hasDialogue && charData?.fal_voice_id && voiceSlot < 2) {
        voices.push({
          voiceId: charData.fal_voice_id as string,
        });
        voiceSlot++;
      }
    }

    console.log('[Cinematic] Elements:', elements.length, 'Voices:', voices.length);

    // Auto-translate segment dialogues to English if needed
    const dialogueLanguage = short.dialogue_language || 'en';
    if (dialogueLanguage !== 'en') {
      console.log('[Cinematic] Translating dialogues from', dialogueLanguage, 'to English...');

      for (const plan of plans) {
        const segments = (plan as unknown as { segments?: Segment[] }).segments;
        if (segments && Array.isArray(segments)) {
          const translatedSegments = await translateSegmentDialogues(
            segments,
            dialogueLanguage,
            characterMap
          );
          // Update plan with translated segments
          (plan as unknown as { segments: Segment[] }).segments = translatedSegments;
        }
      }
    }

    // Build the mega-prompt (now with English dialogues)
    const megaPrompt = buildCinematicPrompt(short, plans, characterMap);

    // === DETAILED LOGGING ===
    console.log('\n========== CINEMATIC GENERATION DEBUG ==========');
    console.log('[Cinematic] Dialogue language:', dialogueLanguage);
    console.log('[Cinematic] Character map size:', characterMap.size);
    for (const [id, char] of characterMap) {
      const charData = char.data as Record<string, unknown> | null;
      console.log(`  - ${char.name} (${id})`);
      console.log(`    fal_voice_id: ${charData?.fal_voice_id || 'NONE'}`);
      console.log(`    reference_images: ${char.reference_images?.length || 0}`);
    }
    console.log('\n[Cinematic] FULL MEGA-PROMPT:');
    console.log('--- START PROMPT ---');
    console.log(megaPrompt);
    console.log('--- END PROMPT ---\n');

    // Calculate total duration
    const totalDuration = plans.reduce((total, plan) => total + plan.duration, 0);
    const clampedDuration = Math.max(3, Math.min(15, totalDuration));

    // Get first frame image URL (from first plan)
    const firstPlan = plans[0];
    let startImageUrl: string | undefined;
    if (firstPlan?.storyboard_image_url) {
      const imgUrl = firstPlan.storyboard_image_url;
      if (imgUrl.startsWith('b2://')) {
        const signRes = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/storage/sign`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: [imgUrl] }),
          }
        );
        if (signRes.ok) {
          const signData = await signRes.json();
          startImageUrl = signData.signedUrls?.[imgUrl] || imgUrl;
        }
      } else {
        startImageUrl = imgUrl;
      }
    }

    // Determine if native audio generation should be used
    // dialogueLanguage is already defined above
    const generateAudio = dialogueLanguage === 'en' && voices.length > 0;

    // Create fal.ai wrapper
    const falWrapper = createFalWrapper({
      userId: session.user.sub,
      projectId,
      supabase,
      operation: 'generate-cinematic',
    });

    // Generate video with Kling Omni
    console.log('[Cinematic] Elements to send:', elements.length);
    for (let i = 0; i < elements.length; i++) {
      console.log(`  Element ${i + 1}:`);
      console.log(`    frontalImageUrl: ${elements[i].frontalImageUrl?.substring(0, 80)}...`);
      console.log(`    referenceImageUrls: ${elements[i].referenceImageUrls?.length || 0}`);
    }
    console.log('[Cinematic] Voices to send:', voices.length);
    for (let i = 0; i < voices.length; i++) {
      console.log(`  Voice ${i + 1}: ${voices[i].voiceId}`);
    }
    console.log('[Cinematic] Start image URL:', startImageUrl?.substring(0, 80) || 'NONE');
    console.log('[Cinematic] Duration:', clampedDuration, 'seconds');
    console.log('[Cinematic] Generate audio:', generateAudio);
    console.log('=================================================\n');

    console.log('[Cinematic] Generating with Kling Omni...');
    const { videoUrl: generatedVideoUrl, cost: videoCost } = await generateKlingOmniVideoFal(
      falWrapper,
      {
        prompt: megaPrompt,
        imageUrl: startImageUrl,
        elements: elements.length > 0 ? elements : undefined,
        voices: voices.length > 0 ? voices : undefined,
        duration: clampedDuration,
        generateAudio,
      }
    );

    let finalVideoUrl = generatedVideoUrl;
    let totalCost = videoCost;

    // For non-English dialogue, apply lip-sync post-processing
    if (dialogueLanguage !== 'en' && plans.some(p => p.dialogue_text)) {
      console.log('[Cinematic] Post-processing with lip-sync for non-English dialogue...');

      // Get the first dialogue plan to determine character and generate audio
      const dialoguePlan = plans.find(p => p.dialogue_text && p.dialogue_character_id);
      if (dialoguePlan) {
        const character = characterMap.get(dialoguePlan.dialogue_character_id!);
        const charData = character?.data as Record<string, unknown> | null;
        const elevenLabsVoiceId = charData?.voice_id as string | undefined;

        if (elevenLabsVoiceId) {
          // Generate audio with ElevenLabs
          const dialogueTexts = plans
            .filter(p => p.dialogue_text)
            .map(p => p.dialogue_text)
            .join(' ');

          try {
            const elevenLabsResponse = await fetch(
              `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`,
              {
                method: 'POST',
                headers: {
                  'Accept': 'audio/mpeg',
                  'Content-Type': 'application/json',
                  'xi-api-key': process.env.AI_ELEVEN_LABS || '',
                },
                body: JSON.stringify({
                  text: dialogueTexts,
                  model_id: 'eleven_multilingual_v2',
                  voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                  },
                }),
              }
            );

            if (elevenLabsResponse.ok) {
              const audioBuffer = await elevenLabsResponse.arrayBuffer();

              // Upload audio to B2
              const audioPath = `projects/${projectId}/shorts/${shortId}/dialogue-audio.mp3`;
              const { url: audioUrl } = await uploadFile(audioPath, Buffer.from(audioBuffer), 'audio/mpeg');

              // Sign the audio URL
              let signedAudioUrl = audioUrl;
              if (audioUrl.startsWith('b2://')) {
                const signRes = await fetch(
                  `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/storage/sign`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ urls: [audioUrl] }),
                  }
                );
                if (signRes.ok) {
                  const signData = await signRes.json();
                  signedAudioUrl = signData.signedUrls?.[audioUrl] || audioUrl;
                }
              }

              // Sign the video URL if needed
              let signedVideoUrl = generatedVideoUrl;
              // fal.ai URLs are already signed, but check just in case
              if (!generatedVideoUrl.includes('fal.ai')) {
                signedVideoUrl = generatedVideoUrl;
              }

              // Apply lip-sync with Kling LipSync
              const { videoUrl: lipSyncVideoUrl, cost: lipSyncCost } = await generateKlingLipSyncFal(
                falWrapper,
                {
                  videoUrl: signedVideoUrl,
                  audioUrl: signedAudioUrl,
                }
              );

              finalVideoUrl = lipSyncVideoUrl;
              totalCost += lipSyncCost;
            }
          } catch (elevenLabsError) {
            console.error('[Cinematic] ElevenLabs audio generation failed:', elevenLabsError);
            // Continue with video without lip-sync
          }
        }
      }
    }

    // Upload final video to B2 for permanent storage
    const videoPath = `projects/${projectId}/shorts/${shortId}/cinematic-video.mp4`;
    const videoResponse = await fetch(finalVideoUrl);
    const videoBuffer = await videoResponse.arrayBuffer();
    const { url: b2VideoUrl } = await uploadFile(videoPath, Buffer.from(videoBuffer), 'video/mp4');

    // Update the scene with assembled video URL
    const { error: updateError } = await supabase
      .from('scenes')
      .update({
        assembled_video_url: b2VideoUrl,
        assembled_video_duration: clampedDuration,
      })
      .eq('id', shortId);

    if (updateError) {
      console.error('[Cinematic] Error updating scene:', updateError);
    }

    return NextResponse.json({
      success: true,
      video_url: b2VideoUrl,
      duration: clampedDuration,
      cost: totalCost,
      prompt_preview: megaPrompt.substring(0, 500),
    });

  } catch (error) {
    console.error('Error generating cinematic video:', error);
    return NextResponse.json({
      error: 'Failed to generate cinematic video',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
