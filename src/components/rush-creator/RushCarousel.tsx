'use client';

import { ChevronLeft, ChevronRight, ImagePlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRushCreatorStore, type PendingJob } from '@/store/rush-creator-store';
import { RushMediaCard } from './RushMediaCard';
import { GeneratingPlaceholder } from '@/components/ui/generating-placeholder';
import { StorageImg } from '@/components/ui/storage-image';
import type { RushMedia } from '@/types/database';

// Combined item type for carousel
type CarouselItem =
  | { type: 'source'; url: string }
  | { type: 'pending'; job: PendingJob }
  | { type: 'media'; media: RushMedia };

export function RushCarousel() {
  const {
    media,
    pendingJobs,
    currentIndex,
    navigateTo,
    navigatePrev,
    navigateNext,
    getTotalItems,
    sourceImageUrl,
    setSourceImageUrl,
  } = useRushCreatorStore();

  // Combine source image, pending jobs, and media into a single array
  // Source image appears first if present, then pending jobs, then media
  const items: CarouselItem[] = [
    ...(sourceImageUrl ? [{ type: 'source' as const, url: sourceImageUrl }] : []),
    ...pendingJobs.map(job => ({ type: 'pending' as const, job })),
    ...media.map(m => ({ type: 'media' as const, media: m })),
  ];

  const totalItems = items.length;
  const isFirstItem = currentIndex === 0;
  const isLastItem = currentIndex === totalItems - 1;

  // Slide width - much larger to use available space
  const slideWidth = 'min(55vw, 600px)';
  const halfSlideWidth = 'min(27.5vw, 300px)';

  if (totalItems === 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 flex items-center overflow-hidden">
      {/* Carousel track */}
      <div
        className="flex items-center gap-10 transition-transform duration-300 ease-out"
        style={{
          transform: `translateX(calc(50vw - ${currentIndex} * (${slideWidth} + 40px) - ${halfSlideWidth}))`,
        }}
      >
        {items.map((item, index) => {
          const isCurrent = index === currentIndex;
          const isNear = Math.abs(index - currentIndex) <= 2;
          const key = item.type === 'source'
            ? 'source-image'
            : item.type === 'pending'
              ? `pending-${item.job.jobId}`
              : `media-${item.media.id}`;

          return (
            <div
              key={key}
              style={{ width: slideWidth }}
              onClick={() => {
                if (!isCurrent) {
                  navigateTo(index);
                }
              }}
              className={cn(
                'transition-all duration-300 flex-shrink-0',
                isCurrent ? 'opacity-100 scale-100 z-10' : 'opacity-40 scale-95 cursor-pointer hover:opacity-60',
                !isNear && 'opacity-0 pointer-events-none'
              )}
            >
              {item.type === 'source' ? (
                <SourceImageCard url={item.url} isCurrent={isCurrent} onRemove={() => setSourceImageUrl(null)} />
              ) : item.type === 'pending' ? (
                <PendingCard job={item.job} isCurrent={isCurrent} />
              ) : (
                <RushMediaCard media={item.media} isCurrent={isCurrent} />
              )}
            </div>
          );
        })}
      </div>

      {/* Navigation arrows */}
      {!isFirstItem && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigatePrev();
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors"
          title="Précédent (←)"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
      )}
      {!isLastItem && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigateNext();
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors"
          title="Suivant (→)"
        >
          <ChevronRight className="w-6 h-6 text-white" />
        </button>
      )}

      {/* Counter */}
      {totalItems > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 px-3 py-1 rounded-full bg-white/10 backdrop-blur text-white text-sm">
          {currentIndex + 1} / {totalItems}
        </div>
      )}
    </div>
  );
}

// Source image card with special tag - respects natural aspect ratio
function SourceImageCard({ url, isCurrent, onRemove }: { url: string; isCurrent: boolean; onRemove: () => void }) {
  return (
    <div className={cn(
      'relative rounded-xl overflow-hidden shadow-2xl flex items-center justify-center',
      isCurrent && 'ring-2 ring-amber-500/50'
    )}>
      <StorageImg
        src={url}
        alt="Image de référence"
        className="max-w-full max-h-[60vh] object-contain rounded-xl"
      />

      {/* Reference tag */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold shadow-lg">
        <ImagePlus className="w-3.5 h-3.5" />
        Image de référence
      </div>

      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-black/50 hover:bg-red-500/80 flex items-center justify-center transition-colors"
        title="Retirer l'image de référence"
      >
        <X className="w-4 h-4 text-white" />
      </button>

      {/* Info overlay at bottom */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8">
        <p className="text-xs text-amber-300">
          Cette image sera utilisée comme base pour la génération
        </p>
      </div>
    </div>
  );
}

// Pending job card with rainbow animation
function PendingCard({ job, isCurrent }: { job: PendingJob; isCurrent: boolean }) {
  return (
    <div className={cn(
      'relative rounded-xl overflow-hidden shadow-2xl',
      isCurrent && 'ring-2 ring-blue-500/50'
    )}>
      <GeneratingPlaceholder
        aspectRatio={job.aspectRatio}
        status={job.status}
        progress={job.progress}
        startedAt={job.startedAt}
        label={job.mode === 'photo' ? 'Image' : 'Vidéo'}
      />

      {/* Prompt preview */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8">
        <p className="text-xs text-white/70 line-clamp-2">{job.prompt}</p>
      </div>
    </div>
  );
}
