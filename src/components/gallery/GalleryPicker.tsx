'use client';

import { useEffect, useState, useCallback } from 'react';
import { Images, Folder, Loader2, ChevronLeft, Check, ArrowLeft, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { StorageImg } from '@/components/ui/storage-image';
import { QuickShotGenerator } from '@/components/quick-shot/QuickShotGenerator';
import { GeneratingPlaceholder } from '@/components/ui/generating-placeholder';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { GalleryImage, GalleryProject } from '@/app/api/gallery/route';
import type { AspectRatio, Shot } from '@/types/database';

interface GalleryPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (imageUrl: string, image: GalleryImage, lookName?: string, lookDescription?: string) => void;
  title?: string;
  /** If true, shows a name/description form after image selection */
  requireLookInfo?: boolean;
  /** Filter images by aspect ratio */
  aspectRatio?: string;
  /** Current project ID to prioritize */
  currentProjectId?: string;
  /** Allow selecting from other projects */
  allowOtherProjects?: boolean;
}

export function GalleryPicker({
  isOpen,
  onClose,
  onSelect,
  title = 'Choisir depuis la Galerie',
  requireLookInfo = false,
  aspectRatio,
  currentProjectId,
  allowOtherProjects = true,
}: GalleryPickerProps) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [projects, setProjects] = useState<GalleryProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [hoveredImage, setHoveredImage] = useState<string | null>(null);

  // For requireLookInfo mode - two-step flow
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [lookName, setLookName] = useState('');
  const [lookDescription, setLookDescription] = useState('');

  // Rush generator mode
  const [showCreateMode, setShowCreateMode] = useState(false);

  // Generation in progress - show placeholder in gallery
  const [isGeneratingInGallery, setIsGeneratingInGallery] = useState(false);

  // Newly generated images that should be highlighted
  const [newlyGeneratedIds, setNewlyGeneratedIds] = useState<Set<string>>(new Set());

  const fetchGallery = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/gallery');
      if (res.ok) {
        const data = await res.json();
        setImages(data.images || []);
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error('Error fetching gallery:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchGallery();
      setSelectedProjectId(null);
      setSelectedImage(null);
      setLookName('');
      setLookDescription('');
      setShowCreateMode(false);
      setNewlyGeneratedIds(new Set());
      setIsGeneratingInGallery(false);
    }
  }, [isOpen, fetchGallery]);

  // Filter images by aspect ratio if specified
  const aspectFilteredImages = aspectRatio
    ? images.filter(img => {
        // If image has aspectRatio, match it; otherwise include it
        if (img.aspectRatio) {
          return img.aspectRatio === aspectRatio;
        }
        return true; // Include images without aspectRatio info
      })
    : images;

  // Further filter by project if selected
  const filteredImages = selectedProjectId
    ? (selectedProjectId === 'all'
        ? aspectFilteredImages
        : aspectFilteredImages.filter(img => img.projectId === selectedProjectId))
    : aspectFilteredImages;

  // Sort projects - current project first
  const sortedProjects = currentProjectId
    ? [...projects].sort((a, b) => {
        if (a.id === currentProjectId) return -1;
        if (b.id === currentProjectId) return 1;
        return b.imageCount - a.imageCount;
      })
    : projects;

  // If not allowing other projects, only show current project
  const displayProjects = allowOtherProjects
    ? sortedProjects
    : sortedProjects.filter(p => p.id === currentProjectId);

  const selectedProject = selectedProjectId
    ? projects.find(p => p.id === selectedProjectId)
    : null;

  const handleImageClick = (image: GalleryImage) => {
    if (requireLookInfo) {
      // Go to step 2 - enter look info
      setSelectedImage(image);
    } else {
      // Direct selection
      onSelect(image.url, image);
      onClose();
    }
  };

  const handleConfirmLook = () => {
    if (!selectedImage || !lookName.trim()) return;
    onSelect(selectedImage.url, selectedImage, lookName.trim(), lookDescription.trim());
    onClose();
  };

  const handleBackToGallery = () => {
    setSelectedImage(null);
    setLookName('');
    setLookDescription('');
  };

  // Called when generation starts - switch to gallery with placeholder
  const handleGenerationStart = useCallback(() => {
    setShowCreateMode(false);
    setSelectedProjectId('all');
    setIsGeneratingInGallery(true);
  }, []);

  // Rush generator callback - when shots are generated
  const handleShotsGenerated = useCallback(async (shots: Shot[]) => {
    // Clear generating state
    setIsGeneratingInGallery(false);

    // Refresh gallery to include new images
    await fetchGallery();

    // Mark newly generated images
    const newIds = new Set(shots.map(s => `rush-${s.id}`));
    setNewlyGeneratedIds(newIds);
  }, [fetchGallery]);

  const handleBackFromCreate = () => {
    setShowCreateMode(false);
  };

  // Step 2: Look info form
  if (requireLookInfo && selectedImage) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-lg p-0 bg-[#0d1520] border-white/10 flex flex-col overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-white/10 flex-shrink-0">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBackToGallery}
                className="w-8 h-8 text-slate-400 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <DialogTitle className="text-lg font-semibold text-white">
                Nouveau look
              </DialogTitle>
            </div>
          </DialogHeader>

          <div className="p-6 space-y-4">
            {/* Selected image preview */}
            <div className="relative aspect-[3/4] max-h-[250px] w-auto mx-auto rounded-xl overflow-hidden border border-white/10">
              <StorageImg
                src={selectedImage.url}
                alt="Selected"
                className="w-full h-full object-cover object-top"
                lazy={false}
              />
            </div>

            {/* Look name */}
            <div>
              <Label className="text-slate-300 text-sm">Nom du look *</Label>
              <Input
                value={lookName}
                onChange={(e) => setLookName(e.target.value)}
                placeholder="Ex: Tenue de soirée"
                className="mt-1 bg-white/5 border-white/10 text-white"
                autoFocus
              />
            </div>

            {/* Look description */}
            <div>
              <Label className="text-slate-300 text-sm">
                Description <span className="text-slate-500 font-normal">(optionnel)</span>
              </Label>
              <Textarea
                value={lookDescription}
                onChange={(e) => setLookDescription(e.target.value)}
                placeholder="Ex: Robe noire élégante, talons hauts, collier de perles..."
                className="mt-1 bg-white/5 border-white/10 text-white min-h-[80px] resize-none"
              />
            </div>

            {/* Confirm button */}
            <Button
              onClick={handleConfirmLook}
              disabled={!lookName.trim()}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Check className="w-4 h-4 mr-2" />
              Ajouter le look
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Create mode: Real Rush generator
  // modal={false} allows the mention dropdown to receive pointer events
  if (showCreateMode && currentProjectId) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()} modal={false}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 bg-[#0d1520] border-white/10 flex flex-col overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-white/10 flex-shrink-0">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBackFromCreate}
                className="w-8 h-8 text-slate-400 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="p-1.5 rounded-lg bg-blue-500/20">
                <Sparkles className="w-4 h-4 text-blue-400" />
              </div>
              <DialogTitle className="text-lg font-semibold text-white">
                Créer une image
              </DialogTitle>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4">
            <QuickShotGenerator
              projectId={currentProjectId}
              defaultAspectRatio={(aspectRatio as AspectRatio) || '9:16'}
              onShotsGenerated={handleShotsGenerated}
              onGenerationStart={handleGenerationStart}
              apiEndpoint={`/api/projects/${currentProjectId}/rush`}
              title="Rush Generator"
              description="Générez des images pour vos frames"
              lockAspectRatio={!!aspectRatio}
              showPlaceholders={false}
              showSerialMode={false}
            />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Step 1: Gallery grid
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] p-0 bg-[#0d1520] border-white/10 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {selectedProject ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedProjectId(null)}
                    className="w-8 h-8 text-slate-400 hover:text-white"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-blue-500/20">
                      <Folder className="w-4 h-4 text-blue-400" />
                    </div>
                    <DialogTitle className="text-lg font-semibold text-white">
                      {selectedProject.name}
                    </DialogTitle>
                    <span className="text-xs text-slate-500">({selectedProject.imageCount})</span>
                  </div>
                </>
              ) : selectedProjectId === 'all' ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedProjectId(null)}
                    className="w-8 h-8 text-slate-400 hover:text-white"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <div className="p-1.5 rounded-lg bg-purple-500/20">
                    <Images className="w-4 h-4 text-purple-400" />
                  </div>
                  <DialogTitle className="text-lg font-semibold text-white">Toutes les images</DialogTitle>
                  <span className="text-xs text-slate-500">({images.length})</span>
                </>
              ) : (
                <>
                  <div className="p-1.5 rounded-lg bg-purple-500/20">
                    <Images className="w-4 h-4 text-purple-400" />
                  </div>
                  <DialogTitle className="text-lg font-semibold text-white">{title}</DialogTitle>
                  <span className="text-xs text-slate-500">({images.length})</span>
                </>
              )}
            </div>
            {/* Create button - mr-8 to avoid overlap with dialog close button */}
            {currentProjectId && !isGeneratingInGallery && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreateMode(true)}
                className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 mr-8"
              >
                <Plus className="w-4 h-4 mr-1" />
                Créer
              </Button>
            )}
            {/* Generating indicator */}
            {isGeneratingInGallery && (
              <div className="flex items-center gap-2 text-sm text-blue-400 mr-8">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Génération...</span>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
            </div>
          ) : !selectedProjectId ? (
            // Project folders view
            <div className="space-y-2">
              {projects.length === 0 && !isGeneratingInGallery ? (
                <EmptyState message="Aucune image dans les rushes" onCreateClick={currentProjectId ? () => setShowCreateMode(true) : undefined} />
              ) : (
                <>
                  {/* All images option */}
                  <button
                    onClick={() => setSelectedProjectId('all')}
                    className="w-full flex items-center gap-3 p-3 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 transition-colors text-left"
                  >
                    <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                      <Images className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">Toutes les images</p>
                      <p className="text-xs text-slate-400">{images.length} images</p>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-slate-500 rotate-180" />
                  </button>

                  {/* Project folders */}
                  {displayProjects.map(project => {
                    const isCurrent = project.id === currentProjectId;
                    return (
                    <button
                      key={project.id}
                      onClick={() => setSelectedProjectId(project.id)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left",
                        isCurrent
                          ? "bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30"
                          : "bg-white/5 hover:bg-white/10 border-white/10"
                      )}
                    >
                      <div className="w-12 h-12 rounded-lg bg-slate-800 overflow-hidden flex-shrink-0">
                        {project.thumbnailUrl ? (
                          <StorageImg
                            src={project.thumbnailUrl}
                            alt={project.name}
                            className="w-full h-full object-cover"
                            lazy={false}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Folder className="w-5 h-5 text-slate-500" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white truncate">{project.name}</p>
                          {isCurrent && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/30 text-blue-300">
                              Projet actuel
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">
                          {project.imageCount} image{project.imageCount > 1 ? 's' : ''}
                        </p>
                      </div>
                      <ChevronLeft className="w-4 h-4 text-slate-500 rotate-180" />
                    </button>
                  );
                  })}
                </>
              )}
            </div>
          ) : (
            // Images grid (masonry)
            <div className="columns-3 gap-3 space-y-3">
              {/* Generating placeholder - shown at the top */}
              {isGeneratingInGallery && (
                <div className="break-inside-avoid mb-3">
                  <GeneratingPlaceholder
                    aspectRatio={(aspectRatio as AspectRatio) || '9:16'}
                    status="generating"
                  />
                </div>
              )}

              {(selectedProjectId === 'all' ? images : filteredImages).length === 0 && !isGeneratingInGallery ? (
                <EmptyState message="Aucune image" onCreateClick={currentProjectId ? () => setShowCreateMode(true) : undefined} />
              ) : (
                (selectedProjectId === 'all' ? images : filteredImages).map(image => {
                  const isNewlyGenerated = newlyGeneratedIds.has(image.id);
                  return (
                  <button
                    key={image.id}
                    onClick={() => handleImageClick(image)}
                    onMouseEnter={() => setHoveredImage(image.id)}
                    onMouseLeave={() => setHoveredImage(null)}
                    className={cn(
                      "relative rounded-lg overflow-hidden bg-slate-800 border-2 transition-all break-inside-avoid block w-full",
                      isNewlyGenerated
                        ? "border-green-500 ring-2 ring-green-500/30"
                        : hoveredImage === image.id
                        ? "border-purple-500 ring-2 ring-purple-500/30"
                        : "border-white/10 hover:border-white/20"
                    )}
                  >
                    <StorageImg
                      src={image.url}
                      alt={image.description}
                      className="w-full h-auto"
                      lazy={false}
                    />

                    {/* New badge */}
                    {isNewlyGenerated && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-green-500 text-white text-[10px] font-medium">
                        Nouveau
                      </div>
                    )}

                    {/* Selection indicator */}
                    {hoveredImage === image.id && (
                      <div className="absolute inset-0 bg-purple-500/20 flex items-center justify-center">
                        <div className="p-2 rounded-full bg-purple-500">
                          <Check className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    )}

                    {/* Info overlay */}
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                      <p className="text-[10px] text-white/80 truncate">
                        {image.sceneNumber ? `S${image.sceneNumber}.${image.shotNumber}` : (image.shotNumber ? `Plan ${image.shotNumber}` : 'Rush')}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">{image.projectName}</p>
                    </div>
                  </button>
                );
                })
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ message, onCreateClick }: { message: string; onCreateClick?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center col-span-3">
      <div className="p-3 rounded-full bg-white/5 mb-3">
        <Images className="w-6 h-6 text-slate-500" />
      </div>
      <p className="text-sm text-slate-400 mb-4">{message}</p>
      {onCreateClick && (
        <Button
          variant="outline"
          size="sm"
          onClick={onCreateClick}
          className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
        >
          <Plus className="w-4 h-4 mr-1" />
          Créer une image
        </Button>
      )}
    </div>
  );
}
