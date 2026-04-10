/**
 * FFmpeg Processing
 * Handles video assembly and music overlay jobs
 */

import type { Job } from 'bullmq';
import { spawn } from 'child_process';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { getSupabase } from '../supabase.js';
import { uploadFile, getPublicUrl, downloadFile, extractStorageKey, getSignedFileUrl } from '../storage.js';
import { startJob, updateJobProgress, completeJob, failJob } from '../utils/job-status.js';

// Job data type
export interface FFmpegJobData {
  type: 'ffmpeg';
  userId: string;
  jobId: string;
  createdAt: string;
  operation: 'assemble' | 'assemble-sequence' | 'music-overlay' | 'extract-frame' | 'montage-render';
  projectId: string;
  // For assembly
  shortId?: string;
  shotIds?: string[];
  // For sequence assembly
  sequenceId?: string;
  planHash?: string;
  // For music overlay
  shotId?: string;
  videoUrl?: string;
  audioUrl?: string;
  audioStart?: number;
  audioEnd?: number;
  volume?: number;
  // For montage render
  montageData?: {
    aspectRatio: string;
    duration: number;
    tracks: Array<{
      id: string;
      type: 'video' | 'audio' | 'text' | 'transition';
      name: string;
      muted: boolean;
    }>;
    clips: Array<{
      id: string;
      type: 'video' | 'image' | 'audio' | 'text' | 'transition';
      trackId: string;
      start: number;
      duration: number;
      sourceStart?: number;
      sourceEnd?: number;
      assetUrl: string;
      name: string;
      transitionType?: string; // For transition clips
    }>;
  };
}

/**
 * Process an FFmpeg job
 */
