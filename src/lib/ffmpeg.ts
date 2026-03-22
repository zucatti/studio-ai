/**
 * FFmpeg utilities for video processing
 * Replaces Creatomate for concat and merge operations
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { uploadFile, getSignedFileUrl, parseStorageUrl, STORAGE_BUCKET } from './storage';

const execAsync = promisify(exec);

// Temp directory for FFmpeg operations
const TEMP_DIR = path.join(os.tmpdir(), 'studio-ffmpeg');

async function ensureTempDir() {
  if (!existsSync(TEMP_DIR)) {
    await mkdir(TEMP_DIR, { recursive: true });
  }
}

function generateTempPath(ext: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return path.join(TEMP_DIR, `${timestamp}_${random}.${ext}`);
}

/**
 * Download a file from URL to a temp path
 * Handles both regular URLs and b2:// URLs
 */
async function downloadToTemp(url: string, ext: string = 'mp4'): Promise<string> {
  let resolvedUrl = url;

  // Handle b2:// URLs
  if (url.startsWith('b2://')) {
    const parsed = parseStorageUrl(url);
    if (parsed) {
      resolvedUrl = await getSignedFileUrl(parsed.key, 3600);
    }
  }

  const response = await fetch(resolvedUrl);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const tempPath = generateTempPath(ext);
  await writeFile(tempPath, buffer);
  return tempPath;
}

/**
 * Cleanup temp files
 */
async function cleanup(...paths: string[]) {
  for (const p of paths) {
    try {
      await unlink(p);
    } catch {
      // Ignore cleanup errors
    }
  }
}

export interface ConcatenateResult {
  outputUrl: string;      // b2:// URL for storage
  signedUrl: string;      // Signed URL for immediate playback
  duration?: number;
}

export interface ConcatenateOptions {
  videoUrls: string[];
  userId: string;
  projectId: string;
  outputFilename?: string;
  // Color matching options
  colorMatch?: boolean;           // Enable color normalization between clips
  lutFile?: string;               // Path to custom LUT file (optional)
}

/**
 * Concatenate multiple videos into one using FFmpeg
 * Videos are joined sequentially without re-encoding when possible
 *
 * With colorMatch=true, applies color normalization to each clip for consistency:
 * - normalize: auto-adjusts black/white points
 * - eq: standardizes brightness/contrast/saturation
 */
