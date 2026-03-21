/**
 * B2/S3 Storage Utilities
 *
 * Handles file operations for Backblaze B2 (S3-compatible)
 */

import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

// Singleton S3 client
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: process.env.B2_ENDPOINT,
      region: process.env.B2_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.B2_KEY_ID || '',
        secretAccessKey: process.env.B2_APP_KEY || '',
      },
    });
  }
  return s3Client;
}

const B2_BUCKET = process.env.B2_BUCKET || '';

/**
 * Extract the S3 key from various URL formats
 * Supports:
 * - b2://bucket/path/to/file
 * - https://bucket.s3.region.backblazeb2.com/path/to/file
 * - https://f005.backblazeb2.com/file/bucket/path/to/file
 * - Direct key: path/to/file
 */
export function extractKeyFromUrl(url: string): string | null {
  if (!url) return null;

  // b2://bucket/key format
  const b2Match = url.match(/^b2:\/\/[^/]+\/(.+)$/);
  if (b2Match) return b2Match[1];

  // S3-style URL
  const s3Match = url.match(/\.backblazeb2\.com\/(.+)$/);
  if (s3Match) return s3Match[1];

  // B2 native URL: /file/bucket/key
  const b2NativeMatch = url.match(/\/file\/[^/]+\/(.+)$/);
  if (b2NativeMatch) return b2NativeMatch[1];

  // If it looks like a key (no protocol), return as-is
  if (!url.includes('://')) return url;

  return null;
}

/**
 * Delete a single file from B2
 */
export async function deleteFromB2(urlOrKey: string): Promise<boolean> {
  const key = extractKeyFromUrl(urlOrKey);
  if (!key) {
    console.warn(`[B2] Could not extract key from: ${urlOrKey}`);
    return false;
  }

  try {
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: B2_BUCKET,
        Key: key,
      })
    );
    console.log(`[B2] Deleted: ${key}`);
    return true;
  } catch (error) {
    console.error(`[B2] Failed to delete ${key}:`, error);
    return false;
  }
}

/**
 * Delete multiple files from B2
 */
export async function deleteMultipleFromB2(urlsOrKeys: (string | null | undefined)[]): Promise<number> {
  const validUrls = urlsOrKeys.filter((u): u is string => !!u);
  let deletedCount = 0;

  for (const url of validUrls) {
    const success = await deleteFromB2(url);
    if (success) deletedCount++;
  }

  return deletedCount;
}

/**
 * Delete all files with a given prefix (e.g., all files for a shot)
 */
export async function deleteByPrefix(prefix: string): Promise<number> {
  try {
    const client = getS3Client();

    // List all objects with the prefix
    const listResponse = await client.send(
      new ListObjectsV2Command({
        Bucket: B2_BUCKET,
        Prefix: prefix,
      })
    );

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      console.log(`[B2] No files found with prefix: ${prefix}`);
      return 0;
    }

    // Delete each object
    let deletedCount = 0;
    for (const obj of listResponse.Contents) {
      if (obj.Key) {
        try {
          await client.send(
            new DeleteObjectCommand({
              Bucket: B2_BUCKET,
              Key: obj.Key,
            })
          );
          deletedCount++;
          console.log(`[B2] Deleted: ${obj.Key}`);
        } catch (error) {
          console.error(`[B2] Failed to delete ${obj.Key}:`, error);
        }
      }
    }

    return deletedCount;
  } catch (error) {
    console.error(`[B2] Failed to list/delete prefix ${prefix}:`, error);
    return 0;
  }
}

/**
 * Clean up all storage files associated with a shot
 */
export async function cleanupShotStorage(
  userId: string,
  projectId: string,
  shotId: string,
  specificUrls?: {
    storyboardImageUrl?: string | null;
    firstFrameUrl?: string | null;
    lastFrameUrl?: string | null;
    generatedVideoUrl?: string | null;
    dialogueAudioUrl?: string | null;
  }
): Promise<number> {
  let deletedCount = 0;

  // If specific URLs provided, delete those
  if (specificUrls) {
    deletedCount += await deleteMultipleFromB2([
      specificUrls.storyboardImageUrl,
      specificUrls.firstFrameUrl,
      specificUrls.lastFrameUrl,
      specificUrls.generatedVideoUrl,
      specificUrls.dialogueAudioUrl,
    ]);
  }

  // Also try to delete by prefix patterns (catches any orphaned files)
  const sanitizedUserId = userId.replace(/[|]/g, '_');

  // Video files: videos/{userId}/{projectId}/{shotId}_*
  deletedCount += await deleteByPrefix(`videos/${sanitizedUserId}/${projectId}/${shotId}_`);

  // Audio files: audio/{userId}/{projectId}/{shotId}_*
  deletedCount += await deleteByPrefix(`audio/${sanitizedUserId}/${projectId}/${shotId}_`);

  return deletedCount;
}
