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
  operation: 'assemble' | 'music-overlay' | 'extract-frame';
  projectId: string;
  // For assembly
  shortId?: string;
  shotIds?: string[];
  // For music overlay
  shotId?: string;
  videoUrl?: string;
  audioUrl?: string;
  audioStart?: number;
  audioEnd?: number;
  volume?: number;
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
      case 'music-overlay':
        await processMusicOverlay(data);
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

    // Run FFmpeg concat
    await updateJobProgress(jobId, 60, 'Fusion des vidéos...');

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
    ]);

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

    await runFFmpeg(ffmpegArgs);

    // Upload result
    await updateJobProgress(jobId, 85, 'Sauvegarde du résultat...');

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
 * Run FFmpeg with the given arguments
 */
function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[FFmpeg] Running: ffmpeg ${args.join(' ')}`);

    const process = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';

    process.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
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
