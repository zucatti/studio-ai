'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ShortCard } from './ShortCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Play, Loader2, X, ChevronLeft, ChevronRight, Download, Volume2, VolumeX, Pause, Play as PlayIcon } from 'lucide-react';
import type { Short } from '@/store/shorts-store';

interface ShortsListProps {
  shorts: Short[];
  projectId: string;
  isLoading: boolean;
  onCreateShort: (title: string) => Promise<void>;
  onDeleteShort: (shortId: string) => Promise<void>;
  onUpdateShort: (shortId: string, updates: { title?: string; description?: string }) => Promise<void>;
}

export function ShortsList({
  shorts,
  projectId,
  isLoading,
  onCreateShort,
  onDeleteShort,
  onUpdateShort,
}: ShortsListProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingShort, setEditingShort] = useState<Short | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Gallery state
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [galleryVideoUrl, setGalleryVideoUrl] = useState<string | null>(null);
  const [isGalleryPlaying, setIsGalleryPlaying] = useState(true);
  const [isGalleryMuted, setIsGalleryMuted] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState(0);
  const galleryVideoRef = useRef<HTMLVideoElement>(null);

  // Get shorts with assembled videos for gallery navigation
  const shortsWithVideo = shorts.filter(s => s.assembled_video_url);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setIsCreating(true);
    try {
      await onCreateShort(newTitle.trim());
      setNewTitle('');
      setShowCreateDialog(false);
    } finally {
      setIsCreating(false);
    }
  };

  const handleEdit = (short: Short) => {
    setEditingShort(short);
    setNewTitle(short.title);
    setShowEditDialog(true);
  };

  const handleUpdate = async () => {
    if (!editingShort || !newTitle.trim()) return;
    setIsUpdating(true);
    try {
      await onUpdateShort(editingShort.id, { title: newTitle.trim() });
      setShowEditDialog(false);
      setEditingShort(null);
      setNewTitle('');
    } finally {
      setIsUpdating(false);
    }
  };

  // Gallery handlers
  const openGallery = useCallback(async (short: Short) => {
    const index = shortsWithVideo.findIndex(s => s.id === short.id);
    if (index === -1) return;

    setGalleryIndex(index);
    setGalleryProgress(0);
    setIsGalleryPlaying(true);

    // Sign URL if needed
    const url = short.assembled_video_url;
    if (url?.startsWith('b2://')) {
      try {
        const res = await fetch('/api/storage/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: [url] }),
        });
        if (res.ok) {
          const data = await res.json();
          setGalleryVideoUrl(data.signedUrls?.[url] || url);
        }
      } catch {
        setGalleryVideoUrl(url);
      }
    } else {
      setGalleryVideoUrl(url || null);
    }
  }, [shortsWithVideo]);

  const closeGallery = useCallback(() => {
    setGalleryIndex(null);
    setGalleryVideoUrl(null);
    setGalleryProgress(0);
  }, []);

  const navigateGallery = useCallback(async (direction: 'prev' | 'next') => {
    if (galleryIndex === null || shortsWithVideo.length === 0) return;

    let newIndex: number;
    if (direction === 'prev') {
      newIndex = galleryIndex > 0 ? galleryIndex - 1 : shortsWithVideo.length - 1;
    } else {
      newIndex = galleryIndex < shortsWithVideo.length - 1 ? galleryIndex + 1 : 0;
    }

    const short = shortsWithVideo[newIndex];
    setGalleryIndex(newIndex);
    setGalleryProgress(0);

    // Sign URL if needed
    const url = short.assembled_video_url;
    if (url?.startsWith('b2://')) {
      try {
        const res = await fetch('/api/storage/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: [url] }),
        });
        if (res.ok) {
          const data = await res.json();
          setGalleryVideoUrl(data.signedUrls?.[url] || url);
        }
      } catch {
        setGalleryVideoUrl(url || null);
      }
    } else {
      setGalleryVideoUrl(url || null);
    }
  }, [galleryIndex, shortsWithVideo]);

  const handleGalleryDownload = useCallback(() => {
    if (galleryIndex === null) return;
    const short = shortsWithVideo[galleryIndex];
    if (!short.assembled_video_url) return;

    const filename = `${short.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`;
    const downloadUrl = `/api/storage/download?url=${encodeURIComponent(short.assembled_video_url)}&filename=${encodeURIComponent(filename)}`;

    window.open(downloadUrl, '_blank');
  }, [galleryIndex, shortsWithVideo]);

  // Keyboard navigation for gallery
  useEffect(() => {
    if (galleryIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          navigateGallery('prev');
          break;
        case 'ArrowRight':
          navigateGallery('next');
          break;
        case 'Escape':
          closeGallery();
          break;
        case ' ':
          e.preventDefault();
          const video = galleryVideoRef.current;
          if (video) {
            if (video.paused) {
              video.play();
              setIsGalleryPlaying(true);
            } else {
              video.pause();
              setIsGalleryPlaying(false);
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [galleryIndex, navigateGallery, closeGallery]);

  // Video progress tracking
  useEffect(() => {
    const video = galleryVideoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (video.duration) {
        setGalleryProgress((video.currentTime / video.duration) * 100);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [galleryVideoUrl]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Play className="w-5 h-5 text-blue-400" />
          <h2 className="text-xl font-semibold text-white">Mes Shorts</h2>
          {shorts.length > 0 && (
            <span className="text-sm text-slate-400">({shorts.length})</span>
          )}
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nouveau Short
        </Button>
      </div>

      {/* Grid */}
      {shorts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-slate-700/30 flex items-center justify-center mb-4">
            <Play className="w-10 h-10 text-blue-400/50" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">Aucun short</h3>
          <p className="text-slate-400 text-sm max-w-md mb-6">
            Créez votre premier short pour commencer. Chaque short peut contenir plusieurs plans avec différentes durées.
          </p>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Créer mon premier Short
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {shorts.map((short) => (
            <ShortCard
              key={short.id}
              short={short}
              projectId={projectId}
              onDelete={onDeleteShort}
              onEdit={handleEdit}
              onGallery={openGallery}
            />
          ))}

          {/* Create new card */}
          <button
            onClick={() => setShowCreateDialog(true)}
            className="aspect-[9/16] rounded-xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center text-slate-400 hover:text-white hover:border-white/40 transition-all"
          >
            <Plus className="w-8 h-8 mb-2" />
            <span className="text-sm">Nouveau Short</span>
          </button>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-[#1a2433] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Nouveau Short</DialogTitle>
            <DialogDescription className="text-slate-400">
              Donnez un titre à votre short. Vous pourrez ajouter des plans ensuite.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Ex: Présentation du produit"
              className="bg-white/5 border-white/10 text-white"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              className="border-white/10 text-white hover:bg-white/5"
            >
              Annuler
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newTitle.trim() || isCreating}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Création...
                </>
              ) : (
                'Créer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-[#1a2433] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Renommer le Short</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Nouveau titre"
              className="bg-white/5 border-white/10 text-white"
              onKeyDown={(e) => e.key === 'Enter' && handleUpdate()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
              className="border-white/10 text-white hover:bg-white/5"
            >
              Annuler
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={!newTitle.trim() || isUpdating}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isUpdating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Mise à jour...
                </>
              ) : (
                'Enregistrer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gallery Modal */}
      {galleryIndex !== null && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
          {/* Close button */}
          <button
            onClick={closeGallery}
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>

          {/* Navigation arrows */}
          {shortsWithVideo.length > 1 && (
            <>
              <button
                onClick={() => navigateGallery('prev')}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <ChevronLeft className="w-6 h-6 text-white" />
              </button>
              <button
                onClick={() => navigateGallery('next')}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <ChevronRight className="w-6 h-6 text-white" />
              </button>
            </>
          )}

          {/* Video container */}
          <div className="relative max-h-[90vh] aspect-[9/16]">
            {galleryVideoUrl && (
              <video
                ref={galleryVideoRef}
                src={galleryVideoUrl}
                className="w-full h-full object-contain"
                autoPlay
                loop
                muted={isGalleryMuted}
                playsInline
                onClick={() => {
                  const video = galleryVideoRef.current;
                  if (video) {
                    if (video.paused) {
                      video.play();
                      setIsGalleryPlaying(true);
                    } else {
                      video.pause();
                      setIsGalleryPlaying(false);
                    }
                  }
                }}
              />
            )}

            {/* Bottom controls */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
              {/* Progress bar */}
              <div
                className="h-1 bg-white/20 rounded-full cursor-pointer overflow-hidden mb-3"
                onClick={(e) => {
                  const video = galleryVideoRef.current;
                  if (!video) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const percentage = x / rect.width;
                  video.currentTime = percentage * video.duration;
                }}
              >
                <div
                  className="h-full bg-white rounded-full transition-all duration-100"
                  style={{ width: `${galleryProgress}%` }}
                />
              </div>

              {/* Title and controls */}
              <div className="flex items-center justify-between">
                <div className="text-white">
                  <h3 className="font-medium">
                    {shortsWithVideo[galleryIndex]?.title}
                  </h3>
                  <p className="text-sm text-white/60">
                    {galleryIndex + 1} / {shortsWithVideo.length}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* Play/Pause */}
                  <button
                    onClick={() => {
                      const video = galleryVideoRef.current;
                      if (video) {
                        if (video.paused) {
                          video.play();
                          setIsGalleryPlaying(true);
                        } else {
                          video.pause();
                          setIsGalleryPlaying(false);
                        }
                      }
                    }}
                    className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                  >
                    {isGalleryPlaying ? (
                      <Pause className="w-5 h-5 text-white" />
                    ) : (
                      <PlayIcon className="w-5 h-5 text-white ml-0.5" />
                    )}
                  </button>

                  {/* Mute */}
                  <button
                    onClick={() => {
                      const video = galleryVideoRef.current;
                      if (video) {
                        video.muted = !video.muted;
                        setIsGalleryMuted(video.muted);
                      }
                    }}
                    className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                  >
                    {isGalleryMuted ? (
                      <VolumeX className="w-5 h-5 text-white" />
                    ) : (
                      <Volume2 className="w-5 h-5 text-white" />
                    )}
                  </button>

                  {/* Download */}
                  <button
                    onClick={handleGalleryDownload}
                    className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                  >
                    <Download className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
