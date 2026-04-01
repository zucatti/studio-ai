/**
 * FFmpeg utilities for video processing
 * Handles concat and merge operations locally
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
 * Handles b2:// URLs and expired signed URLs
 */
async function downloadToTemp(url: string, ext: string = 'mp4'): Promise<string> {
  let resolvedUrl = url;

  // Handle b2:// URLs
  if (url.startsWith('b2://')) {
    const parsed = parseStorageUrl(url);
    if (parsed) {
      resolvedUrl = await getSignedFileUrl(parsed.key, 3600);
    }
  } else if (url.includes('backblazeb2.com') || url.includes('s3.')) {
    // Looks like a signed URL (possibly expired) - extract key and re-sign
    try {
      const parsedUrl = new URL(url);
      let key = parsedUrl.pathname;

      // Remove leading slash
      if (key.startsWith('/')) {
        key = key.substring(1);
      }

      // If path starts with bucket name, remove it
      const bucket = STORAGE_BUCKET;
      if (key.startsWith(`${bucket}/`)) {
        key = key.substring(bucket.length + 1);
      }

      console.log('[FFmpeg] Re-signing expired URL, key:', key);
      resolvedUrl = await getSignedFileUrl(key, 3600);
    } catch (e) {
      console.error('[FFmpeg] Failed to re-sign URL:', e);
      // Keep original URL and hope for the best
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
  // Target resolution - if provided, ALL clips will be normalized to this exact resolution
  // This should be based on project aspect ratio, not derived from clips
  targetResolution?: { width: number; height: number };
}

// Standard resolutions for each aspect ratio
export const STANDARD_RESOLUTIONS: Record<string, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },  // Vertical (TikTok, Reels, Shorts)
  '16:9': { width: 1920, height: 1080 },  // Horizontal (YouTube, TV)
  '1:1': { width: 1080, height: 1080 },   // Square (Instagram)
  '4:5': { width: 1080, height: 1350 },   // Portrait (Instagram)
  '2:3': { width: 1080, height: 1620 },   // Portrait
  '21:9': { width: 2560, height: 1080 },  // Ultrawide
};

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
 * Get detailed video info using ffprobe (resolution, SAR, DAR)
 */
