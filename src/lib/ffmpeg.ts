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
  // Color matching - matches each clip to the previous one for continuity
  colorMatch?: boolean;           // Enable color matching between clips (default: true)
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
 * Get video resolution using ffprobe
 */
async function getVideoResolution(videoPath: string): Promise<{ width: number; height: number }> {
  const { stdout } = await execAsync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${videoPath}"`,
    { timeout: 30000 }
  );
  const [width, height] = stdout.trim().split(',').map(Number);
  return { width, height };
}

/**
 * Extract a frame from a video at a specific position
 */
async function extractFrame(videoPath: string, position: 'first' | 'last', outputPath: string): Promise<void> {
  if (position === 'first') {
    await execAsync(
      `ffmpeg -y -i "${videoPath}" -vf "select=eq(n\\,0)" -vframes 1 "${outputPath}"`,
      { timeout: 30000 }
    );
  } else {
    // Get duration and extract frame near the end
    const duration = await getVideoDurationLocal(videoPath);
    const seekTime = Math.max(0, duration - 0.1);
    await execAsync(
      `ffmpeg -y -ss ${seekTime} -i "${videoPath}" -vframes 1 "${outputPath}"`,
      { timeout: 30000 }
    );
  }
}

/**
 * Analyze frame color statistics (brightness, contrast)
 * Returns average Y (luminance), min Y, max Y
 */
async function analyzeFrameColors(framePath: string): Promise<{
  yAvg: number;
  yMin: number;
  yMax: number;
  satAvg: number;
}> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -f lavfi -i "movie='${framePath.replace(/'/g, "\\'")}',signalstats" -show_entries frame_tags=lavfi.signalstats.YAVG,lavfi.signalstats.YMIN,lavfi.signalstats.YMAX,lavfi.signalstats.SATAVG -of json`,
      { timeout: 30000 }
    );

    const data = JSON.parse(stdout);
    const tags = data.frames?.[0]?.tags || {};

    return {
      yAvg: parseFloat(tags['lavfi.signalstats.YAVG'] || '128'),
      yMin: parseFloat(tags['lavfi.signalstats.YMIN'] || '16'),
      yMax: parseFloat(tags['lavfi.signalstats.YMAX'] || '235'),
      satAvg: parseFloat(tags['lavfi.signalstats.SATAVG'] || '100'),
    };
  } catch (error) {
    console.error('[FFmpeg] Frame analysis error:', error);
    return { yAvg: 128, yMin: 16, yMax: 235, satAvg: 100 };
  }
}

/**
 * Calculate color correction needed to match source frame to target frame
 */
function calculateColorCorrection(source: { yAvg: number; yMin: number; yMax: number; satAvg: number },
                                   target: { yAvg: number; yMin: number; yMax: number; satAvg: number }): {
  brightness: number;
  contrast: number;
  saturation: number;
} {
  // Brightness: difference in average luminance, normalized to -1..1 range
  // FFmpeg eq brightness is in range -1 to 1
  const brightnessDiff = (target.yAvg - source.yAvg) / 255;
  const brightness = Math.max(-0.3, Math.min(0.3, brightnessDiff));

  // Contrast: ratio of luminance ranges
  const sourceRange = Math.max(1, source.yMax - source.yMin);
  const targetRange = Math.max(1, target.yMax - target.yMin);
  const contrastRatio = targetRange / sourceRange;
  const contrast = Math.max(0.7, Math.min(1.3, contrastRatio));

  // Saturation: ratio of average saturation
  const satRatio = source.satAvg > 0 ? target.satAvg / source.satAvg : 1;
  const saturation = Math.max(0.7, Math.min(1.3, satRatio));

  return { brightness, contrast, saturation };
}

/**
 * Apply color correction and resolution normalization to a video
 * Always re-encodes to ensure consistent output
 */
