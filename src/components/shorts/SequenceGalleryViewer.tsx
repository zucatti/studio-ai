'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Download, Layers, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSignedUrl, isB2Url } from '@/hooks/use-signed-url';
import { Slider } from '@/components/ui/slider';
import type { Sequence } from '@/types/cinematic';
import type { Plan } from '@/store/shorts-store';

interface SequenceWithPlans {
  sequence: Sequence;
  plans: Plan[];
  assembledVideoUrl: string | null;
}

interface SequenceGalleryViewerProps {
  isOpen: boolean;
  onClose: () => void;
  sequences: SequenceWithPlans[];
  initialIndex?: number;
}

export function SequenceGalleryViewer({
  isOpen,
  onClose,
  sequences,
  initialIndex = 0,
}: SequenceGalleryViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isAnimating, setIsAnimating] = useState(false);

  // Video controls state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  // Reset to initial index when opening
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setIsAnimating(true);
      setIsPlaying(false);
      setCurrentTime(0);
      // Trigger fade-in
      const timer = setTimeout(() => setIsAnimating(false), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialIndex]);

  // Reset video state when switching sequences
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setVideoDuration(0);
  }, [currentIndex]);

  const currentSequence = sequences[currentIndex];
  const hasNext = currentIndex < sequences.length - 1;
  const hasPrev = currentIndex > 0;

  // Sign B2 URL if needed
  const { signedUrl } = useSignedUrl(currentSequence?.assembledVideoUrl || null);
  const finalVideoUrl = signedUrl || (currentSequence?.assembledVideoUrl && !isB2Url(currentSequence.assembledVideoUrl) ? currentSequence.assembledVideoUrl : null);

  // Video controls
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  const handleSeek = useCallback((value: number[]) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = value[0];
    setCurrentTime(value[0]);
  }, []);

  const formatVideoTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const goNext = useCallback(() => {
    if (hasNext) {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentIndex(i => i + 1);
        setIsAnimating(false);
      }, 150);
    }
  }, [hasNext]);

  const goPrev = useCallback(() => {
    if (hasPrev) {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentIndex(i => i - 1);
        setIsAnimating(false);
      }, 150);
    }
  }, [hasPrev]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goPrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, goNext, goPrev]);

  const handleDownload = useCallback(() => {
    if (!currentSequence?.assembledVideoUrl) return;
    const filename = `${currentSequence.sequence.title || 'sequence'}.mp4`;
    const downloadUrl = `/api/download?url=${encodeURIComponent(currentSequence.assembledVideoUrl)}&filename=${encodeURIComponent(filename)}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => document.body.removeChild(link), 100);
  }, [currentSequence]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  if (!isOpen || typeof document === 'undefined') return null;

  const totalDuration = currentSequence?.plans.reduce((sum, p) => sum + p.duration, 0) || 0;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[99999] bg-black/95 backdrop-blur-sm flex items-center justify-center transition-opacity duration-300",
        isAnimating ? "opacity-0" : "opacity-100"
      )}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        title="Fermer (Escape)"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Navigation arrows */}
      {hasPrev && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="Séquence précédente (←)"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>
      )}
      {hasNext && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="Séquence suivante (→)"
        >
          <ChevronRight className="w-8 h-8" />
        </button>
      )}

      {/* Main content */}
      {currentSequence && (
        <div
          className={cn(
            "flex flex-col items-center max-w-5xl w-full mx-4 transition-all duration-300",
            isAnimating ? "opacity-0 scale-95" : "opacity-100 scale-100"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Video card */}
          <div className="relative rounded-2xl overflow-hidden shadow-2xl bg-slate-900 w-full">
            {/* Top info bar */}
            <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-4 pb-12">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Layers className="w-5 h-5 text-purple-400" />
                  <span className="text-lg font-medium text-white">
                    {currentSequence.sequence.title || `Séquence ${currentSequence.sequence.sort_order + 1}`}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-300">
                    {currentSequence.plans.length} plan{currentSequence.plans.length > 1 ? 's' : ''} · {formatDuration(totalDuration)}
                  </span>
                  {currentSequence.assembledVideoUrl && (
                    <button
                      onClick={handleDownload}
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                      title="Télécharger"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Video */}
            {finalVideoUrl ? (
              <div
                className="relative w-full bg-black group"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
              >
                <video
                  ref={videoRef}
                  key={finalVideoUrl}
                  src={finalVideoUrl}
                  className="w-full h-auto max-h-[70vh] object-contain bg-black"
                  muted={isMuted}
                  playsInline
                  onClick={togglePlay}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                  onLoadedMetadata={() => {
                    setVideoDuration(videoRef.current?.duration || 0);
                    // Auto-play when loaded
                    videoRef.current?.play();
                  }}
                />

                {/* Center play button when paused and not hovered */}
                {!isPlaying && !isHovered && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
                      <Play className="w-8 h-8 text-white ml-1" fill="white" />
                    </div>
                  </div>
                )}

                {/* Custom controls overlay - hover only */}
                <div
                  className={cn(
                    'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity',
                    isHovered ? 'opacity-100' : 'opacity-0'
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Progress bar */}
                  <Slider
                    value={[currentTime]}
                    max={videoDuration || 1}
                    step={0.1}
                    onValueChange={handleSeek}
                    className="mb-3"
                  />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={togglePlay}
                        className="w-8 h-8 flex items-center justify-center text-white hover:bg-white/20 rounded"
                      >
                        {isPlaying ? (
                          <Pause className="w-5 h-5" />
                        ) : (
                          <Play className="w-5 h-5" />
                        )}
                      </button>
                      <button
                        onClick={toggleMute}
                        className="w-8 h-8 flex items-center justify-center text-white hover:bg-white/20 rounded"
                      >
                        {isMuted ? (
                          <VolumeX className="w-5 h-5" />
                        ) : (
                          <Volume2 className="w-5 h-5" />
                        )}
                      </button>
                      <span className="text-sm text-white/80 ml-2">
                        {formatVideoTime(currentTime)} / {formatVideoTime(videoDuration)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : currentSequence.assembledVideoUrl ? (
              <div className="w-full aspect-video bg-slate-800 flex items-center justify-center">
                <p className="text-slate-500">Chargement...</p>
              </div>
            ) : (
              <div className="w-full aspect-video bg-slate-800 flex items-center justify-center">
                <p className="text-slate-500">Vidéo non assemblée</p>
              </div>
            )}
          </div>

          {/* Pagination indicator */}
          {sequences.length > 1 && (
            <div className="flex items-center gap-2 mt-4">
              {sequences.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAnimating(true);
                    setTimeout(() => {
                      setCurrentIndex(i);
                      setIsAnimating(false);
                    }, 150);
                  }}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all",
                    i === currentIndex
                      ? "bg-purple-500 w-6"
                      : "bg-white/30 hover:bg-white/50"
                  )}
                />
              ))}
            </div>
          )}

          {/* Keyboard hints */}
          <p className="mt-4 text-xs text-slate-600">
            ← → Navigation · Esc Fermer
          </p>
        </div>
      )}
    </div>,
    document.body
  );
}
