import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { createElevenLabsWrapper } from '@/lib/ai/elevenlabs-wrapper';
import { mergeVideoAudio } from '@/lib/ffmpeg';
import { uploadFile, getSignedFileUrl, STORAGE_BUCKET } from '@/lib/storage';

interface RouteParams {
  params: Promise<{ projectId: string; shotId: string }>;
}

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

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shotId } = await params;
    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id, aspect_ratio')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get shot with dialogue info and video generation metadata
    const { data: shot, error: shotError } = await supabase
      .from('shots')
      .select('*, generated_video_url, has_dialogue, dialogue_text, dialogue_character_id, dialogue_audio_url, video_generation_id, video_provider')
      .eq('id', shotId)
      .single();

    if (shotError || !shot) {
      return NextResponse.json({ error: 'Shot not found' }, { status: 404 });
    }

    // Validate requirements
    if (!shot.generated_video_url) {
      return NextResponse.json({ error: 'No video to add audio to. Generate video first.' }, { status: 400 });
    }

    if (!shot.has_dialogue || !shot.dialogue_text) {
      return NextResponse.json({ error: 'No dialogue configured for this shot.' }, { status: 400 });
    }

    if (!shot.dialogue_character_id) {
      return NextResponse.json({ error: 'No character selected for dialogue.' }, { status: 400 });
    }

    // Get character's voice_id
    const { data: character } = await supabase
      .from('global_assets')
      .select('data, name')
      .eq('id', shot.dialogue_character_id)
      .single();

    const voiceId = (character?.data as Record<string, unknown>)?.voice_id as string;
    console.log(`[AddAudio] Character: ${character?.name}, voice_id: ${voiceId}`);

    if (!voiceId) {
      return NextResponse.json({
        error: `Character "${character?.name}" has no voice configured. Add a voice_id in character settings.`,
        characterName: character?.name,
        characterData: character?.data,
      }, { status: 400 });
    }

    if (!process.env.AI_ELEVEN_LABS) {
      return NextResponse.json({ error: 'ElevenLabs API key not configured (AI_ELEVEN_LABS)' }, { status: 500 });
    }

    console.log(`[AddAudio] Starting audio generation for shot ${shotId}`);
    console.log(`[AddAudio] Dialogue (raw): "${shot.dialogue_text.substring(0, 100)}..."`);

    // Clean dialogue text - remove @mentions, #locations, !looks, &in/&out
    const cleanedDialogue = cleanDialogueForTTS(shot.dialogue_text);
    console.log(`[AddAudio] Dialogue (clean): "${cleanedDialogue.substring(0, 100)}..."`);

    if (!cleanedDialogue) {
      return NextResponse.json({ error: 'Dialogue is empty after removing tags.' }, { status: 400 });
    }

    // Step 1: Generate audio with ElevenLabs
    const elevenlabs = createElevenLabsWrapper({
      userId: session.user.sub,
      projectId,
      supabase,
      operation: 'add-audio-to-video',
    });

    // Use v3 model for audio tags support ([laughs], [sad], [whispers], etc.)
    const audioResult = await elevenlabs.textToSpeech({
      voiceId,
      text: cleanedDialogue,
      modelId: 'eleven_v3',
    });

    console.log(`[AddAudio] Audio generated: ${audioResult.audio.byteLength} bytes`);

    // Step 2: Upload audio to B2
    const sanitizedUserId = session.user.sub.replace(/[|]/g, '_');
    const timestamp = Date.now();
    const audioKey = `audio/${sanitizedUserId}/${projectId}/${shotId}_dialogue_${timestamp}.mp3`;

    await uploadFile(audioKey, Buffer.from(audioResult.audio), 'audio/mpeg');
    const dialogueAudioUrl = `b2://${STORAGE_BUCKET}/${audioKey}`;

    console.log(`[AddAudio] Audio uploaded: ${dialogueAudioUrl}`);

    // Update shot with audio URL
    await supabase
      .from('shots')
      .update({ dialogue_audio_url: dialogueAudioUrl })
      .eq('id', shotId);

    // Step 3: Merge audio with video using FFmpeg
    const publicAudioUrl = await getSignedFileUrl(audioKey, 3600);

    console.log(`[AddAudio] Using FFmpeg merge...`);
    console.log(`[AddAudio] Video: ${shot.generated_video_url}`);
    console.log(`[AddAudio] Audio: ${publicAudioUrl.substring(0, 80)}...`);

    const mergeResult = await mergeVideoAudio({
      videoUrl: shot.generated_video_url,
      audioUrl: publicAudioUrl,
      userId: session.user.sub,
      projectId,
      shotId,
    });

    console.log(`[AddAudio] FFmpeg merge complete: ${mergeResult.outputUrl}`);

    // Step 4: Update shot with merged video (store b2:// URL)
    await supabase
      .from('shots')
      .update({ generated_video_url: mergeResult.outputUrl })
      .eq('id', shotId);

    return NextResponse.json({
      success: true,
      videoUrl: mergeResult.signedUrl,     // Signed URL for immediate playback
      storageUrl: mergeResult.outputUrl,   // b2:// URL for reference
      audioUrl: dialogueAudioUrl,
      message: 'Audio added successfully',
      method: 'ffmpeg',
    });

  } catch (error) {
    console.error('[AddAudio] Error:', error);
    return NextResponse.json(
      { error: 'Failed to add audio: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