async function getVideoInfo(videoPath: string): Promise<{
  width: number;
  height: number;
  sar: string;
  dar: string;
}> {
  const { stdout } = await execAsync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,sample_aspect_ratio,display_aspect_ratio -of json "${videoPath}"`,
    { timeout: 30000 }
  );
  const data = JSON.parse(stdout);
  const stream = data.streams?.[0] || {};
  return {
    width: stream.width || 0,
    height: stream.height || 0,
    sar: stream.sample_aspect_ratio || '1:1',
    dar: stream.display_aspect_ratio || 'N/A',
  };
}

/**
 * Get video resolution using ffprobe
 */
async function getVideoResolution(videoPath: string): Promise<{ width: number; height: number }> {
  const info = await getVideoInfo(videoPath);
  return { width: info.width, height: info.height };
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

    // Download all videos and log their properties
    for (let i = 0; i < videoUrls.length; i++) {
      const tempPath = await downloadToTemp(videoUrls[i], 'mp4');
      tempFiles.push(tempPath);
      allTempFiles.push(tempPath);

      // Log detailed video info for debugging
      const videoInfo = await getVideoInfo(tempPath);
      console.log(`[FFmpeg] Video ${i + 1}/${videoUrls.length}: ${videoInfo.width}x${videoInfo.height}, SAR=${videoInfo.sar}, DAR=${videoInfo.dar}`);
    }

    // Determine target resolution
    // If targetResolution is provided (from project aspect ratio), use it
    // Otherwise fall back to first video's resolution
    let targetResolution: { width: number; height: number };
    if (options.targetResolution) {
      targetResolution = options.targetResolution;
      console.log(`[FFmpeg] Using project target resolution: ${targetResolution.width}x${targetResolution.height}`);
    } else {
      targetResolution = await getVideoResolution(tempFiles[0]);
      console.log(`[FFmpeg] Using first clip resolution as fallback: ${targetResolution.width}x${targetResolution.height}`);
    }
    const referenceResolution = targetResolution;

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

    // Subsequent clips: stretch correction + color matching + resolution normalization
    if (tempFiles.length > 1) {
      console.log(`[FFmpeg] Analyzing and correcting ${tempFiles.length} clips...`);

      for (let i = 1; i < tempFiles.length; i++) {
        const prevClip = normalizedFiles[i - 1]; // Use the normalized previous clip
        let currClip = tempFiles[i];

        // Extract frames for analysis
        const prevLastFrame = generateTempPath('png');
        const currFirstFrame = generateTempPath('png');
        allTempFiles.push(prevLastFrame, currFirstFrame);

        await extractFrame(prevClip, 'last', prevLastFrame);
        await extractFrame(currClip, 'first', currFirstFrame);

        // Note: Stretch correction removed - workflow now avoids OmniHuman concatenation
        // OmniHuman generates single long clips (15s+ based on audio)
        // For transitions, use OmniHuman → Kling (extract last frame, inject into Kling)
        // Multiple OmniHuman clips should be treated as cutaway shots (plan de coupe)
        //
        // TODO: Cleanup - detectStretchRatio() and correctVideoStretch() functions kept
        // in case stretch correction is needed for other models in the future.
        // Remove if unused after validating OmniHuman → Kling workflow works well.

        // Step 2: Analyze colors
        console.log(`[FFmpeg] Analyzing color difference between clip ${i} and ${i + 1}...`);
        const prevColors = await analyzeFrameColors(prevLastFrame);
        const currColors = await analyzeFrameColors(currFirstFrame);

        console.log(`[FFmpeg] Clip ${i} last frame: Y=${prevColors.yAvg.toFixed(1)}, range=${prevColors.yMin}-${prevColors.yMax}, sat=${prevColors.satAvg.toFixed(1)}`);
        console.log(`[FFmpeg] Clip ${i + 1} first frame: Y=${currColors.yAvg.toFixed(1)}, range=${currColors.yMin}-${currColors.yMax}, sat=${currColors.satAvg.toFixed(1)}`);

        // Calculate color correction (only if colorMatch is enabled)
        const correction = colorMatch
          ? calculateColorCorrection(currColors, prevColors)
          : { brightness: 0, contrast: 1, saturation: 1 };

        if (colorMatch) {
          console.log(`[FFmpeg] Color correction needed: brightness=${(correction.brightness * 100).toFixed(1)}%, contrast=${(correction.contrast * 100).toFixed(0)}%, saturation=${(correction.saturation * 100).toFixed(0)}%`);
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
    // Re-encode to ensure proper keyframe alignment and avoid transition glitches
    // -c copy can cause flickering/backward frames if GOP structures don't align
    await execAsync(
      `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k -movflags +faststart "${outputPath}"`,
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

    // Get duration from local output file before cleanup
    const duration = await getVideoDurationLocal(outputPath);
    console.log(`[FFmpeg] Output duration: ${duration}s`);

    return { outputUrl: url, signedUrl, duration };

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

/**
 * Get image resolution from a local file using ffprobe
 */
async function getLocalImageResolution(imagePath: string): Promise<{ width: number; height: number }> {
  const { stdout } = await execAsync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${imagePath}"`,
    { timeout: 30000 }
  );
  const [width, height] = stdout.trim().split(',').map(Number);
  return { width, height };
}

/**
 * Get image resolution using ffprobe
 */
