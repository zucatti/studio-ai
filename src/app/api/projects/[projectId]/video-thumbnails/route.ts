import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { uploadFile, getSignedFileUrl, parseStorageUrl, fileExists } from '@/lib/storage';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * Generate a hash from the video URL (or path) to use as cache key
 * This allows us to detect when a video has changed
 */
function hashVideoUrl(url: string): string {
  // Extract the path part (without query params like signatures)
  let pathPart = url;
  try {
    const parsed = new URL(url);
    pathPart = parsed.pathname;
  } catch {
    // Not a URL, use as-is (e.g., b2:// scheme)
  }

  // Create a short hash
  return createHash('sha256').update(pathPart).digest('hex').substring(0, 16);
}

/**
 * Generate a filmstrip image from a video using FFmpeg
 * Creates a single horizontal image with frames tiled side by side
 *
 * POST /api/projects/[projectId]/video-thumbnails
 * Body: {
 *   videoUrl: string,       // URL of the video (b2:// or signed URL)
 *   timelineWidth: number,  // Width of the timeline container in pixels
 *   height?: number,        // Thumbnail height in px (default: 40)
 * }
 *
 * Returns a single filmstrip image URL (cached if available).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { projectId } = await context.params;

  try {
    const body = await request.json();
    const { videoUrl, timelineWidth = 1200, height = 40 } = body;

    if (!videoUrl) {
      return NextResponse.json({ error: 'videoUrl is required' }, { status: 400 });
    }

    // Generate hash for cache key (include timeline width for different sizes)
    const videoHash = hashVideoUrl(videoUrl);
    const cacheKey = `${videoHash}_w${timelineWidth}_h${height}`;
    const sanitizedUserId = session.user.sub.replace(/[|]/g, '_');
    const filmstripKey = `filmstrips/${sanitizedUserId}/${projectId}/${cacheKey}.jpg`;

    // Check if filmstrip already exists
    const exists = await fileExists(filmstripKey);
    if (exists) {
      console.log('[VideoThumbnails] Cache hit for filmstrip:', cacheKey);
      const signedUrl = await getSignedFileUrl(filmstripKey, 3600);
      return NextResponse.json({
        success: true,
        cached: true,
        hash: videoHash,
        filmstripUrl: signedUrl,
      });
    }

    console.log('[VideoThumbnails] Cache miss, generating filmstrip for:', cacheKey);

    // Resolve the video URL (handle b2:// URLs)
    let resolvedVideoUrl = videoUrl;
    if (videoUrl.startsWith('b2://')) {
      const parsed = parseStorageUrl(videoUrl);
      if (parsed) {
        resolvedVideoUrl = await getSignedFileUrl(parsed.key, 3600);
      }
    } else if (videoUrl.includes('backblazeb2.com') || videoUrl.includes('s3.')) {
      // Re-sign potentially expired URL
      try {
        const url = new URL(videoUrl);
        let key = url.pathname;
        if (key.startsWith('/')) key = key.substring(1);
        const bucket = process.env.S3_BUCKET || 'studio-assets';
        if (key.startsWith(`${bucket}/`)) key = key.substring(bucket.length + 1);
        resolvedVideoUrl = await getSignedFileUrl(key, 3600);
      } catch (e) {
        console.error('[VideoThumbnails] Failed to re-sign URL:', e);
      }
    }

    // Create temp directory
    const tempDir = path.join(os.tmpdir(), 'studio-filmstrips');
    if (!existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true });
    }

    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const tempVideoPath = path.join(tempDir, `video_${timestamp}_${randomId}.mp4`);
    const tempFilmstripPath = path.join(tempDir, `filmstrip_${timestamp}_${randomId}.jpg`);

    try {
      // Download video to temp file
      console.log('[VideoThumbnails] Downloading video...');
      const videoResponse = await fetch(resolvedVideoUrl);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.status}`);
      }
      const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
      await writeFile(tempVideoPath, videoBuffer);
      console.log('[VideoThumbnails] Video downloaded:', videoBuffer.length, 'bytes');

      // Get video duration and dimensions
      const { stdout: probeOutput } = await execAsync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration -show_entries format=duration -of json "${tempVideoPath}"`,
        { timeout: 30000 }
      );

      const probeData = JSON.parse(probeOutput);
      const streamInfo = probeData.streams?.[0] || {};
      const videoWidth = streamInfo.width || 1920;
      const videoHeight = streamInfo.height || 1080;
      const duration = parseFloat(streamInfo.duration || probeData.format?.duration || '0');

      console.log('[VideoThumbnails] Video info:', { videoWidth, videoHeight, duration });

      if (duration <= 0) {
        throw new Error('Could not determine video duration');
      }

      // Calculate frame dimensions based on video aspect ratio
      const aspectRatio = videoWidth / videoHeight;
      const frameWidth = Math.round(height * aspectRatio);

      // Calculate how many frames we need to fill the timeline width
      const frameCount = Math.ceil(timelineWidth / frameWidth);

      // Calculate FPS to extract exactly frameCount frames over the video duration
      const fps = frameCount / duration;

      console.log('[VideoThumbnails] Filmstrip params:', {
        frameWidth,
        frameCount,
        fps,
        outputWidth: frameCount * frameWidth,
      });

      // Extract frames and tile them horizontally in a single command
      // scale: resize each frame
      // tile: arrange frames in a single row (Nx1)
      const ffmpegCmd = `ffmpeg -y -i "${tempVideoPath}" -vf "fps=${fps},scale=${frameWidth}:${height}:flags=lanczos,tile=${frameCount}x1" -frames:v 1 -q:v 2 "${tempFilmstripPath}"`;
      console.log('[VideoThumbnails] Running:', ffmpegCmd);

      await execAsync(ffmpegCmd, { timeout: 120000 });

      // Read and upload the filmstrip
      const filmstripBuffer = await readFile(tempFilmstripPath);
      console.log('[VideoThumbnails] Filmstrip generated:', filmstripBuffer.length, 'bytes');

      await uploadFile(filmstripKey, filmstripBuffer, 'image/jpeg');
      const signedUrl = await getSignedFileUrl(filmstripKey, 3600);

      // Clean up
      await unlink(tempVideoPath).catch(() => {});
      await unlink(tempFilmstripPath).catch(() => {});

      return NextResponse.json({
        success: true,
        cached: false,
        hash: videoHash,
        filmstripUrl: signedUrl,
        frameCount,
        frameWidth,
      });

    } finally {
      // Ensure cleanup
      await unlink(tempVideoPath).catch(() => {});
      await unlink(tempFilmstripPath).catch(() => {});
    }

  } catch (error) {
    console.error('[VideoThumbnails] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate filmstrip' },
      { status: 500 }
    );
  }
}
