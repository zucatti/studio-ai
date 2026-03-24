import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { downloadFile, parseStorageUrl, isB2Url } from '@/lib/storage';

/**
 * GET /api/storage/proxy?url=b2://bucket/key
 *
 * Temporary proxy for B2 files while CORS propagates.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = request.nextUrl.searchParams.get('url');
    if (!url || !isB2Url(url)) {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    const parsed = parseStorageUrl(url);
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid B2 URL' }, { status: 400 });
    }

    const fileBuffer = await downloadFile(parsed.key);

    const ext = parsed.key.split('.').pop()?.toLowerCase();
    const types: Record<string, string> = {
      mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
      m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
    };

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type': types[ext || ''] || 'audio/mpeg',
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
