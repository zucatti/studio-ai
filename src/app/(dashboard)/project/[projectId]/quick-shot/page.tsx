'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { QuickShotGenerator } from '@/components/quick-shot/QuickShotGenerator';
import { ImageSelectionGrid } from '@/components/quick-shot/ImageSelectionGrid';
import { StorageImg } from '@/components/ui/storage-image';
import { Lightbox, type LightboxImage } from '@/components/ui/lightbox';
import { ProjectBibleButton } from '@/components/bible/ProjectBible';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  ArrowRight,
  Trash2,
  Zap,
  Maximize2,
  Check,
  ImageIcon,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Shot, Project, ShotStatus, AspectRatio } from '@/types/database';

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

export default function QuickShotPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  // Portfolio mode (shots table)
  const [shots, setShots] = useState<Shot[]>([]);
  const [isMovingToGallery, setIsMovingToGallery] = useState(false);

  // Shorts mode (rush_images table)
  const [rushImages, setRushImages] = useState<RushImage[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hoveredImage, setHoveredImage] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const isShorts = project?.project_type === 'shorts_project';

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);

      // Fetch project first
      const projectRes = await fetch(`/api/projects/${projectId}`);
      if (!projectRes.ok) return;

      const projectData = await projectRes.json();
      setProject(projectData.project);

      const projectType = projectData.project?.project_type;

      if (projectType === 'shorts_project') {
        // Shorts: fetch rush_images with pending status
        const rushRes = await fetch(`/api/projects/${projectId}/rush`);
        if (rushRes.ok) {
          const rushData = await rushRes.json();
          setRushImages(rushData.images || []);
        }
      } else {
        // Portfolio: fetch shots with draft status
        const shotsRes = await fetch(`/api/projects/${projectId}/shots?status=draft`);
        if (shotsRes.ok) {
          const shotsData = await shotsRes.json();
          const quickShots = (shotsData.shots || []).filter((s: Shot) => !s.scene_id);
          setShots(quickShots);
        }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // === SHORTS MODE HANDLERS ===

  const handleShotsGeneratedShorts = useCallback((newShots: Shot[]) => {
    const newImages: RushImage[] = newShots.map(shot => ({
      id: shot.id,
      project_id: projectId,
      user_id: '',
      url: shot.storyboard_image_url || '',
      prompt: shot.description || null,
      aspect_ratio: null,
      model: null,
      created_at: shot.created_at || new Date().toISOString(),
    }));
    setRushImages(prev => [...newImages, ...prev]);
  }, [projectId]);

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

  const selectAll = () => setSelectedIds(new Set(rushImages.map(img => img.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const updateRushStatus = async (imageIds: string[], status: 'selected' | 'rejected') => {
    if (imageIds.length === 0) return;

    setIsUpdating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/rush`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageIds, status }),
      });

      if (res.ok) {
        setRushImages(prev => prev.filter(img => !imageIds.includes(img.id)));
        setSelectedIds(prev => {
          const next = new Set(prev);
          imageIds.forEach(id => next.delete(id));
          return next;
        });

        const label = status === 'selected' ? 'Gallery' : 'Rush';
        toast.success(`${imageIds.length} image${imageIds.length > 1 ? 's' : ''} envoyée${imageIds.length > 1 ? 's' : ''} vers ${label}`);
      } else {
        toast.error('Erreur lors de la mise à jour');
      }
    } catch (error) {
      console.error('Failed to update status:', error);
      toast.error('Erreur de connexion');
    } finally {
      setIsUpdating(false);
    }
  };

  const sendToGalleryShorts = () => updateRushStatus(Array.from(selectedIds), 'selected');
  const sendToRushShorts = () => updateRushStatus(Array.from(selectedIds), 'rejected');

  const handleDeleteRush = async (imageId: string) => {
    if (!confirm('Supprimer définitivement cette image ?')) return;

    try {
      const res = await fetch(`/api/projects/${projectId}/rush?id=${imageId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setRushImages(prev => prev.filter(img => img.id !== imageId));
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

  const lightboxImages = useMemo((): LightboxImage[] => {
    return rushImages.map(img => ({
      id: img.id,
      url: img.url,
      description: img.prompt || undefined,
    }));
  }, [rushImages]);

  const openLightbox = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  // === PORTFOLIO MODE HANDLERS ===

  const handleShotsGeneratedPortfolio = (newShots: Shot[]) => {
    setShots(prev => [...newShots, ...prev]);
  };

  const handleUpdateShotStatus = async (shotId: string, status: ShotStatus) => {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/shots/${shotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        setShots(prev => prev.map(s => (s.id === shotId ? { ...s, status } : s)));
      }
    } catch (error) {
      console.error('Failed to update shot:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleMoveSelectedToGallery = async () => {
    const selectedShots = shots.filter(s => s.status === 'selected');
    if (selectedShots.length === 0) return;

    setIsMovingToGallery(true);
    try {
      router.push(`/project/${projectId}/gallery`);
    } finally {
      setIsMovingToGallery(false);
    }
  };

  const handleMoveOthersToRushes = async () => {
    const draftShots = shots.filter(s => s.status === 'draft');
    if (draftShots.length === 0) return;

    setIsUpdating(true);
    try {
      await Promise.all(
        draftShots.map(shot =>
          fetch(`/api/projects/${projectId}/shots/${shot.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'rush' }),
          })
        )
      );
      setShots(prev => prev.filter(s => s.status === 'selected'));
    } catch (error) {
      console.error('Failed to move shots to rushes:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const selectedCount = shots.filter(s => s.status === 'selected').length;
  const draftCount = shots.filter(s => s.status === 'draft').length;
  const hasSelectedRush = selectedIds.size > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  // === SHORTS MODE UI ===
  if (isShorts) {
    return (
      <div className="space-y-8 pb-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Zap className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Quick Shot</h1>
              <p className="text-slate-500 text-sm">
                Generez des images, selectionnez les meilleures pour Gallery
              </p>
            </div>
          </div>
          <ProjectBibleButton projectId={projectId} />
        </div>

        {/* Generator */}
        <QuickShotGenerator
          projectId={projectId}
          defaultAspectRatio={(project?.aspect_ratio as AspectRatio) || '9:16'}
          onShotsGenerated={handleShotsGeneratedShorts}
          apiEndpoint={`/api/projects/${projectId}/queue-rush`}
          title="Quick Shot Generator"
          lockAspectRatio={true}
          description="Generez des photos avec @Personnage #Lieu !Reference"
          mode="multi"
        />

        {/* Images Grid */}
        {rushImages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mb-6">
              <Sparkles className="w-10 h-10 text-slate-600" />
            </div>
            <p className="text-slate-400 text-lg">Aucune image en attente</p>
            <p className="text-slate-600 text-sm mt-1">
              Generez des photos ci-dessus, puis selectionnez les meilleures pour Gallery
            </p>
          </div>
        ) : (
          <div>
            {/* Action bar */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold text-white">
                  En attente ({rushImages.length})
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAll}
                    className="text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    Tout selectionner
                  </button>
                  {hasSelectedRush && (
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

              {hasSelectedRush && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-yellow-400 mr-2">
                    {selectedIds.size} selectionnee{selectedIds.size > 1 ? 's' : ''}
                  </span>
                  <Button
                    onClick={sendToGalleryShorts}
                    disabled={isUpdating}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isUpdating ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <ImageIcon className="w-4 h-4 mr-2" />
                    )}
                    Gallery
                  </Button>
                  <Button
                    onClick={sendToRushShorts}
                    disabled={isUpdating}
                    variant="outline"
                    className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                  >
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Rush
                  </Button>
                </div>
              )}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {rushImages.map((image, index) => {
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
                      alt={image.prompt || 'Quick shot image'}
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
                            handleDeleteRush(image.id);
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
              onDelete={handleDeleteRush}
            />
          </div>
        )}
      </div>
    );
  }

  // === PORTFOLIO MODE UI ===
  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Quick Shot</h1>
          <p className="text-slate-500 text-sm mt-1">
            Generez rapidement des images a partir de votre Bible
          </p>
        </div>
        <ProjectBibleButton projectId={projectId} />
      </div>

      {/* Generator */}
      <QuickShotGenerator
        projectId={projectId}
        defaultAspectRatio={(project?.aspect_ratio as AspectRatio) || '2:3'}
        onShotsGenerated={handleShotsGeneratedPortfolio}
        mode="multi"
      />

      {/* Results */}
      {shots.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Resultats ({shots.length})
            </h2>
            <div className="flex items-center gap-3">
              {selectedCount > 0 && (
                <Button
                  onClick={handleMoveSelectedToGallery}
                  disabled={isMovingToGallery}
                  className="bg-yellow-500 hover:bg-yellow-600 text-black"
                >
                  {isMovingToGallery ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4 mr-2" />
                  )}
                  Garder {selectedCount} vers Gallery
                </Button>
              )}
              {draftCount > 0 && (
                <Button
                  onClick={handleMoveOthersToRushes}
                  disabled={isUpdating}
                  variant="outline"
                  className="border-white/10 text-slate-400 hover:text-white hover:bg-white/5"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Autres vers Rush
                </Button>
              )}
            </div>
          </div>

          <div className="text-sm text-slate-500 mb-2">
            Cliquez sur une image pour la selectionner
          </div>

          <ImageSelectionGrid
            shots={shots}
            onUpdateStatus={handleUpdateShotStatus}
            isUpdating={isUpdating}
          />
        </div>
      )}
    </div>
  );
}