async function applyColorCorrectionAndNormalize(
  inputPath: string,
  outputPath: string,
  correction: { brightness: number; contrast: number; saturation: number },
  targetResolution: { width: number; height: number }
): Promise<void> {
  const { brightness, contrast, saturation } = correction;
  const { width, height } = targetResolution;

  // Build filter chain
  const filters: string[] = [];

  // Always scale to target resolution with setsar=1:1 to ensure pixel-perfect match
  filters.push(`scale=${width}:${height}:flags=lanczos,setsar=1:1`);

  // Add color correction if needed
  const needsColorCorrection =
    Math.abs(brightness) > 0.01 ||
    Math.abs(contrast - 1) > 0.02 ||
    Math.abs(saturation - 1) > 0.02;

  if (needsColorCorrection) {
    filters.push(`eq=brightness=${brightness.toFixed(4)}:contrast=${contrast.toFixed(4)}:saturation=${saturation.toFixed(4)}`);
    console.log(`[FFmpeg] Applying color correction: brightness=${brightness.toFixed(3)}, contrast=${contrast.toFixed(3)}, saturation=${saturation.toFixed(3)}`);
  }

  console.log(`[FFmpeg] Normalizing to ${width}x${height} with SAR 1:1`);

  const filterChain = filters.join(',');

  await execAsync(
    `ffmpeg -y -i "${inputPath}" -vf "${filterChain}" -c:v libx264 -preset fast -crf 18 -c:a copy "${outputPath}"`,
    { timeout: 180000 }
  );
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
    colorMatch = true,  // Enable by default for consistent look
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

    // Get reference resolution from first video
    const referenceResolution = await getVideoResolution(tempFiles[0]);
    console.log(`[FFmpeg] Reference resolution: ${referenceResolution.width}x${referenceResolution.height}`);

    // Step 1: Normalize all clips to reference resolution + color matching
    const normalizedFiles: string[] = [];

    // First clip: normalize resolution only (no color correction needed)
    const firstNormalized = generateTempPath('mp4');
    allTempFiles.push(firstNormalized);
    await applyColorCorrectionAndNormalize(
      tempFiles[0],
      firstNormalized,
      { brightness: 0, contrast: 1, saturation: 1 }, // No color correction
      referenceResolution
    );
    normalizedFiles.push(firstNormalized);
    console.log(`[FFmpeg] Normalized clip 1/${tempFiles.length}`);

    // Subsequent clips: color matching + resolution normalization
    if (tempFiles.length > 1) {
      console.log(`[FFmpeg] Matching colors between ${tempFiles.length} clips...`);

      for (let i = 1; i < tempFiles.length; i++) {
        const prevClip = normalizedFiles[i - 1]; // Use the normalized previous clip
        const currClip = tempFiles[i];

        // Extract frames for analysis
        const prevLastFrame = generateTempPath('png');
        const currFirstFrame = generateTempPath('png');
        allTempFiles.push(prevLastFrame, currFirstFrame);

        await extractFrame(prevClip, 'last', prevLastFrame);
        await extractFrame(currClip, 'first', currFirstFrame);

        // Analyze colors
        console.log(`[FFmpeg] Analyzing color difference between clip ${i} and ${i + 1}...`);
        const prevColors = await analyzeFrameColors(prevLastFrame);
        const currColors = await analyzeFrameColors(currFirstFrame);

        console.log(`[FFmpeg] Clip ${i} last frame: Y=${prevColors.yAvg.toFixed(1)}, range=${prevColors.yMin}-${prevColors.yMax}, sat=${prevColors.satAvg.toFixed(1)}`);
        console.log(`[FFmpeg] Clip ${i + 1} first frame: Y=${currColors.yAvg.toFixed(1)}, range=${currColors.yMin}-${currColors.yMax}, sat=${currColors.satAvg.toFixed(1)}`);

        // Calculate correction (only if colorMatch is enabled)
        const correction = colorMatch
          ? calculateColorCorrection(currColors, prevColors)
          : { brightness: 0, contrast: 1, saturation: 1 };

        if (colorMatch) {
          console.log(`[FFmpeg] Correction needed: brightness=${(correction.brightness * 100).toFixed(1)}%, contrast=${(correction.contrast * 100).toFixed(0)}%, saturation=${(correction.saturation * 100).toFixed(0)}%`);
        }

        const normalizedPath = generateTempPath('mp4');
        allTempFiles.push(normalizedPath);

        await applyColorCorrectionAndNormalize(currClip, normalizedPath, correction, referenceResolution);
        normalizedFiles.push(normalizedPath);

        console.log(`[FFmpeg] Normalized clip ${i + 1}/${tempFiles.length}`);
      }
    }

    const workingFiles = normalizedFiles;

    // Step 2: Simple concatenation (hard cut, no crossfade)
    // Color matching already ensures visual continuity
    const listPath = generateTempPath('txt');
    allTempFiles.push(listPath);
    await writeFile(listPath, workingFiles.map(f => `file '${f}'`).join('\n'));

    console.log(`[FFmpeg] Concatenating ${workingFiles.length} clips...`);
    await execAsync(
      `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy -movflags +faststart "${outputPath}"`,
      { timeout: 300000 }
    );

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
