import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { getSignedFileUrl, downloadFile, getFileMetadata, uploadFile, fileExists } from '@/lib/storage';
import sharp from 'sharp';

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

// Allowed thumbnail sizes to prevent abuse
const ALLOWED_SIZES = [48, 80, 96, 160, 320, 640, 1280];

// In-memory LRU cache for hot thumbnails (max 100 items, ~50MB max)
const thumbnailCache = new Map<string, { data: Buffer; timestamp: number }>();
const CACHE_MAX_SIZE = 100;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in-memory

function getCachedThumbnail(cacheKey: string): Buffer | null {
  const entry = thumbnailCache.get(cacheKey);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    // Move to end (LRU)
    thumbnailCache.delete(cacheKey);
    thumbnailCache.set(cacheKey, entry);
    return entry.data;
  }
  if (entry) {
    thumbnailCache.delete(cacheKey);
  }
  return null;
}

function setCachedThumbnail(cacheKey: string, data: Buffer): void {
  // Evict oldest if at capacity
  if (thumbnailCache.size >= CACHE_MAX_SIZE) {
    const firstKey = thumbnailCache.keys().next().value;
    if (firstKey) thumbnailCache.delete(firstKey);
  }
  thumbnailCache.set(cacheKey, { data, timestamp: Date.now() });
}

function getAllowedSize(requested: number): number {
  // Find the closest allowed size that is >= requested
  for (const size of ALLOWED_SIZES) {
    if (size >= requested) return size;
  }
  return ALLOWED_SIZES[ALLOWED_SIZES.length - 1];
}

function isImageContentType(contentType: string): boolean {
  return contentType.startsWith('image/') && !contentType.includes('svg');
}

function getThumbnailKey(originalKey: string, width: number, quality: number): string {
  const parts = originalKey.split('/');
  const filename = parts.pop() || 'image';
  const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
  return `thumbnails/${parts.join('/')}/${nameWithoutExt}_${width}q${quality}.webp`;
}

/**
 * GET /api/storage/[...path]
 *
 * Serves files from B2 storage with signed URLs or proxies the content.
 * Requires authentication.
 *
 * Query params:
 * - redirect=true: Redirect to signed URL (default for non-resized)
 * - redirect=false: Proxy the file content directly
 * - expires: URL expiration in seconds (default: 3600)
 * - w: Width for thumbnail (forces proxy mode, resizes image)
 * - q: Quality 1-100 (default: 80)
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
    const widthParam = url.searchParams.get('w');
    const qualityParam = url.searchParams.get('q');
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

    // If width is specified, resize the image
    if (widthParam && isImageContentType(metadata.contentType)) {
      const requestedWidth = parseInt(widthParam, 10);
      if (isNaN(requestedWidth) || requestedWidth < 1) {
        return NextResponse.json({ error: 'Invalid width' }, { status: 400 });
      }

      const width = getAllowedSize(requestedWidth);
      const quality = Math.min(100, Math.max(1, parseInt(qualityParam || '80', 10)));
      const cacheKey = `${key}:${width}:${quality}`;
      const thumbnailKey = getThumbnailKey(key, width, quality);

      // 1. Check in-memory cache
      const cached = getCachedThumbnail(cacheKey);
      if (cached) {
        return new NextResponse(new Uint8Array(cached), {
          headers: {
            'Content-Type': 'image/webp',
            'Content-Length': cached.length.toString(),
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Cache': 'HIT-MEMORY',
          },
        });
      }

      // 2. Check if thumbnail exists in B2
      const thumbnailExists = await fileExists(thumbnailKey);
      if (thumbnailExists) {
        const thumbnailBuffer = await downloadFile(thumbnailKey);
        setCachedThumbnail(cacheKey, thumbnailBuffer);
        return new NextResponse(new Uint8Array(thumbnailBuffer), {
          headers: {
            'Content-Type': 'image/webp',
            'Content-Length': thumbnailBuffer.length.toString(),
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Cache': 'HIT-B2',
          },
        });
      }

      // 3. Generate thumbnail
      const buffer = await downloadFile(key);
      const resized = await sharp(buffer)
        .resize(width, width, {
          fit: 'cover',
          position: 'top', // For portraits, keep the face visible
          withoutEnlargement: true,
        })
        .webp({ quality })
        .toBuffer();

      // 4. Store in B2 (async, don't wait)
      uploadFile(thumbnailKey, resized, 'image/webp', {
        cacheControl: 'public, max-age=31536000, immutable',
      }).catch(err => console.error('Failed to cache thumbnail:', err));

      // 5. Store in memory cache
      setCachedThumbnail(cacheKey, resized);

      return new NextResponse(new Uint8Array(resized), {
        headers: {
          'Content-Type': 'image/webp',
          'Content-Length': resized.length.toString(),
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Cache': 'MISS',
        },
      });
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
