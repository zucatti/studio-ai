'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { StorageImg } from '@/components/ui/storage-image';
import { Lightbox, type LightboxImage } from '@/components/ui/lightbox';
import { Button } from '@/components/ui/button';
import { Loader2, Archive, Star, Trash2, ArrowRight, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Shot, ShotStatus } from '@/types/database';

export default function RushesPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [shots, setShots] = useState<Shot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedShots, setSelectedShots] = useState<Set<string>>(new Set());
  const [isUpdating, setIsUpdating] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Convert shots to lightbox images
  const lightboxImages = useMemo((): LightboxImage[] => {
    return shots
      .filter((s) => s.storyboard_image_url)
      .map((s) => ({
        id: s.id,
        url: s.storyboard_image_url!,
        description: s.description || undefined,
      }));
  }, [shots]);

  const openLightbox = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const handleMoveToGalleryFromLightbox = async (shotId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/shots/${shotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'selected' }),
      });

      if (res.ok) {
        setShots((prev) => prev.filter((s) => s.id !== shotId));
        if (shots.length <= 1) {
          setLightboxOpen(false);
        }
      }
    } catch (error) {
      console.error('Failed to move to gallery:', error);
    }
  };

  const handleDeleteFromLightbox = async (shotId: string) => {
    if (!confirm('Supprimer cette image ?')) return;

    try {
      const res = await fetch(`/api/projects/${projectId}/shots/${shotId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setShots((prev) => prev.filter((s) => s.id !== shotId));
        if (shots.length <= 1) {
          setLightboxOpen(false);
        }
      }
    } catch (error) {
      console.error('Failed to delete shot:', error);
    }
  };

  const fetchShots = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/projects/${projectId}/shots?status=rush`);
      if (res.ok) {
        const data = await res.json();
        // Filter to only show quick shots (no scene_id)
        const quickShots = (data.shots || []).filter((s: Shot) => !s.scene_id);
        setShots(quickShots);
      }
    } catch (error) {
      console.error('Failed to fetch rushes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchShots();
  }, [fetchShots]);

  const toggleSelection = (shotId: string) => {
    setSelectedShots((prev) => {
      const next = new Set(prev);
      if (next.has(shotId)) {
        next.delete(shotId);
      } else {
        next.add(shotId);
      }
      return next;
    });
  };

  const handleMoveToGallery = async () => {
    if (selectedShots.size === 0) return;

    setIsUpdating(true);
    try {
      await Promise.all(
        Array.from(selectedShots).map((shotId) =>
          fetch(`/api/projects/${projectId}/shots/${shotId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'selected' }),
          })
        )
      );

      // Remove from rushes
      setShots((prev) => prev.filter((s) => !selectedShots.has(s.id)));
      setSelectedShots(new Set());
    } catch (error) {
      console.error('Failed to move shots:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedShots.size === 0) return;
    if (!confirm(`Supprimer ${selectedShots.size} image(s) ?`)) return;

    setIsUpdating(true);
    try {
      await Promise.all(
        Array.from(selectedShots).map((shotId) =>
          fetch(`/api/projects/${projectId}/shots/${shotId}`, {
            method: 'DELETE',
          })
        )
      );

      setShots((prev) => prev.filter((s) => !selectedShots.has(s.id)));
      setSelectedShots(new Set());
    } catch (error) {
      console.error('Failed to delete shots:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-500/20 flex items-center justify-center">
            <Archive className="w-6 h-6 text-slate-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Rushes</h1>
            <p className="text-slate-500 text-sm">
              {shots.length} image{shots.length !== 1 ? 's' : ''} non selectionnee{shots.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {selectedShots.size > 0 && (
          <div className="flex items-center gap-3">
            <Button
              onClick={handleMoveToGallery}
              disabled={isUpdating}
              className="bg-yellow-500 hover:bg-yellow-600 text-black"
            >
              {isUpdating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4 mr-2" />
              )}
              Vers Gallery ({selectedShots.size})
            </Button>
            <Button
              onClick={handleDeleteSelected}
              disabled={isUpdating}
              variant="outline"
              className="border-red-500/30 text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Supprimer
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      {shots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mb-6">
            <Archive className="w-10 h-10 text-slate-600" />
          </div>
          <p className="text-slate-400 text-lg">Aucun rush</p>
          <p className="text-slate-600 text-sm mt-1">
            Les images non selectionnees apparaitront ici.
          </p>
        </div>
      ) : (
        <div>
          <div className="text-sm text-slate-500 mb-4">
            Cliquez pour selectionner, puis deplacez vers la Gallery ou supprimez
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {shots.map((shot, index) => {
              const isSelected = selectedShots.has(shot.id);
              return (
                <div
                  key={shot.id}
                  onClick={() => toggleSelection(shot.id)}
                  className={cn(
                    'relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all duration-200 opacity-75 hover:opacity-100 group',
                    isSelected
                      ? 'border-blue-500 ring-2 ring-blue-500/30 opacity-100'
                      : 'border-white/10 hover:border-white/30'
                  )}
                >
                  <div className="aspect-[2/3]">
                    {shot.storyboard_image_url ? (
                      <StorageImg
                        src={shot.storyboard_image_url}
                        alt={shot.description || 'Rush image'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-slate-800" />
                    )}
                  </div>

                  {/* View full button */}
                  <button
                    onClick={(e) => openLightbox(index, e)}
                    className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-white" />
                  </button>

                  {/* Selection indicator */}
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                      <Star className="w-3.5 h-3.5 text-white fill-current" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Lightbox */}
          <Lightbox
            images={lightboxImages}
            initialIndex={lightboxIndex}
            isOpen={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
            onDelete={handleDeleteFromLightbox}
            onMoveToGallery={handleMoveToGalleryFromLightbox}
          />
        </div>
      )}
    </div>
  );
}
