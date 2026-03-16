import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import {
  getSignedFileUrl,
  parseStorageUrl,
  isB2Url,
  isSupabaseStorageUrl,
} from '@/lib/storage';

/**
 * POST /api/storage/sign
 *
 * Generate signed URLs for one or more storage keys/URLs.
 * Handles both B2 URLs (b2://bucket/key) and legacy Supabase URLs.
 *
 * Body: { urls: string[], expires?: number }
 * Returns: { signedUrls: Record<string, string> }
 */
export async function POST(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { urls, expires = 3600 } = body;

    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: 'urls array required' }, { status: 400 });
    }

    if (urls.length > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 URLs per request' },
        { status: 400 }
      );
    }

    const signedUrls: Record<string, string> = {};

    for (const url of urls) {
      if (!url) continue;

      // If it's already a signed URL or regular HTTP URL, pass through
      if (url.startsWith('http') && !isSupabaseStorageUrl(url)) {
        signedUrls[url] = url;
        continue;
      }

      // Parse the URL to get the key
      const parsed = parseStorageUrl(url);
      if (!parsed) {
        // Can't parse, pass through as-is
        signedUrls[url] = url;
        continue;
      }

      try {
        const signedUrl = await getSignedFileUrl(parsed.key, expires);
        signedUrls[url] = signedUrl;
      } catch (error) {
        console.error(`Failed to sign URL ${url}:`, error);
        // Return original URL on error
        signedUrls[url] = url;
      }
    }

    return NextResponse.json({ signedUrls });
  } catch (error) {
    console.error('Storage sign error:', error);
    return NextResponse.json(
      { error: 'Failed to sign URLs' },
      { status: 500 }
    );
  }
}
