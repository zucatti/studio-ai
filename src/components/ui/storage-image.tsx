'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image, { ImageProps } from 'next/image';
import { useSignedUrl, isB2Url } from '@/hooks/use-signed-url';
import { useSignedUrlContext } from '@/contexts/signed-url-context';
import { cn } from '@/lib/utils';

interface StorageImageProps extends Omit<ImageProps, 'src'> {
  src: string | null | undefined;
  fallback?: React.ReactNode;
  showLoader?: boolean;
}

// Thumbnail size presets
export type ThumbnailSize = 'xs' | 'sm' | 'md' | 'lg';
const THUMBNAIL_SIZES: Record<ThumbnailSize, number> = {
  xs: 48,   // 48x48 - tiny avatars
  sm: 80,   // 80x80 - small cards
  md: 160,  // 160x160 - medium cards
  lg: 320,  // 320x320 - large previews
};

/**
 * Image component that automatically handles B2 storage URLs
 * Resolves b2:// URLs to signed URLs before rendering
 */
export function StorageImage({
  src,
  fallback,
  showLoader = true,
  alt,
  className,
  ...props
}: StorageImageProps) {
  const { signedUrl, isLoading, error } = useSignedUrl(src);
  const [imageError, setImageError] = useState(false);

  // Show loading state for B2 URLs
  if (isLoading && isB2Url(src) && showLoader) {
    return (
      <div
        className={cn(
          'animate-pulse bg-slate-700/50 rounded',
          className
        )}
        style={{ width: props.width, height: props.height }}
      />
    );
  }

  // Show fallback on error
  if (error || imageError || !signedUrl) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return (
      <div
        className={cn(
          'bg-slate-800 rounded flex items-center justify-center text-slate-500',
          className
        )}
        style={{ width: props.width, height: props.height }}
      >
        <svg
          className="w-8 h-8"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    );
  }

  return (
    <Image
      src={signedUrl}
      alt={alt}
      className={className}
      onError={() => setImageError(true)}
      {...props}
    />
  );
}

/**
 * Simple img element that handles B2 storage URLs
 * Use this when you don't need Next.js Image optimization
 * Now with lazy loading and batched URL signing for better performance
 */
