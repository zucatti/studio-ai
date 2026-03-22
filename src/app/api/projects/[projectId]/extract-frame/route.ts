import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { uploadFile, getSignedFileUrl, parseStorageUrl } from '@/lib/storage';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * Extract a frame from a video using FFmpeg
 *
 * POST /api/projects/[projectId]/extract-frame
 * Body: {
 *   videoUrl: string,       // URL of the video (b2:// or signed URL)
 *   position: 'first' | 'last' | number,  // Frame position (number = seconds)
 *   outputFormat?: 'png' | 'webp' | 'jpg'  // Default: png (lossless for best quality)
 * }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { projectId } = await context.params;

  try {
    const body = await request.json();
    const { videoUrl, position = 'last', outputFormat = 'png' } = body;  // PNG = lossless

    if (!videoUrl) {
      return NextResponse.json({ error: 'videoUrl is required' }, { status: 400 });
    }

    // Resolve the video URL (handle b2:// URLs)
    let resolvedVideoUrl = videoUrl;
    if (videoUrl.startsWith('b2://')) {
      const parsed = parseStorageUrl(videoUrl);
      if (parsed) {
        resolvedVideoUrl = await getSignedFileUrl(parsed.key, 3600);
      }
    }

    // Create temp directory
    const tempDir = path.join(os.tmpdir(), 'studio-frames');
    if (!existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true });
    }

    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const tempVideoPath = path.join(tempDir, `video_${timestamp}_${randomId}.mp4`);
    const tempFramePath = path.join(tempDir, `frame_${timestamp}_${randomId}.${outputFormat}`);

    try {
      // Download video to temp file
      console.log('[ExtractFrame] Downloading video...');
      const videoResponse = await fetch(resolvedVideoUrl);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.status}`);
      }
      const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
      await writeFile(tempVideoPath, videoBuffer);
      console.log('[ExtractFrame] Video downloaded:', videoBuffer.length, 'bytes');

      // Get video duration if extracting last frame
      let frameTime = '0';
      if (position === 'last') {
        const { stdout } = await execAsync(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempVideoPath}"`,
          { timeout: 30000 }
        );
        const duration = parseFloat(stdout.trim());
        // Extract frame 0.1 seconds before the end to avoid black frames
        frameTime = Math.max(0, duration - 0.1).toFixed(3);
        console.log('[ExtractFrame] Video duration:', duration, '-> extracting at', frameTime);
      } else if (position === 'first') {
        frameTime = '0.1'; // Slightly after start to avoid potential black frames
      } else if (typeof position === 'number') {
        frameTime = position.toString();
      }

      // Get video resolution first
      const { stdout: probeOutput } = await execAsync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${tempVideoPath}"`,
        { timeout: 30000 }
      );
      const [width, height] = probeOutput.trim().split(',').map(Number);
      console.log('[ExtractFrame] Video resolution:', width, 'x', height);

      // Extract frame using FFmpeg
      // PNG: lossless compression (best for frame continuity)
      // WebP/JPG: use high quality setting
      // Force exact resolution to avoid any scaling artifacts
      const qualityOpts = outputFormat === 'png'
        ? '-compression_level 6'  // PNG lossless (0-10, higher = smaller file)
        : '-q:v 1';  // Highest quality for lossy formats

      // Use scale filter to ensure exact pixel dimensions
      // setsar=1:1 forces square pixels (removes any SAR/DAR weirdness)
      // flags=lanczos for best quality scaling (even though we're not scaling)
      const ffmpegCmd = `ffmpeg -y -ss ${frameTime} -i "${tempVideoPath}" -vframes 1 -vf "scale=${width}:${height}:flags=lanczos,setsar=1:1" ${qualityOpts} "${tempFramePath}"`;
      console.log('[ExtractFrame] Running:', ffmpegCmd);

      await execAsync(ffmpegCmd, { timeout: 60000 });

      console.log('[ExtractFrame] Frame extracted at exact resolution:', width, 'x', height, '(SAR 1:1)');

      // Read the extracted frame
      const { readFile } = await import('fs/promises');
      const frameBuffer = await readFile(tempFramePath);
      console.log('[ExtractFrame] Frame extracted:', frameBuffer.length, 'bytes');

      // Upload to B2
      const sanitizedUserId = session.user.sub.replace(/[|]/g, '_');
      const storageKey = `frames/${sanitizedUserId}/${projectId}/${timestamp}_${randomId}_extracted.${outputFormat}`;

      const contentType = outputFormat === 'webp' ? 'image/webp'
        : outputFormat === 'png' ? 'image/png'
        : 'image/jpeg';

      const { url } = await uploadFile(storageKey, frameBuffer, contentType);
      console.log('[ExtractFrame] Uploaded to:', url);

      // Clean up temp files
      await unlink(tempVideoPath).catch(() => {});
      await unlink(tempFramePath).catch(() => {});

      // Return both the storage URL and a signed URL for immediate display
      const signedUrl = await getSignedFileUrl(storageKey, 3600);

      return NextResponse.json({
        success: true,
        frameUrl: url,
        signedUrl,
        position: position === 'last' ? `${frameTime}s (last)` : position,
      });

    } finally {
      // Ensure cleanup even on error
      await unlink(tempVideoPath).catch(() => {});
      await unlink(tempFramePath).catch(() => {});
    }

  } catch (error) {
    console.error('[ExtractFrame] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to extract frame' },
      { status: 500 }
    );
  }
}
