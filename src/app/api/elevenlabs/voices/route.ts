import { NextResponse } from 'next/server';
import { logElevenLabsUsage } from '@/lib/ai/log-api-usage';

const ELEVENLABS_API_KEY = process.env.AI_ELEVEN_LABS;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// Helper for accent-insensitive search
const normalize = (str: string) =>
  str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

interface SimplifiedVoice {
  id: string;
  name: string;
  labels: Record<string, string>;
  previewUrl?: string;
  category: string;
  isLibrary?: boolean;
  publicOwnerId?: string; // For library voices, needed to add to collection
}

export async function GET(request: Request) {
  if (!ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const includeLibrary = searchParams.get('includeLibrary') !== 'false'; // Default true

  try {
    // 1. Fetch user's personal voices (always)
    const personalResponse = await fetch(`${ELEVENLABS_API_URL}/voices`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
    });

    if (!personalResponse.ok) {
      const error = await personalResponse.text();
      console.error('ElevenLabs API error:', error);
      return NextResponse.json({ error: 'Failed to fetch voices' }, { status: personalResponse.status });
    }

    const personalData = await personalResponse.json();
    let personalVoices: Array<{
      voice_id: string;
      name: string;
      labels?: Record<string, string>;
      preview_url?: string;
      category?: string;
    }> = personalData.voices || [];


    // Filter personal voices by search term if provided
    // Search by all words (AND logic) - e.g. "nicolas narration" matches "Voix Nicolas Petit IA AUDIO Narration"
    if (search) {
      const searchWords = normalize(search).split(/[\s\-]+/).filter(w => w.length > 0);
      personalVoices = personalVoices.filter((voice) => {
        const nameNorm = normalize(voice.name);
        const labelsNorm = Object.values(voice.labels || {}).map(l => normalize(l)).join(' ');
        const fullText = `${nameNorm} ${labelsNorm}`;
        // All search words must be present
        return searchWords.every(word => fullText.includes(word));
      });
    }

    // Map personal voices to simplified format
    const simplifiedPersonal: SimplifiedVoice[] = personalVoices.map((voice) => ({
      id: voice.voice_id,
      name: voice.name,
      labels: voice.labels || {},
      previewUrl: voice.preview_url,
      category: voice.category || 'custom',
      isLibrary: false,
    }));

    // 2. If search provided and includeLibrary, also search the Voice Library
    let libraryVoices: SimplifiedVoice[] = [];

    if (search && includeLibrary && search.length >= 2) {
      try {
        const libraryUrl = new URL(`${ELEVENLABS_API_URL}/shared-voices`);
        libraryUrl.searchParams.set('search', search);
        libraryUrl.searchParams.set('page_size', '50');

        const libraryResponse = await fetch(libraryUrl.toString(), {
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
          },
        });

        if (libraryResponse.ok) {
          const libraryData = await libraryResponse.json();
          const sharedVoices: Array<{
            public_owner_id: string;
            voice_id: string;
            name: string;
            accent?: string;
            gender?: string;
            age?: string;
            descriptive?: string;
            use_case?: string;
            category?: string;
            preview_url?: string;
          }> = libraryData.voices || [];

          // Map library voices, excluding any already in personal collection
          const personalIds = new Set(simplifiedPersonal.map(v => v.id));

          libraryVoices = sharedVoices
            .filter(v => !personalIds.has(v.voice_id))
            .map((voice) => ({
              id: voice.voice_id,
              name: voice.name,
              labels: {
                ...(voice.accent && { accent: voice.accent }),
                ...(voice.gender && { gender: voice.gender }),
                ...(voice.age && { age: voice.age }),
                ...(voice.descriptive && { descriptive: voice.descriptive }),
                ...(voice.use_case && { use_case: voice.use_case }),
              },
              previewUrl: voice.preview_url,
              category: voice.category || 'library',
              isLibrary: true,
              publicOwnerId: voice.public_owner_id,
            }));
        }
      } catch (libraryError) {
        console.error('Error fetching library voices:', libraryError);
        // Continue with personal voices only
      }
    }

    // Combine: personal voices first, then library voices
    const allVoices = [...simplifiedPersonal, ...libraryVoices];

    return NextResponse.json({
      voices: allVoices,
      hasLibraryResults: libraryVoices.length > 0,
    });
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

    // Log ElevenLabs usage
    logElevenLabsUsage({
      operation: 'text-to-speech-preview',
      model: 'eleven_multilingual_v2',
      characters: text.length,
    }).catch(console.error);

    return NextResponse.json({
      audio: `data:audio/mpeg;base64,${base64Audio}`
    });
  } catch (error) {
    console.error('Error generating speech:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
