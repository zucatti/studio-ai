'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, Download, Trash2, ArrowLeft, Info, Copy, Check } from 'lucide-react';
import { StorageImg } from '@/components/ui/storage-image';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { GenerationMetadata } from '@/types/database';

// Parse generation metadata from description (stored as HTML comment)
function parseGenerationMetadata(description?: string): GenerationMetadata | null {
  if (!description) return null;
  const match = description.match(/<!-- metadata:(.*?) -->/s);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

// Format resolution for display
function formatResolution(resolution?: string): string {
  if (!resolution) return 'Standard';
  // Map internal values to display format
  const resMap: Record<string, string> = {
    '720p': '720p',
    '1080p': '1080p',
    '2K': '2K',
    '4K': '4K',
  };
  return resMap[resolution] || resolution;
}

export interface LightboxImage {
  id: string;
  url: string;
  description?: string;
}

interface LightboxProps {
  images: LightboxImage[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onMoveToRushes?: (id: string) => void;
  onMoveToGallery?: (id: string) => void;
  onDownload?: (id: string) => void;
}

export function Lightbox({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
  onDelete,
  onMoveToRushes,
  onMoveToGallery,
  onDownload,
}: LightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showInfo, setShowInfo] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset index when opening with new initialIndex
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
    }
  }, [isOpen, initialIndex]);

  const currentImage = images[currentIndex];

  // Parse metadata from current image description
  const metadata = useMemo(() =>
    parseGenerationMetadata(currentImage?.description),
    [currentImage?.description]
  );

  // Copy prompt to clipboard
  const copyPrompt = useCallback(async () => {
    if (metadata?.original_prompt) {
      await navigator.clipboard.writeText(metadata.original_prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [metadata?.original_prompt]);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          goToPrevious();
          break;
        case 'ArrowRight':
          goToNext();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, goToPrevious, goToNext]);

  // Prevent body scroll when open
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

  if (!isOpen || !currentImage || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/50">
        <div className="flex items-center gap-4">
          <span className="text-white/70 text-sm">
            {currentIndex + 1} / {images.length}
          </span>
          {currentImage.description && (
            <span className="text-white/50 text-sm truncate max-w-md">
              {currentImage.description}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {metadata && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowInfo(!showInfo)}
              className={cn(
                "text-white/70 hover:text-white hover:bg-white/10",
                showInfo && "text-blue-400 bg-blue-500/20"
              )}
            >
              <Info className="w-4 h-4" />
            </Button>
          )}
          {onDownload && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDownload(currentImage.id)}
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              <Download className="w-4 h-4" />
            </Button>
          )}
          {onMoveToRushes && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onMoveToRushes(currentImage.id)}
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Rushes
            </Button>
          )}
          {onMoveToGallery && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onMoveToGallery(currentImage.id)}
              className="text-yellow-400/70 hover:text-yellow-400 hover:bg-yellow-500/10"
            >
              Gallery
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(currentImage.id)}
              className="text-red-400/70 hover:text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Main image area */}
      <div className="flex-1 relative flex items-center justify-center px-16">
        {/* Previous button */}
        {images.length > 1 && (
          <button
            onClick={goToPrevious}
            className="absolute left-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
        )}

        {/* Image */}
        <div className="relative max-w-full max-h-full">
          <StorageImg
            src={currentImage.url}
            alt={currentImage.description || 'Image'}
            className="max-h-[calc(100vh-200px)] max-w-full object-contain rounded-lg"
          />
        </div>

        {/* Next button */}
        {images.length > 1 && (
          <button
            onClick={goToNext}
            className="absolute right-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        )}

        {/* Info Panel */}
        {showInfo && metadata && (
          <div className="absolute right-20 top-4 w-80 bg-slate-900/95 border border-white/10 rounded-xl shadow-xl overflow-hidden">
            <div className="p-4 space-y-4">
              {/* Model & Resolution */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs font-medium rounded">
                    {metadata.model?.split('/').pop() || 'Unknown'}
                  </span>
                  <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs font-medium rounded">
                    {formatResolution(metadata.resolution)}
                  </span>
                </div>
                {metadata.aspect_ratio && (
                  <span className="text-white/50 text-xs">
                    {metadata.aspect_ratio}
                  </span>
                )}
              </div>

              {/* Original Prompt */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/50 uppercase tracking-wide">Prompt</span>
                  <button
                    onClick={copyPrompt}
                    className="flex items-center gap-1 text-xs text-white/50 hover:text-white transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-green-400" />
                        <span className="text-green-400">Copié</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copier</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-sm text-white/80 leading-relaxed">
                  {metadata.original_prompt}
                </p>
              </div>

              {/* Optimized Prompt (if different) */}
              {metadata.optimized_prompt && metadata.optimized_prompt !== metadata.original_prompt && (
                <div className="space-y-1">
                  <span className="text-xs text-white/50 uppercase tracking-wide">Prompt optimisé</span>
                  <p className="text-xs text-white/60 leading-relaxed italic">
                    {metadata.optimized_prompt}
                  </p>
                </div>
              )}

              {/* References */}
              {metadata.references && (
                <div className="space-y-2">
                  {metadata.references.characters && metadata.references.characters.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {metadata.references.characters.map((char, i) => (
                        <span key={i} className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-xs rounded">
                          @{char}
                        </span>
                      ))}
                    </div>
                  )}
                  {metadata.references.locations && metadata.references.locations.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {metadata.references.locations.map((loc, i) => (
                        <span key={i} className="px-2 py-0.5 bg-green-500/10 text-green-400 text-xs rounded">
                          #{loc}
                        </span>
                      ))}
                    </div>
                  )}
                  {metadata.references.poses && metadata.references.poses.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {metadata.references.poses.map((pose, i) => (
                        <span key={i} className="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-xs rounded">
                          !{pose}
                        </span>
                      ))}
                    </div>
                  )}
                  {metadata.references.styles && metadata.references.styles.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {metadata.references.styles.map((style, i) => (
                        <span key={i} className="px-2 py-0.5 bg-orange-500/10 text-orange-400 text-xs rounded">
                          ~{style}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Timestamp */}
              {metadata.generated_at && (
                <div className="pt-2 border-t border-white/10">
                  <span className="text-xs text-white/30">
                    Généré le {new Date(metadata.generated_at).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="px-4 py-3 bg-black/50">
          <div className="flex gap-2 justify-center overflow-x-auto max-w-full pb-1">
            {images.map((image, index) => (
              <button
                key={image.id}
                onClick={() => setCurrentIndex(index)}
                className={cn(
                  'flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all',
                  index === currentIndex
                    ? 'border-blue-500 ring-2 ring-blue-500/30'
                    : 'border-white/10 hover:border-white/30 opacity-60 hover:opacity-100'
                )}
              >
                <StorageImg
                  src={image.url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
