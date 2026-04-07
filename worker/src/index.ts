/**
 * Studio Worker Entry Point
 *
 * BullMQ worker process for handling AI generation jobs:
 * - Video generation (Kling, Sora, Veo, OmniHuman)
 * - Image generation (Flux, character refs)
 * - Audio generation (ElevenLabs TTS)
 * - FFmpeg processing (assembly, music overlay)
 */

import { validateConfig, redisConfig } from './config.js';
import { setupGracefulShutdown } from './utils/graceful-shutdown.js';
import { createWorkers } from './queues/index.js';
import { startSnapshotScheduler } from './scheduled/snapshot-scheduler.js';
import { Redis } from 'ioredis';

async function main() {
  console.log('========================================');
  console.log('  Studio Worker v1.0.0');
  console.log('========================================');
  console.log(`  Started at: ${new Date().toISOString()}`);
  console.log(`  Node.js: ${process.version}`);
  console.log('========================================');

  // Validate environment
  try {
    validateConfig();
  } catch (error) {
    console.error('[Startup] Configuration error:', error);
    process.exit(1);
  }

  // Setup graceful shutdown
  setupGracefulShutdown();

  // Test Redis connection
  console.log('[Redis] Connecting...');
  const redis = new Redis(redisConfig);

  redis.on('error', (error: Error) => {
    console.error('[Redis] Connection error:', error);
  });

  redis.on('connect', () => {
    console.log('[Redis] Connected successfully');
  });

  try {
    const pong = await redis.ping();
    if (pong !== 'PONG') {
      throw new Error(`Unexpected ping response: ${pong}`);
    }
    console.log('[Redis] Ping successful');
  } catch (error) {
    console.error('[Redis] Failed to ping:', error);
    process.exit(1);
  }

  // Create workers
  console.log('[Worker] Starting workers...');
  const workers = createWorkers();

  // Start scheduled tasks
  startSnapshotScheduler();

  console.log('========================================');
  console.log(`  ${workers.length} workers running`);
  console.log('  Snapshot scheduler active');
  console.log('  Waiting for jobs...');
  console.log('========================================');

  // Keep process alive
  process.stdin.resume();
}

// Run main
main().catch((error) => {
  console.error('[Fatal] Unhandled error:', error);
  process.exit(1);
});
