'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  Wand2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { QuickShotGenerator } from '@/components/quick-shot/QuickShotGenerator';
import type { AspectRatio, Shot } from '@/types/database';

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

export interface RushPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  aspectRatio?: AspectRatio;
  title?: string;
  /** Callback when an image is selected and validated */
  onSelect: (imageUrl: string) => void;
  /** Context label (e.g., "Frame In", "Frame Out") */
  context?: string;
}

export function RushPicker({
  open,
  onOpenChange,
  projectId,
  aspectRatio = '16:9',
  title = 'Rush',
  onSelect,
  context,
}: RushPickerProps) {
  // State
  const [images, setImages] = useState<RushImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredImage, setHoveredImage] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // View: 'browse' for viewing rush, 'generate' for generating new images
  const [view, setView] = useState<'browse' | 'generate'>('browse');

  // Fetch rush images
  const fetchImages = useCallback(async () => {
    if (!open) return;

    try {
      setIsLoading(true);
      // Fetch both rejected (rush) and selected (gallery) images
      const [rushRes, galleryRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/rush?status=rejected`),
        fetch(`/api/projects/${projectId}/rush?status=selected`),
      ]);

      const rushData = rushRes.ok ? await rushRes.json() : { images: [] };
      const galleryData = galleryRes.ok ? await galleryRes.json() : { images: [] };

      // Combine and sort by date (most recent first)
      const allImages = [
        ...(rushData.images || []),
        ...(galleryData.images || []),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setImages(allImages);
    } catch (error) {
      console.error('Failed to fetch images:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, open]);

  useEffect(() => {
    if (open) {
      fetchImages();
      setSelectedId(null);
      setView('browse');
    }
  }, [open, fetchImages]);

  // Handle validation - send to gallery AND to frame
  const handleValidate = async () => {
    if (!selectedId) return;

    const selectedImage = images.find(img => img.id === selectedId);
    if (!selectedImage) return;

    setIsUpdating(true);
    try {
      // Update status to 'selected' (move to gallery if not already)
      await fetch(`/api/projects/${projectId}/rush`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageIds: [selectedId],
          status: 'selected'
        }),
      });

      // Call the onSelect callback with the image URL
      onSelect(selectedImage.url);

      toast.success(context ? `Image appliquée à ${context}` : 'Image sélectionnée');
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to validate:', error);
      toast.error('Erreur lors de la validation');
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle new images generated
  const handleShotsGenerated = async (shots: Shot[]) => {
    // After generating, refresh the list and switch to browse view
    await fetchImages();
    setView('browse');
    toast.success(`${shots.length} image${shots.length > 1 ? 's' : ''} générée${shots.length > 1 ? 's' : ''}`);
  };

  // Handle image selected from generator (immediate validation)
  const handleImageSelected = async (url: string) => {
    // Directly use this image
    onSelect(url);
    toast.success(context ? `Image appliquée à ${context}` : 'Image sélectionnée');
    onOpenChange(false);
  };

  // Delete image
  const handleDelete = async (imageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Supprimer définitivement cette image ?')) return;

    try {
      await fetch(`/api/projects/${projectId}/rush?id=${imageId}`, {
        method: 'DELETE',
      });
      setImages(prev => prev.filter(img => img.id !== imageId));
      if (selectedId === imageId) {
        setSelectedId(null);
      }
      toast.success('Image supprimée');
    } catch (error) {
      console.error('Failed to delete:', error);
      toast.error('Erreur de suppression');
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

  const selectedImage = selectedId ? images.find(img => img.id === selectedId) : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            'max-w-[90vw] w-[90vw] h-[85vh] max-h-[85vh]',
            'flex flex-col p-0 gap-0',
            'bg-[#0a0e12] border-white/10',
            '[&>button]:hidden'
          )}
        >
          <DialogHeader className="flex-shrink-0 px-6 py-4 border-b border-white/10 bg-[#0f1419]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                  <Archive className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold text-white">
                    {title}
                    {context && (
                      <span className="ml-2 text-sm font-normal text-slate-400">
                        → {context}
                      </span>
                    )}
                  </DialogTitle>
                  <p className="text-sm text-slate-400">
                    {view === 'browse'
                      ? 'Sélectionnez une image ou générez-en de nouvelles'
                      : 'Générez de nouvelles images avec @Personnage #Lieu !Look'
                    }
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* View toggle */}
                <div className="flex bg-white/5 rounded-lg p-0.5 mr-2">
                  <button
                    onClick={() => setView('browse')}
                    className={cn(
                      'px-3 py-1.5 rounded text-sm transition-colors',
                      view === 'browse'
                        ? 'bg-white/10 text-white'
                        : 'text-slate-400 hover:text-white'
                    )}
                  >
                    <ImageIcon className="w-4 h-4 inline mr-1.5" />
                    Parcourir
                  </button>
                  <button
                    onClick={() => setView('generate')}
                    className={cn(
                      'px-3 py-1.5 rounded text-sm transition-colors',
                      view === 'generate'
                        ? 'bg-white/10 text-white'
                        : 'text-slate-400 hover:text-white'
                    )}
                  >
                    <Wand2 className="w-4 h-4 inline mr-1.5" />
                    Générer
                  </button>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 text-slate-300 hover:bg-white/5"
                  onClick={() => onOpenChange(false)}
                >
                  Annuler
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col">
            {view === 'browse' ? (
              <>
                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-64">
                      <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    </div>
                  ) : images.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mb-6">
                        <Film className="w-10 h-10 text-slate-600" />
                      </div>
                      <p className="text-slate-400 text-lg">Aucune image disponible</p>
                      <p className="text-slate-600 text-sm mt-1 mb-4">
                        Générez de nouvelles images avec le Rush Creator
                      </p>
                      <Button
                        onClick={() => setView('generate')}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        <Wand2 className="w-4 h-4 mr-2" />
                        Générer des images
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      {images.map((image, index) => {
                        const isSelected = selectedId === image.id;
                        const isHovered = hoveredImage === image.id;

                        return (
                          <div
                            key={image.id}
                            className={cn(
                              'relative group cursor-pointer rounded-xl overflow-hidden border-2 transition-all',
                              isSelected
                                ? 'border-green-500 ring-2 ring-green-500/30'
                                : 'border-white/10 hover:border-white/30'
                            )}
                            onClick={() => setSelectedId(isSelected ? null : image.id)}
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
                              <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
                                <Check className="w-4 h-4 text-white" />
                              </div>
                            )}

                            {/* Hover actions */}
                            {isHovered && (
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-2">
                                <button
                                  onClick={(e) => openLightbox(index, e)}
                                  className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                                  title="Agrandir"
                                >
                                  <Maximize2 className="w-4 h-4 text-white" />
                                </button>
                                <button
                                  onClick={(e) => handleDelete(image.id, e)}
                                  className="w-8 h-8 rounded-lg bg-red-500/50 hover:bg-red-500/70 flex items-center justify-center transition-colors"
                                  title="Supprimer"
                                >
                                  <Trash2 className="w-4 h-4 text-white" />
                                </button>
                              </div>
                            )}

                            {/* Prompt tooltip */}
                            {image.prompt && (
                              <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                <p className="text-[10px] text-white/80 line-clamp-2">
                                  {image.prompt}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer with validate button */}
                {images.length > 0 && (
                  <div className="flex-shrink-0 px-6 py-4 border-t border-white/10 bg-[#0f1419] flex items-center justify-between">
                    <div className="text-sm text-slate-400">
                      {selectedImage ? (
                        <span className="text-green-400">
                          1 image sélectionnée
                        </span>
                      ) : (
                        <span>
                          {images.length} image{images.length > 1 ? 's' : ''} disponible{images.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    <Button
                      onClick={handleValidate}
                      disabled={!selectedId || isUpdating}
                      className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                    >
                      {isUpdating ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4 mr-2" />
                      )}
                      Valider
                      {context && ` → ${context}`}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              /* Generate view */
              <div className="flex-1 overflow-y-auto p-6">
                <QuickShotGenerator
                  projectId={projectId}
                  defaultAspectRatio={aspectRatio}
                  onShotsGenerated={handleShotsGenerated}
                  onImageSelected={handleImageSelected}
                  lockAspectRatio={true}
                  showPlaceholders={true}
                  mode="multi"
                  title=""
                  description=""
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      <Lightbox
        images={lightboxImages}
        initialIndex={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
}
