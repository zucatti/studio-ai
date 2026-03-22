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
  // Transition options
  transitionFrames?: number;      // Number of interpolated frames at each junction (default: 8)
  smoothTransition?: boolean;     // Enable motion interpolation at junctions (default: true)
}

/**
 * Get video duration using ffprobe
 */
async function getVideoDurationLocal(videoPath: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
    { timeout: 30000 }
  );
  return parseFloat(stdout.trim()) || 0;
}

/**
 * Concatenate multiple videos into one using FFmpeg
 *
 * With smoothTransition=true (default), creates crossfade transitions between clips:
 * - Uses xfade filter for smooth visual blending
 * - Short 0.3s crossfade masks the frame discontinuity
 *
 * With colorMatch=true, applies color normalization to each clip for consistency
 */
export async function concatenateVideos(options: ConcatenateOptions): Promise<ConcatenateResult> {
  await ensureTempDir();

  const {
    videoUrls,
    userId,
    projectId,
    colorMatch = false,
    smoothTransition = true,
    transitionFrames = 10,  // ~0.33s at 30fps
  } = options;

  const tempFiles: string[] = [];
  const allTempFiles: string[] = [];
  const outputPath = generateTempPath('mp4');

  try {
    console.log(`[FFmpeg] Downloading ${videoUrls.length} videos...`);

    // Download all videos
    for (let i = 0; i < videoUrls.length; i++) {
      const tempPath = await downloadToTemp(videoUrls[i], 'mp4');
      tempFiles.push(tempPath);
      allTempFiles.push(tempPath);
      console.log(`[FFmpeg] Downloaded video ${i + 1}/${videoUrls.length}`);
    }

    // Step 1: Color normalization (if enabled)
    let workingFiles = tempFiles;
    if (colorMatch) {
      console.log(`[FFmpeg] Applying color normalization...`);
      const normalizedFiles: string[] = [];

      for (let i = 0; i < tempFiles.length; i++) {
        const normalizedPath = generateTempPath('mp4');
        normalizedFiles.push(normalizedPath);
        allTempFiles.push(normalizedPath);

        const filterChain = [
          'normalize=blackpt=black:whitept=white:smoothing=50',
          'eq=brightness=0:contrast=1:saturation=1.05',
        ].join(',');

        await execAsync(
          `ffmpeg -y -i "${tempFiles[i]}" -vf "${filterChain}" -c:v libx264 -preset fast -crf 18 -c:a copy "${normalizedPath}"`,
          { timeout: 180000 }
        );
        console.log(`[FFmpeg] Normalized video ${i + 1}/${tempFiles.length}`);
      }
      workingFiles = normalizedFiles;
    }

    // Step 2: Concatenate with xfade transitions (if enabled and multiple clips)
    if (smoothTransition && workingFiles.length > 1) {
      console.log(`[FFmpeg] Creating crossfade transitions between ${workingFiles.length} clips...`);

      const xfadeDuration = transitionFrames / 30; // Convert frames to seconds

      // Build xfade filter chain for multiple clips
      // For 2 clips: [0:v][1:v]xfade=transition=fade:duration=0.3:offset=X[v]
      // For 3+ clips: chain them together

      // Get durations of all clips
      const durations: number[] = [];
      for (const file of workingFiles) {
        const dur = await getVideoDurationLocal(file);
        durations.push(dur);
      }

      // Build inputs
      const inputs = workingFiles.map(f => `-i "${f}"`).join(' ');

      // Build filter complex for xfade chain
      let filterComplex = '';
      let currentOffset = 0;
      let lastOutput = '[0:v]';
      let audioMerge = '';

      for (let i = 1; i < workingFiles.length; i++) {
        // Offset = sum of previous durations minus accumulated xfade durations
        currentOffset = durations.slice(0, i).reduce((a, b) => a + b, 0) - (i * xfadeDuration);
        currentOffset = Math.max(0, currentOffset);

        const outputLabel = i === workingFiles.length - 1 ? '[vout]' : `[v${i}]`;

        filterComplex += `${lastOutput}[${i}:v]xfade=transition=fade:duration=${xfadeDuration}:offset=${currentOffset.toFixed(3)}${outputLabel}`;

        if (i < workingFiles.length - 1) {
          filterComplex += '; ';
        }

        lastOutput = outputLabel;
      }

      // For audio: amerge or concat
      // Simple approach: concat audio streams
      const audioInputs = workingFiles.map((_, i) => `[${i}:a]`).join('');
      audioMerge = `; ${audioInputs}concat=n=${workingFiles.length}:v=0:a=1[aout]`;

      const fullFilter = filterComplex + audioMerge;

      const xfadeCmd = `ffmpeg -y ${inputs} -filter_complex "${fullFilter}" -map "[vout]" -map "[aout]" -c:v libx264 -preset fast -crf 18 -c:a aac -movflags +faststart "${outputPath}"`;

      console.log(`[FFmpeg] Running xfade: ${xfadeCmd.substring(0, 200)}...`);
      await execAsync(xfadeCmd, { timeout: 300000 });

    } else {
      // Simple concatenation without transitions
      const listPath = generateTempPath('txt');
      allTempFiles.push(listPath);
      await writeFile(listPath, workingFiles.map(f => `file '${f}'`).join('\n'));

      await execAsync(
        `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy -movflags +faststart "${outputPath}"`,
        { timeout: 300000 }
      );
    }

    // Read output and upload to B2
    const outputBuffer = await readFile(outputPath);
    console.log(`[FFmpeg] Output size: ${outputBuffer.length} bytes`);

    const sanitizedUserId = userId.replace(/[|]/g, '_');
    const timestamp = Date.now();
    const storageKey = `shorts/${sanitizedUserId}/${projectId}/assembled_${timestamp}.mp4`;

    const { url } = await uploadFile(storageKey, outputBuffer, 'video/mp4');
    console.log(`[FFmpeg] Uploaded to: ${url}`);

    const signedUrl = await getSignedFileUrl(storageKey, 3600);

    return { outputUrl: url, signedUrl };

  } finally {
    await cleanup(outputPath, ...allTempFiles);
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
