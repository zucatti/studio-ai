/**
 * Migration script: Supabase Storage -> Backblaze B2
 *
 * This script:
 * 1. Lists all files in Supabase Storage buckets
 * 2. Downloads each file
 * 3. Uploads to Backblaze B2
 * 4. Updates database URLs to use the new b2:// format
 *
 * Usage: npx ts-node scripts/migrate-to-b2.ts
 */

import { createClient } from '@supabase/supabase-js';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// B2 configuration
const B2_ENDPOINT = process.env.S3_ENDPOINT!;
const B2_KEY_ID = process.env.S3_KEY!;
const B2_APP_KEY = process.env.S3_SECRET!;
const B2_BUCKET = process.env.S3_BUCKET || 'studio-assets';
const B2_REGION = B2_ENDPOINT?.match(/s3\.([^.]+)\.backblazeb2/)?.[1] || 'us-west-004';

// Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// B2 S3 client
const s3Client = new S3Client({
  endpoint: `https://${B2_ENDPOINT}`,
  region: B2_REGION,
  credentials: {
    accessKeyId: B2_KEY_ID,
    secretAccessKey: B2_APP_KEY,
  },
});

// Buckets to migrate
const BUCKETS = ['project-assets', 'project-thumbnails'];

interface MigrationStats {
  total: number;
  migrated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

async function checkFileExistsInB2(key: string): Promise<boolean> {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: B2_BUCKET,
        Key: key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

async function uploadToB2(
  key: string,
  data: Buffer,
  contentType: string
): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: B2_BUCKET,
      Key: key,
      Body: data,
      ContentType: contentType,
      CacheControl: 'max-age=31536000',
    })
  );
}

async function migrateFile(
  bucket: string,
  path: string,
  stats: MigrationStats
): Promise<string | null> {
  const key = `${bucket}/${path}`;

  try {
    // Check if already exists in B2
    const exists = await checkFileExistsInB2(key);
    if (exists) {
      console.log(`  [SKIP] Already exists: ${key}`);
      stats.skipped++;
      return `b2://${B2_BUCKET}/${key}`;
    }

    // Download from Supabase
    const { data, error } = await supabase.storage.from(bucket).download(path);

    if (error || !data) {
      console.error(`  [ERROR] Failed to download ${path}:`, error?.message);
      stats.failed++;
      stats.errors.push(`Download failed: ${path} - ${error?.message}`);
      return null;
    }

    // Get content type
    const contentType = data.type || 'application/octet-stream';

    // Convert to buffer
    const buffer = Buffer.from(await data.arrayBuffer());

    // Upload to B2
    await uploadToB2(key, buffer, contentType);
    console.log(`  [OK] Migrated: ${key} (${(buffer.length / 1024).toFixed(1)} KB)`);
    stats.migrated++;

    return `b2://${B2_BUCKET}/${key}`;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`  [ERROR] Failed to migrate ${path}:`, errMsg);
    stats.failed++;
    stats.errors.push(`Migration failed: ${path} - ${errMsg}`);
    return null;
  }
}

async function listAllFiles(bucket: string): Promise<string[]> {
  const files: string[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list('', {
      limit,
      offset,
    });

    if (error) {
      console.error(`Error listing files in ${bucket}:`, error);
      break;
    }

    if (!data || data.length === 0) break;

    // Handle folders recursively
    for (const item of data) {
      if (item.id === null) {
        // It's a folder, list its contents
        const folderFiles = await listFilesInFolder(bucket, item.name);
        files.push(...folderFiles);
      } else {
        files.push(item.name);
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return files;
}

async function listFilesInFolder(bucket: string, folder: string): Promise<string[]> {
  const files: string[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(folder, {
      limit,
      offset,
    });

    if (error) {
      console.error(`Error listing files in ${bucket}/${folder}:`, error);
      break;
    }

    if (!data || data.length === 0) break;

    for (const item of data) {
      if (item.id === null) {
        // Nested folder
        const nestedFiles = await listFilesInFolder(bucket, `${folder}/${item.name}`);
        files.push(...nestedFiles);
      } else {
        files.push(`${folder}/${item.name}`);
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return files;
}

async function updateDatabaseUrls(): Promise<void> {
  console.log('\n--- Updating database URLs ---\n');

  // Tables and columns that store storage URLs
  const urlColumns = [
    { table: 'projects', column: 'thumbnail_url' },
    { table: 'shots', column: 'storyboard_image_url' },
    { table: 'global_assets', column: 'reference_images', isArray: true },
    { table: 'characters', column: 'reference_images', isArray: true },
    { table: 'props', column: 'reference_images', isArray: true },
    { table: 'locations', column: 'reference_images', isArray: true },
  ];

  for (const { table, column, isArray } of urlColumns) {
    console.log(`Updating ${table}.${column}...`);

    // Get all rows with non-null URLs
    const { data: rows, error } = await supabase
      .from(table)
      .select(`id, ${column}`)
      .not(column, 'is', null);

    if (error) {
      console.error(`  Error fetching ${table}:`, error.message);
      continue;
    }

    if (!rows || rows.length === 0) {
      console.log(`  No URLs to update`);
      continue;
    }

    let updated = 0;
    for (const row of rows) {
      const oldValue = row[column];
      if (!oldValue) continue;

      let newValue: string | string[];

      if (isArray && Array.isArray(oldValue)) {
        newValue = oldValue.map((url: string) => convertUrl(url));
        if (JSON.stringify(newValue) === JSON.stringify(oldValue)) continue;
      } else if (typeof oldValue === 'string') {
        newValue = convertUrl(oldValue);
        if (newValue === oldValue) continue;
      } else {
        continue;
      }

      const { error: updateError } = await supabase
        .from(table)
        .update({ [column]: newValue })
        .eq('id', row.id);

      if (updateError) {
        console.error(`  Error updating ${table} row ${row.id}:`, updateError.message);
      } else {
        updated++;
      }
    }

    console.log(`  Updated ${updated} rows`);
  }
}

function convertUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('b2://')) return url; // Already converted

  // Match Supabase storage URL pattern
  const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (match) {
    const [, bucket, path] = match;
    return `b2://${B2_BUCKET}/${bucket}/${path}`;
  }

  return url; // Return unchanged if not a Supabase URL
}

async function main() {
  console.log('===========================================');
  console.log('   Supabase Storage -> Backblaze B2');
  console.log('===========================================\n');

  console.log('Configuration:');
  console.log(`  Supabase: ${supabaseUrl}`);
  console.log(`  B2 Endpoint: ${B2_ENDPOINT}`);
  console.log(`  B2 Bucket: ${B2_BUCKET}`);
  console.log(`  B2 Region: ${B2_REGION}`);
  console.log();

  const stats: MigrationStats = {
    total: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const bucket of BUCKETS) {
    console.log(`\n--- Migrating bucket: ${bucket} ---\n`);

    const files = await listAllFiles(bucket);
    console.log(`Found ${files.length} files\n`);

    stats.total += files.length;

    for (const file of files) {
      await migrateFile(bucket, file, stats);
    }
  }

  // Update database URLs
  await updateDatabaseUrls();

  // Summary
  console.log('\n===========================================');
  console.log('   Migration Summary');
  console.log('===========================================');
  console.log(`Total files: ${stats.total}`);
  console.log(`Migrated: ${stats.migrated}`);
  console.log(`Skipped (already exists): ${stats.skipped}`);
  console.log(`Failed: ${stats.failed}`);

  if (stats.errors.length > 0) {
    console.log('\nErrors:');
    for (const err of stats.errors) {
      console.log(`  - ${err}`);
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
