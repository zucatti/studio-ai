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
  QuickShotGenJobData,
  EditlyJobData,
} from './types';

// Parse Redis port handling K8s service discovery format (tcp://host:port)
function getRedisPort(): number {
  const portEnv = process.env.REDIS_SERVICE_PORT || process.env.REDIS_PORT || '6379';
  // K8s injects REDIS_PORT as "tcp://host:port" for services named "redis"
  if (portEnv.startsWith('tcp://')) {
    const match = portEnv.match(/:(\d+)$/);
    return match ? parseInt(match[1], 10) : 6379;
  }
  const parsed = parseInt(portEnv, 10);
  return isNaN(parsed) ? 6379 : parsed;
}

// Redis connection config - lazy loaded to avoid errors at build time
function getRedisConnection() {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: getRedisPort(),
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
 * Get the quick-shot generation queue
 */
export function getQuickShotGenQueue(): Queue<QuickShotGenJobData> {
  return getQueue(QUEUE_NAMES.QUICK_SHOT_GEN) as Queue<QuickShotGenJobData>;
}

/**
 * Get the Editly video assembly queue
 */
export function getEditlyQueue(): Queue<EditlyJobData> {
  return getQueue(QUEUE_NAMES.EDITLY) as Queue<EditlyJobData>;
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
 * Add a quick-shot generation job
 */
export async function enqueueQuickShotGen(
  data: Omit<QuickShotGenJobData, 'type'>,
  options?: { priority?: number; delay?: number }
): Promise<string> {
  console.log(`[BullMQ] Enqueueing quick-shot-gen job ${data.jobId}...`);
  try {
    const queue = getQuickShotGenQueue();
    const job = await queue.add(
      'quick-shot-gen',
      { ...data, type: 'quick-shot-gen' },
      {
        jobId: data.jobId,
        priority: options?.priority,
        delay: options?.delay,
      }
    );
    console.log(`[BullMQ] Quick-shot job ${job.id} added successfully`);
    return job.id!;
  } catch (error) {
    console.error(`[BullMQ] Failed to enqueue quick-shot:`, error);
    throw error;
  }
}

/**
 * Add an Editly video assembly job
 */
export async function enqueueEditly(
  data: Omit<EditlyJobData, 'type'>,
  options?: { priority?: number; delay?: number }
): Promise<string> {
  console.log(`[BullMQ] Enqueueing editly job ${data.jobId}...`);
  try {
    const queue = getEditlyQueue();
    const job = await queue.add(
      'editly',
      { ...data, type: 'editly' },
      {
        jobId: data.jobId,
        priority: options?.priority,
        delay: options?.delay,
      }
    );
    console.log(`[BullMQ] Editly job ${job.id} added successfully`);
    return job.id!;
  } catch (error) {
    console.error(`[BullMQ] Failed to enqueue editly:`, error);
    throw error;
  }
}

/**
 * Cancel a BullMQ job by ID
 * Tries to find and remove the job from all queues
 */
export async function cancelBullMQJob(jobId: string): Promise<boolean> {
  console.log(`[BullMQ] Attempting to cancel job ${jobId}...`);

  // Try all queues
  for (const [name, queue] of queues.entries()) {
    try {
      const job = await queue.getJob(jobId);
      if (job) {
        const state = await job.getState();
        console.log(`[BullMQ] Found job ${jobId} in queue ${name}, state: ${state}`);

        if (state === 'waiting' || state === 'delayed') {
          // Job is waiting, can be removed directly
          await job.remove();
          console.log(`[BullMQ] Removed waiting job ${jobId}`);
          return true;
        } else if (state === 'active') {
          // Job is running - mark for cancellation (worker will check)
          // We can't directly stop it, but we can update progress in Supabase
          // which the worker can check
          console.log(`[BullMQ] Job ${jobId} is active, marking for cancellation`);
          await job.moveToFailed(new Error('Cancelled by user'), '', true);
          return true;
        } else if (state === 'completed' || state === 'failed') {
          console.log(`[BullMQ] Job ${jobId} already finished (${state})`);
          return true;
        }
      }
    } catch (error) {
      console.error(`[BullMQ] Error checking queue ${name}:`, error);
    }
  }

  // Job not found in any queue - might be in a queue we haven't initialized yet
  // Try initializing all queues and checking
  const allQueueNames = Object.values(QUEUE_NAMES);
  for (const name of allQueueNames) {
    if (!queues.has(name)) {
      try {
        const queue = getQueue(name);
        const job = await queue.getJob(jobId);
        if (job) {
          const state = await job.getState();
          console.log(`[BullMQ] Found job ${jobId} in newly-opened queue ${name}, state: ${state}`);

          if (state === 'waiting' || state === 'delayed') {
            await job.remove();
            return true;
          } else if (state === 'active') {
            await job.moveToFailed(new Error('Cancelled by user'), '', true);
            return true;
          }
          return true;
        }
      } catch (error) {
        console.error(`[BullMQ] Error checking queue ${name}:`, error);
      }
    }
  }

  console.log(`[BullMQ] Job ${jobId} not found in any queue`);
  return false;
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
