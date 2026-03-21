'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { StorageImg } from '@/components/ui/storage-image';
import { Lightbox, type LightboxImage } from '@/components/ui/lightbox';
import { Loader2, Grid3X3, Trash2, Maximize2 } from 'lucide-react';
import { toast } from 'sonner';
import type { GalleryImage } from '@/app/api/gallery/route';

export default function GalleryPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [images, setImages] = useState<GalleryImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [hoveredImage, setHoveredImage] = useState<string | null>(null);

  const fetchImages = useCallback(async () => {
    try {
      setIsLoading(true);
      // Fetch from global gallery API, then filter by current project
      const res = await fetch('/api/gallery');
      if (res.ok) {
        const data = await res.json();
        // Filter to only show images from this project
        const projectImages = (data.images || []).filter(
          (img: GalleryImage) => img.projectId === projectId
        );
        setImages(projectImages);
      }
    } catch (error) {
      console.error('Failed to fetch gallery:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  // Convert to lightbox images
  const lightboxImages = useMemo((): LightboxImage[] => {
    return images.map((img) => ({
      id: img.id,
      url: img.url,
      description: img.description || undefined,
    }));
  }, [images]);

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const handleDelete = async (imageId: string) => {
    if (!confirm('Supprimer cette image ?')) return;

    try {
      // Parse the image ID to determine type and actual ID
      // Formats: 'rush-{id}', '{shotId}-storyboard', '{shotId}-first', '{shotId}-last'
      let endpoint: string;

      if (imageId.startsWith('rush-')) {
        // Rush image
        const actualId = imageId.replace('rush-', '');
        endpoint = `/api/projects/${projectId}/rush?id=${actualId}`;
      } else if (imageId.endsWith('-storyboard') || imageId.endsWith('-first') || imageId.endsWith('-last')) {
        // Shot image - extract the shot ID
        const shotId = imageId.replace(/-storyboard$|-first$|-last$/, '');
        endpoint = `/api/projects/${projectId}/shots/${shotId}`;
      } else {
        // Unknown format, try as direct ID
        endpoint = `/api/projects/${projectId}/shots/${imageId}`;
      }

      const res = await fetch(endpoint, {
        method: 'DELETE',
      });

      if (res.ok) {
        setImages((prev) => prev.filter((img) => img.id !== imageId));
        toast.success('Image supprimee');
        // If no more images, close lightbox
        if (images.length <= 1) {
          setLightboxOpen(false);
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error('Delete failed:', res.status, errorData);
        toast.error(`Erreur: ${errorData.error || res.statusText}`);
      }
    } catch (error) {
      console.error('Failed to delete image:', error);
      toast.error('Erreur de suppression');
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
              {images.length} image{images.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      {images.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mb-6">
            <Grid3X3 className="w-10 h-10 text-slate-600" />
          </div>
          <p className="text-slate-400 text-lg">Aucune image dans la gallery</p>
          <p className="text-slate-600 text-sm mt-1">
            Generez des images depuis Rush pour les voir ici.
          </p>
        </div>
      ) : (
        <>
          <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-4 space-y-4">
            {images.map((image, index) => (
              <div
                key={image.id}
                className="break-inside-avoid relative group"
                onMouseEnter={() => setHoveredImage(image.id)}
                onMouseLeave={() => setHoveredImage(null)}
              >
                <div className="rounded-xl overflow-hidden border border-white/10 hover:border-white/20 transition-colors">
                  <StorageImg
                    src={image.url}
                    alt={image.description || 'Gallery image'}
                    className="w-full h-auto"
                  />
                </div>

                {/* Hover actions */}
                {hoveredImage === image.id && (
                  <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center gap-2">
                    <button
                      onClick={() => openLightbox(index)}
                      className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center hover:bg-white/30 transition-colors"
                    >
                      <Maximize2 className="w-5 h-5 text-white" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(image.id);
                      }}
                      className="w-10 h-10 rounded-full bg-red-500/20 backdrop-blur flex items-center justify-center hover:bg-red-500/40 transition-colors"
                    >
                      <Trash2 className="w-5 h-5 text-red-400" />
                    </button>
                  </div>
                )}

                {/* Description preview */}
                {image.description && (
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent rounded-b-xl opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[10px] text-white/80 truncate">
                      {image.description}
                    </p>
                  </div>
                )}
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
          />
        </>
      )}
    </div>
  );
}
