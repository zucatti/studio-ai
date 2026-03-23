/**
 * B2 Storage utilities for Worker
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { storageConfig } from './config.js';

// Create S3-compatible client for Backblaze B2
const s3Client = new S3Client({
  endpoint: `https://${storageConfig.endpoint}`,
  region: storageConfig.region,
  credentials: {
    accessKeyId: storageConfig.keyId,
    secretAccessKey: storageConfig.appKey,
  },
});

/**
 * Upload a file to B2
 */
export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: storageConfig.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'max-age=31536000',
    })
  );

  return `b2://${storageConfig.bucket}/${key}`;
}

/**
 * Generate a signed URL for reading a file
 */
export async function getSignedFileUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: storageConfig.bucket,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Download a file from B2
 */
export async function downloadFile(key: string): Promise<Buffer> {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: storageConfig.bucket,
      Key: key,
    })
  );

  const stream = response.Body;
  if (!stream) {
    throw new Error('No body in response');
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

/**
 * Extract storage key from b2:// URL
 */
export function extractStorageKey(b2Url: string): string | null {
  const match = b2Url.match(/^b2:\/\/[^/]+\/(.+)$/);
  return match ? match[1] : null;
}

/**
 * Get public URL from b2:// URL (signed for access)
 */
export async function getPublicUrl(b2Url: string): Promise<string> {
  if (!b2Url.startsWith('b2://')) {
    return b2Url; // Already a public URL
  }

  const key = extractStorageKey(b2Url);
  if (!key) {
    throw new Error(`Invalid b2:// URL: ${b2Url}`);
  }

  return getSignedFileUrl(key);
}

/**
 * Generate a storage key for uploaded files
 */
export function generateStorageKey(
  folder: string,
  userId: string,
  projectId: string,
  identifier: string,
  extension: string
): string {
  const sanitizedUserId = userId.replace(/[|]/g, '_');
  const timestamp = Date.now();
  return `${folder}/${sanitizedUserId}/${projectId}/${identifier}_${timestamp}.${extension}`;
}
