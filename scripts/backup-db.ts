#!/usr/bin/env npx tsx
/**
 * Database Backup Script
 *
 * Dumps the Supabase PostgreSQL database to B2 with 7-day rotation.
 *
 * Usage:
 *   npx tsx scripts/backup-db.ts
 *
 * Required environment variables:
 *   DATABASE_URL - PostgreSQL connection string (from Supabase dashboard > Settings > Database)
 *   S3_ENDPOINT  - B2 endpoint (e.g., s3.us-west-004.backblazeb2.com)
 *   S3_BUCKET    - B2 bucket name
 *   S3_KEY       - B2 application key ID
 *   S3_SECRET    - B2 application key
 *
 * Cron example (daily at 3am):
 *   0 3 * * * cd /path/to/studio && npx tsx scripts/backup-db.ts >> /var/log/db-backup.log 2>&1
 */

// Load environment variables from .env.local file
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

import { execSync, spawn } from 'child_process';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable, PassThrough } from 'stream';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

// Configuration
const BACKUP_PREFIX = 'backups/db_';
const RETENTION_DAYS = 7;

// Parse environment
const DATABASE_URL = process.env.DATABASE_URL;
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_BUCKET = process.env.S3_BUCKET || 'studio-assets';
const S3_KEY = process.env.S3_KEY;
const S3_SECRET = process.env.S3_SECRET;

// Validate environment
function validateEnv(): void {
  const missing: string[] = [];
  if (!DATABASE_URL) missing.push('DATABASE_URL');
  if (!S3_ENDPOINT) missing.push('S3_ENDPOINT');
  if (!S3_KEY) missing.push('S3_KEY');
  if (!S3_SECRET) missing.push('S3_SECRET');

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    console.error('\nTo get DATABASE_URL from Supabase:');
    console.error('1. Go to Supabase Dashboard > Settings > Database');
    console.error('2. Copy the "Connection string" (URI format)');
    console.error('3. Add it to your .env file as DATABASE_URL=...');
    process.exit(1);
  }
}

// Extract region from B2 endpoint
function getRegion(endpoint: string): string {
  const match = endpoint.match(/s3\.([^.]+)\.backblazeb2/);
  return match ? match[1] : 'us-west-004';
}

// Create S3 client
function createS3Client(): S3Client {
  return new S3Client({
    endpoint: `https://${S3_ENDPOINT}`,
    region: getRegion(S3_ENDPOINT!),
    credentials: {
      accessKeyId: S3_KEY!,
      secretAccessKey: S3_SECRET!,
    },
  });
}

// Generate backup filename with timestamp
function generateBackupKey(): string {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/T/, '_')
    .replace(/:/g, '-')
    .replace(/\..+/, '');
  return `${BACKUP_PREFIX}${timestamp}.sql.gz`;
}

// Parse date from backup key
function parseDateFromKey(key: string): Date | null {
  // Format: backups/db_2026-04-12_03-00-00.sql.gz
  const match = key.match(/db_(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})\.sql\.gz$/);
  if (!match) return null;
  const [, date, hour, minute, second] = match;
  return new Date(`${date}T${hour}:${minute}:${second}Z`);
}

// Run pg_dump and stream to gzip
async function dumpDatabase(): Promise<{ stream: Readable; waitForCompletion: () => Promise<void> }> {
  console.log('[Backup] Starting pg_dump...');

  // Check if pg_dump is available
  try {
    execSync('which pg_dump', { stdio: 'ignore' });
  } catch {
    console.error('[Backup] pg_dump not found. Install PostgreSQL client tools:');
    console.error('  brew install libpq && brew link --force libpq');
    process.exit(1);
  }

  // Create pg_dump process
  const pgDump = spawn('pg_dump', [
    '--no-owner',
    '--no-acl',
    '--clean',
    '--if-exists',
    DATABASE_URL!,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Collect stderr for error reporting
  let stderrOutput = '';
  pgDump.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    stderrOutput += msg + '\n';
    if (msg) console.log(`[pg_dump] ${msg}`);
  });

  // Create gzip stream
  const gzip = createGzip({ level: 9 });
  const output = new PassThrough();

  // Pipe: pg_dump stdout -> gzip -> output
  pipeline(pgDump.stdout, gzip, output).catch((err) => {
    console.error('[Backup] Pipeline error:', err);
  });

  // Track completion state
  let exitCode: number | null = null;
  let exitResolve: (() => void) | null = null;
  let exitReject: ((err: Error) => void) | null = null;

  pgDump.on('close', (code) => {
    exitCode = code;
    if (exitResolve && exitReject) {
      if (code === 0) {
        exitResolve();
      } else {
        exitReject(new Error(`pg_dump failed with exit code ${code}\n${stderrOutput}`));
      }
    }
  });

  // Wait for pg_dump to start
  await new Promise<void>((resolve, reject) => {
    pgDump.on('error', reject);
    setTimeout(resolve, 100);
  });

  // Return stream and a function to check completion
  const waitForCompletion = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      // If already exited, resolve/reject immediately
      if (exitCode !== null) {
        if (exitCode === 0) {
          resolve();
        } else {
          reject(new Error(`pg_dump failed with exit code ${exitCode}\n${stderrOutput}`));
        }
        return;
      }
      // Otherwise wait for close event
      exitResolve = resolve;
      exitReject = reject;
    });
  };

  return { stream: output, waitForCompletion };
}

