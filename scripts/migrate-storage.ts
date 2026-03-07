/**
 * Script to migrate storage files from local Supabase to remote
 * Run with: npx tsx scripts/migrate-storage.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON_KEY = process.env.LOCAL_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const LOCAL_SERVICE_KEY = process.env.LOCAL_SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

// Remote config - get from environment or .env file
const REMOTE_URL = process.env.REMOTE_SUPABASE_URL;
const REMOTE_SERVICE_KEY = process.env.REMOTE_SUPABASE_SERVICE_KEY;

if (!REMOTE_URL || !REMOTE_SERVICE_KEY) {
  console.error('❌ Missing REMOTE_SUPABASE_URL or REMOTE_SUPABASE_SERVICE_KEY');
  console.log('\nSet these environment variables:');
  console.log('  export REMOTE_SUPABASE_URL=https://pepexyobsmedoadxehhv.supabase.co');
  console.log('  export REMOTE_SUPABASE_SERVICE_KEY=your-service-role-key');
  console.log('\nYou can find your service role key in:');
  console.log('  Supabase Dashboard → Project Settings → API → service_role key');
  process.exit(1);
}

const localSupabase = createClient(LOCAL_URL, LOCAL_SERVICE_KEY);
const remoteSupabase = createClient(REMOTE_URL, REMOTE_SERVICE_KEY);

const BUCKETS = ['project-assets', 'project-thumbnails'];

interface MigrationResult {
  bucket: string;
  file: string;
  oldUrl: string;
  newUrl: string;
}

async function listAllFiles(supabase: any, bucket: string, folder = ''): Promise<string[]> {
  const files: string[] = [];

  const { data, error } = await supabase.storage.from(bucket).list(folder, {
    limit: 1000,
  });

  if (error) {
    console.error(`Error listing ${bucket}/${folder}:`, error.message);
    return files;
  }

  for (const item of data || []) {
    const fullPath = folder ? `${folder}/${item.name}` : item.name;

    if (item.id === null) {
      // It's a folder, recurse
      const subFiles = await listAllFiles(supabase, bucket, fullPath);
      files.push(...subFiles);
    } else {
      // It's a file
      files.push(fullPath);
    }
  }

  return files;
}

async function migrateFile(bucket: string, filePath: string): Promise<MigrationResult | null> {
  try {
    // Download from local
    const { data: fileData, error: downloadError } = await localSupabase.storage
      .from(bucket)
      .download(filePath);

    if (downloadError) {
      console.error(`  ❌ Download error for ${filePath}:`, downloadError.message);
      return null;
    }

    // Upload to remote
    const { data: uploadData, error: uploadError } = await remoteSupabase.storage
      .from(bucket)
      .upload(filePath, fileData, {
        upsert: true,
        contentType: fileData.type,
      });

    if (uploadError) {
      console.error(`  ❌ Upload error for ${filePath}:`, uploadError.message);
      return null;
    }

    // Get public URLs
    const { data: localUrlData } = localSupabase.storage.from(bucket).getPublicUrl(filePath);
    const { data: remoteUrlData } = remoteSupabase.storage.from(bucket).getPublicUrl(filePath);

    console.log(`  ✅ ${filePath}`);

    return {
      bucket,
      file: filePath,
      oldUrl: localUrlData.publicUrl,
      newUrl: remoteUrlData.publicUrl,
    };
  } catch (error) {
    console.error(`  ❌ Error migrating ${filePath}:`, error);
    return null;
  }
}

async function updateDatabaseUrls(migrations: MigrationResult[]) {
  console.log('\n📝 Updating database URLs...');

  // Build URL mapping
  const urlMap = new Map<string, string>();
  for (const m of migrations) {
    urlMap.set(m.oldUrl, m.newUrl);
  }

  // Tables with URL columns
  const tables = [
    { name: 'projects', columns: ['thumbnail_url'] },
    { name: 'characters', columns: ['reference_images'] },
    { name: 'props', columns: ['reference_images'] },
    { name: 'locations', columns: ['reference_images'] },
    { name: 'shots', columns: ['storyboard_image_url', 'first_frame_url', 'last_frame_url', 'generated_video_url'] },
  ];

  for (const table of tables) {
    const { data: rows, error } = await remoteSupabase.from(table.name).select('id, ' + table.columns.join(', '));

    if (error) {
      console.error(`  ❌ Error reading ${table.name}:`, error.message);
      continue;
    }

    for (const row of rows || []) {
      const updates: any = {};
      let hasChanges = false;

      for (const col of table.columns) {
        const value = row[col];
        if (!value) continue;

        if (Array.isArray(value)) {
          // Array of URLs (reference_images)
          const newArray = value.map((url: string) => {
            const newUrl = urlMap.get(url);
            if (newUrl) {
              hasChanges = true;
              return newUrl;
            }
            return url;
          });
          if (hasChanges) updates[col] = newArray;
        } else if (typeof value === 'string' && value.includes('127.0.0.1')) {
          // Single URL
          const newUrl = urlMap.get(value);
          if (newUrl) {
            hasChanges = true;
            updates[col] = newUrl;
          }
        }
      }

      if (hasChanges) {
        const { error: updateError } = await remoteSupabase
          .from(table.name)
          .update(updates)
          .eq('id', row.id);

        if (updateError) {
          console.error(`  ❌ Error updating ${table.name}/${row.id}:`, updateError.message);
        } else {
          console.log(`  ✅ Updated ${table.name}/${row.id}`);
        }
      }
    }
  }
}

async function main() {
  console.log('🚀 Starting storage migration...\n');
  console.log(`Local:  ${LOCAL_URL}`);
  console.log(`Remote: ${REMOTE_URL}\n`);

  const allMigrations: MigrationResult[] = [];

  for (const bucket of BUCKETS) {
    console.log(`\n📦 Bucket: ${bucket}`);

    // Check if bucket exists on remote, create if not
    const { data: buckets } = await remoteSupabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === bucket);

    if (!bucketExists) {
      console.log(`  Creating bucket ${bucket}...`);
      const { error } = await remoteSupabase.storage.createBucket(bucket, {
        public: true,
      });
      if (error) {
        console.error(`  ❌ Error creating bucket:`, error.message);
        continue;
      }
    }

    // List all files in local bucket
    const files = await listAllFiles(localSupabase, bucket);
    console.log(`  Found ${files.length} files`);

    // Migrate each file
    for (const file of files) {
      const result = await migrateFile(bucket, file);
      if (result) {
        allMigrations.push(result);
      }
    }
  }

  console.log(`\n✅ Migrated ${allMigrations.length} files`);

  // Update database URLs
  if (allMigrations.length > 0) {
    await updateDatabaseUrls(allMigrations);
  }

  console.log('\n🎉 Migration complete!');
}

main().catch(console.error);
