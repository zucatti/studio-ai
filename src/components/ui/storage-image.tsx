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
    return null;
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

export default StorageImage;
