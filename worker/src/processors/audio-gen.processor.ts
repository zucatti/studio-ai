/**
 * Audio Generation Processor
 * Handles TTS audio generation jobs from the queue
 */

import type { Job } from 'bullmq';
import { spawn } from 'child_process';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { getSupabase } from '../supabase.js';
import { uploadFile, generateStorageKey, getPublicUrl } from '../storage.js';
import { startJob, updateJobProgress, completeJob, failJob } from '../utils/job-status.js';
import { aiConfig } from '../config.js';

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// Job data type
export interface AudioGenJobData {
  type: 'audio-gen';
  userId: string;
  jobId: string;
  createdAt: string;
  projectId: string;
  shotId: string;
  voiceId: string;
  text: string;
  modelId?: string;
  // For merging dialogue with video
  videoUrl?: string;
  mergeWithVideo?: boolean;
}

/**
 * Process an audio generation job
 */
export async function processAudioGenJob(job: Job<AudioGenJobData>): Promise<void> {
  const { data } = job;
  const {
    jobId,
    userId,
    projectId,
    shotId,
    voiceId,
    text,
    modelId = 'eleven_v3',
    videoUrl,
    mergeWithVideo = false,
  } = data;

  console.log(`[AudioGen] Processing job ${jobId} for shot ${shotId}`);
  console.log(`[AudioGen] Voice: ${voiceId}, Text length: ${text.length}, Merge: ${mergeWithVideo}`);

  const supabase = getSupabase();

  try {
    // Mark job as running
    await startJob(jobId, 'Préparation de la génération audio...');

    // Clean dialogue text - remove @mentions, #locations, !looks, &in/&out
    const cleanedText = text
      .replace(/@\w+/g, '')
      .replace(/#\w+/g, '')
      .replace(/!\w+/g, '')
      .replace(/&in\b/gi, '')
      .replace(/&out\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanedText) {
      throw new Error('No text to generate after cleaning');
    }

    // Generate audio with ElevenLabs
    await updateJobProgress(jobId, 20, 'Génération de l\'audio...');

    const response = await fetch(
      `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': aiConfig.elevenLabs,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: cleanedText,
          model_id: modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    console.log(`[AudioGen] Generated audio: ${audioBuffer.byteLength} bytes`);

    // Upload audio to B2
    await updateJobProgress(jobId, 40, 'Sauvegarde de l\'audio...');

    const storageKey = generateStorageKey('audio', userId, projectId, `${shotId}_dialogue`, 'mp3');
    const audioB2Url = await uploadFile(storageKey, Buffer.from(audioBuffer), 'audio/mpeg');

    console.log(`[AudioGen] Uploaded audio to B2: ${audioB2Url}`);

    // Calculate hash for caching
    const crypto = await import('crypto');
    const dialogueHash = crypto.createHash('md5').update(text).digest('hex');

    let finalVideoUrl: string | undefined;

    // Merge audio with video if requested
    if (mergeWithVideo && videoUrl) {
      await updateJobProgress(jobId, 50, 'Fusion audio + vidéo...');

      finalVideoUrl = await mergeVideoWithAudio({
        videoUrl,
        audioUrl: audioB2Url,
        userId,
        projectId,
        shotId,
        jobId,
      });

      console.log(`[AudioGen] Merged video: ${finalVideoUrl}`);

      // Update shot with merged video and audio URL
      await updateJobProgress(jobId, 90, 'Mise à jour du shot...');

      await supabase
        .from('shots')
        .update({
          generated_video_url: finalVideoUrl,
          dialogue_audio_url: audioB2Url,
          dialogue_text_hash: dialogueHash,
        })
        .eq('id', shotId);
    } else {
      // Just update with audio URL
      await updateJobProgress(jobId, 85, 'Mise à jour du shot...');

      await supabase
        .from('shots')
        .update({
          dialogue_audio_url: audioB2Url,
          dialogue_text_hash: dialogueHash,
        })
        .eq('id', shotId);
    }

    // Estimate cost based on character count
    const characterCost = cleanedText.length * 0.00003; // ~$0.03 per 1000 chars

    // Complete the job
    await completeJob(jobId, {
      audioUrl: audioB2Url,
      videoUrl: finalVideoUrl,
      characterCount: cleanedText.length,
      dialogueHash,
      merged: mergeWithVideo && !!finalVideoUrl,
    }, characterCost);

    console.log(`[AudioGen] Job ${jobId} completed successfully`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[AudioGen] Job ${jobId} failed:`, errorMessage);

    // Fail the job
    await failJob(jobId, errorMessage);

    throw error;
  }
}

/**
 * Merge video with dialogue audio using FFmpeg
 */
async function mergeVideoWithAudio(options: {
  videoUrl: string;
  audioUrl: string;
  userId: string;
  projectId: string;
  shotId: string;
  jobId: string;
}): Promise<string> {
  const { videoUrl, audioUrl, userId, projectId, shotId, jobId } = options;

  // Get public URLs
  const videoPublicUrl = await getPublicUrl(videoUrl);
  const audioPublicUrl = await getPublicUrl(audioUrl);

  // Create temp directory
  const tempDir = join(tmpdir(), `audio-merge-${jobId}`);
  await mkdir(tempDir, { recursive: true });

  const videoPath = join(tempDir, 'video.mp4');
  const audioPath = join(tempDir, 'audio.mp3');
  const outputPath = join(tempDir, 'output.mp4');
  const tempFiles = [videoPath, audioPath, outputPath];

  try {
    // Download video
    console.log(`[AudioGen] Downloading video: ${videoPublicUrl.substring(0, 80)}...`);
    const videoResponse = await fetch(videoPublicUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status}`);
    }
    await writeFile(videoPath, Buffer.from(await videoResponse.arrayBuffer()));

    // Download audio
    console.log(`[AudioGen] Downloading audio: ${audioPublicUrl.substring(0, 80)}...`);
    const audioResponse = await fetch(audioPublicUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status}`);
    }
    await writeFile(audioPath, Buffer.from(await audioResponse.arrayBuffer()));

    // Run FFmpeg to merge - replace video audio with dialogue
    // This adds the dialogue audio track and mixes it with any existing audio
    console.log(`[AudioGen] Running FFmpeg merge...`);

    await runFFmpeg([
      '-i', videoPath,
      '-i', audioPath,
      '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[aout]',
      '-map', '0:v',
      '-map', '[aout]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ]);

    // Upload result
    const { readFile } = await import('fs/promises');
    const outputBuffer = await readFile(outputPath);
    const outputKey = `videos/${userId.replace(/[|]/g, '_')}/${projectId}/${shotId}_dialogue_${Date.now()}.mp4`;
    const finalUrl = await uploadFile(outputKey, outputBuffer, 'video/mp4');

    return finalUrl;

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
 * Run FFmpeg with the given arguments
 */
function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[AudioGen] Running: ffmpeg ${args.slice(0, 10).join(' ')}...`);

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
        console.error(`[AudioGen] FFmpeg error:\n${stderr.slice(-500)}`);
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    process.on('error', (error) => {
      reject(new Error(`FFmpeg spawn error: ${error.message}`));
    });
  });
}
