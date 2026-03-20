'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// Default expiration buffer (5 minutes before actual expiry)
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

// Default expiry: 6 hours for better caching
const DEFAULT_EXPIRES = 6 * 60 * 60; // 6 hours in seconds

// LocalStorage key for persistent cache
const CACHE_STORAGE_KEY = 'signed-url-cache';

// Cache for signed URLs (in-memory, persists across re-renders)
const urlCache = new Map<string, { signedUrl: string; expiresAt: number }>();

// Load cache from localStorage on init
function loadCacheFromStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const stored = localStorage.getItem(CACHE_STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored) as Record<string, { signedUrl: string; expiresAt: number }>;
      const now = Date.now();
      // Only load non-expired entries
      for (const [url, entry] of Object.entries(data)) {
        if (entry.expiresAt > now) {
          urlCache.set(url, entry);
        }
      }
    }
  } catch (e) {
    // Ignore storage errors
  }
}

// Save cache to localStorage (debounced)
let saveTimeout: NodeJS.Timeout | null = null;
function saveCacheToStorage(): void {
  if (typeof window === 'undefined') return;
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      const data: Record<string, { signedUrl: string; expiresAt: number }> = {};
      const now = Date.now();
      // Only save non-expired entries
      for (const [url, entry] of urlCache.entries()) {
        if (entry.expiresAt > now) {
          data[url] = entry;
        }
      }
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // Ignore storage errors (quota exceeded, etc.)
    }
  }, 1000); // Debounce saves by 1 second
}

// Initialize cache from storage
let cacheInitialized = false;
function ensureCacheInitialized(): void {
  if (!cacheInitialized && typeof window !== 'undefined') {
    cacheInitialized = true;
    loadCacheFromStorage();
  }
}

/**
 * Check if a URL is a B2 storage URL that needs signing
 */
export function isB2Url(url: string | null | undefined): boolean {
  return url?.startsWith('b2://') ?? false;
}

/**
 * Check if a URL is a legacy Supabase storage URL
 */
export function isSupabaseStorageUrl(url: string | null | undefined): boolean {
  return url?.includes('/storage/v1/object/public/') ?? false;
}

/**
 * Hook to get a signed URL for a B2 storage URL
 * Returns the signed URL and loading state
 */
export function useSignedUrl(
  url: string | null | undefined,
  options?: { expires?: number }
): { signedUrl: string | null; isLoading: boolean; error: Error | null } {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const expires = options?.expires ?? DEFAULT_EXPIRES;

  useEffect(() => {
    ensureCacheInitialized();

    if (!url) {
      setSignedUrl(null);
      return;
    }

    // If not a B2 URL, use as-is
    if (!isB2Url(url)) {
      setSignedUrl(url);
      return;
    }

    // Check cache
    const cached = urlCache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      setSignedUrl(cached.signedUrl);
      return;
    }

    // Fetch signed URL
    setIsLoading(true);
    setError(null);

    fetch('/api/storage/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [url], expires }),
    })
      .then((res) => res.json())
      .then((data) => {
        const signed = data.signedUrls?.[url];
        if (signed) {
          // Cache with expiry
          urlCache.set(url, {
            signedUrl: signed,
            expiresAt: Date.now() + expires * 1000 - EXPIRY_BUFFER_MS,
          });
          saveCacheToStorage();
          setSignedUrl(signed);
        } else {
          setError(new Error('Failed to get signed URL'));
        }
      })
      .catch((err) => {
        console.error('Error signing URL:', err);
        setError(err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [url, expires]);

  return { signedUrl, isLoading, error };
}

/**
 * Hook to get signed URLs for multiple B2 storage URLs
 * Batches requests for efficiency
 */
export function useSignedUrls(
  urls: (string | null | undefined)[],
  options?: { expires?: number }
): {
  signedUrls: Record<string, string>;
  isLoading: boolean;
  error: Error | null;
} {
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const expires = options?.expires ?? DEFAULT_EXPIRES;

  // Use ref to track last processed URLs
  const lastUrlsRef = useRef<string>('');

  useEffect(() => {
    ensureCacheInitialized();
    const validUrls = urls.filter((u): u is string => !!u);
    const urlsKey = validUrls.sort().join('|');

    // Skip if URLs haven't changed
    if (urlsKey === lastUrlsRef.current) {
      return;
    }
    lastUrlsRef.current = urlsKey;

    if (validUrls.length === 0) {
      setSignedUrls({});
      return;
    }

    // Separate B2 URLs that need signing from regular URLs
    const b2Urls: string[] = [];
    const regularUrls: Record<string, string> = {};
    const cachedUrls: Record<string, string> = {};

    for (const url of validUrls) {
      if (!isB2Url(url)) {
        regularUrls[url] = url;
      } else {
        // Check cache
        const cached = urlCache.get(url);
        if (cached && cached.expiresAt > Date.now()) {
          cachedUrls[url] = cached.signedUrl;
        } else {
          b2Urls.push(url);
        }
      }
    }

    // If all URLs are cached or regular, use them directly
    if (b2Urls.length === 0) {
      setSignedUrls({ ...regularUrls, ...cachedUrls });
      return;
    }

    // Fetch signed URLs for uncached B2 URLs
    setIsLoading(true);
    setError(null);

    fetch('/api/storage/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: b2Urls, expires }),
    })
      .then((res) => res.json())
      .then((data) => {
        const newSignedUrls: Record<string, string> = {
          ...regularUrls,
          ...cachedUrls,
        };

        for (const [originalUrl, signedUrl] of Object.entries(
          data.signedUrls || {}
        )) {
          // Cache the signed URL
          urlCache.set(originalUrl, {
            signedUrl: signedUrl as string,
            expiresAt: Date.now() + expires * 1000 - EXPIRY_BUFFER_MS,
          });
          newSignedUrls[originalUrl] = signedUrl as string;
        }
        saveCacheToStorage();

        setSignedUrls(newSignedUrls);
      })
      .catch((err) => {
        console.error('Error signing URLs:', err);
        setError(err);
        // Fall back to cached + regular URLs
        setSignedUrls({ ...regularUrls, ...cachedUrls });
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [urls, expires]);

  return { signedUrls, isLoading, error };
}

/**
 * Utility function to get a signed URL (non-hook version for event handlers)
 */
export async function getSignedUrl(
  url: string,
  expires: number = DEFAULT_EXPIRES
): Promise<string> {
  ensureCacheInitialized();

  // If not a B2 URL, return as-is
  if (!isB2Url(url)) {
    return url;
  }

  // Check cache
  const cached = urlCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.signedUrl;
  }

  // Fetch signed URL
  const res = await fetch('/api/storage/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: [url], expires }),
  });

  const data = await res.json();
  const signedUrl = data.signedUrls?.[url];

  if (signedUrl) {
    // Cache the signed URL
    urlCache.set(url, {
      signedUrl,
      expiresAt: Date.now() + expires * 1000 - EXPIRY_BUFFER_MS,
    });
    saveCacheToStorage();
    return signedUrl;
  }

  throw new Error('Failed to get signed URL');
}

/**
 * Clear the URL cache (useful for testing or after logout)
 */
export function clearUrlCache(): void {
  urlCache.clear();
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CACHE_STORAGE_KEY);
  }
}

/**
 * Preload images into browser cache
 * This fetches the actual images so they're cached by the browser
 */
export function preloadImages(urls: string[]): void {
  for (const url of urls) {
    if (url && typeof window !== 'undefined') {
      const img = new window.Image();
      img.src = url;
    }
  }
}
