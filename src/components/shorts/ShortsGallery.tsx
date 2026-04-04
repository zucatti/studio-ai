'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Download,
  Play,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Short } from '@/store/shorts-store';
import { formatDuration } from './DurationPicker';
import { useSignedUrl, isB2Url } from '@/hooks/use-signed-url';

interface ShortsGalleryProps {
  shorts: Short[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

// Individual slide component for a short
function GalleryShortSlide({
  short,
  isCurrent,
}: {
  short: Short;
  isCurrent: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Get the assembled video URL
  const videoUrl = short.assembled_video_url;
  const { signedUrl } = useSignedUrl(videoUrl || null);
  const finalVideoUrl = signedUrl || (videoUrl && !isB2Url(videoUrl) ? videoUrl : null);

  // Get thumbnail from first plan
  const thumbnailUrl = short.plans[0]?.storyboard_image_url;
  const { signedUrl: signedThumbUrl } = useSignedUrl(thumbnailUrl || null);
  const finalThumbUrl = signedThumbUrl || (thumbnailUrl && !isB2Url(thumbnailUrl) ? thumbnailUrl : null);

  // Auto-play when current and video is ready
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !finalVideoUrl) return;

    const handleCanPlay = () => {
      if (isCurrent) {
        video.play().catch(() => {});
      }
    };

    if (isCurrent) {
      // Try to play immediately if already loaded
      if (video.readyState >= 3) {
        video.play().catch(() => {});
      } else {
        // Wait for video to be ready
        video.addEventListener('canplay', handleCanPlay);
      }
    } else {
      video.pause();
      video.currentTime = 0;
    }

    return () => {
      video.removeEventListener('canplay', handleCanPlay);
    };
  }, [isCurrent, finalVideoUrl]);

  const planCount = short.plans.length;
  const totalDuration = short.assembled_video_duration ?? short.totalDuration ?? 0;

  return (
    <div
      className={cn(
        "flex-shrink-0 transition-all duration-300",
        isCurrent ? "opacity-100 scale-100" : "opacity-40 scale-95",
      )}
    >
      <div
        className={cn(
          "relative rounded-xl overflow-hidden shadow-2xl",
          isCurrent && "ring-2 ring-white/20",
        )}
      >
        {finalVideoUrl ? (
          <video
            ref={videoRef}
            src={finalVideoUrl}
            loop
            muted={!isCurrent}
            playsInline
            controls={isCurrent}
            poster={finalThumbUrl || undefined}
            className="w-full object-cover bg-black"
            style={{ aspectRatio: '9/16' }}
          />
        ) : finalThumbUrl ? (
          <div className="relative" style={{ aspectRatio: '9/16' }}>
            <img
              src={finalThumbUrl}
              alt={short.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <Play className="w-8 h-8 text-white ml-1" />
              </div>
            </div>
          </div>
        ) : (
          <div
            className="bg-slate-800 flex items-center justify-center"
            style={{ aspectRatio: '9/16' }}
          >
            <Play className="w-12 h-12 text-slate-600" />
          </div>
        )}

        {/* Info overlay - top */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-3 pb-10 pointer-events-none">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white flex items-center gap-2">
              <Play className="w-4 h-4 text-blue-400" />
              {short.title}
            </span>
            <span className="text-xs text-slate-300 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {planCount} plans • {formatDuration(totalDuration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ShortsGallery({
  shorts,
  initialIndex = 0,
  isOpen,
  onClose,
}: ShortsGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Filter shorts with assembled videos
  const shortsWithVideo = shorts.filter((s) => s.assembled_video_url);

  // Reset index when opening
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
    }
  }, [isOpen, initialIndex]);

  // Navigation
  const navigateShort = useCallback((direction: 'prev' | 'next') => {
    if (shortsWithVideo.length <= 1) return;

    // Check bounds - no infinite loop
    if (direction === 'prev' && currentIndex === 0) return;
    if (direction === 'next' && currentIndex === shortsWithVideo.length - 1) return;

    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    setCurrentIndex(newIndex);
  }, [currentIndex, shortsWithVideo.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateShort('prev');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateShort('next');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, navigateShort, onClose]);

  // Check if at boundaries
  const isFirstShort = currentIndex === 0;
  const isLastShort = currentIndex === shortsWithVideo.length - 1;

  // Prevent body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleDownload = () => {
    const currentShort = shortsWithVideo[currentIndex];
    if (!currentShort?.assembled_video_url) return;
    const filename = `${currentShort.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`;
    const downloadUrl = `/api/storage/download?url=${encodeURIComponent(currentShort.assembled_video_url)}&filename=${encodeURIComponent(filename)}`;
    window.open(downloadUrl, '_blank');
  };

  if (!isOpen || shortsWithVideo.length === 0 || typeof document === 'undefined') {
    return null;
  }

  // Slide width based on 9:16 aspect ratio
  const slideWidth = 'min(40vw, 400px)';
  const halfSlideWidth = 'min(20vw, 200px)';

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/95 overflow-hidden"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-30 w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors"
      >
        <X className="w-5 h-5 text-white" />
      </button>

      {/* Download button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleDownload();
        }}
        className="absolute top-4 left-4 z-30 w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors"
        title="Télécharger"
      >
        <Download className="w-5 h-5 text-white" />
      </button>

      {/* Sliding carousel track */}
      <div className="absolute inset-0 flex items-center overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div
          className="flex items-center gap-10 transition-transform duration-300 ease-out"
          style={{
            // Each slide is slideWidth + gap, center the current slide
            transform: `translateX(calc(50vw - ${currentIndex} * (${slideWidth} + 40px) - ${halfSlideWidth}))`,
          }}
        >
          {shortsWithVideo.map((short, index) => (
            <div
              key={short.id}
              style={{ width: slideWidth }}
              onClick={() => {
                if (index !== currentIndex) {
                  setCurrentIndex(index);
                }
              }}
              className={index !== currentIndex ? 'cursor-pointer' : ''}
            >
              <GalleryShortSlide
                short={short}
                isCurrent={index === currentIndex}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Navigation arrows - hidden at boundaries */}
      {!isFirstShort && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigateShort('prev');
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors"
          title="Short précédent (←)"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
      )}
      {!isLastShort && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigateShort('next');
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors"
          title="Short suivant (→)"
        >
          <ChevronRight className="w-6 h-6 text-white" />
        </button>
      )}

      {/* Bottom bar: counter + navigation hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2">
        {/* Counter */}
        {shortsWithVideo.length > 1 && (
          <div className="px-3 py-1 rounded-full bg-white/10 backdrop-blur text-white text-sm">
            {currentIndex + 1} / {shortsWithVideo.length}
          </div>
        )}
        {/* Hint */}
        <div className="text-slate-500 text-xs flex items-center gap-3">
          <span>← → Navigation</span>
          <span>•</span>
          <span>Échap pour fermer</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
