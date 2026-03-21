import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { getSignedFileUrl } from '@/lib/storage';

/**
 * Proxy video with CORS headers for client-side frame extraction
 * GET /api/proxy-video?url=b2://bucket/key
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = request.nextUrl.searchParams.get('url');
    if (!url) {
      return NextResponse.json({ error: 'url parameter required' }, { status: 400 });
    }

    // Get signed URL if B2 URL
    let fetchUrl = url;
    if (url.startsWith('b2://')) {
      const match = url.match(/^b2:\/\/[^/]+\/(.+)$/);
      if (match) {
        fetchUrl = await getSignedFileUrl(match[1]);
      }
    }

    // Fetch video from B2
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch video: ${response.status}` },
        { status: response.status }
      );
    }

    // Get video data
    const videoBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'video/mp4';

    // Return with CORS headers
    return new NextResponse(videoBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('[Proxy Video] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
