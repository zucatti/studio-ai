import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { getSignedFileUrl } from '@/lib/storage';

/**
 * Download endpoint with Content-Disposition: attachment
 * Forces browser to download instead of displaying
 * GET /api/download?url=b2://...&filename=video.mp4
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = request.nextUrl.searchParams.get('url');
    const filename = request.nextUrl.searchParams.get('filename') || 'download';

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

    // Fetch file
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch file: ${response.status}` },
        { status: response.status }
      );
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    // Return with Content-Disposition: attachment to force download
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error('[Download] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
