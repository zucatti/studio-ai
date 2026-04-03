/**
 * Color Matching utilities for FFmpeg processing
 * Extracted from src/lib/ffmpeg.ts for worker usage
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ColorStats {
  yAvg: number;
  yMin: number;
  yMax: number;
  satAvg: number;
}

interface ColorCorrection {
  brightness: number;
  contrast: number;
  saturation: number;
}

/**
 * Analyze frame color statistics (brightness, contrast)
 */
export async function analyzeFrameColors(framePath: string): Promise<ColorStats> {
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
    console.error('[ColorMatching] Frame analysis error:', error);
    return { yAvg: 128, yMin: 16, yMax: 235, satAvg: 100 };
  }
}

/**
 * Calculate color correction needed to match source frame to target frame
 */
export function calculateColorCorrection(source: ColorStats, target: ColorStats): ColorCorrection {
  // Brightness: difference in average luminance, normalized to -1..1 range
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
 * Extract a frame from video (first or last)
 */
export async function extractFrame(
  videoPath: string,
  position: 'first' | 'last',
  outputPath: string
): Promise<void> {
  if (position === 'first') {
    await execAsync(
      `ffmpeg -y -i "${videoPath}" -vframes 1 -q:v 2 "${outputPath}"`,
      { timeout: 30000 }
    );
  } else {
    // Get duration first
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { timeout: 15000 }
    );
    const duration = parseFloat(stdout.trim()) || 5;
    const seekTime = Math.max(0, duration - 0.1);

    await execAsync(
      `ffmpeg -y -ss ${seekTime} -i "${videoPath}" -vframes 1 -q:v 2 "${outputPath}"`,
      { timeout: 30000 }
    );
  }
}

/**
 * Build FFmpeg filter string for color correction
 */
export function buildColorCorrectionFilter(correction: ColorCorrection): string | null {
  const { brightness, contrast, saturation } = correction;

  const needsCorrection =
    Math.abs(brightness) > 0.01 ||
    Math.abs(contrast - 1) > 0.02 ||
    Math.abs(saturation - 1) > 0.02;

  if (!needsCorrection) {
    return null;
  }

  return `eq=brightness=${brightness.toFixed(4)}:contrast=${contrast.toFixed(4)}:saturation=${saturation.toFixed(4)}`;
}

/**
 * Get video resolution
 */
export async function getVideoResolution(videoPath: string): Promise<{ width: number; height: number }> {
  const { stdout } = await execAsync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of json "${videoPath}"`,
    { timeout: 15000 }
  );

  const data = JSON.parse(stdout);
  const stream = data.streams?.[0];

  return {
    width: stream?.width || 1920,
    height: stream?.height || 1080,
  };
}
