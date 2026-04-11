'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StorageThumbnail } from '@/components/ui/storage-image';
import { useSignedUrl, isB2Url } from '@/hooks/use-signed-url';

export interface CarouselImage {
  url: string;
  label: string;
  description?: string;
}

interface ImageCarouselProps {
  images: CarouselImage[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

// Individual slide component
function CarouselSlide({
  image,
  isCurrent,
  onClick,
}: {
  image: CarouselImage;
  isCurrent: boolean;
  onClick?: () => void;
}) {
  const { signedUrl } = useSignedUrl(image.url);
  const finalUrl = signedUrl || (!isB2Url(image.url) ? image.url : null);

  return (
    <div
      className={cn(
        "flex-shrink-0 transition-all duration-300 cursor-pointer",
        isCurrent ? "opacity-100 scale-100" : "opacity-40 scale-95 hover:opacity-60",
      )}
      onClick={onClick}
    >
      <div
        className={cn(
          "relative rounded-xl overflow-hidden shadow-2xl",
          isCurrent && "ring-2 ring-white/20",
        )}
      >
        {finalUrl ? (
          <img
            src={finalUrl}
            alt={image.label}
            className="w-full h-full object-cover bg-black"
            style={{ aspectRatio: '1/1' }}
          />
        ) : (
          <div
            className="bg-slate-800 flex items-center justify-center"
            style={{ aspectRatio: '1/1' }}
          >
            <div className="w-12 h-12 rounded-full border-2 border-slate-600 border-t-transparent animate-spin" />
          </div>
        )}

        {/* Label overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10 pointer-events-none">
          <span className="text-sm font-medium text-white">{image.label}</span>
          {image.description && (
            <p className="text-xs text-slate-300 mt-0.5">{image.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ImageCarousel({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
  title,
}: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [mounted, setMounted] = useState(false);

  // Handle client-side mounting
  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset index when opening
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
    }
  }, [isOpen, initialIndex]);

  // Navigation
  const navigate = useCallback((direction: 'prev' | 'next') => {
    if (images.length <= 1) return;

    if (direction === 'prev' && currentIndex === 0) return;
    if (direction === 'next' && currentIndex === images.length - 1) return;

    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    setCurrentIndex(newIndex);
  }, [currentIndex, images.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigate('prev');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigate('next');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, navigate, onClose]);

  // Boundary checks
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === images.length - 1;

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

  // Download current image
  const handleDownload = () => {
    const currentImage = images[currentIndex];
    if (!currentImage?.url) return;
    const filename = `${currentImage.label.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
    const downloadUrl = `/api/storage/download?url=${encodeURIComponent(currentImage.url)}&filename=${encodeURIComponent(filename)}`;
    window.open(downloadUrl, '_blank');
  };

  if (!isOpen || images.length === 0 || !mounted) {
    return null;
  }

  // Slide dimensions
  const slideWidth = 'min(50vh, 500px)';
  const halfSlideWidth = 'min(25vh, 250px)';

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/95 overflow-hidden"
      onClick={onClose}
    >
      {/* Title */}
      {title && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 text-white text-lg font-medium">
          {title}
        </div>
      )}

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
            transform: `translateX(calc(50vw - ${currentIndex} * (${slideWidth} + 40px) - ${halfSlideWidth}))`,
          }}
        >
          {images.map((image, index) => (
            <div
              key={index}
              style={{ width: slideWidth }}
            >
              <CarouselSlide
                image={image}
                isCurrent={index === currentIndex}
                onClick={index !== currentIndex ? () => setCurrentIndex(index) : undefined}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Navigation arrows */}
      {!isFirst && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate('prev');
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors"
          title="Image précédente (←)"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
      )}
      {!isLast && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate('next');
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors"
          title="Image suivante (→)"
        >
          <ChevronRight className="w-6 h-6 text-white" />
        </button>
      )}

      {/* Bottom bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2">
        {/* Counter */}
        {images.length > 1 && (
          <div className="px-3 py-1 rounded-full bg-white/10 backdrop-blur text-white text-sm">
            {currentIndex + 1} / {images.length}
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
