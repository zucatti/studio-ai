'use client';

import { Shot } from '@/types/shot';
import { cn } from '@/lib/utils';
import { Image as ImageIcon, Check } from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { StorageImg } from '@/components/ui/storage-image';

interface ThumbnailStripProps {
  shots: Shot[];
  currentShotId?: string;
  onSelectShot: (shot: Shot) => void;
}

export function ThumbnailStrip({
  shots,
  currentShotId,
  onSelectShot,
}: ThumbnailStripProps) {
  return (
    <ScrollArea className="w-full whitespace-nowrap">
      <div className="flex gap-2 p-2">
        {shots.map((shot) => (
          <button
            key={shot.id}
            onClick={() => onSelectShot(shot)}
            className={cn(
              'relative flex-shrink-0 w-24 h-16 rounded-md overflow-hidden border-2 transition-all',
              currentShotId === shot.id
                ? 'border-primary ring-2 ring-primary/20'
                : 'border-transparent hover:border-muted-foreground/30'
            )}
          >
            {shot.storyboardImage ? (
              <StorageImg
                src={shot.storyboardImage}
                alt={`Plan ${shot.shotNumber}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-muted-foreground" />
              </div>
            )}

            {/* Shot number badge */}
            <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/70 rounded text-[10px] text-white font-mono">
              {shot.shotNumber}
            </div>

            {/* Completion indicator */}
            {shot.generationStatus === 'completed' && (
              <div className="absolute top-1 right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
          </button>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