export async function getImageResolution(imageUrl: string): Promise<{ width: number; height: number }> {
  await ensureTempDir();

  // Download image
  let resolvedUrl = imageUrl;
  if (imageUrl.startsWith('b2://')) {
    const parsed = parseStorageUrl(imageUrl);
    if (parsed) {
      resolvedUrl = await getSignedFileUrl(parsed.key, 3600);
    }
  }

  const response = await fetch(resolvedUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const ext = imageUrl.includes('.png') ? 'png' : imageUrl.includes('.webp') ? 'webp' : 'jpg';
  const tempPath = generateTempPath(ext);
  await writeFile(tempPath, buffer);

  try {
    return await getLocalImageResolution(tempPath);
  } finally {
    await cleanup(tempPath);
  }
}

export interface NormalizeVideoResult {
  outputUrl: string;      // b2:// URL
  signedUrl: string;      // Signed URL for playback
}

/**
 * Normalize video resolution to match input frame
 * This fixes resolution mismatches from AI video models
 */
export async function normalizeVideoToFrame(options: {
  videoUrl: string;
  frameUrl: string;        // First frame used to generate the video
  userId: string;
  projectId: string;
  shotId: string;
}): Promise<NormalizeVideoResult> {
  await ensureTempDir();

  const { videoUrl, frameUrl, userId, projectId, shotId } = options;

  // Get target resolution from the input frame
  const targetResolution = await getImageResolution(frameUrl);
  console.log(`[FFmpeg] Target resolution from frame: ${targetResolution.width}x${targetResolution.height}`);

  // Download video
  const videoPath = await downloadToTemp(videoUrl, 'mp4');
  const outputPath = generateTempPath('mp4');

  try {
    // Get current video resolution
    const currentResolution = await getVideoResolution(videoPath);
    console.log(`[FFmpeg] Current video resolution: ${currentResolution.width}x${currentResolution.height}`);

    // Check if normalization is needed
    const needsNormalization =
      currentResolution.width !== targetResolution.width ||
      currentResolution.height !== targetResolution.height;

    if (!needsNormalization) {
      console.log(`[FFmpeg] Video already at correct resolution, no normalization needed`);
      // Still apply setsar=1:1 to ensure consistent SAR
      await execAsync(
        `ffmpeg -y -i "${videoPath}" -vf "setsar=1:1" -c:v libx264 -preset fast -crf 18 -c:a copy -movflags +faststart "${outputPath}"`,
        { timeout: 180000 }
      );
    } else {
      console.log(`[FFmpeg] Normalizing video from ${currentResolution.width}x${currentResolution.height} to ${targetResolution.width}x${targetResolution.height}`);

      // Scale to exact target resolution with setsar=1:1
      await execAsync(
        `ffmpeg -y -i "${videoPath}" -vf "scale=${targetResolution.width}:${targetResolution.height}:flags=lanczos,setsar=1:1" -c:v libx264 -preset fast -crf 18 -c:a copy -movflags +faststart "${outputPath}"`,
        { timeout: 180000 }
      );
    }

    // Upload normalized video to B2
    const outputBuffer = await readFile(outputPath);
    console.log(`[FFmpeg] Normalized video size: ${outputBuffer.length} bytes`);

    const sanitizedUserId = userId.replace(/[|]/g, '_');
    const timestamp = Date.now();
    const storageKey = `videos/${sanitizedUserId}/${projectId}/${shotId}_normalized_${timestamp}.mp4`;

    const { url } = await uploadFile(storageKey, outputBuffer, 'video/mp4');
    console.log(`[FFmpeg] Uploaded normalized video to: ${url}`);

    const signedUrl = await getSignedFileUrl(storageKey, 3600);

    return { outputUrl: url, signedUrl };

  } finally {
    await cleanup(videoPath, outputPath);
  }
}

/**
 * Detect and correct geometric stretch in a video by comparing with reference frame
 * OmniHuman tends to stretch images due to internal square tensor processing
 * This function detects the stretch by comparing edge/structure and corrects it
 */
export async function correctVideoStretch(options: {
  videoUrl: string;
  referenceFrameUrl: string;  // The original input frame (before AI generation)
  userId: string;
  projectId: string;
  shotId: string;
}): Promise<{ outputUrl: string; signedUrl: string; correction: { scaleX: number; scaleY: number } }> {
  await ensureTempDir();

  const { videoUrl, referenceFrameUrl, userId, projectId, shotId } = options;

  // Download video and reference frame
  const videoPath = await downloadToTemp(videoUrl, 'mp4');
  const refFramePath = await downloadToTemp(referenceFrameUrl, 'png');
  const generatedFramePath = generateTempPath('png');
  const outputPath = generateTempPath('mp4');

  try {
    // Extract first frame from video
    await extractFrame(videoPath, 'first', generatedFramePath);

    // Get dimensions
    const refRes = await getImageResolution(refFramePath);
    const genRes = await getImageResolution(generatedFramePath);

    console.log(`[FFmpeg] Reference frame: ${refRes.width}x${refRes.height}`);
    console.log(`[FFmpeg] Generated frame: ${genRes.width}x${genRes.height}`);

    // Detect stretch by analyzing horizontal/vertical edge density
    // If image is stretched horizontally, vertical edges will be more spread out
    const stretchRatio = await detectStretchRatio(refFramePath, generatedFramePath);

    console.log(`[FFmpeg] Detected stretch ratio: scaleX=${stretchRatio.scaleX.toFixed(4)}, scaleY=${stretchRatio.scaleY.toFixed(4)}`);

    // Apply correction if significant stretch detected (> 0.5%)
    const needsCorrection = Math.abs(stretchRatio.scaleX - 1) > 0.005 || Math.abs(stretchRatio.scaleY - 1) > 0.005;

    if (needsCorrection) {
      // Calculate corrected dimensions
      const correctedWidth = Math.round(genRes.width * stretchRatio.scaleX);
      const correctedHeight = Math.round(genRes.height * stretchRatio.scaleY);

      // Ensure even dimensions
      const finalWidth = Math.floor(correctedWidth / 2) * 2;
      const finalHeight = Math.floor(correctedHeight / 2) * 2;

      console.log(`[FFmpeg] Applying stretch correction: ${genRes.width}x${genRes.height} -> ${finalWidth}x${finalHeight}`);

      // Scale to corrected size, then crop to original dimensions
      await execAsync(
        `ffmpeg -y -i "${videoPath}" -vf "scale=${finalWidth}:${finalHeight}:flags=lanczos,crop=${genRes.width}:${genRes.height},setsar=1:1" -c:v libx264 -preset fast -crf 18 -c:a copy -movflags +faststart "${outputPath}"`,
        { timeout: 180000 }
      );
    } else {
      console.log(`[FFmpeg] No significant stretch detected, keeping original`);
      // Just copy with setsar
      await execAsync(
        `ffmpeg -y -i "${videoPath}" -vf "setsar=1:1" -c:v libx264 -preset fast -crf 18 -c:a copy -movflags +faststart "${outputPath}"`,
        { timeout: 180000 }
      );
    }

    // Upload corrected video
    const outputBuffer = await readFile(outputPath);
    console.log(`[FFmpeg] Corrected video size: ${outputBuffer.length} bytes`);

    const sanitizedUserId = userId.replace(/[|]/g, '_');
    const timestamp = Date.now();
    const storageKey = `videos/${sanitizedUserId}/${projectId}/${shotId}_corrected_${timestamp}.mp4`;

    const { url } = await uploadFile(storageKey, outputBuffer, 'video/mp4');
    console.log(`[FFmpeg] Uploaded corrected video to: ${url}`);

    const signedUrl = await getSignedFileUrl(storageKey, 3600);

    return { outputUrl: url, signedUrl, correction: stretchRatio };

  } finally {
    await cleanup(videoPath, refFramePath, generatedFramePath, outputPath);
  }
}

/**
 * Overlay music onto a video with specific start/end points
 * Extracts a segment of the audio and mixes it with video
 */
export async function overlayMusicOnVideo(options: {
  videoUrl: string;
  audioUrl: string;
  audioStart: number;    // Start time in seconds in the audio file
  audioEnd: number;      // End time in seconds in the audio file
  userId: string;
  projectId: string;
  shotId: string;
  volume?: number;       // Audio volume multiplier (default: 1.0)
}): Promise<MergeAudioResult> {
  await ensureTempDir();

  const { videoUrl, audioUrl, audioStart, audioEnd, userId, projectId, shotId, volume = 1.0 } = options;
  const audioDuration = audioEnd - audioStart;

  console.log(`[FFmpeg] Overlaying music: ${audioStart}s-${audioEnd}s (${audioDuration}s) onto video`);

  const videoPath = await downloadToTemp(videoUrl, 'mp4');
  const audioPath = await downloadToTemp(audioUrl, 'mp3');
  const outputPath = generateTempPath('mp4');

  try {
    // Get video duration to ensure we don't exceed it
    const videoDuration = await getVideoDurationLocal(videoPath);
    console.log(`[FFmpeg] Video duration: ${videoDuration}s, Audio segment: ${audioDuration}s`);

    // FFmpeg command:
    // -ss audioStart: seek to start position in audio
    // -t audioDuration: read only the specified duration
    // -filter_complex: mix audio with video's existing audio (if any) or just add it
    // volume=X: adjust audio volume
    // amix: mix audio streams, or use the music as the only audio
    const cmd = `ffmpeg -y -i "${videoPath}" -ss ${audioStart} -t ${audioDuration} -i "${audioPath}" -filter_complex "[1:a]volume=${volume}[music];[music]apad[padded];[padded]atrim=0:${videoDuration}[trimmed]" -map 0:v:0 -map "[trimmed]" -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "${outputPath}"`;

    console.log(`[FFmpeg] Running music overlay...`);
    await execAsync(cmd, { timeout: 180000 }); // 3 min timeout

    // Read output and upload to B2
    const outputBuffer = await readFile(outputPath);
    console.log(`[FFmpeg] Output size: ${outputBuffer.length} bytes`);

    const sanitizedUserId = userId.replace(/[|]/g, '_');
    const timestamp = Date.now();
    const storageKey = `videos/${sanitizedUserId}/${projectId}/${shotId}_with_music_${timestamp}.mp4`;

    const { url } = await uploadFile(storageKey, outputBuffer, 'video/mp4');
    console.log(`[FFmpeg] Uploaded to: ${url}`);

    const signedUrl = await getSignedFileUrl(storageKey, 3600);

    return { outputUrl: url, signedUrl };

  } finally {
    await cleanup(videoPath, audioPath, outputPath);
  }
}

/**
 * Detect stretch ratio between reference and generated frames
 * Uses edge detection and correlation to find the optimal scale
 */
// ============================================================================
// Section Assembly with Transitions
// ============================================================================

export interface ShotWithTransition {
  id: string;
  videoUrl: string;
  duration: number;
  transitionType: 'cut' | 'fadeblack' | 'fadewhite' | 'dissolve';
  transitionDuration: number;
}

export interface AssembleSectionOptions {
  shots: ShotWithTransition[];
  audioUrl?: string;
  audioStart?: number;  // Start time in the audio file
  audioEnd?: number;    // End time in the audio file
  userId: string;
  projectId: string;
  sectionId: string;
  audioVolume?: number;
}

export interface AssembleSectionResult {
  outputUrl: string;
  signedUrl: string;
  duration: number;
}

/**
 * Map our transition types to FFmpeg xfade transition names
 */
function getXfadeTransition(type: ShotWithTransition['transitionType']): string {
  switch (type) {
    case 'fadeblack':
      return 'fadeblack';
    case 'fadewhite':
      return 'fadewhite';
    case 'dissolve':
      return 'fade';  // xfade uses 'fade' for dissolve
    case 'cut':
    default:
      return '';  // No transition needed
  }
}

/**
 * Assemble a section with shots, transitions, and optional music overlay
 *
 * Uses FFmpeg xfade filter for smooth transitions between clips:
 * - fadeblack: fades to black then to next clip
 * - fadewhite: fades to white then to next clip
 * - fade (dissolve): cross-dissolve between clips
 */
export async function assembleSectionWithTransitions(
  options: AssembleSectionOptions
): Promise<AssembleSectionResult> {
  await ensureTempDir();

  const {
    shots,
    audioUrl,
    audioStart = 0,
    audioEnd,
    userId,
    projectId,
    sectionId,
    audioVolume = 0.8,
  } = options;

  if (shots.length === 0) {
    throw new Error('No shots to assemble');
  }

  const allTempFiles: string[] = [];

  try {
    console.log(`[FFmpeg] Assembling section with ${shots.length} shots...`);

    // Download all video files
    const videoFiles: string[] = [];
    for (let i = 0; i < shots.length; i++) {
      console.log(`[FFmpeg] Downloading shot ${i + 1}/${shots.length}...`);
      const tempPath = await downloadToTemp(shots[i].videoUrl, 'mp4');
      videoFiles.push(tempPath);
      allTempFiles.push(tempPath);
    }

    // Get reference resolution from first video
    const refResolution = await getVideoResolution(videoFiles[0]);
    console.log(`[FFmpeg] Reference resolution: ${refResolution.width}x${refResolution.height}`);

    // Normalize all videos to same resolution
    const normalizedFiles: string[] = [];
    for (let i = 0; i < videoFiles.length; i++) {
      const normalizedPath = generateTempPath('mp4');
      allTempFiles.push(normalizedPath);

      await execAsync(
        `ffmpeg -y -i "${videoFiles[i]}" -vf "scale=${refResolution.width}:${refResolution.height}:flags=lanczos,setsar=1:1,fps=30" -c:v libx264 -preset fast -crf 18 -an "${normalizedPath}"`,
        { timeout: 180000 }
      );
      normalizedFiles.push(normalizedPath);
    }

    let assembledVideoPath: string;

    if (shots.length === 1) {
      // Single shot - no transitions needed
      assembledVideoPath = normalizedFiles[0];
    } else {
      // Multiple shots - build xfade filter chain
      assembledVideoPath = generateTempPath('mp4');
      allTempFiles.push(assembledVideoPath);

      // Get actual durations from files
      const durations: number[] = [];
      for (const file of normalizedFiles) {
        const dur = await getVideoDurationLocal(file);
        durations.push(dur);
        console.log(`[FFmpeg] Shot duration: ${dur.toFixed(3)}s`);
      }

      // Check if any transitions are non-cut
      const hasTransitions = shots.slice(0, -1).some(
        s => s.transitionType !== 'cut' && s.transitionDuration > 0
      );

      if (!hasTransitions) {
        // All cuts - use simple concat (faster)
        console.log(`[FFmpeg] All cuts - using simple concat`);
        const listPath = generateTempPath('txt');
        allTempFiles.push(listPath);
        await writeFile(listPath, normalizedFiles.map(f => `file '${f}'`).join('\n'));

        await execAsync(
          `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:v libx264 -preset fast -crf 18 -movflags +faststart "${assembledVideoPath}"`,
          { timeout: 300000 }
        );
      } else {
        // Has transitions - build xfade filter chain
        const inputArgs = normalizedFiles.map((f) => `-i "${f}"`).join(' ');

        // Build filter graph
        // xfade offset = time in OUTPUT stream when transition starts
        // Each xfade reduces total duration by transitionDuration
        let filterParts: string[] = [];
        let currentOffset = 0;

        for (let i = 0; i < shots.length - 1; i++) {
          const shot = shots[i];
          const transitionType = getXfadeTransition(shot.transitionType);
          const transitionDur = (shot.transitionType === 'cut' || !transitionType) ? 0 : Math.min(shot.transitionDuration, durations[i] * 0.5, durations[i + 1] * 0.5);

          const inputA = i === 0 ? '[0:v]' : `[v${i - 1}]`;
          const inputB = `[${i + 1}:v]`;
          const output = i === shots.length - 2 ? '[vout]' : `[v${i}]`;

          if (transitionType && transitionDur > 0) {
            // xfade transition
            // offset = cumulative duration up to this point - overlap from previous transitions
            const offset = currentOffset + durations[i] - transitionDur;

            filterParts.push(
              `${inputA}${inputB}xfade=transition=${transitionType}:duration=${transitionDur.toFixed(3)}:offset=${offset.toFixed(3)}${output}`
            );

            console.log(`[FFmpeg] Transition ${i}: ${shot.transitionType} @ offset=${offset.toFixed(3)}s, duration=${transitionDur.toFixed(3)}s`);

            // Update offset: after xfade, total time is reduced by transitionDur
            currentOffset = offset;
          } else {
            // Cut - use xfade with wipeleft at 0 duration (instant cut)
            const offset = currentOffset + durations[i];

            filterParts.push(
              `${inputA}${inputB}xfade=transition=fade:duration=0.001:offset=${offset.toFixed(3)}${output}`
            );

            console.log(`[FFmpeg] Cut ${i}: @ offset=${offset.toFixed(3)}s`);
            currentOffset = offset;
          }
        }

        const filterComplex = filterParts.join(';');
        console.log(`[FFmpeg] Filter complex:\n${filterComplex}`);

        const ffmpegCmd = `ffmpeg -y ${inputArgs} -filter_complex "${filterComplex}" -map "[vout]" -c:v libx264 -preset fast -crf 18 -movflags +faststart "${assembledVideoPath}"`;

        console.log(`[FFmpeg] Running assembly with transitions...`);
        await execAsync(ffmpegCmd, { timeout: 300000 });
      }
    }

    // Get assembled video duration
    let finalDuration = await getVideoDurationLocal(assembledVideoPath);
    console.log(`[FFmpeg] Assembled video duration: ${finalDuration}s`);

    // Overlay music if provided
    let finalVideoPath = assembledVideoPath;
    if (audioUrl) {
      console.log(`[FFmpeg] Adding music overlay...`);
      const audioPath = await downloadToTemp(audioUrl, 'mp3');
      allTempFiles.push(audioPath);

      finalVideoPath = generateTempPath('mp4');
      allTempFiles.push(finalVideoPath);

      const audioDuration = (audioEnd || finalDuration) - audioStart;

      // Mix music with video
      const audioCmd = `ffmpeg -y -i "${assembledVideoPath}" -ss ${audioStart} -t ${audioDuration} -i "${audioPath}" -filter_complex "[1:a]volume=${audioVolume}[music];[music]apad[padded];[padded]atrim=0:${finalDuration}[trimmed]" -map 0:v:0 -map "[trimmed]" -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "${finalVideoPath}"`;

      await execAsync(audioCmd, { timeout: 180000 });
      finalDuration = await getVideoDurationLocal(finalVideoPath);
    }

    // Upload to B2
    const outputBuffer = await readFile(finalVideoPath);
    console.log(`[FFmpeg] Final video size: ${outputBuffer.length} bytes`);

    const sanitizedUserId = userId.replace(/[|]/g, '_');
    const timestamp = Date.now();
    const storageKey = `shorts/${sanitizedUserId}/${projectId}/section_${sectionId}_${timestamp}.mp4`;

    const { url } = await uploadFile(storageKey, outputBuffer, 'video/mp4');
    console.log(`[FFmpeg] Uploaded to: ${url}`);

    const signedUrl = await getSignedFileUrl(storageKey, 3600);

    return {
      outputUrl: url,
      signedUrl,
      duration: finalDuration,
    };
  } finally {
    // Cleanup all temp files
    for (const file of allTempFiles) {
      await cleanup(file);
    }
  }
}

/**
 * Detect stretch ratio between reference and generated frames
 * Uses edge detection and correlation to find the optimal scale
 */
async function detectStretchRatio(
  refFramePath: string,
  genFramePath: string
): Promise<{ scaleX: number; scaleY: number }> {
  try {
    // Use FFmpeg to compute SSIM at different scales and find optimal match
    // Test wider range with finer granularity for better detection

    const scaleFactors = [0.94, 0.95, 0.96, 0.97, 0.98, 0.99, 1.00, 1.01, 1.02, 1.03, 1.04, 1.05, 1.06];
    let bestScaleX = 1.0;
    let bestScaleY = 1.0;
    let bestScore = -1;

    // Get reference dimensions (local file, not URL)
    const refRes = await getLocalImageResolution(refFramePath);

    console.log(`[FFmpeg] Testing ${scaleFactors.length} scale factors for stretch detection...`);
    const scores: Array<{ scale: number; score: number }> = [];

    // Get both frame dimensions
    const genRes = await getLocalImageResolution(genFramePath);
    console.log(`[FFmpeg] Reference frame: ${refRes.width}x${refRes.height}, Generated frame: ${genRes.width}x${genRes.height}`);

    // First, scale both frames to same base size for fair comparison
    // Use the generated frame's dimensions as base since that's what we're testing
    const baseRefPath = generateTempPath('png');
    await execAsync(
      `ffmpeg -y -i "${refFramePath}" -vf "scale=${genRes.width}:${genRes.height}:flags=lanczos" "${baseRefPath}"`,
      { timeout: 30000 }
    );

    for (const scaleX of scaleFactors) {
      // Test horizontal stretch correction
      // Scale the generated frame horizontally to simulate correction
      const scaledWidth = Math.round(genRes.width * scaleX);
      const scaledPath = generateTempPath('png');

      try {
        // Scale generated frame horizontally, then crop/pad to match base dimensions
        // crop takes center portion if scaled is larger, pad adds black if smaller
        if (scaledWidth >= genRes.width) {
          // Scaled is wider - crop center
          await execAsync(
            `ffmpeg -y -i "${genFramePath}" -vf "scale=${scaledWidth}:${genRes.height}:flags=lanczos,crop=${genRes.width}:${genRes.height}" "${scaledPath}"`,
            { timeout: 30000 }
          );
        } else {
          // Scaled is narrower - pad with black
          const padX = Math.floor((genRes.width - scaledWidth) / 2);
          await execAsync(
            `ffmpeg -y -i "${genFramePath}" -vf "scale=${scaledWidth}:${genRes.height}:flags=lanczos,pad=${genRes.width}:${genRes.height}:${padX}:0:black" "${scaledPath}"`,
            { timeout: 30000 }
          );
        }

        // Compute SSIM between scaled reference and scaled generated frame
        const { stdout, stderr } = await execAsync(
          `ffmpeg -i "${baseRefPath}" -i "${scaledPath}" -lavfi "ssim" -f null - 2>&1`,
          { timeout: 30000 }
        );

        // Parse SSIM score from output
        const output = stdout + stderr;
        const match = output.match(/All:([\d.]+)/);
        if (match) {
          const score = parseFloat(match[1]);
          scores.push({ scale: scaleX, score });
          if (score > bestScore) {
            bestScore = score;
            bestScaleX = scaleX;
          }
        }
      } catch (e) {
        // Ignore errors in individual tests
        console.log(`[FFmpeg] SSIM test failed for scale ${scaleX}:`, e instanceof Error ? e.message : e);
      } finally {
        await cleanup(scaledPath);
      }
    }

    // Cleanup base reference
    await cleanup(baseRefPath);

    // Log all scores for debugging
    if (scores.length > 0) {
      console.log(`[FFmpeg] SSIM scores by scale factor:`);
      scores.forEach(({ scale, score }) => {
        const marker = scale === bestScaleX ? ' <-- BEST' : '';
        console.log(`[FFmpeg]   scale=${scale.toFixed(2)}: SSIM=${score.toFixed(6)}${marker}`);
      });
    }

    // For now, assume vertical stretch is proportional or minimal
    bestScaleY = 1.0;

    console.log(`[FFmpeg] Best stretch match: scaleX=${bestScaleX} (SSIM=${bestScore.toFixed(6)})`);

    return { scaleX: bestScaleX, scaleY: bestScaleY };

  } catch (error) {
    console.error('[FFmpeg] Stretch detection error:', error);
    // Default to no correction
    return { scaleX: 1.0, scaleY: 1.0 };
  }
}