// Upload backup to B2 with streaming
async function uploadBackup(s3: S3Client, key: string, stream: Readable): Promise<void> {
  console.log(`[Backup] Uploading to b2://${S3_BUCKET}/${key}...`);

  const upload = new Upload({
    client: s3,
    params: {
      Bucket: S3_BUCKET,
      Key: key,
      Body: stream,
      ContentType: 'application/gzip',
      ContentEncoding: 'gzip',
    },
    // Upload in 5MB parts
    partSize: 5 * 1024 * 1024,
    queueSize: 4,
  });

  upload.on('httpUploadProgress', (progress) => {
    if (progress.loaded) {
      const mb = (progress.loaded / 1024 / 1024).toFixed(2);
      process.stdout.write(`\r[Backup] Uploaded ${mb} MB...`);
    }
  });

  await upload.done();
  console.log('\n[Backup] Upload complete');
}

// List existing backups
async function listBackups(s3: S3Client): Promise<{ key: string; date: Date }[]> {
  const response = await s3.send(
    new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: BACKUP_PREFIX,
    })
  );

  const backups: { key: string; date: Date }[] = [];

  for (const obj of response.Contents || []) {
    if (!obj.Key) continue;
    const date = parseDateFromKey(obj.Key);
    if (date) {
      backups.push({ key: obj.Key, date });
    }
  }

  return backups.sort((a, b) => b.date.getTime() - a.date.getTime());
}

// Delete old backups (older than RETENTION_DAYS)
async function cleanupOldBackups(s3: S3Client): Promise<number> {
  const backups = await listBackups(s3);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  const toDelete = backups.filter((b) => b.date < cutoff);

  if (toDelete.length === 0) {
    console.log(`[Backup] No backups older than ${RETENTION_DAYS} days to delete`);
    return 0;
  }

  console.log(`[Backup] Deleting ${toDelete.length} backup(s) older than ${RETENTION_DAYS} days...`);

  await s3.send(
    new DeleteObjectsCommand({
      Bucket: S3_BUCKET,
      Delete: {
        Objects: toDelete.map((b) => ({ Key: b.key })),
      },
    })
  );

  for (const backup of toDelete) {
    console.log(`[Backup] Deleted: ${backup.key}`);
  }

  return toDelete.length;
}

// Main function
async function main(): Promise<void> {
  console.log('========================================');
  console.log('Database Backup Script');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('========================================\n');

  validateEnv();

  const s3 = createS3Client();
  const backupKey = generateBackupKey();

  try {
    // Create database dump and stream it
    const { stream: dumpStream, waitForCompletion } = await dumpDatabase();

    // Upload to B2 (streams while pg_dump runs)
    await uploadBackup(s3, backupKey, dumpStream);

    // Verify pg_dump completed successfully
    await waitForCompletion();

    console.log(`\n[Backup] Successfully created: b2://${S3_BUCKET}/${backupKey}`);

    // Cleanup old backups
    const deleted = await cleanupOldBackups(s3);

    // List remaining backups
    const remaining = await listBackups(s3);
    console.log(`\n[Backup] Current backups (${remaining.length}):`);
    for (const backup of remaining) {
      console.log(`  - ${backup.key} (${backup.date.toISOString()})`);
    }

    console.log('\n========================================');
    console.log('Backup completed successfully');
    console.log(`Finished: ${new Date().toISOString()}`);
    console.log('========================================');

  } catch (error) {
    console.error('\n[Backup] FAILED:', error);
    process.exit(1);
  }
}

main();
