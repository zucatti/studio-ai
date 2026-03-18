import { parseStorageUrl, getSignedFileUrl } from '@/lib/storage';

/**
 * Convert any image URL to a publicly accessible URL for fal.ai
 *
 * - B2 URLs (b2://...) are converted to signed URLs
 * - HTTP/HTTPS URLs are returned as-is
 * - fal.ai URLs are returned as-is
 *
 * This avoids unnecessary re-uploads to fal.ai storage,
 * which is faster and more bandwidth-efficient.
 *
 * @param imageUrl - The image URL to convert
 * @param expirationSeconds - How long the signed URL should be valid (default: 1 hour)
 * @returns A publicly accessible URL
 */
export async function getPublicImageUrl(
  imageUrl: string,
  expirationSeconds: number = 3600
): Promise<string> {
  // Already a fal.ai URL - return as-is
  if (imageUrl.includes('fal.media') || imageUrl.includes('fal-cdn')) {
    return imageUrl;
  }

  // Already a public URL - return as-is
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }

  // Convert B2 URLs to signed URLs
  if (imageUrl.startsWith('b2://')) {
    const parsed = parseStorageUrl(imageUrl);
    if (parsed) {
      return await getSignedFileUrl(parsed.key, expirationSeconds);
    }
  }

  // Unknown format - return as-is and hope for the best
  return imageUrl;
}

/**
 * Convert multiple image URLs to publicly accessible URLs
 *
 * @param imageUrls - Array of image URLs to convert
 * @param expirationSeconds - How long signed URLs should be valid
 * @returns Array of publicly accessible URLs
 */
export async function getPublicImageUrls(
  imageUrls: string[],
  expirationSeconds: number = 3600
): Promise<string[]> {
  return Promise.all(
    imageUrls.map(url => getPublicImageUrl(url, expirationSeconds))
  );
}
