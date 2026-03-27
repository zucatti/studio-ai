'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MentionInput } from '@/components/ui/mention-input';
import { GalleryPicker } from '@/components/gallery/GalleryPicker';
import { QuickShotGenerator } from '@/components/quick-shot/QuickShotGenerator';
import { ProjectBiblePicker } from './ProjectBiblePicker';
import { StorageImg } from '@/components/ui/storage-image';
import {
  Film,
  ImagePlus,
  Settings,
  Wand2,
  Clock,
  Video,
  Sparkles,
  FolderOpen,
  Images,
  Book,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AspectRatio, Shot } from '@/types/database';
import type { GalleryImage } from '@/app/api/gallery/route';

// Aspect ratio configuration
const ASPECT_RATIO_CONFIG: Record<AspectRatio, { width: number; height: number; label: string }> = {
  '9:16': { width: 9, height: 16, label: 'Vertical' },
  '16:9': { width: 16, height: 9, label: 'Horizontal' },
  '1:1': { width: 1, height: 1, label: 'Carré' },
  '4:5': { width: 4, height: 5, label: 'Portrait' },
  '2:3': { width: 2, height: 3, label: 'Photo' },
  '21:9': { width: 21, height: 9, label: 'Cinéma' },
};

interface ShotData {
  id: string;
  section_id: string;
  relative_start: number;
  duration: number;
  description?: string;
  storyboard_image_url?: string;
  first_frame_url?: string;
  last_frame_url?: string;
  animation_prompt?: string;
}

interface ShotEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shot: ShotData | null;
  shotIndex: number;
  projectId: string;
  aspectRatio: AspectRatio;
  onSave?: (shot: ShotData) => void;
}

type FrameTarget = 'frameIn' | 'frameOut';