export async function concatenateVideos(options: ConcatenateOptions): Promise<ConcatenateResult> {
  await ensureTempDir();

  const { videoUrls, userId, projectId, colorMatch = false } = options;
  const tempFiles: string[] = [];
  const normalizedFiles: string[] = [];
  const listPath = generateTempPath('txt');
  const outputPath = generateTempPath('mp4');

  try {
    console.log(`[FFmpeg] Downloading ${videoUrls.length} videos...`);

    // Download all videos
    for (let i = 0; i < videoUrls.length; i++) {
      const tempPath = await downloadToTemp(videoUrls[i], 'mp4');
      tempFiles.push(tempPath);
      console.log(`[FFmpeg] Downloaded video ${i + 1}/${videoUrls.length}`);
    }

    // If color matching is enabled, normalize each video first
    if (colorMatch) {
      console.log(`[FFmpeg] Applying color normalization to ${tempFiles.length} videos...`);

      for (let i = 0; i < tempFiles.length; i++) {
        const normalizedPath = generateTempPath('mp4');
        normalizedFiles.push(normalizedPath);

        // Color normalization filter chain:
        // 1. normalize: auto-adjust black/white points (temporal smoothing for consistency)
        // 2. eq: fine-tune brightness=0, contrast=1, saturation=1 (neutral baseline)
        // 3. unsharp: slight sharpening to counter any softness from processing
        const filterChain = [
          'normalize=blackpt=black:whitept=white:smoothing=50',
          'eq=brightness=0:contrast=1:saturation=1.05',  // Slight saturation boost
        ].join(',');

        const normalizeCmd = `ffmpeg -y -i "${tempFiles[i]}" -vf "${filterChain}" -c:v libx264 -preset fast -crf 18 -c:a copy "${normalizedPath}"`;
        console.log(`[FFmpeg] Normalizing video ${i + 1}: ${normalizeCmd}`);

        await execAsync(normalizeCmd, { timeout: 180000 }); // 3 min per video
      }
    }

    // Use normalized files if color matching, otherwise use originals
    const filesToConcat = colorMatch ? normalizedFiles : tempFiles;

    // Create concat list file
    const listContent = filesToConcat.map(f => `file '${f}'`).join('\n');
    await writeFile(listPath, listContent);

    // Run FFmpeg concat
    // With color matching: files are already re-encoded, so we can stream copy
    // Without color matching: direct stream copy (fast)
    const cmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy -movflags +faststart "${outputPath}"`;
    console.log(`[FFmpeg] Concatenating: ${cmd}`);

    await execAsync(cmd, { timeout: 300000 }); // 5 min timeout

    // Read output and upload to B2
    const outputBuffer = await readFile(outputPath);
    console.log(`[FFmpeg] Output size: ${outputBuffer.length} bytes`);

    const sanitizedUserId = userId.replace(/[|]/g, '_');
    const timestamp = Date.now();
    const storageKey = `shorts/${sanitizedUserId}/${projectId}/assembled_${timestamp}.mp4`;

    const { url } = await uploadFile(storageKey, outputBuffer, 'video/mp4');
    console.log(`[FFmpeg] Uploaded to: ${url}`);

    // Get signed URL for immediate playback
    const signedUrl = await getSignedFileUrl(storageKey, 3600);

    return { outputUrl: url, signedUrl };

  } finally {
    // Cleanup all temp files
    await cleanup(listPath, outputPath, ...tempFiles, ...normalizedFiles);
  }
}

export interface MergeAudioResult {
  outputUrl: string;      // b2:// URL for storage
  signedUrl: string;      // Signed URL for immediate playback
}

/**
 * Merge video and audio into a single file using FFmpeg
 * Replaces original audio with new audio track
 */
export async function mergeVideoAudio(options: {
  videoUrl: string;
  audioUrl: string;
  userId: string;
  projectId: string;
  shotId: string;
}): Promise<MergeAudioResult> {
  await ensureTempDir();

  const { videoUrl, audioUrl, userId, projectId, shotId } = options;
  const videoPath = await downloadToTemp(videoUrl, 'mp4');
  const audioPath = await downloadToTemp(audioUrl, 'mp3');
  const outputPath = generateTempPath('mp4');

  try {
    console.log(`[FFmpeg] Merging video + audio...`);

    // FFmpeg command to merge video and audio
    // -i video: input video
    // -i audio: input audio
    // -c:v copy: copy video stream (no re-encoding)
    // -c:a aac: encode audio to AAC (compatible format)
    // -map 0:v:0: use video from first input
    // -map 1:a:0: use audio from second input
    // -shortest: end when shortest stream ends
    // -movflags +faststart: move metadata to start for streaming/proper duration
    const cmd = `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest -movflags +faststart "${outputPath}"`;
    console.log(`[FFmpeg] Running: ${cmd}`);

    await execAsync(cmd, { timeout: 120000 }); // 2 min timeout

    // Read output and upload to B2
    const outputBuffer = await readFile(outputPath);
    console.log(`[FFmpeg] Output size: ${outputBuffer.length} bytes`);

    const sanitizedUserId = userId.replace(/[|]/g, '_');
    const timestamp = Date.now();
    const storageKey = `videos/${sanitizedUserId}/${projectId}/${shotId}_with_audio_${timestamp}.mp4`;

    const { url } = await uploadFile(storageKey, outputBuffer, 'video/mp4');
    console.log(`[FFmpeg] Uploaded to: ${url}`);

    // Get signed URL for immediate playback
    const signedUrl = await getSignedFileUrl(storageKey, 3600);

    return { outputUrl: url, signedUrl };

  } finally {
    // Cleanup
    await cleanup(videoPath, audioPath, outputPath);
  }
}

/**
 * Get video duration using ffprobe
 */
export async function getVideoDuration(videoUrl: string): Promise<number> {
  await ensureTempDir();

  const videoPath = await downloadToTemp(videoUrl, 'mp4');

  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { timeout: 30000 }
    );
    return parseFloat(stdout.trim());
  } finally {
    await cleanup(videoPath);
  }
}
