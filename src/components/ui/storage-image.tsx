'use client';

import { useState } from 'react';
import Image, { ImageProps } from 'next/image';
import { useSignedUrl, isB2Url } from '@/hooks/use-signed-url';
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
 */
export function StorageImg({
  src,
  fallback,
  showLoader = true,
  alt,
  className,
  ...props
}: Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null | undefined;
  fallback?: React.ReactNode;
  showLoader?: boolean;
}) {
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
    return null;
  }

  return (
    <img
      src={signedUrl}
      alt={alt || ''}
      className={className}
      onError={() => setImageError(true)}
      {...props}
    />
  );
}

export default StorageImage;
