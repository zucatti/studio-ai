import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { getSignedFileUrl, downloadFile, getFileMetadata } from '@/lib/storage';

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

/**
 * GET /api/storage/[...path]
 *
 * Serves files from B2 storage with signed URLs or proxies the content.
 * Requires authentication.
 *
 * Query params:
 * - redirect=true: Redirect to signed URL (default)
 * - redirect=false: Proxy the file content directly
 * - expires: URL expiration in seconds (default: 3600)
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { path } = await params;
    const key = path.join('/');
    const url = new URL(request.url);
    const redirect = url.searchParams.get('redirect') !== 'false';
    const expires = parseInt(url.searchParams.get('expires') || '3600', 10);

    if (!key) {
      return NextResponse.json({ error: 'Path required' }, { status: 400 });
    }

    // Check if file exists
    const metadata = await getFileMetadata(key);
    if (!metadata) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    if (redirect) {
      // Redirect to signed URL
      const signedUrl = await getSignedFileUrl(key, expires);
      return NextResponse.redirect(signedUrl, 302);
    } else {
      // Proxy the file content
      const buffer = await downloadFile(key);

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': metadata.contentType,
          'Content-Length': metadata.size.toString(),
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }
  } catch (error) {
    console.error('Storage GET error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve file' },
      { status: 500 }
    );
  }
}
