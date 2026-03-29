'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { GeneratingPlaceholder } from '@/components/ui/generating-placeholder';
import { StorageImg } from '@/components/ui/storage-image';
import { Lightbox, type LightboxImage } from '@/components/ui/lightbox';
import { Loader2, Minus, Plus, Check, Maximize2, Sparkles, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AspectRatio } from '@/types/database';
import type { GenerationStatus } from '@/lib/sse';

interface GeneratedImage {
  jobId: string;
  imageUrl: string;
  selected?: boolean;
}

interface PlaceholderState {
  status: GenerationStatus;
  progress?: number;
  jobId?: string;
  imageUrl?: string;
}

export interface MultiImageGeneratorProps {
  /** Aspect ratio for images */
  aspectRatio?: AspectRatio;
  /** Initial count (default: 4) */
  initialCount?: number;
  /** Min count (default: 1) */
  minCount?: number;
  /** Max count (default: 8) */
  maxCount?: number;
  /** Whether to allow multiple selections (default: false - single selection) */
  multiSelect?: boolean;
  /** Called to generate images - should return job IDs */
  onGenerate: (count: number) => Promise<string[]>;
  /** Called when user confirms selection */
  onSelect: (imageUrls: string[]) => void;
  /** Called to check job status - returns { status, progress, imageUrl } */
  onPollJob: (jobId: string) => Promise<{ status: string; progress?: number; imageUrl?: string }>;
  /** Previous generations (rushes) */
  rushes?: Array<{ id: string; url: string; createdAt?: string }>;
  /** Called when viewing rushes */
  onViewRushes?: () => void;
  /** Custom generate button text */
  generateButtonText?: string;
  /** Custom confirm button text */
  confirmButtonText?: string;
  /** Show rushes icon */
  showRushesIcon?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Compact mode - smaller UI */
  compact?: boolean;
  /** Class name */
  className?: string;
}

const POLL_INTERVAL = 2000;

