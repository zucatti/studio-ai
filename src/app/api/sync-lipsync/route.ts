import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { createFalWrapper, applySyncLipsyncFal } from '@/lib/ai/fal-wrapper';
import { uploadFile } from '@/lib/storage';

/**
 * POST /api/sync-lipsync
 *
 * Apply lip-sync translation to a video using Sync Lipsync 1.9.
 * Takes a video (in English) and audio (in target language) and
 * produces a video with lip-sync adjusted for the target language.
 *
 * Workflow:
 * 1. English video generated with Kling Omni (native lip-sync)
 * 2. Target language audio generated with ElevenLabs
 * 3. This endpoint applies Sync Lipsync to combine them
 *
 * Cost: ~$0.70/minute of video
 *
 * Request body:
 * {
 *   videoUrl: string,    // Source video URL (English)
 *   audioUrl: string,    // Target audio URL (translated)
 *   targetLanguage: string,  // e.g., "fr", "es", "de"
 *   projectId?: string,  // For storage organization
 *   shortId?: string,    // For storage organization
 * }
 *
 * Response:
 * {
 *   videoUrl: string,    // Translated video with lip-sync
 *   cost: number,        // Cost in dollars
 * }
 */
export async function POST(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { videoUrl, audioUrl, targetLanguage, projectId, shortId } = body;

    // Validate required fields
    if (!videoUrl || !audioUrl) {
      return NextResponse.json(
        { error: 'videoUrl and audioUrl are required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Create fal.ai wrapper
    const falWrapper = createFalWrapper({
      userId: session.user.sub,
      projectId,
      supabase,
      operation: 'sync-lipsync-translation',
    });

    // Sign URLs if they're B2 URLs
    let signedVideoUrl = videoUrl;
    let signedAudioUrl = audioUrl;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    if (videoUrl.startsWith('b2://')) {
      const signRes = await fetch(`${baseUrl}/api/storage/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: [videoUrl] }),
      });
      if (signRes.ok) {
        const signData = await signRes.json();
        signedVideoUrl = signData.signedUrls?.[videoUrl] || videoUrl;
      }
    }

    if (audioUrl.startsWith('b2://')) {
      const signRes = await fetch(`${baseUrl}/api/storage/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: [audioUrl] }),
      });
      if (signRes.ok) {
        const signData = await signRes.json();
        signedAudioUrl = signData.signedUrls?.[audioUrl] || audioUrl;
      }
    }

    console.log('[Sync Lipsync] Applying lip-sync translation...');
    console.log(`[Sync Lipsync] Target language: ${targetLanguage || 'unknown'}`);

    // Apply Sync Lipsync with remap mode (for translation)
    const { videoUrl: translatedVideoUrl, cost } = await applySyncLipsyncFal(
      falWrapper,
      {
        videoUrl: signedVideoUrl,
        audioUrl: signedAudioUrl,
        syncMode: 'remap',
      }
    );

    // Upload the translated video to B2 for permanent storage
    let b2VideoUrl = translatedVideoUrl;
    if (projectId && shortId) {
      const videoResponse = await fetch(translatedVideoUrl);
      const videoBuffer = await videoResponse.arrayBuffer();
      const videoPath = `projects/${projectId}/shorts/${shortId}/translated-${targetLanguage || 'video'}.mp4`;
      const { url } = await uploadFile(videoPath, Buffer.from(videoBuffer), 'video/mp4');
      b2VideoUrl = url;
    }

    console.log('[Sync Lipsync] Translation complete');

    return NextResponse.json({
      videoUrl: b2VideoUrl,
      cost,
      targetLanguage,
    });
  } catch (error) {
    console.error('Sync Lipsync error:', error);
    return NextResponse.json(
      {
        error: 'Failed to apply lip-sync translation',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
