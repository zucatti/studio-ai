/**
 * Graceful Shutdown Handler
 * Ensures workers finish their current jobs before shutting down
 */

import type { Worker } from 'bullmq';

let isShuttingDown = false;
const workers: Worker[] = [];

/**
 * Register a worker for graceful shutdown
 */
export function registerWorker(worker: Worker): void {
  workers.push(worker);
}

/**
 * Check if we're in shutdown mode
 */
export function isShutdown(): boolean {
  return isShuttingDown;
}

/**
 * Initiate graceful shutdown
 */
async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    console.log(`[Shutdown] Already shutting down, ignoring ${signal}`);
    return;
  }

  isShuttingDown = true;
  console.log(`[Shutdown] Received ${signal}, initiating graceful shutdown...`);
  console.log(`[Shutdown] Waiting for ${workers.length} workers to finish current jobs...`);

  // Pause all workers to stop taking new jobs
  const pausePromises = workers.map(async (worker) => {
    try {
      await worker.pause();
      console.log(`[Shutdown] Worker ${worker.name} paused`);
    } catch (error) {
      console.error(`[Shutdown] Failed to pause worker ${worker.name}:`, error);
    }
  });

  await Promise.all(pausePromises);

  // Wait for workers to finish current jobs (with timeout)
  const closeTimeout = 90000; // 90 seconds - less than terminationGracePeriodSeconds
  const startTime = Date.now();

  const closePromises = workers.map(async (worker) => {
    try {
      // Wait for the worker to finish processing current jobs
      await worker.close();
      console.log(`[Shutdown] Worker ${worker.name} closed`);
    } catch (error) {
      console.error(`[Shutdown] Failed to close worker ${worker.name}:`, error);
    }
  });

  // Race against timeout
  await Promise.race([
    Promise.all(closePromises),
    new Promise<void>((resolve) => {
      setTimeout(() => {
        const elapsed = Date.now() - startTime;
        console.warn(`[Shutdown] Timeout after ${elapsed}ms, forcing exit`);
        resolve();
      }, closeTimeout);
    }),
  ]);

  const elapsed = Date.now() - startTime;
  console.log(`[Shutdown] Graceful shutdown completed in ${elapsed}ms`);
  process.exit(0);
}

/**
 * Setup signal handlers for graceful shutdown
 */
export function setupGracefulShutdown(): void {
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('[Worker] Uncaught exception:', error);
    shutdown('uncaughtException');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Worker] Unhandled rejection at:', promise, 'reason:', reason);
    shutdown('unhandledRejection');
  });

  console.log('[Shutdown] Graceful shutdown handlers registered');
}
