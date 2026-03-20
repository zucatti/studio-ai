'use client';

import { useEffect, useState, useCallback } from 'react';
import { Images, Folder, X, Loader2, ImageIcon, Film, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StorageImg } from '@/components/ui/storage-image';
import { Lightbox, type LightboxImage } from '@/components/ui/lightbox';
import { cn } from '@/lib/utils';
import type { GalleryImage, GalleryProject } from '@/app/api/gallery/route';

interface GlobalGalleryProps {
  isOpen: boolean;
  onClose: () => void;
}

type ViewMode = 'all' | 'project';

export function GlobalGallery({ isOpen, onClose }: GlobalGalleryProps) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [projects, setProjects] = useState<GalleryProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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
    }
  }, [isOpen, fetchGallery]);

  const filteredImages = selectedProjectId
    ? images.filter(img => img.projectId === selectedProjectId)
    : images;

  const selectedProject = selectedProjectId
    ? projects.find(p => p.id === selectedProjectId)
    : null;

  const handleProjectClick = (projectId: string) => {
    setSelectedProjectId(projectId);
    setViewMode('project');
  };

  const handleBackToProjects = () => {
    setSelectedProjectId(null);
    setViewMode('all');
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-[500px] bg-[#0d1520] border-l border-white/10 z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            {viewMode === 'project' && selectedProject ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleBackToProjects}
                  className="w-8 h-8 text-slate-400 hover:text-white"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-500/20">
                    <Folder className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-white font-medium">{selectedProject.name}</span>
                  <span className="text-xs text-slate-500">({selectedProject.imageCount})</span>
                </div>
              </>
            ) : (
              <>
                <div className="p-1.5 rounded-lg bg-purple-500/20">
                  <Images className="w-4 h-4 text-purple-400" />
                </div>
                <span className="text-white font-medium">Rushes</span>
                <span className="text-xs text-slate-500">({images.length})</span>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="w-8 h-8 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* View tabs */}
        {viewMode === 'all' && (
          <div className="flex gap-2 px-4 py-2 border-b border-white/5">
            <button
              onClick={() => setSelectedProjectId(null)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-md transition-colors',
                !selectedProjectId
                  ? 'bg-purple-500/20 text-purple-300'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              )}
            >
              Tout
            </button>
            <button
              onClick={() => setViewMode('project')}
              className="px-3 py-1.5 text-xs rounded-md text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              Par projet
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
            </div>
          ) : viewMode === 'project' && !selectedProjectId ? (
            // Project folders view
            <div className="space-y-2">
              {projects.length === 0 ? (
                <EmptyState message="Aucun projet avec des images" />
              ) : (
                projects.map(project => (
                  <button
                    key={project.id}
                    onClick={() => handleProjectClick(project.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-left"
                  >
                    <div className="w-12 h-12 rounded-lg bg-slate-800 overflow-hidden flex-shrink-0">
                      {project.thumbnailUrl ? (
                        <StorageImg
                          src={project.thumbnailUrl}
                          alt={project.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Folder className="w-5 h-5 text-slate-500" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{project.name}</p>
                      <p className="text-xs text-slate-400">
                        {project.imageCount} image{project.imageCount > 1 ? 's' : ''}
                      </p>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-slate-500 rotate-180" />
                  </button>
                ))
              )}
            </div>
          ) : (
            // Images masonry grid
            filteredImages.length === 0 ? (
              <EmptyState message="Aucune image generee" />
            ) : (
              <div className="columns-2 gap-3 space-y-3">
                {filteredImages.map((image, index) => (
                  <ImageCard
                    key={image.id}
                    image={image}
                    showProject={!selectedProjectId}
                    onClick={() => setLightboxIndex(index)}
                  />
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Lightbox */}
      <Lightbox
        images={filteredImages.map((img): LightboxImage => ({
          id: img.id,
          url: img.url,
          description: `${img.projectName} - S${img.sceneNumber || '?'}.${img.shotNumber} - ${img.description}`,
        }))}
        initialIndex={lightboxIndex ?? 0}
        isOpen={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
      />
    </>
  );
}

function ImageCard({
  image,
  showProject,
  onClick,
}: {
  image: GalleryImage;
  showProject: boolean;
  onClick: () => void;
}) {
  const typeLabels = {
    storyboard: 'Storyboard',
    first_frame: 'Frame debut',
    last_frame: 'Frame fin',
  };

  const typeColors = {
    storyboard: 'bg-blue-500/20 text-blue-300',
    first_frame: 'bg-green-500/20 text-green-300',
    last_frame: 'bg-orange-500/20 text-orange-300',
  };

  return (
    <button
      onClick={onClick}
      className="group relative rounded-lg overflow-hidden bg-slate-800 border border-white/10 hover:border-white/20 transition-colors break-inside-avoid block w-full"
    >
      <StorageImg
        src={image.url}
        alt={image.description}
        className="w-full h-auto"
      />

      {/* Overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded', typeColors[image.type])}>
              {typeLabels[image.type]}
            </span>
            {image.sceneNumber && (
              <span className="text-[10px] text-slate-400">
                S{image.sceneNumber}.{image.shotNumber}
              </span>
            )}
          </div>
          {showProject && (
            <p className="text-[10px] text-slate-300 truncate">{image.projectName}</p>
          )}
        </div>
      </div>

      {/* Type indicator */}
      <div className="absolute top-2 right-2">
        {image.type === 'storyboard' ? (
          <ImageIcon className="w-3.5 h-3.5 text-white/60" />
        ) : (
          <Film className="w-3.5 h-3.5 text-white/60" />
        )}
      </div>
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="p-3 rounded-full bg-white/5 mb-3">
        <Images className="w-6 h-6 text-slate-500" />
      </div>
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}

// Toggle button component
export function GalleryToggleButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(true)}
        className="w-8 h-8 text-slate-400 hover:text-white hover:bg-white/5"
        title="Rushes"
      >
        <Images className="w-4 h-4" />
      </Button>
      <GlobalGallery isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
