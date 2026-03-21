'use client';

import { createContext, useContext, useCallback, useRef, useMemo, ReactNode } from 'react';
import { isB2Url } from '@/hooks/use-signed-url';

// Default expiration buffer (5 minutes before actual expiry)
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
// Default expiry: 6 hours for better caching
const DEFAULT_EXPIRES = 6 * 60 * 60; // 6 hours in seconds
const BATCH_DELAY_MS = 50; // Wait 50ms to collect URLs before batching

// LocalStorage key for persistent cache
const CACHE_STORAGE_KEY = 'signed-url-cache';

// In-memory cache for signed URLs
const urlCache = new Map<string, { signedUrl: string; expiresAt: number }>();

// Load cache from localStorage on init
function loadCacheFromStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const stored = localStorage.getItem(CACHE_STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored) as Record<string, { signedUrl: string; expiresAt: number }>;
      const now = Date.now();
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
      for (const [url, entry] of urlCache.entries()) {
        if (entry.expiresAt > now) {
          data[url] = entry;
        }
      }
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // Ignore storage errors
    }
  }, 1000);
}

// Initialize cache from storage
let cacheInitialized = false;
function ensureCacheInitialized(): void {
  if (!cacheInitialized && typeof window !== 'undefined') {
    cacheInitialized = true;
    loadCacheFromStorage();
  }
}

interface PendingRequest {
  resolve: (url: string) => void;
  reject: (error: Error) => void;
}

interface SignedUrlContextValue {
  getSignedUrl: (url: string) => Promise<string>;
  preloadUrls: (urls: string[]) => void;
  preloadImages: (urls: string[]) => void;
}

const SignedUrlContext = createContext<SignedUrlContextValue | null>(null);

export function SignedUrlProvider({ children }: { children: ReactNode }) {
  const pendingUrls = useRef<Map<string, PendingRequest[]>>(new Map());
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inFlightRef = useRef<Set<string>>(new Set());

  const processBatch = useCallback(async () => {
    ensureCacheInitialized();
    const urlsToSign: string[] = [];
    const pendingMap = new Map(pendingUrls.current);

    // Clear the pending queue
    pendingUrls.current.clear();
    batchTimeoutRef.current = null;

    // Collect URLs that need signing
    for (const url of pendingMap.keys()) {
      // Skip if already in flight
      if (inFlightRef.current.has(url)) continue;

      // Check cache first
      const cached = urlCache.get(url);
      if (cached && cached.expiresAt > Date.now()) {
        // Resolve from cache
        const requests = pendingMap.get(url) || [];
        requests.forEach(req => req.resolve(cached.signedUrl));
        pendingMap.delete(url);
        continue;
      }

      if (isB2Url(url)) {
        urlsToSign.push(url);
        inFlightRef.current.add(url);
      } else {
        // Non-B2 URLs can be used directly
        const requests = pendingMap.get(url) || [];
        requests.forEach(req => req.resolve(url));
        pendingMap.delete(url);
      }
    }

    if (urlsToSign.length === 0) return;

    try {
      const res = await fetch('/api/storage/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: urlsToSign, expires: DEFAULT_EXPIRES }),
      });

      const data = await res.json();
      const signedUrls = data.signedUrls || {};

      for (const url of urlsToSign) {
        inFlightRef.current.delete(url);
        const signedUrl = signedUrls[url];
        const requests = pendingMap.get(url) || [];

        if (signedUrl) {
          // Cache the signed URL
          urlCache.set(url, {
            signedUrl,
            expiresAt: Date.now() + DEFAULT_EXPIRES * 1000 - EXPIRY_BUFFER_MS,
          });
          requests.forEach(req => req.resolve(signedUrl));
        } else {
          requests.forEach(req => req.reject(new Error('Failed to sign URL')));
        }
      }
      saveCacheToStorage();
    } catch (error) {
      // On error, reject all pending
      for (const url of urlsToSign) {
        inFlightRef.current.delete(url);
        const requests = pendingMap.get(url) || [];
        requests.forEach(req => req.reject(error as Error));
      }
    }
  }, []);

  const getSignedUrl = useCallback((url: string): Promise<string> => {
    ensureCacheInitialized();
    return new Promise((resolve, reject) => {
      if (!url) {
        resolve('');
        return;
      }

      // Check cache first
      if (isB2Url(url)) {
        const cached = urlCache.get(url);
        if (cached && cached.expiresAt > Date.now()) {
          resolve(cached.signedUrl);
          return;
        }
      } else {
        // Non-B2 URLs can be used directly
        resolve(url);
        return;
      }

      // Add to pending queue
      const existing = pendingUrls.current.get(url) || [];
      existing.push({ resolve, reject });
      pendingUrls.current.set(url, existing);

      // Schedule batch processing
      if (!batchTimeoutRef.current) {
        batchTimeoutRef.current = setTimeout(processBatch, BATCH_DELAY_MS);
      }
    });
  }, [processBatch]);

  const preloadUrls = useCallback((urls: string[]) => {
    // Just queue them for signing, don't wait for result
    for (const url of urls) {
      if (url && isB2Url(url)) {
        const cached = urlCache.get(url);
        if (!cached || cached.expiresAt <= Date.now()) {
          getSignedUrl(url).catch(() => {}); // Ignore errors for preload
        }
      }
    }
  }, [getSignedUrl]);

  // Preload images into browser cache after signing
  const preloadImages = useCallback(async (urls: string[]) => {
    for (const url of urls) {
      if (!url) continue;
      try {
        const signedUrl = await getSignedUrl(url);
        if (signedUrl && typeof window !== 'undefined') {
          const img = new window.Image();
          img.src = signedUrl;
        }
      } catch {
        // Ignore errors
      }
    }
  }, [getSignedUrl]);

  // Memoize context value to prevent infinite re-renders in consumers
  const contextValue = useMemo(() => ({
    getSignedUrl,
    preloadUrls,
    preloadImages,
  }), [getSignedUrl, preloadUrls, preloadImages]);

  return (
    <SignedUrlContext.Provider value={contextValue}>
      {children}
    </SignedUrlContext.Provider>
  );
}

export function useSignedUrlContext() {
  const context = useContext(SignedUrlContext);
  if (!context) {
    throw new Error('useSignedUrlContext must be used within SignedUrlProvider');
  }
  return context;
}
