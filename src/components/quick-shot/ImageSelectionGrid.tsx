'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Star, Check, Loader2 } from 'lucide-react';
import { StorageImg } from '@/components/ui/storage-image';
import type { Shot, ShotStatus } from '@/types/database';

interface ImageSelectionGridProps {
  shots: Shot[];
  onUpdateStatus: (shotId: string, status: ShotStatus) => Promise<void>;
  isUpdating: boolean;
}

export function ImageSelectionGrid({
  shots,
  onUpdateStatus,
  isUpdating,
}: ImageSelectionGridProps) {
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  const handleToggleSelect = async (shot: Shot) => {
    if (isUpdating || updatingIds.has(shot.id)) return;

    setUpdatingIds((prev) => new Set(prev).add(shot.id));
    try {
      const newStatus: ShotStatus = shot.status === 'selected' ? 'draft' : 'selected';
      await onUpdateStatus(shot.id, newStatus);
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(shot.id);
        return next;
      });
    }
  };

  if (shots.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p>Aucune image generee.</p>
        <p className="text-sm text-slate-600 mt-1">
          Utilisez le generateur ci-dessus pour creer des images.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {shots.map((shot) => {
        const isSelected = shot.status === 'selected';
        const isLoading = updatingIds.has(shot.id);

        return (
          <div
            key={shot.id}
            onClick={() => handleToggleSelect(shot)}
            className={cn(
              'relative group cursor-pointer rounded-xl overflow-hidden border-2 transition-all duration-200',
              isSelected
                ? 'border-yellow-400 ring-2 ring-yellow-400/30'
                : 'border-white/10 hover:border-white/30'
            )}
          >
            <div className="aspect-[2/3]">
              {shot.storyboard_image_url ? (
                <StorageImg
                  src={shot.storyboard_image_url}
                  alt={shot.description || 'Generated image'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                  <span className="text-slate-500 text-sm">No image</span>
                </div>
              )}
            </div>

            {/* Selection indicator */}
            <div
              className={cn(
                'absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-all',
                isSelected
                  ? 'bg-yellow-400 text-black'
                  : 'bg-black/50 text-white opacity-0 group-hover:opacity-100'
              )}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isSelected ? (
                <Star className="w-4 h-4 fill-current" />
              ) : (
                <Check className="w-4 h-4" />
              )}
            </div>

            {/* Description tooltip */}
            {shot.description && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-white text-xs line-clamp-2">{shot.description}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