export function ShotEditorModal({
  open,
  onOpenChange,
  shot,
  shotIndex,
  projectId,
  aspectRatio,
  onSave,
}: ShotEditorModalProps) {
  // Local state for editing
  const [animationPrompt, setAnimationPrompt] = useState(shot?.animation_prompt || '');
  const [frameInUrl, setFrameInUrl] = useState(shot?.first_frame_url || '');
  const [frameOutUrl, setFrameOutUrl] = useState(shot?.last_frame_url || '');

  // Gallery picker state (images générées)
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryTarget, setGalleryTarget] = useState<FrameTarget>('frameIn');

  // Bible picker state (assets du projet)
  const [bibleOpen, setBibleOpen] = useState(false);
  const [bibleTarget, setBibleTarget] = useState<FrameTarget>('frameIn');

  // QuickShot generator state
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [generatorTarget, setGeneratorTarget] = useState<FrameTarget>('frameIn');

  // Reset state when shot changes
  useMemo(() => {
    if (shot) {
      setAnimationPrompt(shot.animation_prompt || '');
      setFrameInUrl(shot.first_frame_url || '');
      setFrameOutUrl(shot.last_frame_url || '');
    }
  }, [shot]);

  // Get aspect ratio config
  const ratioConfig = ASPECT_RATIO_CONFIG[aspectRatio];
  const isPortrait = ratioConfig.height > ratioConfig.width;

  // Calculate frame dimensions
  const frameHeight = isPortrait ? 320 : 220;
  const frameWidth = frameHeight * (ratioConfig.width / ratioConfig.height);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!shot) return;

    const updatedShot: ShotData = {
      ...shot,
      animation_prompt: animationPrompt,
      first_frame_url: frameInUrl,
      last_frame_url: frameOutUrl,
    };

    // Save to API
    try {
      const res = await fetch(
        `/api/projects/${projectId}/sections/${shot.section_id}/shots/${shot.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            animation_prompt: animationPrompt,
            first_frame_url: frameInUrl || null,
            last_frame_url: frameOutUrl || null,
          }),
        }
      );

      if (res.ok) {
        onSave?.(updatedShot);
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Error saving shot:', error);
    }
  }, [shot, animationPrompt, frameInUrl, frameOutUrl, projectId, onSave, onOpenChange]);

  // Open gallery picker (images générées)
  const openGallery = useCallback((target: FrameTarget) => {
    setGalleryTarget(target);
    setGalleryOpen(true);
  }, []);

  // Handle gallery selection
  const handleGallerySelect = useCallback((imageUrl: string, _image: GalleryImage) => {
    if (galleryTarget === 'frameIn') {
      setFrameInUrl(imageUrl);
    } else {
      setFrameOutUrl(imageUrl);
    }
    setGalleryOpen(false);
  }, [galleryTarget]);

  // Open bible picker (assets du projet)
  const openBible = useCallback((target: FrameTarget) => {
    setBibleTarget(target);
    setBibleOpen(true);
  }, []);

  // Handle bible selection
  const handleBibleSelect = useCallback((imageUrl: string) => {
    if (bibleTarget === 'frameIn') {
      setFrameInUrl(imageUrl);
    } else {
      setFrameOutUrl(imageUrl);
    }
    setBibleOpen(false);
  }, [bibleTarget]);

  // Open generator
  const openGenerator = useCallback((target: FrameTarget) => {
    setGeneratorTarget(target);
    setGeneratorOpen(true);
  }, []);

  // Handle generated shots
  const handleShotsGenerated = useCallback((shots: Shot[]) => {
    if (shots.length > 0 && shots[0].storyboard_image_url) {
      const imageUrl = shots[0].storyboard_image_url;
      if (generatorTarget === 'frameIn') {
        setFrameInUrl(imageUrl);
      } else {
        setFrameOutUrl(imageUrl);
      }
      setGeneratorOpen(false);
    }
  }, [generatorTarget]);

  // Clear frame
  const clearFrame = useCallback((target: FrameTarget) => {
    if (target === 'frameIn') {
      setFrameInUrl('');
    } else {
      setFrameOutUrl('');
    }
  }, []);

  if (!shot) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            'max-w-[90vw] w-[90vw] h-[90vh] max-h-[90vh]',
            'flex flex-col p-0 gap-0',
            'bg-[#0a0e12] border-white/10',
            '[&>button]:hidden' // Hide the default close button
          )}
        >
          {/* Header */}
          <DialogHeader className="flex-shrink-0 px-6 py-4 border-b border-white/10 bg-[#0f1419]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Film className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold text-white">
                    Plan {shotIndex + 1}
                  </DialogTitle>
                  <p className="text-sm text-slate-400">
                    {shot.duration.toFixed(1)}s • {ratioConfig.label} ({aspectRatio})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 text-slate-300 hover:bg-white/5"
                  onClick={() => onOpenChange(false)}
                >
                  Annuler
                </Button>
                <Button
                  size="sm"
                  className="bg-purple-500 hover:bg-purple-600 text-white"
                  onClick={handleSave}
                >
                  Enregistrer
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Top Section: Frames */}
            <div className="flex-shrink-0 px-6 py-6 border-b border-white/10">
              <div className="flex items-center justify-center gap-8">
                {/* Frame In */}
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Frame In
                  </span>
                  <div
                    className={cn(
                      'relative rounded-lg overflow-hidden border-2 border-dashed',
                      'flex items-center justify-center',
                      'bg-slate-800/50 hover:bg-slate-800 transition-colors',
                      'group',
                      frameInUrl ? 'border-green-500/50' : 'border-white/20 hover:border-purple-500/50'
                    )}
                    style={{ width: frameWidth, height: frameHeight }}
                  >
                    {frameInUrl ? (
                      <>
                        <StorageImg
                          src={frameInUrl}
                          alt="Frame In"
                          className="w-full h-full object-cover"
                        />
                        {/* Clear button */}
                        <button
                          onClick={() => clearFrame('frameIn')}
                          className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
                          title="Supprimer"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-500 group-hover:text-purple-400 transition-colors">
                        <ImagePlus className="w-8 h-8" />
                        <span className="text-xs">Ajouter image</span>
                      </div>
                    )}

                    {/* Hover overlay with buttons */}
                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs"
                          onClick={() => openBible('frameIn')}
                        >
                          <Book className="w-3.5 h-3.5 mr-1" />
                          Bible
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs"
                          onClick={() => openGallery('frameIn')}
                        >
                          <Images className="w-3.5 h-3.5 mr-1" />
                          Galerie
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-purple-500 hover:bg-purple-600"
                        onClick={() => openGenerator('frameIn')}
                      >
                        <Wand2 className="w-3.5 h-3.5 mr-1" />
                        Générer
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Arrow / Connection */}
                <div className="flex flex-col items-center gap-1 text-slate-500">
                  <Video className="w-6 h-6" />
                  <span className="text-xs">{shot.duration.toFixed(1)}s</span>
                </div>

                {/* Frame Out */}
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Frame Out
                  </span>
                  <div
                    className={cn(
                      'relative rounded-lg overflow-hidden border-2 border-dashed',
                      'flex items-center justify-center',
                      'bg-slate-800/50 hover:bg-slate-800 transition-colors',
                      'group',
                      frameOutUrl ? 'border-green-500/50' : 'border-white/20 hover:border-purple-500/50'
                    )}
                    style={{ width: frameWidth, height: frameHeight }}
                  >
                    {frameOutUrl ? (
                      <>
                        <StorageImg
                          src={frameOutUrl}
                          alt="Frame Out"
                          className="w-full h-full object-cover"
                        />
                        {/* Clear button */}
                        <button
                          onClick={() => clearFrame('frameOut')}
                          className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
                          title="Supprimer"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-500 group-hover:text-purple-400 transition-colors">
                        <ImagePlus className="w-8 h-8" />
                        <span className="text-xs">Ajouter image</span>
                      </div>
                    )}

                    {/* Hover overlay with buttons */}
                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs"
                          onClick={() => openBible('frameOut')}
                        >
                          <Book className="w-3.5 h-3.5 mr-1" />
                          Bible
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs"
                          onClick={() => openGallery('frameOut')}
                        >
                          <Images className="w-3.5 h-3.5 mr-1" />
                          Galerie
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-purple-500 hover:bg-purple-600"
                        onClick={() => openGenerator('frameOut')}
                      >
                        <Wand2 className="w-3.5 h-3.5 mr-1" />
                        Générer
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Section: Prompt + Settings */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left: Prompt */}
              <div className="flex-1 flex flex-col p-6 overflow-hidden">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-white">Prompt d'animation</span>
                  <span className="text-xs text-slate-500 ml-auto">
                    Utilisez @ pour les personnages, # pour les lieux, ! pour les looks
                  </span>
                </div>

                <div className="flex-1 overflow-hidden">
                  <MentionInput
                    value={animationPrompt}
                    onChange={setAnimationPrompt}
                    placeholder="Décrivez l'action du plan... Ex: @Morgana marche lentement vers #LaPlage, son !RobeDeSoirée flottant au vent..."
                    projectId={projectId}
                    minHeight="200px"
                    className="h-full"
                  />
                </div>
              </div>

              {/* Right: Toolbox & Settings */}
              <div className="w-[300px] flex-shrink-0 border-l border-white/10 bg-slate-900/30 overflow-y-auto">
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Settings className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium text-white">Toolbox & Settings</span>
                  </div>

                  {/* Duration */}
                  <div className="mb-4">
                    <label className="text-xs text-slate-400 uppercase tracking-wider mb-2 block">
                      Durée
                    </label>
                    <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg border border-white/10">
                      <Clock className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-white">{shot.duration.toFixed(1)} secondes</span>
                    </div>
                  </div>

                  {/* Placeholder for future settings */}
                  <div className="space-y-3">
                    <div className="px-3 py-4 bg-white/5 rounded-lg border border-dashed border-white/10 text-center">
                      <p className="text-xs text-slate-500">
                        Plus de paramètres à venir...
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bible Picker (assets du projet) */}
      <ProjectBiblePicker
        open={bibleOpen}
        onOpenChange={setBibleOpen}
        projectId={projectId}
        onSelect={handleBibleSelect}
        title={`Bible du projet - ${bibleTarget === 'frameIn' ? 'Frame In' : 'Frame Out'}`}
      />

      {/* Gallery Picker (images générées) */}
      <GalleryPicker
        isOpen={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onSelect={handleGallerySelect}
        title={`Galerie - ${galleryTarget === 'frameIn' ? 'Frame In' : 'Frame Out'}`}
        aspectRatio={aspectRatio}
        currentProjectId={projectId}
        allowOtherProjects={true}
      />

      {/* QuickShot Generator Modal */}
      <Dialog open={generatorOpen} onOpenChange={setGeneratorOpen}>
        <DialogContent
          className={cn(
            'max-w-[85vw] w-[85vw] h-[85vh] max-h-[85vh]',
            'flex flex-col p-0 gap-0',
            'bg-[#0a0e12] border-white/10',
            '[&>button]:hidden'
          )}
        >
          <DialogHeader className="flex-shrink-0 px-6 py-4 border-b border-white/10 bg-[#0f1419]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Wand2 className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold text-white">
                    Générer {generatorTarget === 'frameIn' ? 'Frame In' : 'Frame Out'}
                  </DialogTitle>
                  <p className="text-sm text-slate-400">
                    Créez une image avec l'IA pour votre plan
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="border-white/10 text-slate-300 hover:bg-white/5"
                onClick={() => setGeneratorOpen(false)}
              >
                Fermer
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6">
            <QuickShotGenerator
              projectId={projectId}
              defaultAspectRatio={aspectRatio}
              onShotsGenerated={handleShotsGenerated}
              lockAspectRatio={true}
              showPlaceholders={true}
              title=""
              description=""
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ShotEditorModal;
