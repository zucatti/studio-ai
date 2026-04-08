'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { StorageImg } from '@/components/ui/storage-image';
import { Lightbox, type LightboxImage } from '@/components/ui/lightbox';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  Maximize2,
  Trash2,
  Archive,
  Check,
  ImageIcon,
  Film,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface RushImage {
  id: string;
  project_id: string;
  user_id: string;
  url: string;
  prompt: string | null;
  aspect_ratio: string | null;
  model: string | null;
  created_at: string;
}

export default function RushPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  // State
  const [images, setImages] = useState<RushImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hoveredImage, setHoveredImage] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Fetch rejected rush images
  const fetchImages = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/projects/${projectId}/rush?status=rejected`);
      if (res.ok) {
        const data = await res.json();
        setImages(data.images || []);
      }
    } catch (error) {
      console.error('Failed to fetch rush images:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  // Toggle selection
  const toggleSelection = (imageId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(imageId)) {
        next.delete(imageId);
      } else {
        next.add(imageId);
      }
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(images.map(img => img.id)));
  const deselectAll = () => setSelectedIds(new Set());

  // Move selected to gallery
  const sendToGallery = async () => {
    if (selectedIds.size === 0) return;

    setIsUpdating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/rush`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageIds: Array.from(selectedIds),
          status: 'selected'
        }),
      });

      if (res.ok) {
        setImages(prev => prev.filter(img => !selectedIds.has(img.id)));
        toast.success(`${selectedIds.size} image${selectedIds.size > 1 ? 's' : ''} envoyée${selectedIds.size > 1 ? 's' : ''} vers Gallery`);
        setSelectedIds(new Set());
      } else {
        toast.error('Erreur lors du transfert');
      }
    } catch (error) {
      console.error('Failed to update status:', error);
      toast.error('Erreur de connexion');
    } finally {
      setIsUpdating(false);
    }
  };

  // Delete permanently
  const handleDelete = async (imageId: string) => {
    if (!confirm('Supprimer définitivement cette image ?')) return;

    try {
      const res = await fetch(`/api/projects/${projectId}/rush?id=${imageId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setImages(prev => prev.filter(img => img.id !== imageId));
        setSelectedIds(prev => {
          const next = new Set(prev);
          next.delete(imageId);
          return next;
        });
        toast.success('Image supprimée');
      }
    } catch (error) {
      console.error('Failed to delete:', error);
      toast.error('Erreur de suppression');
    }
  };

  // Delete all selected
  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Supprimer définitivement ${selectedIds.size} image${selectedIds.size > 1 ? 's' : ''} ?`)) return;

    setIsUpdating(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map(id =>
          fetch(`/api/projects/${projectId}/rush?id=${id}`, { method: 'DELETE' })
        )
      );

      setImages(prev => prev.filter(img => !selectedIds.has(img.id)));
      toast.success(`${selectedIds.size} image${selectedIds.size > 1 ? 's' : ''} supprimée${selectedIds.size > 1 ? 's' : ''}`);
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Failed to delete:', error);
      toast.error('Erreur de suppression');
    } finally {
      setIsUpdating(false);
    }
  };

  // Lightbox
  const lightboxImages = useMemo((): LightboxImage[] => {
    return images.map(img => ({
      id: img.id,
      url: img.url,
      description: img.prompt || undefined,
    }));
  }, [images]);

  const openLightbox = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const hasSelected = selectedIds.size > 0;

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
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
          <Archive className="w-6 h-6 text-orange-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Rush</h1>
          <p className="text-slate-500 text-sm">
            Images stockées - Envoyez-les en Gallery si besoin
          </p>
        </div>
      </div>

      {/* Content */}
      {images.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mb-6">
            <Film className="w-10 h-10 text-slate-600" />
          </div>
          <p className="text-slate-400 text-lg">Aucune image dans les rush</p>
          <p className="text-slate-600 text-sm mt-1">
            Cliquez &quot;Rush&quot; dans le Rush Creator pour stocker des images ici
          </p>
        </div>
      ) : (
        <div>
          {/* Action bar */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold text-white">
                Rush ({images.length})
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={selectAll}
                  className="text-sm text-slate-400 hover:text-white transition-colors"
                >
                  Tout selectionner
                </button>
                {hasSelected && (
                  <>
                    <span className="text-slate-600">|</span>
                    <button
                      onClick={deselectAll}
                      className="text-sm text-slate-400 hover:text-white transition-colors"
                    >
                      Deselectionner
                    </button>
                  </>
                )}
              </div>
            </div>

            {hasSelected && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-yellow-400 mr-2">
                  {selectedIds.size} selectionnee{selectedIds.size > 1 ? 's' : ''}
                </span>
                <Button
                  onClick={sendToGallery}
                  disabled={isUpdating}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {isUpdating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ImageIcon className="w-4 h-4 mr-2" />
                  )}
                  Vers Gallery
                </Button>
                <Button
                  onClick={deleteSelected}
                  disabled={isUpdating}
                  variant="outline"
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Supprimer
                </Button>
              </div>
            )}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {images.map((image, index) => {
              const isSelected = selectedIds.has(image.id);
              const isHovered = hoveredImage === image.id;

              return (
                <div
                  key={image.id}
                  className={cn(
                    'relative group cursor-pointer rounded-xl overflow-hidden border-2 transition-all',
                    isSelected
                      ? 'border-yellow-500 ring-2 ring-yellow-500/30'
                      : 'border-white/10 hover:border-white/30'
                  )}
                  onClick={() => toggleSelection(image.id)}
                  onMouseEnter={() => setHoveredImage(image.id)}
                  onMouseLeave={() => setHoveredImage(null)}
                >
                  <StorageImg
                    src={image.url}
                    alt={image.prompt || 'Rush image'}
                    className="w-full aspect-square object-cover"
                  />

                  {/* Selection badge */}
                  {isSelected && (
                    <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center shadow-lg">
                      <Check className="w-4 h-4 text-black" />
                    </div>
                  )}

                  {/* Hover overlay */}
                  {isHovered && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-2">
                      <button
                        onClick={(e) => openLightbox(index, e)}
                        className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center hover:bg-white/30 transition-colors"
                        title="Agrandir"
                      >
                        <Maximize2 className="w-5 h-5 text-white" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(image.id);
                        }}
                        className="w-10 h-10 rounded-full bg-red-500/20 backdrop-blur flex items-center justify-center hover:bg-red-500/40 transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-5 h-5 text-red-400" />
                      </button>
                    </div>
                  )}

                  {/* Prompt preview */}
                  {image.prompt && !isHovered && (
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                      <p className="text-[10px] text-white/80 truncate">
                        {image.prompt}
                      </p>
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
            onDelete={handleDelete}
          />
        </div>
      )}
    </div>
  );
}
