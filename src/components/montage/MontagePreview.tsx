'use client';

import { useRef, useEffect, useMemo, useCallback } from 'react';
import { useMontageStore } from '@/store/montage-store';
import { useSignedUrl } from '@/hooks/use-signed-url';
import { cn } from '@/lib/utils';
import { Film, Play, Pause } from 'lucide-react';

interface MontagePreviewProps {
  aspectRatio: string;
  className?: string;
}

// Parse aspect ratio string to number
function parseAspectRatio(ratio: string): number {
  const parts = ratio.split(':').map(Number);
  if (parts.length === 2 && parts[0] && parts[1]) {
    return parts[0] / parts[1];
  }
  return 16 / 9; // Default
}

export function MontagePreview({ aspectRatio, className }: MontagePreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    currentTime,
    isPlaying,
    clips,
    tracks,
    duration,
    setCurrentTime,
    play,
    pause,
    togglePlayback,
  } = useMontageStore();

  const ratio = useMemo(() => parseAspectRatio(aspectRatio), [aspectRatio]);

  // Find current clip at playhead
  const currentClip = useMemo(() => {
    const videoTracks = tracks.filter((t) => t.type === 'video');
    for (const track of videoTracks) {
      const clip = Object.values(clips).find(
        (c) =>
          c.trackId === track.id &&
          currentTime >= c.start &&
          currentTime < c.start + c.duration
      );
      if (clip) return clip;
    }
    return null;
  }, [clips, tracks, currentTime]);

  // Get signed URL for current clip
  const { signedUrl } = useSignedUrl(currentClip?.assetUrl || null);

  // Playback timer
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      const store = useMontageStore.getState();
      const newTime = store.currentTime + 0.033; // ~30fps

      if (newTime >= store.duration) {
        store.pause();
        store.setCurrentTime(0);
      } else {
        store.setCurrentTime(newTime);
      }
    }, 33);

    return () => clearInterval(interval);
  }, [isPlaying]);

  // Sync video element with current time
  useEffect(() => {
    if (!videoRef.current || !currentClip) return;

    const clipTime = currentTime - currentClip.start;
    const sourceTime = (currentClip.sourceStart || 0) + clipTime;

    // Only seek if difference is significant
    if (Math.abs(videoRef.current.currentTime - sourceTime) > 0.1) {
      videoRef.current.currentTime = sourceTime;
    }
  }, [currentTime, currentClip]);

  // Play/pause video element
  useEffect(() => {
    if (!videoRef.current) return;

    if (isPlaying && currentClip) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying, currentClip]);

  // Format time display
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col items-center justify-center',
        className
      )}
    >
      {/* Preview container */}
      <div
        className="relative bg-black/20 rounded-lg overflow-hidden border border-white/10"
        style={{
          aspectRatio: ratio,
          maxHeight: '100%',
          maxWidth: '100%',
          width: ratio >= 1 ? 'auto' : '100%',
          height: ratio >= 1 ? '100%' : 'auto',
        }}
      >
        {currentClip && signedUrl ? (
          currentClip.type === 'video' ? (
            <video
              ref={videoRef}
              src={signedUrl}
              className="w-full h-full object-contain"
              muted
              playsInline
              preload="auto"
            />
          ) : (
            <img
              src={signedUrl}
              alt={currentClip.name}
              className="w-full h-full object-contain"
            />
          )
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600">
            <Film className="w-12 h-12 mb-2" />
            <span className="text-sm">Aucun média</span>
          </div>
        )}

        {/* Play button overlay */}
        <button
          onClick={togglePlayback}
          className={cn(
            'absolute inset-0 flex items-center justify-center',
            'bg-black/20 opacity-0 hover:opacity-100 transition-opacity',
            isPlaying && 'opacity-0'
          )}
        >
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
            {isPlaying ? (
              <Pause className="w-8 h-8 text-white" />
            ) : (
              <Play className="w-8 h-8 text-white ml-1" fill="white" />
            )}
          </div>
        </button>

        {/* Time display */}
        <div className="absolute bottom-3 left-3 px-2 py-1 bg-black/70 rounded text-xs text-white/90 font-mono">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>

        {/* Clip info */}
        {currentClip && (
          <div className="absolute top-3 left-3 px-2 py-1 bg-black/70 rounded text-xs text-white/80">
            {currentClip.name}
          </div>
        )}
      </div>
    </div>
  );
}
