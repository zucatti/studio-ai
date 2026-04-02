import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { createFalWrapper, createKlingVoiceFal, uploadToFalStorage } from '@/lib/ai/fal-wrapper';
import { uploadFile, downloadFile, parseStorageUrl } from '@/lib/storage';

interface RouteParams {
  params: Promise<{ assetId: string }>;
}

/**
 * POST /api/global-assets/[assetId]/create-fal-voice
 *
 * Creates a fal.ai voice_id from a character's ElevenLabs voice.
 * Workflow:
 * 1. Get character with ElevenLabs voice_id
 * 2. Generate a sample audio via ElevenLabs (or use existing sample)
 * 3. Upload to fal.ai create-voice endpoint
 * 4. Store fal_voice_id in character.data
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { assetId } = await params;
    const supabase = createServerSupabaseClient();

    // Get the character asset
    const { data: asset, error: assetError } = await supabase
      .from('global_assets')
      .select('*')
      .eq('id', assetId)
      .eq('user_id', session.user.sub)
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    if (asset.asset_type !== 'character') {
      return NextResponse.json({ error: 'Asset must be a character' }, { status: 400 });
    }

    const charData = asset.data as Record<string, unknown> | null;

    // Check if already has fal_voice_id
    if (charData?.fal_voice_id) {
      return NextResponse.json({
        success: true,
        voice_id: charData.fal_voice_id,
        message: 'Voice already exists',
      });
    }

    // Check for ElevenLabs voice_id
    const elevenLabsVoiceId = charData?.voice_id as string | undefined;
    if (!elevenLabsVoiceId) {
      return NextResponse.json({
        error: 'Character must have an ElevenLabs voice_id first',
      }, { status: 400 });
    }

    // Get or generate a voice sample
    // Option 1: Use existing sample if stored
    let sampleAudioUrl = charData?.fal_voice_sample_url as string | undefined;
    let audioBuffer: ArrayBuffer | null = null;

    // Option 2: Generate a new sample via ElevenLabs
    if (!sampleAudioUrl) {
      const sampleText = "Hello, this is a sample of my voice. I can speak naturally and express different emotions. The quick brown fox jumps over the lazy dog.";

      try {
        // Generate audio via ElevenLabs
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
              text: sampleText,
              model_id: 'eleven_multilingual_v2',
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
              },
            }),
          }
        );

        if (!elevenLabsResponse.ok) {
          throw new Error(`ElevenLabs error: ${elevenLabsResponse.status}`);
        }

        // Get audio buffer
        audioBuffer = await elevenLabsResponse.arrayBuffer();

        // Upload to B2 storage for long-term storage
        const sanitizedUserId = session.user.sub.replace(/[|]/g, '_');
        const timestamp = Date.now();
        const storageKey = `voice-samples/${sanitizedUserId}/character-${assetId}-${timestamp}.mp3`;

        const uploadResult = await uploadFile(
          storageKey,
          Buffer.from(audioBuffer),
          'audio/mpeg'
        );

        sampleAudioUrl = uploadResult.url;

        // Store the sample URL
        const updatedData = {
          ...(charData || {}),
          fal_voice_sample_url: sampleAudioUrl,
        };

        await supabase
          .from('global_assets')
          .update({ data: updatedData })
          .eq('id', assetId);

      } catch (elevenLabsError) {
        console.error('ElevenLabs sample generation failed:', elevenLabsError);
        return NextResponse.json({
          error: 'Failed to generate voice sample from ElevenLabs',
          details: elevenLabsError instanceof Error ? elevenLabsError.message : 'Unknown error',
        }, { status: 500 });
      }
    } else {
      // Download existing sample from B2
      if (sampleAudioUrl.startsWith('b2://')) {
        const parsed = parseStorageUrl(sampleAudioUrl);
        if (parsed) {
          try {
            const buffer = await downloadFile(parsed.key);
            // Convert Buffer to ArrayBuffer
            audioBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
          } catch (downloadError) {
            console.error('Failed to download existing sample:', downloadError);
          }
        }
      }
    }

    if (!audioBuffer) {
      return NextResponse.json({
        error: 'No voice sample audio available',
      }, { status: 400 });
    }

    // Upload to fal.ai storage (required for fal.ai to access the file)
    let falAudioUrl: string;
    try {
      falAudioUrl = await uploadToFalStorage(audioBuffer);
      console.log(`[fal.ai] Uploaded audio to fal storage: ${falAudioUrl}`);
    } catch (falUploadError) {
      console.error('Failed to upload to fal.ai storage:', falUploadError);
      return NextResponse.json({
        error: 'Failed to upload audio to fal.ai storage',
        details: falUploadError instanceof Error ? falUploadError.message : 'Unknown error',
      }, { status: 500 });
    }

    // Create fal.ai voice
    const falWrapper = createFalWrapper({
      userId: session.user.sub,
      supabase,
      operation: 'create-kling-voice',
    });

    const { voiceId, cost } = await createKlingVoiceFal(falWrapper, falAudioUrl);

    // Update character with fal_voice_id
    const finalData = {
      ...(charData || {}),
      fal_voice_id: voiceId,
      fal_voice_sample_url: sampleAudioUrl,
    };

    const { error: updateError } = await supabase
      .from('global_assets')
      .update({ data: finalData })
      .eq('id', assetId);

    if (updateError) {
      console.error('Error updating character with fal_voice_id:', updateError);
      // Still return success since voice was created
    }

    return NextResponse.json({
      success: true,
      voice_id: voiceId,
      sample_url: sampleAudioUrl,
      cost,
      message: 'fal.ai voice created successfully',
    });

  } catch (error) {
    console.error('Error creating fal voice:', error);
    return NextResponse.json({
      error: 'Failed to create fal.ai voice',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
