/**
 * Provider-specific result mappings for extracting data from different AI providers
 */

export type ProviderType = 'fal' | 'elevenlabs' | 'runway';

interface ExtractedResult {
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

type ResultExtractor = (payload: Record<string, unknown>) => ExtractedResult;

/**
 * fal.ai result extractor
 * Structures:
 * - Queue result: { data: { images: [{ url }] } }
 * - Webhook: { images: [{ url }] }
 * - Some models: { image: { url } }
 * - Some models: { output: "url" }
 */
const falExtractor: ResultExtractor = (payload) => {
  // Unwrap data if present (queue.result wraps in data)
  const data = (payload.data as Record<string, unknown>) || payload;

  let imageUrl: string | undefined;
  let videoUrl: string | undefined;

  // Images array (most common)
  if (data.images && Array.isArray(data.images) && data.images.length > 0) {
    const firstImage = data.images[0] as { url?: string };
    imageUrl = firstImage?.url;
  }
  // Single image object
  else if (data.image && typeof data.image === 'object') {
    imageUrl = (data.image as { url?: string })?.url;
  }
  // Direct output URL
  else if (data.output && typeof data.output === 'string') {
    imageUrl = data.output;
  }
  // Video output
  else if (data.video && typeof data.video === 'object') {
    videoUrl = (data.video as { url?: string })?.url;
  }
  else if (data.video_url && typeof data.video_url === 'string') {
    videoUrl = data.video_url;
  }

  return { imageUrl, videoUrl };
};

/**
 * Runway ML result extractor
 * Structure: task.output[0] contains video URL
 */
const runwayExtractor: ResultExtractor = (payload) => {
  let videoUrl: string | undefined;
  let imageUrl: string | undefined;

  // Output array
  if (payload.output && Array.isArray(payload.output) && payload.output.length > 0) {
    videoUrl = payload.output[0] as string;
  }
  // Direct output URL
  else if (payload.output && typeof payload.output === 'string') {
    videoUrl = payload.output;
  }
  // Artifacts array (Gen-4)
  else if (payload.artifacts && Array.isArray(payload.artifacts) && payload.artifacts.length > 0) {
    const artifact = payload.artifacts[0] as { url?: string };
    videoUrl = artifact?.url;
  }
  // Image output
  else if (payload.image && typeof payload.image === 'object') {
    imageUrl = (payload.image as { url?: string })?.url;
  }

  return { imageUrl, videoUrl };
};

/**
 * ElevenLabs result extractor
 * Structure: { audio_url } or binary audio data
 */
const elevenlabsExtractor: ResultExtractor = (payload) => {
  return {
    audioUrl: (payload.audio_url || payload.url) as string | undefined,
  };
};

/**
 * Provider extractors registry
 */
const extractors: Record<ProviderType, ResultExtractor> = {
  fal: falExtractor,
  elevenlabs: elevenlabsExtractor,
  runway: runwayExtractor,
};

/**
 * Detect provider from endpoint string
 */
export function detectProvider(endpoint: string): ProviderType {
  if (endpoint.includes('fal-ai') || endpoint.includes('fal.ai')) {
    return 'fal';
  }
  if (endpoint.includes('runway') || endpoint.includes('runwayml')) {
    return 'runway';
  }
  if (endpoint.includes('elevenlabs')) {
    return 'elevenlabs';
  }
  // Default to fal
  return 'fal';
}

/**
 * Extract result from provider payload
 */
export function extractProviderResult(
  payload: Record<string, unknown>,
  provider: ProviderType | string
): ExtractedResult {
  const providerType = typeof provider === 'string' && provider in extractors
    ? provider as ProviderType
    : detectProvider(provider);

  const extractor = extractors[providerType];
  return extractor(payload);
}

/**
 * Get image URL from any provider payload
 */
export function extractImageUrl(
  payload: Record<string, unknown>,
  endpoint?: string
): string | null {
  const provider = endpoint ? detectProvider(endpoint) : 'fal';
  const result = extractProviderResult(payload, provider);
  return result.imageUrl || null;
}

/**
 * Get video URL from any provider payload
 */
export function extractVideoUrl(
  payload: Record<string, unknown>,
  endpoint?: string
): string | null {
  const provider = endpoint ? detectProvider(endpoint) : 'fal';
  const result = extractProviderResult(payload, provider);
  return result.videoUrl || null;
}

/**
 * Get audio URL from any provider payload
 */
export function extractAudioUrl(
  payload: Record<string, unknown>,
  endpoint?: string
): string | null {
  const provider = endpoint ? detectProvider(endpoint) : 'elevenlabs';
  const result = extractProviderResult(payload, provider);
  return result.audioUrl || null;
}
