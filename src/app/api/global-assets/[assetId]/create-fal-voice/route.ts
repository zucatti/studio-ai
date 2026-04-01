import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { createFalWrapper, createKlingVoiceFal } from '@/lib/ai/fal-wrapper';

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
        const audioBuffer = await elevenLabsResponse.arrayBuffer();

        // Upload to B2 storage
        const uploadRes = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/storage/upload`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'audio/mpeg',
              'X-File-Name': `character-${assetId}-voice-sample.mp3`,
              'X-File-Path': `voice-samples/${session.user.sub}`,
            },
            body: audioBuffer,
          }
        );

        if (!uploadRes.ok) {
          throw new Error('Failed to upload voice sample');
        }

        const uploadData = await uploadRes.json();
        sampleAudioUrl = uploadData.url;

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
    }

    if (!sampleAudioUrl) {
      return NextResponse.json({
        error: 'No voice sample available',
      }, { status: 400 });
    }

    // Sign the sample URL if it's a B2 URL
    let signedSampleUrl = sampleAudioUrl;
    if (sampleAudioUrl.startsWith('b2://')) {
      const signRes = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/storage/sign`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: [sampleAudioUrl] }),
        }
      );
      if (signRes.ok) {
        const signData = await signRes.json();
        signedSampleUrl = signData.signedUrls?.[sampleAudioUrl] || sampleAudioUrl;
      }
    }

    // Create fal.ai voice
    const falWrapper = createFalWrapper({
      userId: session.user.sub,
      supabase,
      operation: 'create-kling-voice',
    });

    const { voiceId, cost } = await createKlingVoiceFal(falWrapper, signedSampleUrl);

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
