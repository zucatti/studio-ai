'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { StorageImg } from '@/components/ui/storage-image';
import { Lightbox, type LightboxImage } from '@/components/ui/lightbox';
import { Loader2, Grid3X3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Shot, ShotStatus } from '@/types/database';

export default function GalleryPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [shots, setShots] = useState<Shot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const fetchShots = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/projects/${projectId}/shots?status=selected`);
      if (res.ok) {
        const data = await res.json();
        // Filter to only show quick shots (no scene_id)
        const quickShots = (data.shots || []).filter((s: Shot) => !s.scene_id);
        setShots(quickShots);
      }
    } catch (error) {
      console.error('Failed to fetch gallery:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchShots();
  }, [fetchShots]);

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

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const handleMoveToRushes = async (shotId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/shots/${shotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rush' }),
      });

      if (res.ok) {
        setShots((prev) => prev.filter((s) => s.id !== shotId));
        // If no more images, close lightbox
        if (shots.length <= 1) {
          setLightboxOpen(false);
        }
      }
    } catch (error) {
      console.error('Failed to move to rushes:', error);
    }
  };

  const handleDelete = async (shotId: string) => {
    if (!confirm('Supprimer cette image ?')) return;

    try {
      const res = await fetch(`/api/projects/${projectId}/shots/${shotId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setShots((prev) => prev.filter((s) => s.id !== shotId));
        // If no more images, close lightbox
        if (shots.length <= 1) {
          setLightboxOpen(false);
        }
      }
    } catch (error) {
      console.error('Failed to delete shot:', error);
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
          <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
            <Grid3X3 className="w-6 h-6 text-yellow-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Gallery</h1>
            <p className="text-slate-500 text-sm">
              {shots.length} image{shots.length !== 1 ? 's' : ''} selectionnee{shots.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      {shots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mb-6">
            <Grid3X3 className="w-10 h-10 text-slate-600" />
          </div>
          <p className="text-slate-400 text-lg">Aucune image dans la gallery</p>
          <p className="text-slate-600 text-sm mt-1">
            Selectionnez des images depuis Quick Shot pour les ajouter ici.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {shots.map((shot, index) => (
              <div
                key={shot.id}
                onClick={() => openLightbox(index)}
                className="relative cursor-pointer rounded-xl overflow-hidden border-2 border-white/10 hover:border-white/30 transition-all duration-200 group"
              >
                <div className="aspect-[2/3]">
                  {shot.storyboard_image_url ? (
                    <StorageImg
                      src={shot.storyboard_image_url}
                      alt={shot.description || 'Gallery image'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-slate-800" />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Lightbox */}
          <Lightbox
            images={lightboxImages}
            initialIndex={lightboxIndex}
            isOpen={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
            onDelete={handleDelete}
            onMoveToRushes={handleMoveToRushes}
          />
        </>
      )}
    </div>
  );
}