export function MultiImageGenerator({
  aspectRatio = '2:3',
  initialCount = 4,
  minCount = 1,
  maxCount = 8,
  multiSelect = false,
  onGenerate,
  onSelect,
  onPollJob,
  rushes = [],
  onViewRushes,
  generateButtonText = 'Générer',
  confirmButtonText = 'Utiliser',
  showRushesIcon = true,
  disabled = false,
  compact = false,
  className,
}: MultiImageGeneratorProps) {
  const [count, setCount] = useState(initialCount);
  const [isGenerating, setIsGenerating] = useState(false);
  const [placeholders, setPlaceholders] = useState<PlaceholderState[]>([]);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [completedCount, setCompletedCount] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const activeJobsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const interval of activeJobsRef.current.values()) {
        clearInterval(interval);
      }
      activeJobsRef.current.clear();
    };
  }, []);

  // Check if all jobs completed
  useEffect(() => {
    if (isGenerating && completedCount >= count) {
      setIsGenerating(false);
    }
  }, [isGenerating, completedCount, count]);

  // Poll a single job
  const pollJob = useCallback(async (jobId: string, index: number) => {
    try {
      const result = await onPollJob(jobId);

      // Update placeholder
      setPlaceholders(prev => prev.map((p, i) =>
        i === index ? {
          ...p,
          status: result.status === 'completed' ? 'completed' : 'generating',
          progress: result.progress,
          jobId,
        } : p
      ));

      if (result.status === 'completed') {
        // Stop polling
        const interval = activeJobsRef.current.get(jobId);
        if (interval) {
          clearInterval(interval);
          activeJobsRef.current.delete(jobId);
        }

        if (result.imageUrl) {
          setGeneratedImages(prev => [...prev, { jobId, imageUrl: result.imageUrl! }]);
          setPlaceholders(prev => prev.map((p, i) =>
            i === index ? { ...p, imageUrl: result.imageUrl, status: 'completed' } : p
          ));
        }
        setCompletedCount(prev => prev + 1);
      } else if (result.status === 'failed') {
        const interval = activeJobsRef.current.get(jobId);
        if (interval) {
          clearInterval(interval);
          activeJobsRef.current.delete(jobId);
        }
        setPlaceholders(prev => prev.map((p, i) =>
          i === index ? { ...p, status: 'error' as GenerationStatus } : p
        ));
        setCompletedCount(prev => prev + 1);
      }
    } catch (err) {
      console.error(`[MultiImageGenerator] Poll error:`, err);
      const interval = activeJobsRef.current.get(jobId);
      if (interval) {
        clearInterval(interval);
        activeJobsRef.current.delete(jobId);
      }
      setCompletedCount(prev => prev + 1);
    }
  }, [onPollJob]);

  // Handle generation
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setGeneratedImages([]);
    setSelectedUrls(new Set());
    setCompletedCount(0);
    setPlaceholders(Array(count).fill({ status: 'queued' as GenerationStatus }));

    try {
      const jobIds = await onGenerate(count);

      // Start polling each job
      jobIds.forEach((jobId, index) => {
        // Poll immediately
        pollJob(jobId, index);

        // Then poll at intervals
        const interval = setInterval(() => {
          pollJob(jobId, index);
        }, POLL_INTERVAL);
        activeJobsRef.current.set(jobId, interval);
      });
    } catch (err) {
      console.error('[MultiImageGenerator] Generation error:', err);
      setIsGenerating(false);
      setPlaceholders([]);
    }
  }, [count, onGenerate, pollJob]);

  // Handle image selection
  const toggleSelection = useCallback((imageUrl: string) => {
    setSelectedUrls(prev => {
      const next = new Set(prev);
      if (next.has(imageUrl)) {
        next.delete(imageUrl);
      } else {
        if (!multiSelect) {
          next.clear();
        }
        next.add(imageUrl);
      }
      return next;
    });
  }, [multiSelect]);

  // Handle confirm
  const handleConfirm = useCallback(() => {
    onSelect(Array.from(selectedUrls));
    // Reset state
    setGeneratedImages([]);
    setSelectedUrls(new Set());
    setPlaceholders([]);
  }, [selectedUrls, onSelect]);

  // Compute aspect ratio style
  const aspectStyle = {
    '--aspect': aspectRatio === '9:16' ? '9/16' :
               aspectRatio === '16:9' ? '16/9' :
               aspectRatio === '4:5' ? '4/5' :
               aspectRatio === '2:3' ? '2/3' : '1/1'
  } as React.CSSProperties;

  // Lightbox images
  const lightboxImages: LightboxImage[] = generatedImages.map((img, idx) => ({
    id: img.jobId,
    url: img.imageUrl,
    description: `Image ${idx + 1}`,
  }));

  const hasImages = generatedImages.length > 0 || isGenerating;
  const hasSelection = selectedUrls.size > 0;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Controls */}
      <div className={cn(
        'flex flex-wrap items-center gap-3',
        compact && 'gap-2'
      )}>
        {/* Count selector */}
        <div className="flex items-center gap-2">
          <span className={cn('text-sm text-slate-400', compact && 'text-xs')}>Quantité</span>
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg">
            <button
              type="button"
              onClick={() => setCount(Math.max(minCount, count - 1))}
              disabled={count <= minCount || isGenerating || disabled}
              className="p-2 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Minus className={cn('w-4 h-4', compact && 'w-3 h-3')} />
            </button>
            <span className={cn('w-8 text-center text-white font-medium', compact && 'text-sm')}>{count}</span>
            <button
              type="button"
              onClick={() => setCount(Math.min(maxCount, count + 1))}
              disabled={count >= maxCount || isGenerating || disabled}
              className="p-2 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className={cn('w-4 h-4', compact && 'w-3 h-3')} />
            </button>
          </div>
        </div>

        {/* Rushes button */}
        {showRushesIcon && rushes.length > 0 && onViewRushes && (
          <Button
            variant="ghost"
            size={compact ? 'sm' : 'default'}
            onClick={onViewRushes}
            className="text-slate-400 hover:text-white"
          >
            <History className={cn('w-4 h-4 mr-1', compact && 'w-3 h-3')} />
            <span className={cn(compact && 'text-xs')}>{rushes.length}</span>
          </Button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Generate button */}
        <Button
          onClick={handleGenerate}
          disabled={disabled || isGenerating}
          className={cn(
            'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white',
            compact && 'text-sm px-3 py-1.5 h-auto'
          )}
        >
          {isGenerating ? (
            <>
              <Loader2 className={cn('w-4 h-4 mr-2 animate-spin', compact && 'w-3 h-3 mr-1')} />
              {completedCount}/{count}
            </>
          ) : (
            <>
              <Sparkles className={cn('w-4 h-4 mr-2', compact && 'w-3 h-3 mr-1')} />
              {generateButtonText} {count}
            </>
          )}
        </Button>

        {/* Confirm button */}
        {hasSelection && !isGenerating && (
          <Button
            onClick={handleConfirm}
            className={cn(
              'bg-green-600 hover:bg-green-700 text-white',
              compact && 'text-sm px-3 py-1.5 h-auto'
            )}
          >
            <Check className={cn('w-4 h-4 mr-2', compact && 'w-3 h-3 mr-1')} />
            {confirmButtonText}
          </Button>
        )}
      </div>

      {/* Image grid */}
      {hasImages && (
        <div className={cn(
          'grid gap-3',
          count <= 2 ? 'grid-cols-2' :
          count <= 4 ? 'grid-cols-2 md:grid-cols-4' :
          'grid-cols-2 md:grid-cols-4',
          compact && 'gap-2'
        )}>
          {placeholders.map((placeholder, index) => {
            const generatedImg = generatedImages.find(g => g.jobId === placeholder.jobId);
            const imageUrl = placeholder.imageUrl || generatedImg?.imageUrl;

            if (imageUrl) {
              const isSelected = selectedUrls.has(imageUrl);
              const lightboxIdx = generatedImages.findIndex(g => g.imageUrl === imageUrl);

              return (
                <div
                  key={index}
                  className={cn(
                    'relative aspect-[var(--aspect)] rounded-lg overflow-hidden border-2 transition-all group cursor-pointer',
                    isSelected
                      ? 'border-green-500 ring-2 ring-green-500/30'
                      : 'border-white/10 hover:border-white/30'
                  )}
                  style={aspectStyle}
                  onClick={() => toggleSelection(imageUrl)}
                >
                  <StorageImg
                    src={imageUrl}
                    alt={`Generated ${index + 1}`}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {/* Selection overlay */}
                  <div className={cn(
                    'absolute inset-0 transition-all',
                    isSelected ? 'bg-green-500/20' : 'bg-black/0 group-hover:bg-black/20'
                  )}>
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>
                  {/* Expand button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIndex(lightboxIdx >= 0 ? lightboxIdx : 0);
                      setLightboxOpen(true);
                    }}
                    className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all z-10"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-white" />
                  </button>
                  {/* Image number */}
                  <div className={cn(
                    'absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white',
                    compact ? 'text-[10px]' : 'text-xs'
                  )}>
                    #{index + 1}
                  </div>
                </div>
              );
            }

            // Placeholder
            return (
              <GeneratingPlaceholder
                key={index}
                aspectRatio={aspectRatio}
                status={placeholder.status}
                progress={placeholder.progress}
              />
            );
          })}
        </div>
      )}

      {/* Status text */}
      {isGenerating && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Génération {completedCount}/{count}...</span>
        </div>
      )}

      {/* Selection hint */}
      {!isGenerating && generatedImages.length > 0 && !hasSelection && (
        <p className={cn('text-sm text-slate-500', compact && 'text-xs')}>
          Cliquez sur {multiSelect ? 'les images à garder' : "l'image à garder"}
        </p>
      )}

      {/* Lightbox */}
      <Lightbox
        images={lightboxImages}
        initialIndex={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  );
}
