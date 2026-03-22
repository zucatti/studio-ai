import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { getSignedFileUrl, parseStorageUrl } from '@/lib/storage';

export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = request.nextUrl.searchParams.get('url');
    const filename = request.nextUrl.searchParams.get('filename') || 'video.mp4';

    if (!url) {
      return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    // Get signed URL if it's a b2:// URL
    let signedUrl = url;
    if (url.startsWith('b2://')) {
      const parsed = parseStorageUrl(url);
      if (parsed) {
        signedUrl = await getSignedFileUrl(parsed.key, 3600);
      }
    }

    // Fetch the file
    const response = await fetch(signedUrl);
    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch file' }, { status: 500 });
    }

    const blob = await response.blob();

    // Return with download headers
    return new NextResponse(blob, {
      headers: {
        'Content-Type': blob.type || 'video/mp4',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': blob.size.toString(),
      },
    });
  } catch (error) {
    console.error('[Download] Error:', error);
    return NextResponse.json(
      { error: 'Download failed: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