export function StorageImg({
  src,
  fallback,
  showLoader = true,
  alt,
  className,
  lazy = true,
  ...props
}: Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null | undefined;
  fallback?: React.ReactNode;
  showLoader?: boolean;
  lazy?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(!lazy);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [imageError, setImageError] = useState(false);

  // Try to use context, fall back to standalone hook if not available
  let contextValue: ReturnType<typeof useSignedUrlContext> | null = null;
  try {
    contextValue = useSignedUrlContext();
  } catch {
    // Context not available, will use standalone hook
  }

  // Intersection observer for lazy loading
  useEffect(() => {
    if (!lazy || isVisible) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' } // Load images 100px before they enter viewport
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [lazy, isVisible]);

  // Sign URL when visible
  useEffect(() => {
    if (!isVisible || !src) {
      setSignedUrl(null);
      return;
    }

    // Non-B2 URLs can be used directly
    if (!isB2Url(src)) {
      setSignedUrl(src);
      return;
    }

    // Use context for batched signing if available
    if (contextValue) {
      setIsLoading(true);
      contextValue.getSignedUrl(src)
        .then(url => {
          setSignedUrl(url);
          setError(null);
        })
        .catch(err => {
          setError(err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isVisible, src, contextValue]);

  // Fallback to standalone hook if context is not available
  const standaloneHook = useSignedUrl(contextValue ? null : (isVisible ? src : null));

  // Use standalone hook values if context is not available
  const finalSignedUrl = contextValue ? signedUrl : standaloneHook.signedUrl;
  const finalIsLoading = contextValue ? isLoading : standaloneHook.isLoading;
  const finalError = contextValue ? error : standaloneHook.error;

  // Show placeholder when not visible yet (lazy loading)
  if (!isVisible) {
    return (
      <div
        ref={containerRef}
        className={cn(
          'bg-slate-800/50 rounded',
          className
        )}
        style={{ width: props.width, height: props.height }}
      />
    );
  }

  // Show loading state for B2 URLs
  if (finalIsLoading && isB2Url(src) && showLoader) {
    return (
      <div
        ref={containerRef}
        className={cn(
          'animate-pulse bg-slate-700/50 rounded',
          className
        )}
        style={{ width: props.width, height: props.height }}
      />
    );
  }

  // Show fallback on error
  if (finalError || imageError || !finalSignedUrl) {
    if (fallback) {
      return <>{fallback}</>;
    }
    // Show error placeholder instead of nothing
    return (
      <div
        className={cn(
          'bg-slate-800/80 rounded flex flex-col items-center justify-center text-slate-500 min-h-[100px]',
          className
        )}
        style={{ width: props.width, height: props.height }}
        title={finalError?.message || (imageError ? 'Image failed to load' : 'No URL')}
      >
        <svg
          className="w-8 h-8 mb-1"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span className="text-[10px]">Erreur</span>
      </div>
    );
  }

  // Destructure style to merge it properly (avoid double application)
  const { style, ...restProps } = props;

  return (
    <img
      src={finalSignedUrl}
      alt={alt || ''}
      className={className}
      onError={() => setImageError(true)}
      style={style}
      loading={lazy ? 'lazy' : undefined}
      {...restProps}
    />
  );
}

/**
 * Div with background-image that handles B2 storage URLs
 * Use this when you need guaranteed clipping within rounded containers
 */
export function StorageBackgroundDiv({
  src,
  fallback,
  showLoader = true,
  className,
  children,
  ...props
}: Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & {
  src: string | null | undefined;
  fallback?: React.ReactNode;
  showLoader?: boolean;
  children?: React.ReactNode;
}) {
  const { signedUrl, isLoading, error } = useSignedUrl(src);
  const [imageError, setImageError] = useState(false);

  // Preload image to detect errors
  useState(() => {
    if (signedUrl) {
      const img = new window.Image();
      img.onerror = () => setImageError(true);
      img.src = signedUrl;
    }
  });

  // Show loading state for B2 URLs
  if (isLoading && isB2Url(src) && showLoader) {
    return (
      <div
        className={cn(
          'animate-pulse bg-slate-700/50',
          className
        )}
        {...props}
      />
    );
  }

  // Show fallback on error
  if (error || imageError || !signedUrl) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return (
      <div
        className={cn('bg-slate-800', className)}
        {...props}
      >
        {children}
      </div>
    );
  }

  // Destructure style from props to merge it properly
  const { style: propStyle, ...restProps } = props;

  return (
    <div
      className={className}
      style={{
        ...propStyle,
        backgroundImage: `url(${signedUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        borderRadius: 'inherit',
      }}
      {...restProps}
    >
      {children}
    </div>
  );
}

/**
 * Extract the key from a B2 URL (b2://bucket/key -> key)
 */
function extractB2Key(url: string): string | null {
  if (url.startsWith('b2://')) {
    const pathWithBucket = url.slice(5); // Remove 'b2://'
    const slashIndex = pathWithBucket.indexOf('/');
    if (slashIndex !== -1) {
      return pathWithBucket.slice(slashIndex + 1); // Remove bucket name
    }
  }
  return null;
}

/**
 * Optimized thumbnail component
 * Uses /api/storage endpoint with ?w= for on-the-fly resizing
 * This serves properly sized thumbnails instead of full images
 */
export function StorageThumbnail({
  src,
  size = 'sm',
  alt,
  className,
  fallback,
  objectFit = 'cover',
  objectPosition = 'center top',
}: {
  src: string | null | undefined;
  size?: ThumbnailSize | number;
  alt?: string;
  className?: string;
  fallback?: React.ReactNode;
  objectFit?: 'cover' | 'contain' | 'fill';
  objectPosition?: string;
}) {
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const dimension = typeof size === 'number' ? size : THUMBNAIL_SIZES[size];

  // For B2 URLs, use our thumbnail endpoint
  const b2Key = src && isB2Url(src) ? extractB2Key(src) : null;
  const thumbnailUrl = b2Key ? `/api/storage/${b2Key}?w=${dimension}` : null;

  // For non-B2 URLs, use the signed URL hook
  const { signedUrl, isLoading: isSignedUrlLoading, error } = useSignedUrl(
    thumbnailUrl ? null : src // Only use hook for non-B2 URLs
  );

  const finalUrl = thumbnailUrl || signedUrl;
  const finalIsLoading = thumbnailUrl ? isLoading : isSignedUrlLoading;

  // Show loading state
  if (finalIsLoading && !finalUrl) {
    return (
      <div
        className={cn(
          'animate-pulse bg-slate-700/50 rounded',
          className
        )}
        style={{ width: dimension, height: dimension }}
      />
    );
  }

  // Show fallback on error
  if (error || imageError || !finalUrl) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return (
      <div
        className={cn(
          'bg-slate-800 rounded flex items-center justify-center text-slate-500',
          className
        )}
        style={{ width: dimension, height: dimension }}
      >
        <svg
          className="w-1/3 h-1/3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    );
  }

  // Use native img for thumbnails (our endpoint returns optimized WebP)
  if (thumbnailUrl) {
    return (
      <img
        src={finalUrl}
        alt={alt || ''}
        width={dimension}
        height={dimension}
        className={className}
        style={{ objectFit, objectPosition, width: dimension, height: dimension }}
        onLoad={() => setIsLoading(false)}
        onError={() => { setIsLoading(false); setImageError(true); }}
        loading="lazy"
      />
    );
  }

  return (
    <Image
      src={finalUrl}
      alt={alt || ''}
      width={dimension}
      height={dimension}
      className={className}
      style={{ objectFit, objectPosition }}
      onError={() => setImageError(true)}
    />
  );
}

/**
 * Check if a URL points to a video file
 */
function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  // Check common video extensions
  return (
    lower.includes('.mp4') ||
    lower.includes('.webm') ||
    lower.includes('.mov') ||
    lower.includes('.avi') ||
    lower.includes('.mkv') ||
    lower.includes('/video/') ||
    lower.includes('video_')
  );
}

/**
 * Media component that handles both images and videos from B2 storage
 * Automatically detects video URLs and renders appropriate element
 */
export function StorageMedia({
  src,
  fallback,
  showLoader = true,
  alt,
  className,
  lazy = true,
  autoPlay = true,
  muted = true,
  loop = true,
  controls = false,
  ...props
}: Omit<React.HTMLAttributes<HTMLElement>, 'src'> & {
  src: string | null | undefined;
  fallback?: React.ReactNode;
  showLoader?: boolean;
  alt?: string;
  lazy?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(!lazy);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [mediaError, setMediaError] = useState(false);

  // Try to use context, fall back to standalone hook if not available
  let contextValue: ReturnType<typeof useSignedUrlContext> | null = null;
  try {
    contextValue = useSignedUrlContext();
  } catch {
    // Context not available, will use standalone hook
  }

  // Intersection observer for lazy loading
  useEffect(() => {
    if (!lazy || isVisible) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [lazy, isVisible]);

  // Sign URL when visible
  useEffect(() => {
    if (!isVisible || !src) {
      setSignedUrl(null);
      return;
    }

    // Non-B2 URLs can be used directly
    if (!isB2Url(src)) {
      setSignedUrl(src);
      return;
    }

    // Use context for batched signing if available
    if (contextValue) {
      setIsLoading(true);
      contextValue.getSignedUrl(src)
        .then(url => {
          setSignedUrl(url);
          setError(null);
        })
        .catch(err => {
          setError(err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isVisible, src, contextValue]);

  // Fallback to standalone hook if context is not available
  const standaloneHook = useSignedUrl(contextValue ? null : (isVisible ? src : null));

  // Use standalone hook values if context is not available
  const finalSignedUrl = contextValue ? signedUrl : standaloneHook.signedUrl;
  const finalIsLoading = contextValue ? isLoading : standaloneHook.isLoading;
  const finalError = contextValue ? error : standaloneHook.error;

  // Determine if this is a video
  const isVideo = isVideoUrl(src) || isVideoUrl(finalSignedUrl);

  // Show placeholder when not visible yet (lazy loading)
  if (!isVisible) {
    return (
      <div
        ref={containerRef}
        className={cn(
          'bg-slate-800/50 rounded',
          className
        )}
        {...props}
      />
    );
  }

  // Show loading state for B2 URLs
  if (finalIsLoading && isB2Url(src) && showLoader) {
    return (
      <div
        ref={containerRef}
        className={cn(
          'animate-pulse bg-slate-700/50 rounded',
          className
        )}
        {...props}
      />
    );
  }

  // Show fallback on error
  if (finalError || mediaError || !finalSignedUrl) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return null;
  }

  // Render video or image based on URL
  if (isVideo) {
    return (
      <video
        src={finalSignedUrl}
        className={className}
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        controls={controls}
        playsInline
        onError={() => setMediaError(true)}
        {...(props as React.VideoHTMLAttributes<HTMLVideoElement>)}
      />
    );
  }

  return (
    <img
      src={finalSignedUrl}
      alt={alt || ''}
      className={className}
      onError={() => setMediaError(true)}
      loading={lazy ? 'lazy' : undefined}
      {...(props as React.ImgHTMLAttributes<HTMLImageElement>)}
    />
  );
}

export default StorageImage;
