/**
 * Editly Video Assembly Processor
 *
 * Handles video assembly with:
 * - Sequences with transitions
 * - Background music
 * - Color matching (via FFmpeg pre-processing)
 */

import type { Job } from 'bullmq';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { getSupabase } from '../supabase.js';
import { uploadFile, getPublicUrl } from '../storage.js';
import { startJob, updateJobProgress, completeJob, failJob } from '../utils/job-status.js';
import {
  assembleWithEditly,
  createTempDir,
  cleanupTempDir,
  type SequenceInput,
  type SequenceClip,
  type ShortMusicInput,
} from '../lib/editly/index.js';

// Job data type
export interface EditlyJobData {
  type: 'editly';
  userId: string;
  jobId: string;
  createdAt: string;
  operation: 'assemble-short';
  projectId: string;
  shortId: string;
  // Sequences with their plans
  sequences: Array<{
    id: string;
    title: string | null;
    sort_order: number;
    transition_in: string | null;
    transition_out: string | null;
    transition_duration: number;
    plans: Array<{
      id: string;
      video_url: string;
      duration: number;
      sort_order: number;
    }>;
  }>;
  // Optional background music
  music?: {
    asset_url: string;
    volume: number;
    fade_in: number;
    fade_out: number;
  };
}

/**
 * Process an Editly job
 */
export async function processEditlyJob(job: Job<EditlyJobData>): Promise<void> {
  const { data } = job;
  const { jobId, operation } = data;

  console.log(`[Editly] Processing job ${jobId}, operation: ${operation}`);

  try {
    switch (operation) {
      case 'assemble-short':
        await processAssembleShort(data);
        break;
      default:
        throw new Error(`Unknown Editly operation: ${operation}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Editly] Job ${jobId} failed:`, errorMessage);
    await failJob(jobId, errorMessage);
    throw error;
  }
}

/**
 * Assemble a short from sequences using Editly
 */
async function processAssembleShort(data: EditlyJobData): Promise<void> {
  const { jobId, userId, projectId, shortId, sequences, music } = data;

  if (!sequences || sequences.length === 0) {
    throw new Error('No sequences provided for assembly');
  }

  const supabase = getSupabase();
  await startJob(jobId, 'Préparation de l\'assemblage Editly...');

  // Create temp directory
  const tempDir = await createTempDir(jobId);
  const tempFiles: string[] = [];
  const outputPath = join(tempDir, 'output.mp4');
  tempFiles.push(outputPath);

  try {
    // Step 1: Download all videos and convert URLs
    await updateJobProgress(jobId, 10, 'Récupération des vidéos...');

    const sequenceInputs: SequenceInput[] = [];
    let totalClips = 0;
    let downloadedClips = 0;

    // Count total clips
    for (const seq of sequences) {
      totalClips += seq.plans.length;
    }

    // Process each sequence
    for (const sequence of sequences) {
      const clips: SequenceClip[] = [];

      // Sort plans by sort_order
      const sortedPlans = [...sequence.plans].sort((a, b) => a.sort_order - b.sort_order);

      for (const plan of sortedPlans) {
        // Get signed URL for the video
        const videoUrl = await getPublicUrl(plan.video_url);

        // Download video to temp file (Editly works better with local files)
        downloadedClips++;
        const progress = 10 + (downloadedClips / totalClips) * 30;
        await updateJobProgress(jobId, progress, `Téléchargement ${downloadedClips}/${totalClips}...`);

        const tempVideoPath = join(tempDir, `video_${sequence.id}_${plan.id}.mp4`);

        const response = await fetch(videoUrl);
        if (!response.ok) {
          throw new Error(`Failed to download video for plan ${plan.id}: ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        await writeFile(tempVideoPath, Buffer.from(buffer));
        tempFiles.push(tempVideoPath);

        clips.push({
          videoUrl: tempVideoPath,
          duration: plan.duration,
        });
      }

      sequenceInputs.push({
        id: sequence.id,
        title: sequence.title,
        clips,
        transition_in: sequence.transition_in,
        transition_out: sequence.transition_out,
        transition_duration: sequence.transition_duration,
      });
    }

    // Step 2: Download music if provided
    let musicInput: ShortMusicInput | undefined;

    if (music?.asset_url) {
      await updateJobProgress(jobId, 45, 'Téléchargement de la musique...');

      const musicUrl = await getPublicUrl(music.asset_url);
      const tempMusicPath = join(tempDir, 'music.mp3');

      const response = await fetch(musicUrl);
      if (!response.ok) {
        console.warn(`[Editly] Failed to download music: ${response.status}, proceeding without`);
      } else {
        const buffer = await response.arrayBuffer();
        await writeFile(tempMusicPath, Buffer.from(buffer));
        tempFiles.push(tempMusicPath);

        musicInput = {
          audioUrl: tempMusicPath,
          volume: music.volume,
          fadeIn: music.fade_in,
          fadeOut: music.fade_out,
        };
      }
    }

    // Step 3: Run Editly assembly
    await updateJobProgress(jobId, 50, 'Assemblage des séquences...');

    await assembleWithEditly({
      sequences: sequenceInputs,
      music: musicInput,
      outputPath,
      width: 1920,
      height: 1080,
      fps: 30,
    });

    // Step 4: Upload result
    await updateJobProgress(jobId, 85, 'Sauvegarde du résultat...');

    const outputBuffer = await readFile(outputPath);
    const storageKey = `scenes/${userId.replace(/[|]/g, '_')}/${projectId}/${shortId}_editly_${Date.now()}.mp4`;
    const b2Url = await uploadFile(storageKey, outputBuffer, 'video/mp4');

    // Step 5: Update database
    await updateJobProgress(jobId, 95, 'Mise à jour de la base de données...');

    const { error: updateError } = await supabase
      .from('scenes')
      .update({
        assembled_video_url: b2Url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', shortId);

    if (updateError) {
      console.error('[Editly] Failed to update scene:', updateError);
    }

    // Complete job
    await completeJob(jobId, {
      outputUrl: b2Url,
      sequenceCount: sequences.length,
      clipCount: totalClips,
    });

    console.log(`[Editly] Assembly job ${jobId} completed`);

  } finally {
    // Cleanup temp files
    await cleanupTempDir(tempDir, tempFiles);
  }
}
