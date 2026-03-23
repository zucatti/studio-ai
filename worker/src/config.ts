/**
 * Worker Configuration
 */

import type { RedisOptions } from 'ioredis';

// Redis connection configuration
export const redisConfig: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  // Password is optional (for local dev without auth)
  ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    if (times > 10) {
      console.error('[Redis] Max retries reached, giving up');
      return null;
    }
    const delay = Math.min(times * 500, 5000);
    console.log(`[Redis] Retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  },
};

// Queue configuration
export const QUEUE_NAMES = {
  VIDEO_GEN: 'video-gen',
  IMAGE_GEN: 'image-gen',
  AUDIO_GEN: 'audio-gen',
  FFMPEG: 'ffmpeg',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const QUEUE_CONFIG: Record<QueueName, { concurrency: number; timeout: number }> = {
  [QUEUE_NAMES.VIDEO_GEN]: { concurrency: 3, timeout: 180000 }, // 3 min
  [QUEUE_NAMES.IMAGE_GEN]: { concurrency: 5, timeout: 90000 }, // 90s
  [QUEUE_NAMES.AUDIO_GEN]: { concurrency: 5, timeout: 30000 }, // 30s
  [QUEUE_NAMES.FFMPEG]: { concurrency: 2, timeout: 120000 }, // 2 min
};

// S3/B2 configuration
export const storageConfig = {
  endpoint: process.env.S3_ENDPOINT || '',
  bucket: process.env.S3_BUCKET || 'studio-assets',
  keyId: process.env.S3_KEY || '',
  appKey: process.env.S3_SECRET || '',
  get region() {
    const match = this.endpoint.match(/s3\.([^.]+)\.backblazeb2/);
    return match ? match[1] : 'us-west-004';
  },
};

// Supabase configuration
export const supabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
};

// AI provider configuration
export const aiConfig = {
  fal: process.env.AI_FAL_KEY || '',
  wavespeed: process.env.AI_WAVESPEED || '',
  elevenLabs: process.env.AI_ELEVEN_LABS || '',
  modelsLab: process.env.AI_MODELS_LAB || '',
};

// Queue producer for adding jobs from within processors
import { Queue } from 'bullmq';

let ffmpegQueue: Queue | null = null;

export function getFFmpegQueue(): Queue {
  if (!ffmpegQueue) {
    ffmpegQueue = new Queue(QUEUE_NAMES.FFMPEG, {
      connection: redisConfig,
    });
  }
  return ffmpegQueue;
}

export async function enqueueFFmpegJob(
  jobId: string,
  data: Record<string, unknown>
): Promise<void> {
  const queue = getFFmpegQueue();
  await queue.add('ffmpeg', { ...data, type: 'ffmpeg' }, { jobId });
  console.log(`[Config] Enqueued FFmpeg job ${jobId}`);
}

// Validate required environment variables
export function validateConfig(): void {
  const required = [
    // REDIS_PASSWORD is optional for local dev
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'S3_ENDPOINT',
    'S3_KEY',
    'S3_SECRET',
    'AI_FAL_KEY',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Log Redis config
  const redisAuth = process.env.REDIS_PASSWORD ? 'with password' : 'no password';
  console.log(`[Config] Redis: ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'} (${redisAuth})`);
  console.log('[Config] All required environment variables present');
}
