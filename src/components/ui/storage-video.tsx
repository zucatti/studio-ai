'use client';

import { useState, useEffect, useRef, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface StorageVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src: string;
  /** Show loading placeholder while signing URL */
  showLoading?: boolean;
}

/**
 * Video component that handles B2 URL signing automatically.
 * Works like a regular <video> but accepts b2:// URLs.
 */
export const StorageVideo = forwardRef<HTMLVideoElement, StorageVideoProps>(
  ({ src, className, showLoading = true, ...props }, ref) => {
    const [signedUrl, setSignedUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
      const signUrl = async () => {
        setIsLoading(true);
        try {
          if (src.startsWith('b2://')) {
            const res = await fetch('/api/storage/sign', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ urls: [src] }),
            });
            if (res.ok) {
              const { signedUrls } = await res.json();
              setSignedUrl(signedUrls[src] || src);
            } else {
              setSignedUrl(src);
            }
          } else {
            setSignedUrl(src);
          }
        } catch {
          setSignedUrl(src);
        } finally {
          setIsLoading(false);
        }
      };

      signUrl();
    }, [src]);

    if (isLoading && showLoading) {
      return (
        <div className={cn('bg-slate-800 animate-pulse', className)} />
      );
    }

    if (!signedUrl) {
      return null;
    }

    return (
      <video
        ref={ref}
        src={signedUrl}
        className={className}
        {...props}
      />
    );
  }
);

StorageVideo.displayName = 'StorageVideo';
