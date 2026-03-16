import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Backblaze B2 configuration
const B2_ENDPOINT = process.env.S3_ENDPOINT!;
const B2_KEY_ID = process.env.S3_KEY!;
const B2_APP_KEY = process.env.S3_SECRET!;
const B2_BUCKET = process.env.S3_BUCKET || 'studio-assets';

// Extract region from endpoint (e.g., s3.eu-central-003.backblazeb2.com -> eu-central-003)
const B2_REGION = B2_ENDPOINT?.match(/s3\.([^.]+)\.backblazeb2/)?.[1] || 'us-west-004';

// Create S3-compatible client for Backblaze B2
export const s3Client = new S3Client({
  endpoint: `https://${B2_ENDPOINT}`,
  region: B2_REGION,
  credentials: {
    accessKeyId: B2_KEY_ID,
    secretAccessKey: B2_APP_KEY,
  },
});

export const STORAGE_BUCKET = B2_BUCKET;

/**
 * Upload a file to Backblaze B2
 */
export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
  options?: {
    cacheControl?: string;
    metadata?: Record<string, string>;
  }
): Promise<{ key: string; url: string }> {
  const command = new PutObjectCommand({
    Bucket: B2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: options?.cacheControl || 'max-age=31536000',
    Metadata: options?.metadata,
  });

  await s3Client.send(command);

  // Return the key and a placeholder URL (actual URL will be signed when needed)
  return {
    key,
    url: `b2://${B2_BUCKET}/${key}`,
  };
}

/**
 * Generate a pre-signed URL for accessing a private file
 * @param key - The file key in the bucket
 * @param expiresIn - URL expiration time in seconds (default: 1 hour)
 */
export async function getSignedFileUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: B2_BUCKET,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Generate a pre-signed URL for uploading a file directly to B2
 */
export async function getSignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: B2_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Delete a file from B2
 */
export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: B2_BUCKET,
    Key: key,
  });

  await s3Client.send(command);
}

/**
 * Delete multiple files from B2
 */
export async function deleteFiles(keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  // B2/S3 allows max 1000 objects per request
  const batches = [];
  for (let i = 0; i < keys.length; i += 1000) {
    batches.push(keys.slice(i, i + 1000));
  }

  for (const batch of batches) {
    const command = new DeleteObjectsCommand({
      Bucket: B2_BUCKET,
      Delete: {
        Objects: batch.map((key) => ({ Key: key })),
      },
    });

    await s3Client.send(command);
  }
}

/**
 * List files with a given prefix
 */
export async function listFiles(
  prefix: string,
  maxKeys: number = 1000
): Promise<{ key: string; size: number; lastModified: Date }[]> {
  const command = new ListObjectsV2Command({
    Bucket: B2_BUCKET,
    Prefix: prefix,
    MaxKeys: maxKeys,
  });

  const response = await s3Client.send(command);

  return (response.Contents || []).map((item) => ({
    key: item.Key!,
    size: item.Size || 0,
    lastModified: item.LastModified || new Date(),
  }));
}

/**
 * Check if a file exists
 */
export async function fileExists(key: string): Promise<boolean> {
  try {
    const command = new HeadObjectCommand({
      Bucket: B2_BUCKET,
      Key: key,
    });
    await s3Client.send(command);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file metadata
 */
export async function getFileMetadata(
  key: string
): Promise<{ contentType: string; size: number; lastModified: Date } | null> {
  try {
    const command = new HeadObjectCommand({
      Bucket: B2_BUCKET,
      Key: key,
    });
    const response = await s3Client.send(command);
    return {
      contentType: response.ContentType || 'application/octet-stream',
      size: response.ContentLength || 0,
      lastModified: response.LastModified || new Date(),
    };
  } catch {
    return null;
  }
}

/**
 * Download a file from B2
 */
export async function downloadFile(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: B2_BUCKET,
    Key: key,
  });

  const response = await s3Client.send(command);
  const stream = response.Body;

  if (!stream) {
    throw new Error('No body in response');
  }

  // Convert stream to buffer
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

/**
 * Generate a storage key for a file
 */
export function generateStorageKey(
  userId: string,
  folder: string,
  filename: string
): string {
  const sanitizedUserId = userId.replace(/[|]/g, '_');
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const extension = filename.split('.').pop() || 'bin';

  return `${folder}/${sanitizedUserId}/${timestamp}_${randomStr}.${extension}`;
}

/**
 * Parse a storage URL to get the key
 * Handles both old Supabase URLs and new B2 URLs
 */
export function parseStorageUrl(url: string): { bucket: string; key: string } | null {
  // B2 URL format: b2://bucket/key
  const b2Match = url.match(/^b2:\/\/([^/]+)\/(.+)$/);
  if (b2Match) {
    return { bucket: b2Match[1], key: b2Match[2] };
  }

  // Old Supabase URL format: .../storage/v1/object/public/bucket/key
  const supabaseMatch = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (supabaseMatch) {
    return { bucket: supabaseMatch[1], key: supabaseMatch[2] };
  }

  return null;
}

/**
 * Check if a URL is a B2 storage URL
 */
export function isB2Url(url: string): boolean {
  return url.startsWith('b2://');
}

/**
 * Check if a URL is a legacy Supabase storage URL
 */
export function isSupabaseStorageUrl(url: string): boolean {
  return url.includes('/storage/v1/object/public/');
}
