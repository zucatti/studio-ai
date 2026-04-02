import { NextResponse } from 'next/server';

const ELEVENLABS_API_KEY = process.env.AI_ELEVEN_LABS;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

/**
 * POST /api/elevenlabs/voices/add
 *
 * Adds a voice from the Voice Library to the user's personal collection.
 * Required body: { publicUserId, voiceId, name }
 */
export async function POST(request: Request) {
  if (!ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 });
  }

  try {
    const { publicUserId, voiceId, name } = await request.json();

    if (!publicUserId || !voiceId || !name) {
      return NextResponse.json(
        { error: 'publicUserId, voiceId, and name are required' },
        { status: 400 }
      );
    }

    // Add the voice to the user's collection
    const response = await fetch(
      `${ELEVENLABS_API_URL}/voices/add/${publicUserId}/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          new_name: name,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('ElevenLabs add voice error:', error);
      return NextResponse.json(
        { error: 'Failed to add voice to collection', details: error },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      voiceId: data.voice_id,
      message: 'Voice added to your collection',
    });
  } catch (error) {
    console.error('Error adding voice:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
