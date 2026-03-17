'use client';

import { createContext, useContext, useCallback, useRef, useState, useEffect, ReactNode } from 'react';
import { isB2Url } from '@/hooks/use-signed-url';

// In-memory cache for signed URLs
const urlCache = new Map<string, { signedUrl: string; expiresAt: number }>();
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const BATCH_DELAY_MS = 50; // Wait 50ms to collect URLs before batching

interface PendingRequest {
  resolve: (url: string) => void;
  reject: (error: Error) => void;
}

interface SignedUrlContextValue {
  getSignedUrl: (url: string) => Promise<string>;
  preloadUrls: (urls: string[]) => void;
}

const SignedUrlContext = createContext<SignedUrlContextValue | null>(null);

export function SignedUrlProvider({ children }: { children: ReactNode }) {
  const pendingUrls = useRef<Map<string, PendingRequest[]>>(new Map());
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inFlightRef = useRef<Set<string>>(new Set());

  const processBatch = useCallback(async () => {
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
        body: JSON.stringify({ urls: urlsToSign, expires: 3600 }),
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
            expiresAt: Date.now() + 3600 * 1000 - EXPIRY_BUFFER_MS,
          });
          requests.forEach(req => req.resolve(signedUrl));
        } else {
          requests.forEach(req => req.reject(new Error('Failed to sign URL')));
        }
      }
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

  return (
    <SignedUrlContext.Provider value={{ getSignedUrl, preloadUrls }}>
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
