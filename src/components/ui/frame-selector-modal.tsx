'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, SkipBack, SkipForward, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface FrameSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (frameUrl: string) => void;
  videoUrl: string;
  projectId: string;
  title?: string;
}

export function FrameSelectorModal({
  isOpen,
  onClose,
  onSelect,
  videoUrl,
  projectId,
  title = 'Sélectionner une frame',
}: FrameSelectorModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExtracting, setIsExtracting] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  // Sign video URL on mount
  useEffect(() => {
    if (!isOpen || !videoUrl) return;

    const signUrl = async () => {
      setIsLoading(true);
      try {
        if (videoUrl.startsWith('b2://')) {
          const res = await fetch('/api/storage/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: [videoUrl] }),
          });
          if (res.ok) {
            const { signedUrls } = await res.json();
            setSignedUrl(signedUrls[videoUrl] || videoUrl);
          } else {
            setSignedUrl(videoUrl);
          }
        } else {
          setSignedUrl(videoUrl);
        }
      } catch {
        setSignedUrl(videoUrl);
      }
    };

    signUrl();
  }, [isOpen, videoUrl]);

  // Handle video metadata loaded
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setIsLoading(false);
    }
  }, []);

  // Handle time update
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  // Seek to position
  const seekTo = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(time, duration));
      setCurrentTime(videoRef.current.currentTime);
    }
  }, [duration]);

  // Go to first frame
  const goToFirst = useCallback(() => {
    seekTo(0.1); // Slightly after 0 to avoid black frames
  }, [seekTo]);

  // Go to last frame
  const goToLast = useCallback(() => {
    seekTo(Math.max(0, duration - 0.1)); // Slightly before end
  }, [seekTo, duration]);

  // Step forward/backward by one frame (~30fps = 0.033s)
  const stepFrame = useCallback((direction: 'forward' | 'backward') => {
    const frameTime = 1 / 30; // Assuming 30fps
    const newTime = direction === 'forward'
      ? currentTime + frameTime
      : currentTime - frameTime;
    seekTo(newTime);
  }, [currentTime, seekTo]);

  // Handle slider change
  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    seekTo(time);
  }, [seekTo]);

  // Extract and select frame
  const handleSelectFrame = useCallback(async () => {
    setIsExtracting(true);
    try {
      toast.loading('Extraction de la frame...', { id: 'extract-frame' });

      const response = await fetch(`/api/projects/${projectId}/extract-frame`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl,
          position: currentTime,
          outputFormat: 'png',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to extract frame');
      }

      const { frameUrl } = await response.json();
      toast.success('Frame extraite!', { id: 'extract-frame' });
      onSelect(frameUrl);
      onClose();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Extraction échouée: ${errorMsg}`, { id: 'extract-frame' });
    } finally {
      setIsExtracting(false);
    }
  }, [projectId, videoUrl, currentTime, onSelect, onClose]);

  // Format time as MM:SS.ms
  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepFrame('backward');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepFrame('forward');
      } else if (e.key === 'Home') {
        e.preventDefault();
        goToFirst();
      } else if (e.key === 'End') {
        e.preventDefault();
        goToLast();
      } else if (e.key === 'Enter' && !isExtracting) {
        e.preventDefault();
        handleSelectFrame();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, stepFrame, goToFirst, goToLast, handleSelectFrame, isExtracting]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center" data-frame-selector>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-[90vw] max-w-4xl bg-[#0f1419] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Video preview */}
        <div className="relative aspect-video bg-black flex items-center justify-center">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
              <Loader2 className="w-8 h-8 animate-spin text-white" />
            </div>
          )}
          {signedUrl && (
            <video
              ref={videoRef}
              src={signedUrl}
              className="w-full h-full object-contain"
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              preload="metadata"
              playsInline
              muted
            />
          )}
        </div>

        {/* Controls */}
        <div className="px-4 py-3 border-t border-white/10 space-y-3">
          {/* Timeline slider */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-mono w-16">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.001}
              value={currentTime}
              onChange={handleSliderChange}
              className="flex-1 h-2 bg-white/10 rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-4
                [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-blue-500
                [&::-webkit-slider-thumb]:cursor-pointer
                [&::-webkit-slider-thumb]:hover:bg-blue-400
                focus:outline-none focus:ring-0"
            />
            <span className="text-xs text-slate-400 font-mono w-16 text-right">
              {formatTime(duration)}
            </span>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-between">
            {/* Navigation buttons */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={goToFirst}
                className="h-8 px-2 border-white/10 text-slate-300 hover:bg-white/10"
                title="Première frame (Home)"
              >
                <SkipBack className="w-4 h-4" />
                <span className="ml-1 text-xs">First</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => stepFrame('backward')}
                className="h-8 px-2 border-white/10 text-slate-300 hover:bg-white/10"
                title="Frame précédente (←)"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => stepFrame('forward')}
                className="h-8 px-2 border-white/10 text-slate-300 hover:bg-white/10"
                title="Frame suivante (→)"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goToLast}
                className="h-8 px-2 border-white/10 text-slate-300 hover:bg-white/10"
                title="Dernière frame (End)"
              >
                <span className="mr-1 text-xs">Last</span>
                <SkipForward className="w-4 h-4" />
              </Button>
            </div>

            {/* Select button */}
            <Button
              size="sm"
              onClick={handleSelectFrame}
              disabled={isExtracting || isLoading}
              className={cn(
                'h-8 px-4',
                isExtracting || isLoading
                  ? 'bg-slate-700 text-slate-400'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              )}
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Extraction...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Sélectionner cette frame
                </>
              )}
            </Button>
          </div>

          {/* Keyboard hints */}
          <div className="flex items-center justify-center gap-4 text-[10px] text-slate-600">
            <span>← → : Frame par frame</span>
            <span>Home/End : Première/Dernière</span>
            <span>Enter : Sélectionner</span>
            <span>Esc : Fermer</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
