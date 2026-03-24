/**
 * BullMQ Queue Producers
 * Used by Next.js API routes to enqueue jobs
 */

import { Queue, QueueOptions } from 'bullmq';
import {
  QUEUE_NAMES,
  QueueName,
  VideoGenJobData,
  ImageGenJobData,
  AudioGenJobData,
  FFmpegJobData,
} from './types';

// Redis connection config - lazy loaded to avoid errors at build time
function getRedisConnection() {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    // Password is optional (for local dev without auth)
    ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
    maxRetriesPerRequest: null, // Required for BullMQ
  };
}

// Queue instances - lazy loaded
const queues: Map<QueueName, Queue> = new Map();

// Default queue options
const defaultQueueOptions: Partial<QueueOptions> = {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s initial delay
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000, // Keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
};

/**
 * Get or create a queue instance
 */
function getQueue(name: QueueName): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      ...defaultQueueOptions,
      connection: getRedisConnection(),
    });
    queues.set(name, queue);
  }
  return queue;
}

/**
 * Get the video generation queue
 */
export function getVideoGenQueue(): Queue<VideoGenJobData> {
  return getQueue(QUEUE_NAMES.VIDEO_GEN) as Queue<VideoGenJobData>;
}

/**
 * Get the image generation queue
 */
export function getImageGenQueue(): Queue<ImageGenJobData> {
  return getQueue(QUEUE_NAMES.IMAGE_GEN) as Queue<ImageGenJobData>;
}

/**
 * Get the audio generation queue
 */
export function getAudioGenQueue(): Queue<AudioGenJobData> {
  return getQueue(QUEUE_NAMES.AUDIO_GEN) as Queue<AudioGenJobData>;
}

/**
 * Get the FFmpeg processing queue
 */
export function getFFmpegQueue(): Queue<FFmpegJobData> {
  return getQueue(QUEUE_NAMES.FFMPEG) as Queue<FFmpegJobData>;
}

/**
 * Add a video generation job
 */
export async function enqueueVideoGen(
  data: Omit<VideoGenJobData, 'type'>,
  options?: { priority?: number; delay?: number }
): Promise<string> {
  const queue = getVideoGenQueue();
  const job = await queue.add(
    'video-gen',
    { ...data, type: 'video-gen' },
    {
      jobId: data.jobId,
      priority: options?.priority,
      delay: options?.delay,
    }
  );
  return job.id!;
}

/**
 * Add an image generation job
 */
export async function enqueueImageGen(
  data: Omit<ImageGenJobData, 'type'>,
  options?: { priority?: number; delay?: number }
): Promise<string> {
  console.log(`[BullMQ] Enqueueing image-gen job ${data.jobId}...`);
  try {
    const queue = getImageGenQueue();
    console.log(`[BullMQ] Got queue, adding job...`);
    const job = await queue.add(
      'image-gen',
      { ...data, type: 'image-gen' },
      {
        jobId: data.jobId,
        priority: options?.priority,
        delay: options?.delay,
      }
    );
    console.log(`[BullMQ] Job ${job.id} added successfully`);
    return job.id!;
  } catch (error) {
    console.error(`[BullMQ] Failed to enqueue:`, error);
    throw error;
  }
}

/**
 * Add an audio generation job
 */
export async function enqueueAudioGen(
  data: Omit<AudioGenJobData, 'type'>,
  options?: { priority?: number; delay?: number }
): Promise<string> {
  const queue = getAudioGenQueue();
  const job = await queue.add(
    'audio-gen',
    { ...data, type: 'audio-gen' },
    {
      jobId: data.jobId,
      priority: options?.priority,
      delay: options?.delay,
    }
  );
  return job.id!;
}

/**
 * Add an FFmpeg processing job
 */
export async function enqueueFFmpeg(
  data: Omit<FFmpegJobData, 'type'>,
  options?: { priority?: number; delay?: number }
): Promise<string> {
  const queue = getFFmpegQueue();
  const job = await queue.add(
    'ffmpeg',
    { ...data, type: 'ffmpeg' },
    {
      jobId: data.jobId,
      priority: options?.priority,
      delay: options?.delay,
    }
  );
  return job.id!;
}

/**
 * Close all queue connections
 * Call this during app shutdown
 */
export async function closeQueues(): Promise<void> {
  const closePromises = Array.from(queues.values()).map((q) => q.close());
  await Promise.all(closePromises);
  queues.clear();
}
