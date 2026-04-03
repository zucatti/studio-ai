/**
 * BullMQ Queue Definitions
 * Creates workers for each queue
 */

import { Worker, type WorkerOptions } from 'bullmq';
import { redisConfig, QUEUE_NAMES, QUEUE_CONFIG } from '../config.js';
import { registerWorker } from '../utils/graceful-shutdown.js';
import { processVideoGenJob, type VideoGenJobData } from '../processors/video-gen.processor.js';
import { processImageGenJob, type ImageGenJobData } from '../processors/image-gen.processor.js';
import { processAudioGenJob, type AudioGenJobData } from '../processors/audio-gen.processor.js';
import { processFFmpegJob, type FFmpegJobData } from '../processors/ffmpeg.processor.js';
import { processQuickShotGenJob, type QuickShotGenJobData } from '../processors/quick-shot-gen.processor.js';

// Get worker options for a specific queue
function getWorkerOptions(queueName: string): WorkerOptions {
  const config = QUEUE_CONFIG[queueName as keyof typeof QUEUE_CONFIG];
  return {
    connection: redisConfig,
    autorun: true,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
    concurrency: config.concurrency,
    lockDuration: config.timeout,
  };
}

/**
 * Create all workers
 */
export function createWorkers(): Worker[] {
  const workers: Worker[] = [];

  // Video generation worker
  const videoGenWorker = new Worker<VideoGenJobData>(
    QUEUE_NAMES.VIDEO_GEN,
    processVideoGenJob,
    getWorkerOptions(QUEUE_NAMES.VIDEO_GEN)
  );
  videoGenWorker.on('active', (job) => {
    console.log(`[VideoGen] Job ${job.id} started processing`);
  });
  videoGenWorker.on('completed', (job) => {
    console.log(`[VideoGen] Job ${job.id} completed`);
  });
  videoGenWorker.on('failed', (job, error) => {
    console.error(`[VideoGen] Job ${job?.id} failed:`, error.message);
  });
  videoGenWorker.on('error', (error) => {
    console.error(`[VideoGen] Worker error:`, error);
  });
  videoGenWorker.on('stalled', (jobId) => {
    console.warn(`[VideoGen] Job ${jobId} stalled - might be stuck`);
  });
  registerWorker(videoGenWorker);
  workers.push(videoGenWorker);
  console.log(`[Worker] Video generation worker started (concurrency: ${QUEUE_CONFIG[QUEUE_NAMES.VIDEO_GEN].concurrency})`);

  // Image generation worker
  const imageGenWorker = new Worker<ImageGenJobData>(
    QUEUE_NAMES.IMAGE_GEN,
    processImageGenJob,
    getWorkerOptions(QUEUE_NAMES.IMAGE_GEN)
  );
  imageGenWorker.on('active', (job) => {
    console.log(`[ImageGen] Job ${job.id} started processing`);
  });
  imageGenWorker.on('completed', (job) => {
    console.log(`[ImageGen] Job ${job.id} completed`);
  });
  imageGenWorker.on('failed', (job, error) => {
    console.error(`[ImageGen] Job ${job?.id} failed:`, error.message);
  });
  imageGenWorker.on('error', (error) => {
    console.error(`[ImageGen] Worker error:`, error);
  });
  imageGenWorker.on('stalled', (jobId) => {
    console.warn(`[ImageGen] Job ${jobId} stalled`);
  });
  registerWorker(imageGenWorker);
  workers.push(imageGenWorker);
  console.log(`[Worker] Image generation worker started (concurrency: ${QUEUE_CONFIG[QUEUE_NAMES.IMAGE_GEN].concurrency})`);

  // Audio generation worker
  const audioGenWorker = new Worker<AudioGenJobData>(
    QUEUE_NAMES.AUDIO_GEN,
    processAudioGenJob,
    getWorkerOptions(QUEUE_NAMES.AUDIO_GEN)
  );
  audioGenWorker.on('completed', (job) => {
    console.log(`[AudioGen] Job ${job.id} completed`);
  });
  audioGenWorker.on('failed', (job, error) => {
    console.error(`[AudioGen] Job ${job?.id} failed:`, error.message);
  });
  audioGenWorker.on('error', (error) => {
    console.error(`[AudioGen] Worker error:`, error);
  });
  registerWorker(audioGenWorker);
  workers.push(audioGenWorker);
  console.log(`[Worker] Audio generation worker started (concurrency: ${QUEUE_CONFIG[QUEUE_NAMES.AUDIO_GEN].concurrency})`);

  // FFmpeg processing worker
  const ffmpegWorker = new Worker<FFmpegJobData>(
    QUEUE_NAMES.FFMPEG,
    processFFmpegJob,
    getWorkerOptions(QUEUE_NAMES.FFMPEG)
  );
  ffmpegWorker.on('completed', (job) => {
    console.log(`[FFmpeg] Job ${job.id} completed`);
  });
  ffmpegWorker.on('failed', (job, error) => {
    console.error(`[FFmpeg] Job ${job?.id} failed:`, error.message);
  });
  ffmpegWorker.on('error', (error) => {
    console.error(`[FFmpeg] Worker error:`, error);
  });
  registerWorker(ffmpegWorker);
  workers.push(ffmpegWorker);
  console.log(`[Worker] FFmpeg processing worker started (concurrency: ${QUEUE_CONFIG[QUEUE_NAMES.FFMPEG].concurrency})`);

  // Quick-shot generation worker
  const quickShotGenWorker = new Worker<QuickShotGenJobData>(
    QUEUE_NAMES.QUICK_SHOT_GEN,
    processQuickShotGenJob,
    getWorkerOptions(QUEUE_NAMES.QUICK_SHOT_GEN)
  );
  quickShotGenWorker.on('active', (job) => {
    console.log(`[QuickShotGen] Job ${job.id} started processing`);
  });
  quickShotGenWorker.on('completed', (job) => {
    console.log(`[QuickShotGen] Job ${job.id} completed`);
  });
  quickShotGenWorker.on('failed', (job, error) => {
    console.error(`[QuickShotGen] Job ${job?.id} failed:`, error.message);
  });
  quickShotGenWorker.on('error', (error) => {
    console.error(`[QuickShotGen] Worker error:`, error);
  });
  registerWorker(quickShotGenWorker);
  workers.push(quickShotGenWorker);
  console.log(`[Worker] Quick-shot generation worker started (concurrency: ${QUEUE_CONFIG[QUEUE_NAMES.QUICK_SHOT_GEN].concurrency})`);

  return workers;
}