export async function processFFmpegJob(job: Job<FFmpegJobData>): Promise<void> {
  const { data } = job;
  const { jobId, operation } = data;

  console.log(`[FFmpeg] Processing job ${jobId}, operation: ${operation}`);

  try {
    switch (operation) {
      case 'assemble':
        await processAssembly(data);
        break;
      case 'assemble-sequence':
        await processSequenceAssembly(data);
        break;
      case 'music-overlay':
        await processMusicOverlay(data);
        break;
      case 'montage-render':
        await processMontageRender(data);
        break;
      default:
        throw new Error(`Unknown FFmpeg operation: ${operation}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[FFmpeg] Job ${jobId} failed:`, errorMessage);
    await failJob(jobId, errorMessage);
    throw error;
  }
}

/**
 * Assemble multiple shots into a single video (short)
 */
async function processAssembly(data: FFmpegJobData): Promise<void> {
  const { jobId, userId, projectId, shortId, shotIds } = data;

  if (!shortId || !shotIds || shotIds.length === 0) {
    throw new Error('Missing shortId or shotIds for assembly');
  }

  const supabase = getSupabase();
  await startJob(jobId, 'Préparation de l\'assemblage...');

  // Get shot video URLs
  await updateJobProgress(jobId, 10, 'Récupération des vidéos...');

  const { data: shots, error: shotsError } = await supabase
    .from('shots')
    .select('id, generated_video_url, sort_order')
    .in('id', shotIds)
    .order('sort_order');

  if (shotsError || !shots) {
    throw new Error(`Failed to get shots: ${shotsError?.message}`);
  }

  // Filter shots with videos and get public URLs
  const videoUrls: string[] = [];
  for (const shot of shots) {
    if (shot.generated_video_url) {
      const publicUrl = await getPublicUrl(shot.generated_video_url);
      videoUrls.push(publicUrl);
    }
  }

  if (videoUrls.length === 0) {
    throw new Error('No videos to assemble');
  }

  await updateJobProgress(jobId, 30, `Assemblage de ${videoUrls.length} vidéos...`);

  // Create temp directory
  const tempDir = join(tmpdir(), `ffmpeg-${jobId}`);
  await mkdir(tempDir, { recursive: true });

  const tempFiles: string[] = [];
  const outputPath = join(tempDir, 'output.mp4');

  try {
    // Download all videos
    for (let i = 0; i < videoUrls.length; i++) {
      await updateJobProgress(jobId, 30 + (i / videoUrls.length) * 20, `Téléchargement vidéo ${i + 1}/${videoUrls.length}...`);

      const response = await fetch(videoUrls[i]);
      if (!response.ok) {
        throw new Error(`Failed to download video ${i + 1}: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      const tempPath = join(tempDir, `input_${i}.mp4`);
      await writeFile(tempPath, Buffer.from(buffer));
      tempFiles.push(tempPath);
    }

    // Create concat file
    const concatPath = join(tempDir, 'concat.txt');
    const concatContent = tempFiles.map((f) => `file '${f}'`).join('\n');
    await writeFile(concatPath, concatContent);
    tempFiles.push(concatPath);

    // Get total duration for progress calculation
    let totalDuration = 0;
    for (const file of tempFiles.filter(f => f.endsWith('.mp4'))) {
      totalDuration += await getVideoDuration(file);
    }
    console.log(`[FFmpeg] Total input duration: ${totalDuration.toFixed(2)}s`);

    // Run FFmpeg concat with progress
    await updateJobProgress(jobId, 55, `Fusion de ${tempFiles.filter(f => f.endsWith('.mp4')).length} vidéos (${totalDuration.toFixed(1)}s)...`);

    await runFFmpeg([
      '-f', 'concat',
      '-safe', '0',
      '-i', concatPath,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ], {
      jobId,
      baseProgress: 55,
      progressRange: 30,
      totalDuration,
      onProgress: (progress, message) => updateJobProgress(jobId, progress, message),
    });

    tempFiles.push(outputPath);

    // Upload result
    await updateJobProgress(jobId, 85, 'Sauvegarde du résultat...');

    const { readFile } = await import('fs/promises');
    const outputBuffer = await readFile(outputPath);
    const storageKey = `scenes/${userId.replace(/[|]/g, '_')}/${projectId}/${shortId}_assembled_${Date.now()}.mp4`;
    const b2Url = await uploadFile(storageKey, outputBuffer, 'video/mp4');

    // Update scene (short) in database
    await supabase
      .from('scenes')
      .update({
        assembled_video_url: b2Url,
      })
      .eq('id', shortId);

    await completeJob(jobId, {
      outputUrl: b2Url,
      shotCount: videoUrls.length,
    });

    console.log(`[FFmpeg] Assembly job ${jobId} completed`);

  } finally {
    // Cleanup temp files
    for (const file of tempFiles) {
      try {
        await unlink(file);
      } catch {
        // Ignore cleanup errors
      }
    }
    try {
      const { rmdir } = await import('fs/promises');
      await rmdir(tempDir);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Assemble plans within a sequence (simple concatenation, no color correction)
 *
 * NOTE: Color correction has been disabled because the AI models now generate
 * consistent colorimetry via prompts. The previous color matching was causing
 * more harm than good with visible color shifts between clips.
 */
async function processSequenceAssembly(data: FFmpegJobData): Promise<void> {
  const { jobId, userId, projectId, sequenceId, shotIds, planHash } = data;

  if (!sequenceId || !shotIds || shotIds.length === 0) {
    throw new Error('Missing sequenceId or shotIds for sequence assembly');
  }

  const supabase = getSupabase();
  await startJob(jobId, 'Préparation de l\'assemblage...');

  // Get shot video URLs
  await updateJobProgress(jobId, 10, 'Récupération des vidéos...');

  const { data: shots, error: shotsError } = await supabase
    .from('shots')
    .select('id, generated_video_url, sort_order')
    .in('id', shotIds)
    .order('sort_order');

  if (shotsError || !shots) {
    throw new Error(`Failed to get shots: ${shotsError?.message}`);
  }

  // Filter shots with videos and get public URLs
  const videoUrls: string[] = [];
  for (const shot of shots) {
    if (shot.generated_video_url) {
      const publicUrl = await getPublicUrl(shot.generated_video_url);
      videoUrls.push(publicUrl);
    }
  }

  if (videoUrls.length === 0) {
    throw new Error('No videos to assemble');
  }

  await updateJobProgress(jobId, 20, `Assemblage de ${videoUrls.length} vidéos...`);

  // Create temp directory
  const tempDir = join(tmpdir(), `ffmpeg-seq-${jobId}`);
  await mkdir(tempDir, { recursive: true });

  const tempFiles: string[] = [];
  const outputPath = join(tempDir, 'output.mp4');

  try {
    // Download all videos
    for (let i = 0; i < videoUrls.length; i++) {
      await updateJobProgress(jobId, 20 + (i / videoUrls.length) * 30, `Téléchargement plan ${i + 1}/${videoUrls.length}...`);

      const response = await fetch(videoUrls[i]);
      if (!response.ok) {
        throw new Error(`Failed to download video ${i + 1}: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      const tempPath = join(tempDir, `input_${i}.mp4`);
      await writeFile(tempPath, Buffer.from(buffer));
      tempFiles.push(tempPath);
    }

    // Get total duration for progress
    await updateJobProgress(jobId, 55, 'Concaténation...');
    let totalDuration = 0;
    for (const file of tempFiles.filter(f => f.endsWith('.mp4'))) {
      totalDuration += await getVideoDuration(file);
    }
    console.log(`[FFmpeg] Sequence total duration: ${totalDuration.toFixed(2)}s`);

    const videoFiles = tempFiles.filter(f => f.endsWith('.mp4'));

    // Check which videos have audio streams
    const audioStatus: boolean[] = [];
    for (const file of videoFiles) {
      const hasAudio = await checkVideoHasAudio(file);
      audioStatus.push(hasAudio);
      console.log(`[FFmpeg] ${file} has audio: ${hasAudio}`);
    }
    const hasAnyAudio = audioStatus.some(Boolean);

    // Get video info for the first file to determine target resolution
    const firstVideoInfo = await getVideoInfo(videoFiles[0]);
    const targetWidth = firstVideoInfo.width || 1080;
    const targetHeight = firstVideoInfo.height || 1920;
    const targetFps = 30; // Normalize to 30fps
    console.log(`[FFmpeg] Target resolution: ${targetWidth}x${targetHeight} @ ${targetFps}fps`);

    // Build FFmpeg command based on number of clips
    // Use filter_complex with audio crossfade to eliminate clicks at junction points
    const AUDIO_CROSSFADE_DURATION = 0.05; // 50ms - imperceptible but eliminates clicks

    let ffmpegArgs: string[];

    if (videoFiles.length === 1) {
      // Single clip - just re-encode with normalization
      const singleHasAudio = audioStatus[0];
      ffmpegArgs = [
        '-i', videoFiles[0],
        '-vf', `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,fps=${targetFps},format=yuv420p`,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '18',
        ...(singleHasAudio ? ['-c:a', 'aac', '-b:a', '128k'] : ['-an']),
        '-movflags', '+faststart',
        '-y',
        outputPath,
      ];
    } else {
      // Multiple clips - use filter_complex with normalization and audio crossfade
      // Build input arguments
      const inputArgs: string[] = [];
      for (const file of videoFiles) {
        inputArgs.push('-i', file);
      }

      const n = videoFiles.length;

      // Normalize each video: scale, pad, fps, format - then concat
      // This ensures all streams have identical parameters before concatenation
      const normalizeFilters = videoFiles.map((_, i) =>
        `[${i}:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,` +
        `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,` +
        `fps=${targetFps},format=yuv420p,setsar=1[v${i}]`
      );

      // Video concat with normalized streams
      const videoInputs = videoFiles.map((_, i) => `[v${i}]`).join('');
      const videoConcat = `${videoInputs}concat=n=${n}:v=1:a=0[outv]`;

      if (!hasAnyAudio) {
        // No audio in any clip - video only output
        console.log(`[FFmpeg] No audio in any clip, video-only output`);
        const filterComplex = [...normalizeFilters, videoConcat].join(';');
        console.log(`[FFmpeg] Filter complex: ${filterComplex}`);

        ffmpegArgs = [
          ...inputArgs,
          '-filter_complex', filterComplex,
          '-map', '[outv]',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '18',
          '-an', // No audio
          '-movflags', '+faststart',
          '-y',
          outputPath,
        ];
      } else {
        // Some or all clips have audio
        // For clips without audio, we need to generate silence
        // Use anullsrc to generate silence matching the clip duration

        // First, get duration of each video
        const durations: number[] = [];
        for (const file of videoFiles) {
          const dur = await getVideoDuration(file);
          durations.push(dur);
        }

        // Build audio filter parts
        // For each clip: if it has audio, use [i:a], else generate silence with anullsrc
        const audioFilters: string[] = [];
        for (let i = 0; i < n; i++) {
          if (!audioStatus[i]) {
            // Generate silence for this clip's duration
            // anullsrc generates silence, atrim limits to exact duration
            audioFilters.push(`anullsrc=r=44100:cl=stereo,atrim=0:${durations[i]}[sil${i}]`);
          }
        }

        // Build crossfade chain using either real audio or generated silence
        const getAudioRef = (i: number) => audioStatus[i] ? `[${i}:a]` : `[sil${i}]`;

        let audioFilter = '';
        if (n === 2) {
          audioFilter = `${getAudioRef(0)}${getAudioRef(1)}acrossfade=d=${AUDIO_CROSSFADE_DURATION}:c1=tri:c2=tri[outa]`;
        } else {
          // Chain crossfades for n > 2 clips
          const crossfades: string[] = [];
          for (let i = 0; i < n - 1; i++) {
            const inputA = i === 0 ? getAudioRef(0) : `[a${i - 1}]`;
            const inputB = getAudioRef(i + 1);
            const output = i === n - 2 ? '[outa]' : `[a${i}]`;
            crossfades.push(`${inputA}${inputB}acrossfade=d=${AUDIO_CROSSFADE_DURATION}:c1=tri:c2=tri${output}`);
          }
          audioFilter = crossfades.join(';');
        }

        // Combine all filter parts: normalize videos, then concat, then audio
        const allFilters = [...normalizeFilters, ...audioFilters, videoConcat, audioFilter].filter(Boolean);
        const filterComplex = allFilters.join(';');
        console.log(`[FFmpeg] Filter complex: ${filterComplex}`);

        ffmpegArgs = [
          ...inputArgs,
          '-filter_complex', filterComplex,
          '-map', '[outv]',
          '-map', '[outa]',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '18',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
          '-y',
          outputPath,
        ];
      }
    }

    await runFFmpeg(ffmpegArgs, {
      jobId,
      baseProgress: 55,
      progressRange: 30,
      totalDuration,
      onProgress: (progress, message) => updateJobProgress(jobId, progress, message),
    });

    tempFiles.push(outputPath);

    // Upload result
    await updateJobProgress(jobId, 90, 'Sauvegarde...');

    const { readFile } = await import('fs/promises');
    const outputBuffer = await readFile(outputPath);
    const storageKey = `sequences/${userId.replace(/[|]/g, '_')}/${projectId}/${sequenceId}_assembled_${Date.now()}.mp4`;
    const b2Url = await uploadFile(storageKey, outputBuffer, 'video/mp4');

    // Update sequence in database
    await supabase
      .from('sequences')
      .update({
        assembled_video_url: b2Url,
        assembled_plan_hash: planHash,
        assembled_at: new Date().toISOString(),
      })
      .eq('id', sequenceId);

    await completeJob(jobId, {
      outputUrl: b2Url,
      planCount: videoUrls.length,
      sequenceId,
    });

    console.log(`[FFmpeg] Sequence assembly completed (simple concat, no color correction)`);

  } finally {
    // Cleanup temp files
    for (const file of tempFiles) {
      try {
        await unlink(file);
      } catch {
        // Ignore cleanup errors
      }
    }
    try {
      const { rmdir } = await import('fs/promises');
      await rmdir(tempDir);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Overlay music on a video
 */
async function processMusicOverlay(data: FFmpegJobData): Promise<void> {
  const {
    jobId,
    userId,
    projectId,
    shotId,
    videoUrl,
    audioUrl,
    audioStart = 0,
    audioEnd,
    volume = 1.0,
  } = data;

  if (!shotId || !videoUrl || !audioUrl) {
    throw new Error('Missing videoUrl or audioUrl for music overlay');
  }

  const supabase = getSupabase();
  await startJob(jobId, 'Préparation de l\'overlay musical...');

  // Get public URLs
  await updateJobProgress(jobId, 10, 'Récupération des fichiers...');
  const videoPublicUrl = await getPublicUrl(videoUrl);
  const audioPublicUrl = await getPublicUrl(audioUrl);

  // Create temp directory
  const tempDir = join(tmpdir(), `ffmpeg-${jobId}`);
  await mkdir(tempDir, { recursive: true });

  const videoPath = join(tempDir, 'video.mp4');
  const audioPath = join(tempDir, 'audio.mp3');
  const outputPath = join(tempDir, 'output.mp4');
  const tempFiles = [videoPath, audioPath, outputPath];

  try {
    // Download video
    await updateJobProgress(jobId, 20, 'Téléchargement de la vidéo...');
    const videoResponse = await fetch(videoPublicUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status}`);
    }
    await writeFile(videoPath, Buffer.from(await videoResponse.arrayBuffer()));

    // Download audio
    await updateJobProgress(jobId, 35, 'Téléchargement de l\'audio...');
    const audioResponse = await fetch(audioPublicUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status}`);
    }
    await writeFile(audioPath, Buffer.from(await audioResponse.arrayBuffer()));

    // Build FFmpeg command for music overlay
    await updateJobProgress(jobId, 50, 'Application de la musique...');

    // Calculate audio trim parameters
    const audioDuration = audioEnd ? audioEnd - audioStart : undefined;

    // Check if video has audio stream
    const hasVideoAudio = await checkVideoHasAudio(videoPath);
    console.log(`[FFmpeg] Video has audio: ${hasVideoAudio}`);

    // Build filter complex for audio
    let filterComplex = '';
    let ffmpegArgs: string[];

    if (hasVideoAudio) {
      // Mix video audio with music
      if (audioDuration) {
        filterComplex = `[1:a]atrim=start=${audioStart}:duration=${audioDuration},asetpts=PTS-STARTPTS,volume=${volume}[music];[0:a][music]amix=inputs=2:duration=shortest[aout]`;
      } else {
        filterComplex = `[1:a]atrim=start=${audioStart},asetpts=PTS-STARTPTS,volume=${volume}[music];[0:a][music]amix=inputs=2:duration=shortest[aout]`;
      }

      ffmpegArgs = [
        '-i', videoPath,
        '-i', audioPath,
        '-filter_complex', filterComplex,
        '-map', '0:v',
        '-map', '[aout]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        '-y',
        outputPath,
      ];
    } else {
      // Video has no audio, just add music track
      if (audioDuration) {
        filterComplex = `[1:a]atrim=start=${audioStart}:duration=${audioDuration},asetpts=PTS-STARTPTS,volume=${volume}[aout]`;
      } else {
        filterComplex = `[1:a]atrim=start=${audioStart},asetpts=PTS-STARTPTS,volume=${volume}[aout]`;
      }

      ffmpegArgs = [
        '-i', videoPath,
        '-i', audioPath,
        '-filter_complex', filterComplex,
        '-map', '0:v',
        '-map', '[aout]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        '-movflags', '+faststart',
        '-y',
        outputPath,
      ];
    }

    // Get video duration for progress
    const videoDuration = await getVideoDuration(videoPath);
    console.log(`[FFmpeg] Video duration: ${videoDuration.toFixed(2)}s`);

    await runFFmpeg(ffmpegArgs, {
      jobId,
      baseProgress: 50,
      progressRange: 35,
      totalDuration: videoDuration,
      onProgress: (progress, message) => updateJobProgress(jobId, progress, message),
    });

    // Upload result
    await updateJobProgress(jobId, 88, 'Sauvegarde du résultat...');

    const { readFile } = await import('fs/promises');
    const outputBuffer = await readFile(outputPath);
    const storageKey = `videos/${userId.replace(/[|]/g, '_')}/${projectId}/${shotId}_music_${Date.now()}.mp4`;
    const b2Url = await uploadFile(storageKey, outputBuffer, 'video/mp4');

    // Update shot with new video URL
    await supabase
      .from('shots')
      .update({
        generated_video_url: b2Url,
      })
      .eq('id', shotId);

    await completeJob(jobId, {
      outputUrl: b2Url,
    });

    console.log(`[FFmpeg] Music overlay job ${jobId} completed`);

  } finally {
    // Cleanup temp files
    for (const file of tempFiles) {
      try {
        await unlink(file);
      } catch {
        // Ignore cleanup errors
      }
    }
    try {
      const { rmdir } = await import('fs/promises');
      await rmdir(tempDir);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Check if video file has an audio stream
 */
async function checkVideoHasAudio(videoPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const process = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a',
      '-show_entries', 'stream=codec_type',
      '-of', 'csv=p=0',
      videoPath,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';

    process.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    process.on('close', () => {
      // If ffprobe found audio streams, stdout will contain 'audio'
      resolve(stdout.trim().includes('audio'));
    });

    process.on('error', () => {
      // On error, assume no audio
      resolve(false);
    });
  });
}

/**
 * Parse FFmpeg progress line and extract info
 */
function parseFFmpegProgress(line: string): {
  frame?: number;
  fps?: number;
  time?: string;
  speed?: string;
  size?: string;
  bitrate?: string;
} | null {
  // FFmpeg progress format: frame=  120 fps= 30 q=28.0 size=    1024kB time=00:00:04.00 bitrate=2099.2kbits/s speed=1.5x
  const frameMatch = line.match(/frame=\s*(\d+)/);
  const fpsMatch = line.match(/fps=\s*([\d.]+)/);
  const timeMatch = line.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
  const speedMatch = line.match(/speed=\s*([\d.]+x|N\/A)/);
  const sizeMatch = line.match(/size=\s*(\d+\w+)/);
  const bitrateMatch = line.match(/bitrate=\s*([\d.]+\w+\/s)/);

  if (!frameMatch && !timeMatch) {
    return null;
  }

  return {
    frame: frameMatch ? parseInt(frameMatch[1], 10) : undefined,
    fps: fpsMatch ? parseFloat(fpsMatch[1]) : undefined,
    time: timeMatch ? timeMatch[1] : undefined,
    speed: speedMatch ? speedMatch[1] : undefined,
    size: sizeMatch ? sizeMatch[1] : undefined,
    bitrate: bitrateMatch ? bitrateMatch[1] : undefined,
  };
}

/**
 * Get video duration using ffprobe
 */
async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      videoPath,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.on('close', () => {
      const duration = parseFloat(stdout.trim());
      resolve(isNaN(duration) ? 0 : duration);
    });

    proc.on('error', () => {
      resolve(0);
    });
  });
}

/**
 * Get video info (width, height, fps) using ffprobe
 */
async function getVideoInfo(videoPath: string): Promise<{ width: number; height: number; fps: number }> {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate',
      '-of', 'json',
      videoPath,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.on('close', () => {
      try {
        const data = JSON.parse(stdout);
        const stream = data.streams?.[0];
        if (stream) {
          // Parse frame rate (e.g., "30/1" or "30000/1001")
          let fps = 30;
          if (stream.r_frame_rate) {
            const [num, den] = stream.r_frame_rate.split('/').map(Number);
            if (num && den) {
              fps = Math.round(num / den);
            }
          }
          resolve({
            width: stream.width || 1080,
            height: stream.height || 1920,
            fps,
          });
          return;
        }
      } catch {
        // Parse error
      }
      resolve({ width: 1080, height: 1920, fps: 30 });
    });

    proc.on('error', () => {
      resolve({ width: 1080, height: 1920, fps: 30 });
    });
  });
}

