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
 * Get video info (duration, fps) using ffprobe
 */
async function getVideoInfo(videoPath: string): Promise<{ duration: number; fps: number }> {
  const { stdout } = await execAsync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate,duration -show_entries format=duration -of json "${videoPath}"`,
    { timeout: 30000 }
  );
  const info = JSON.parse(stdout);

  // Get duration from format or stream
  const duration = parseFloat(info.format?.duration || info.streams?.[0]?.duration || '0');

  // Parse frame rate (format: "30/1" or "30000/1001")
  const fpsStr = info.streams?.[0]?.r_frame_rate || '30/1';
  const [num, den] = fpsStr.split('/').map(Number);
  const fps = num / (den || 1);

  return { duration, fps };
}

/**
 * Create a smooth transition between two video clips using motion interpolation
 * Takes the last part of clip1 and first part of clip2, blends them smoothly
 */
async function createSmoothJunction(
  clip1Path: string,
  clip2Path: string,
  outputPath: string,
  overlapDuration: number = 0.3  // seconds of overlap on each side
): Promise<void> {
  const junction1 = generateTempPath('mp4');
  const junction2 = generateTempPath('mp4');
  const junctionRaw = generateTempPath('mp4');

  try {
    // Get clip1 duration
    const clip1Info = await getVideoInfo(clip1Path);
    const clip1Start = Math.max(0, clip1Info.duration - overlapDuration);

    // Extract last part of clip1
    await execAsync(
      `ffmpeg -y -ss ${clip1Start} -i "${clip1Path}" -c copy "${junction1}"`,
      { timeout: 60000 }
    );

    // Extract first part of clip2
    await execAsync(
      `ffmpeg -y -t ${overlapDuration} -i "${clip2Path}" -c copy "${junction2}"`,
      { timeout: 60000 }
    );

    // Concatenate the two junction parts
    const junctionList = generateTempPath('txt');
    await writeFile(junctionList, `file '${junction1}'\nfile '${junction2}'`);
    await execAsync(
      `ffmpeg -y -f concat -safe 0 -i "${junctionList}" -c copy "${junctionRaw}"`,
      { timeout: 60000 }
    );

    // Apply motion interpolation to smooth the transition
    // minterpolate with motion compensation creates intermediate frames
    // This analyzes optical flow and generates smooth motion between the two clips
    const minterpolateCmd = `ffmpeg -y -i "${junctionRaw}" -vf "minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,fps=30" -c:v libx264 -preset fast -crf 18 -c:a copy "${outputPath}"`;

    console.log(`[FFmpeg] Creating smooth junction with motion interpolation...`);
    await execAsync(minterpolateCmd, { timeout: 120000 });

    await cleanup(junction1, junction2, junctionRaw, junctionList);
  } catch (error) {
    await cleanup(junction1, junction2, junctionRaw);
    throw error;
  }
}

/**
 * Concatenate multiple videos into one using FFmpeg
 *
 * With smoothTransition=true (default), creates seamless transitions between clips:
 * - Uses motion interpolation (optical flow) to generate intermediate frames
 * - Blends the last frames of clip N with first frames of clip N+1
 * - Creates true motion continuity, not just a crossfade
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
  } = options;

  const tempFiles: string[] = [];
  const processedFiles: string[] = [];
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

    // Step 2: Create smooth transitions (if enabled and multiple clips)
    if (smoothTransition && workingFiles.length > 1) {
      console.log(`[FFmpeg] Creating smooth transitions between ${workingFiles.length} clips...`);

      const overlapDuration = 0.25; // 250ms overlap for smooth blending
      const segments: string[] = [];

      for (let i = 0; i < workingFiles.length; i++) {
        const clipInfo = await getVideoInfo(workingFiles[i]);

        if (i === 0) {
          // First clip: trim the last overlapDuration
          const trimmedPath = generateTempPath('mp4');
          allTempFiles.push(trimmedPath);
          const trimEnd = Math.max(0, clipInfo.duration - overlapDuration);
          await execAsync(
            `ffmpeg -y -t ${trimEnd} -i "${workingFiles[i]}" -c copy "${trimmedPath}"`,
            { timeout: 60000 }
          );
          segments.push(trimmedPath);
        } else {
          // Create smooth junction between previous clip and this one
          const junctionPath = generateTempPath('mp4');
          allTempFiles.push(junctionPath);
          await createSmoothJunction(workingFiles[i - 1], workingFiles[i], junctionPath, overlapDuration);
          segments.push(junctionPath);

          if (i < workingFiles.length - 1) {
            // Middle clip: trim both ends
            const trimmedPath = generateTempPath('mp4');
            allTempFiles.push(trimmedPath);
            const trimStart = overlapDuration;
            const trimDuration = Math.max(0, clipInfo.duration - 2 * overlapDuration);
            await execAsync(
              `ffmpeg -y -ss ${trimStart} -t ${trimDuration} -i "${workingFiles[i]}" -c copy "${trimmedPath}"`,
              { timeout: 60000 }
            );
            segments.push(trimmedPath);
          } else {
            // Last clip: trim the first overlapDuration
            const trimmedPath = generateTempPath('mp4');
            allTempFiles.push(trimmedPath);
            await execAsync(
              `ffmpeg -y -ss ${overlapDuration} -i "${workingFiles[i]}" -c copy "${trimmedPath}"`,
              { timeout: 60000 }
            );
            segments.push(trimmedPath);
          }
        }
      }

      // Concatenate all segments
      const listPath = generateTempPath('txt');
      allTempFiles.push(listPath);
      await writeFile(listPath, segments.map(f => `file '${f}'`).join('\n'));

      await execAsync(
        `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy -movflags +faststart "${outputPath}"`,
        { timeout: 300000 }
      );
    } else {
      // Simple concatenation without smooth transitions
      const listPath = generateTempPath('txt');
      allTempFiles.push(listPath);
      await writeFile(listPath, workingFiles.map(f => `file '${f}'`).join('\n'));

      const codecOpt = colorMatch ? '-c copy' : '-c copy';
      await execAsync(
        `ffmpeg -y -f concat -safe 0 -i "${listPath}" ${codecOpt} -movflags +faststart "${outputPath}"`,
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
