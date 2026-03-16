import { NextResponse } from 'next/server';

const ELEVENLABS_API_KEY = process.env.AI_ELEVEN_LABS;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

export async function GET(request: Request) {
  if (!ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';

  try {
    // Fetch all voices
    const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('ElevenLabs API error:', error);
      return NextResponse.json({ error: 'Failed to fetch voices' }, { status: response.status });
    }

    const data = await response.json();
    let voices = data.voices || [];

    // Filter by search term if provided
    if (search) {
      const searchLower = search.toLowerCase();
      voices = voices.filter((voice: { name: string; labels?: Record<string, string> }) =>
        voice.name.toLowerCase().includes(searchLower) ||
        Object.values(voice.labels || {}).some(label =>
          label.toLowerCase().includes(searchLower)
        )
      );
    }

    // Map to simplified format
    const simplifiedVoices = voices.map((voice: {
      voice_id: string;
      name: string;
      labels?: Record<string, string>;
      preview_url?: string;
      category?: string;
    }) => ({
      id: voice.voice_id,
      name: voice.name,
      labels: voice.labels || {},
      previewUrl: voice.preview_url,
      category: voice.category || 'custom',
    }));

    return NextResponse.json({ voices: simplifiedVoices });
  } catch (error) {
    console.error('Error fetching ElevenLabs voices:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Preview a voice with text
export async function POST(request: Request) {
  if (!ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 });
  }

  try {
    const { voiceId, text } = await request.json();

    if (!voiceId || !text) {
      return NextResponse.json({ error: 'voiceId and text are required' }, { status: 400 });
    }

    const response = await fetch(`${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('ElevenLabs TTS error:', error);
      return NextResponse.json({ error: 'Failed to generate speech' }, { status: response.status });
    }

    // Return audio as base64
    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    return NextResponse.json({
      audio: `data:audio/mpeg;base64,${base64Audio}`
    });
  } catch (error) {
    console.error('Error generating speech:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