/**
 * Convert time string (HH:MM:SS.ms) to seconds
 */
function timeToSeconds(time: string): number {
  const parts = time.split(':');
  if (parts.length !== 3) return 0;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseFloat(parts[2]);
  return hours * 3600 + minutes * 60 + seconds;
}

interface FFmpegProgressCallback {
  (progress: number, message: string): Promise<void>;
}

/**
 * Run FFmpeg with the given arguments and progress reporting
 */
function runFFmpeg(
  args: string[],
  options?: {
    jobId?: string;
    baseProgress?: number;
    progressRange?: number;
    totalDuration?: number;
    onProgress?: FFmpegProgressCallback;
  }
): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[FFmpeg] Running: ffmpeg ${args.join(' ')}`);

    const process = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    let lastProgressUpdate = 0;
    const { baseProgress = 50, progressRange = 30, totalDuration = 0, onProgress } = options || {};

    process.stderr?.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;

      // Parse progress from each line
      const lines = chunk.split('\n');
      for (const line of lines) {
        const progress = parseFFmpegProgress(line);
        if (progress) {
          // Log progress
          const parts: string[] = [];
          if (progress.frame) parts.push(`frame=${progress.frame}`);
          if (progress.fps) parts.push(`fps=${progress.fps}`);
          if (progress.time) parts.push(`time=${progress.time}`);
          if (progress.speed) parts.push(`speed=${progress.speed}`);
          if (progress.size) parts.push(`size=${progress.size}`);

          console.log(`[FFmpeg] Progress: ${parts.join(' ')}`);

          // Calculate and report progress percentage
          if (onProgress && progress.time) {
            const currentTime = timeToSeconds(progress.time);
            const now = Date.now();

            // Throttle updates to every 2 seconds
            if (now - lastProgressUpdate >= 2000) {
              lastProgressUpdate = now;

              let progressPercent = baseProgress;
              if (totalDuration > 0) {
                progressPercent = baseProgress + (currentTime / totalDuration) * progressRange;
              }

              // Build message
              const msg = progress.speed && progress.speed !== 'N/A'
                ? `Encodage: ${progress.time} (${progress.speed})`
                : `Encodage: ${progress.time}`;

              onProgress(Math.min(progressPercent, baseProgress + progressRange), msg).catch(() => {});
            }
          }
        }
      }
    });

    process.on('close', (code) => {
      if (code === 0) {
        console.log('[FFmpeg] Completed successfully');
        resolve();
      } else {
        console.error(`[FFmpeg] Error output:\n${stderr}`);
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    process.on('error', (error) => {
      reject(new Error(`FFmpeg spawn error: ${error.message}`));
    });
  });
}

/**
 * Get dimensions from aspect ratio string
 */
function getAspectDimensions(aspectRatio: string): { width: number; height: number } {
  const aspectDimensions: Record<string, { width: number; height: number }> = {
    '16:9': { width: 1920, height: 1080 },
    '9:16': { width: 1080, height: 1920 },
    '1:1': { width: 1080, height: 1080 },
    '4:5': { width: 1080, height: 1350 },
    '2:3': { width: 1080, height: 1620 },
    '21:9': { width: 2560, height: 1080 },
  };
  return aspectDimensions[aspectRatio] || { width: 1080, height: 1920 };
}

/**
 * Map montage transition types to FFmpeg xfade transition names
 */
function mapTransitionToXfade(transitionType: string): string {
  const transitionMap: Record<string, string> = {
    'fade': 'fade',
    'dissolve': 'dissolve',
    'fadeblack': 'fadeblack',
    'fadewhite': 'fadewhite',
    'directional-left': 'slideleft',
    'directional-right': 'slideright',
    'directional-up': 'slideup',
    'directional-down': 'slidedown',
    'crosszoom': 'smoothleft', // No exact match, use smooth slide
    'zoomin': 'circleopen',
    'zoomout': 'circleclose',
  };
  return transitionMap[transitionType] || 'fade';
}

/**
 * Find transition between two clips based on timeline position
 */
function findTransitionBetweenClips(
  clipA: { start: number; duration: number },
  clipB: { start: number },
  transitions: Array<{ start: number; duration: number; transitionType?: string }>
): { type: string; duration: number } | null {
  const gapStart = clipA.start + clipA.duration;
  const gapEnd = clipB.start;

  // Find a transition that overlaps with the gap between clips
  // Or is positioned at the junction point (with small tolerance)
  const tolerance = 0.5;

  for (const t of transitions) {
    const tEnd = t.start + t.duration;
    // Check if transition overlaps with the gap or is at the junction
    if (
      (t.start >= gapStart - tolerance && t.start <= gapEnd + tolerance) ||
      (t.start <= gapStart && tEnd >= gapStart)
    ) {
      return {
        type: t.transitionType || 'fade',
        duration: t.duration,
      };
    }
  }
  return null;
}

/**
 * Find transition at the start of timeline (fade in from black)
 */
function findTransitionAtStart(
  firstClip: { start: number },
  transitions: Array<{ start: number; duration: number; transitionType?: string }>
): { type: string; duration: number } | null {
  const tolerance = 0.5;

  for (const t of transitions) {
    // Transition is at start if it's before or at the beginning of first clip
    if (t.start <= tolerance && t.start + t.duration <= firstClip.start + t.duration + tolerance) {
      return {
        type: t.transitionType || 'fade',
        duration: t.duration,
      };
    }
  }
  return null;
}

/**
 * Find transition at the end of timeline (fade out to black)
 */
function findTransitionAtEnd(
  lastClip: { start: number; duration: number },
  totalDuration: number,
  transitions: Array<{ start: number; duration: number; transitionType?: string }>
): { type: string; duration: number } | null {
  const tolerance = 0.5;
  const lastClipEnd = lastClip.start + lastClip.duration;

  for (const t of transitions) {
    // Transition is at end if it starts near or after the last clip ends
    if (t.start >= lastClipEnd - tolerance || t.start + t.duration >= totalDuration - tolerance) {
      return {
        type: t.transitionType || 'fade',
        duration: t.duration,
      };
    }
  }
  return null;
}

/**
 * Process montage timeline render to MP4
 */
async function processMontageRender(data: FFmpegJobData): Promise<void> {
  const { jobId, userId, projectId, shortId, montageData } = data;

  if (!montageData || !montageData.clips || montageData.clips.length === 0) {
    throw new Error('No clips in montage data');
  }

  const supabase = getSupabase();
  await startJob(jobId, 'Préparation du rendu montage...');

  const { width, height } = getAspectDimensions(montageData.aspectRatio);
  const totalDuration = montageData.duration;

  console.log(`[FFmpeg] Montage render: ${width}x${height}, ${totalDuration.toFixed(2)}s, ${montageData.clips.length} clips`);

  // Create temp directory
  const tempDir = join(tmpdir(), `ffmpeg-montage-${jobId}`);
  await mkdir(tempDir, { recursive: true });

  const tempFiles: string[] = [];
  const outputPath = join(tempDir, 'montage_output.mp4');

  try {
    // Separate video/image clips from audio and transition clips
    const videoTracks = montageData.tracks.filter((t) => t.type === 'video' && !t.muted);
    const audioTracks = montageData.tracks.filter((t) => t.type === 'audio' && !t.muted);

    const videoClips = montageData.clips.filter(
      (c) => (c.type === 'video' || c.type === 'image') && videoTracks.some((t) => t.id === c.trackId)
    );
    const audioClips = montageData.clips.filter(
      (c) => c.type === 'audio' && audioTracks.some((t) => t.id === c.trackId)
    );
    const transitionClips = montageData.clips.filter(
      (c) => c.type === 'transition' && videoTracks.some((t) => t.id === c.trackId)
    );

    console.log(`[FFmpeg] Video clips: ${videoClips.length}, Audio clips: ${audioClips.length}, Transitions: ${transitionClips.length}`);

    if (videoClips.length === 0) {
      throw new Error('No video clips to render');
    }

    // Download all assets
    await updateJobProgress(jobId, 10, `Téléchargement de ${videoClips.length + audioClips.length} assets...`);

    const downloadedFiles: Map<string, { path: string; type: 'video' | 'image' | 'audio' }> = new Map();
    const allClips = [...videoClips, ...audioClips];

    for (let i = 0; i < allClips.length; i++) {
      const clip = allClips[i];
      if (!clip.assetUrl) continue;

      // Skip if already downloaded (same asset used multiple times)
      if (downloadedFiles.has(clip.assetUrl)) continue;

      await updateJobProgress(
        jobId,
        10 + (i / allClips.length) * 30,
        `Téléchargement ${i + 1}/${allClips.length}...`
      );

      const publicUrl = await getPublicUrl(clip.assetUrl);
      const response = await fetch(publicUrl);
      if (!response.ok) {
        throw new Error(`Failed to download ${clip.name}: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      const ext = clip.type === 'audio' ? 'mp3' : clip.type === 'image' ? 'jpg' : 'mp4';
      const filePath = join(tempDir, `asset_${downloadedFiles.size}.${ext}`);
      await writeFile(filePath, Buffer.from(buffer));
      tempFiles.push(filePath);

      downloadedFiles.set(clip.assetUrl, { path: filePath, type: clip.type as 'video' | 'image' | 'audio' });
      console.log(`[FFmpeg] Downloaded: ${clip.name} -> ${filePath}`);
    }

    // Build FFmpeg command with filter_complex
    await updateJobProgress(jobId, 45, 'Construction du graphe de filtres...');

    // Sort video clips by start time (for compositing order)
    const sortedVideoClips = [...videoClips].sort((a, b) => a.start - b.start);

    // Build input arguments
    const inputArgs: string[] = [];
    const inputIndexMap: Map<string, number> = new Map();
    let inputIndex = 0;

    // First input: black background
    inputArgs.push('-f', 'lavfi', '-i', `color=black:s=${width}x${height}:d=${totalDuration}:r=30`);
    inputIndex++;

    // Add video/image inputs
    for (const clip of sortedVideoClips) {
      const file = downloadedFiles.get(clip.assetUrl);
      if (!file) continue;

      if (file.type === 'image') {
        // For images, create a video stream with loop
        inputArgs.push('-loop', '1', '-t', String(clip.duration), '-i', file.path);
      } else {
        inputArgs.push('-i', file.path);
      }
      inputIndexMap.set(clip.id, inputIndex);
      inputIndex++;
    }

    // Add audio inputs
    for (const clip of audioClips) {
      const file = downloadedFiles.get(clip.assetUrl);
      if (!file) continue;
      inputArgs.push('-i', file.path);
      inputIndexMap.set(clip.id, inputIndex);
      inputIndex++;
    }

    // Build filter complex
    const filterParts: string[] = [];
    let lastVideoLabel = '0:v'; // Start with black background (no brackets - added when used)

    // Log transitions for debugging
    if (transitionClips.length > 0) {
      console.log(`[FFmpeg] Transitions found:`, transitionClips.map(t => ({
        start: t.start,
        duration: t.duration,
        type: t.transitionType,
      })));
    }

    // Process video clips - overlay each on top of the previous
    // Apply xfade transitions when a transition clip exists between consecutive clips
    for (let i = 0; i < sortedVideoClips.length; i++) {
      const clip = sortedVideoClips[i];
      const clipInputIdx = inputIndexMap.get(clip.id);
      if (clipInputIdx === undefined) continue;

      const sourceStart = clip.sourceStart || 0;
      const clipDuration = clip.duration;
      const timelineStart = clip.start;

      // Scale and position the clip
      const scaleLabel = `scaled${i}`;

      // Trim source video and shift timestamps to timeline position
      // Using setpts to position the clip at the correct time on the timeline
      if (clip.type === 'video') {
        filterParts.push(
          `[${clipInputIdx}:v]trim=start=${sourceStart}:duration=${clipDuration},` +
          `setpts=PTS-STARTPTS+${timelineStart}/TB,` +
          `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
          `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2[${scaleLabel}]`
        );
      } else {
        // Image - already looped with correct duration, shift to timeline position
        filterParts.push(
          `[${clipInputIdx}:v]setpts=PTS-STARTPTS+${timelineStart}/TB,` +
          `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
          `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2[${scaleLabel}]`
        );
      }

      // Check if there's a transition TO this clip (from the previous clip)
      let useTransition = false;
      let transitionType = 'fade';
      let transitionDuration = 0.5;

      if (i > 0) {
        const prevClip = sortedVideoClips[i - 1];
        const transition = findTransitionBetweenClips(prevClip, clip, transitionClips);
        if (transition) {
          useTransition = true;
          transitionType = transition.type;
          transitionDuration = transition.duration;
          console.log(`[FFmpeg] Applying ${transitionType} transition (${transitionDuration}s) between "${prevClip.name}" and "${clip.name}"`);
        }
      }

      const overlayLabel = `overlay${i}`;

      if (useTransition && i > 0) {
        // Use xfade transition
        // xfade needs the transition to happen at the junction point
        // offset = time when transition starts (relative to first input)
        const prevClip = sortedVideoClips[i - 1];
        const transitionOffset = prevClip.start + prevClip.duration - transitionDuration;
        const xfadeType = mapTransitionToXfade(transitionType);

        filterParts.push(
          `[${lastVideoLabel}][${scaleLabel}]xfade=transition=${xfadeType}:duration=${transitionDuration}:offset=${transitionOffset}[${overlayLabel}]`
        );
      } else {
        // Standard overlay without transition
        const enableStart = timelineStart;
        const enableEnd = timelineStart + clipDuration;

        filterParts.push(
          `[${lastVideoLabel}][${scaleLabel}]overlay=0:0:enable='between(t,${enableStart},${enableEnd})'[${overlayLabel}]`
        );
      }

      // Next iteration uses this overlay's output (store WITHOUT brackets)
      lastVideoLabel = overlayLabel;
    }

    // Apply fade in at start if there's a transition at the beginning
    const fadeInTransition = findTransitionAtStart(sortedVideoClips[0], transitionClips);
    if (fadeInTransition) {
      const fadeLabel = 'fadein';
      const xfadeType = mapTransitionToXfade(fadeInTransition.type);
      console.log(`[FFmpeg] Applying fade in (${xfadeType}, ${fadeInTransition.duration}s) at start`);

      // Use fade filter for fade in from black
      filterParts.push(
        `[${lastVideoLabel}]fade=t=in:st=0:d=${fadeInTransition.duration}[${fadeLabel}]`
      );
      lastVideoLabel = fadeLabel;
    }

    // Apply fade out at end if there's a transition at the end
    const fadeOutTransition = findTransitionAtEnd(
      sortedVideoClips[sortedVideoClips.length - 1],
      totalDuration,
      transitionClips
    );
    if (fadeOutTransition) {
      const fadeLabel = 'fadeout';
      const fadeStart = totalDuration - fadeOutTransition.duration;
      console.log(`[FFmpeg] Applying fade out (${fadeOutTransition.duration}s) at ${fadeStart}s`);

      // Use fade filter for fade out to black
      filterParts.push(
        `[${lastVideoLabel}]fade=t=out:st=${fadeStart}:d=${fadeOutTransition.duration}[${fadeLabel}]`
      );
      lastVideoLabel = fadeLabel;
    }

    // Rename final video output to [vout] if not already
    if (lastVideoLabel !== 'vout') {
      filterParts.push(`[${lastVideoLabel}]copy[vout]`);
    }

    // Process ALL audio sources: audio clips + audio from video clips
    const audioLabels: string[] = [];
    let audioLabelIndex = 0;

    // 1. Audio from video clips (if they have audio streams)
    for (let i = 0; i < sortedVideoClips.length; i++) {
      const clip = sortedVideoClips[i];
      if (clip.type !== 'video') continue; // Skip images

      const clipInputIdx = inputIndexMap.get(clip.id);
      if (clipInputIdx === undefined) continue;

      const file = downloadedFiles.get(clip.assetUrl);
      if (!file || file.type !== 'video') continue;

      // Check if this video has audio
      const hasAudio = await checkVideoHasAudio(file.path);
      if (!hasAudio) {
        console.log(`[FFmpeg] Video clip "${clip.name}" has no audio`);
        continue;
      }

      const sourceStart = clip.sourceStart || 0;
      const clipDuration = clip.duration;
      const timelineStart = clip.start;
      const audioLabel = `vaudio${audioLabelIndex++}`;

      // Extract, trim and delay audio to match timeline position
      // Note: We use adelay instead of asetpts because amix doesn't respect PTS timestamps
      filterParts.push(
        `[${clipInputIdx}:a]atrim=start=${sourceStart}:duration=${clipDuration},` +
        `asetpts=PTS-STARTPTS,` +
        `adelay=${Math.floor(timelineStart * 1000)}|${Math.floor(timelineStart * 1000)}[${audioLabel}]`
      );
      audioLabels.push(`[${audioLabel}]`);
      console.log(`[FFmpeg] Added audio from video clip "${clip.name}" at ${timelineStart}s`);
    }

    // 2. Audio from dedicated audio clips
    for (let i = 0; i < audioClips.length; i++) {
      const clip = audioClips[i];
      const clipInputIdx = inputIndexMap.get(clip.id);
      if (clipInputIdx === undefined) continue;

      const sourceStart = clip.sourceStart || 0;
      const clipDuration = clip.duration;
      const timelineStart = clip.start;
      const audioLabel = `aclip${audioLabelIndex++}`;

      // Trim and delay audio
      filterParts.push(
        `[${clipInputIdx}:a]atrim=start=${sourceStart}:duration=${clipDuration},` +
        `asetpts=PTS-STARTPTS,` +
        `adelay=${Math.floor(timelineStart * 1000)}|${Math.floor(timelineStart * 1000)}[${audioLabel}]`
      );
      audioLabels.push(`[${audioLabel}]`);
    }

    // Mix all audio sources
    if (audioLabels.length === 1) {
      // Single audio - just rename
      filterParts.push(`${audioLabels[0]}acopy[aout]`);
    } else if (audioLabels.length > 1) {
      // Multiple audio - mix with normalize to prevent clipping
      filterParts.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0[aout]`);
    }

    const filterComplex = filterParts.join(';');
    console.log(`[FFmpeg] Filter complex length: ${filterComplex.length} chars`);
    console.log(`[FFmpeg] Audio sources: ${audioLabels.length} (video audio + audio clips)`);

    // Build final FFmpeg command
    const hasAudio = audioLabels.length > 0;
    const ffmpegArgs = [
      ...inputArgs,
      '-filter_complex', filterComplex,
      '-map', '[vout]',
      ...(hasAudio ? ['-map', '[aout]'] : []),
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '18',
      ...(hasAudio ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an']),
      '-t', String(totalDuration),
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ];

    await updateJobProgress(jobId, 50, 'Rendu en cours...');

    await runFFmpeg(ffmpegArgs, {
      jobId,
      baseProgress: 50,
      progressRange: 35,
      totalDuration,
      onProgress: (progress, message) => updateJobProgress(jobId, progress, message),
    });

    tempFiles.push(outputPath);

    // Upload result
    await updateJobProgress(jobId, 90, 'Sauvegarde du résultat...');

    const { readFile } = await import('fs/promises');
    const outputBuffer = await readFile(outputPath);
    const storageKey = `montage/${userId.replace(/[|]/g, '_')}/${projectId}/${shortId}_montage_${Date.now()}.mp4`;
    const b2Url = await uploadFile(storageKey, outputBuffer, 'video/mp4');

    // Update scene with montage video URL
    // Also update assembled_video_url so it appears in the shorts list
    await supabase
      .from('scenes')
      .update({
        montage_video_url: b2Url,
        montage_rendered_at: new Date().toISOString(),
        assembled_video_url: b2Url,
        assembled_video_duration: totalDuration,
      })
      .eq('id', shortId);

    await completeJob(jobId, {
      outputUrl: b2Url,
      clipCount: montageData.clips.length,
      duration: totalDuration,
    });

    console.log(`[FFmpeg] Montage render job ${jobId} completed`);

  } finally {
    // Cleanup temp files
    for (const file of tempFiles) {
      try {
        await unlink(file);
      } catch {
        // Ignore cleanup errors
      }
    }
    try {
      const { rmdir } = await import('fs/promises');
      await rmdir(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
