'use client';

import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { useMontageStore, MontageClip } from '@/store/montage-store';
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

// Format time display
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * 30);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

// Find clip at a given time
function findClipAtTime(
  time: number,
  clips: Record<string, MontageClip>,
  videoTrackIds: string[]
): MontageClip | null {
  for (const trackId of videoTrackIds) {
    const clip = Object.values(clips).find(
      (c) =>
        c.trackId === trackId &&
        time >= c.start &&
        time < c.start + c.duration
    );
    if (clip) return clip;
  }
  return null;
}

export function MontagePreview({ aspectRatio, className }: MontagePreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeDisplayRef = useRef<HTMLDivElement>(null);
  const clipInfoRef = useRef<HTMLDivElement>(null);

  // Track current clip in state (only changes when clip changes, not every frame)
  const [currentClipId, setCurrentClipId] = useState<string | null>(null);
  // Track if video is ready to display (has loaded enough data)
  const [isVideoReady, setIsVideoReady] = useState(false);

  // Get static values from store
  const clips = useMontageStore((state) => state.clips);
  const tracks = useMontageStore((state) => state.tracks);
  const duration = useMontageStore((state) => state.duration);
  const isPlaying = useMontageStore((state) => state.isPlaying);
  const togglePlayback = useMontageStore((state) => state.togglePlayback);

  // Get currentTime only when NOT playing
  const storeCurrentTime = useMontageStore((state) =>
    state.isPlaying ? null : state.currentTime
  );

  const ratio = useMemo(() => parseAspectRatio(aspectRatio), [aspectRatio]);

  // Get video track IDs
  const videoTrackIds = useMemo(
    () => tracks.filter((t) => t.type === 'video').map((t) => t.id),
    [tracks]
  );

  // Current clip object
  const currentClip = currentClipId ? clips[currentClipId] : null;

  // Check if the current clip's track is muted
  const isVideoTrackMuted = useMemo(() => {
    if (!currentClip) return false;
    const track = tracks.find((t) => t.id === currentClip.trackId);
    return track?.muted ?? false;
  }, [currentClip, tracks]);

  // Get signed URL for current clip video
  const { signedUrl } = useSignedUrl(currentClip?.assetUrl || null);

  // Get signed URL for thumbnail (shown when not playing)
  const { signedUrl: thumbnailUrl } = useSignedUrl(currentClip?.thumbnailUrl || null);

  // Update current clip when not playing (based on store currentTime)
  useEffect(() => {
    if (isPlaying) return;

    const time = storeCurrentTime ?? useMontageStore.getState().currentTime;
    const clip = findClipAtTime(time, clips, videoTrackIds);
    setCurrentClipId(clip?.id || null);

    // Update time display
    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = `${formatTime(time)} / ${formatTime(duration)}`;
    }

    // Update clip info
    if (clipInfoRef.current) {
      clipInfoRef.current.textContent = clip?.name || '';
      clipInfoRef.current.style.display = clip ? 'block' : 'none';
    }
  }, [storeCurrentTime, isPlaying, clips, videoTrackIds, duration]);

  // Playback loop - updates store and DOM directly, no React re-renders
  useEffect(() => {
    if (!isPlaying) return;

    let lastTime = performance.now();
    let rafId: number;
    let lastClipId: string | null = currentClipId;

    const tick = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      const store = useMontageStore.getState();
      const newTime = store.currentTime + delta;

      if (newTime >= store.duration) {
        store.pause();
        store.setCurrentTime(0);
        return;
      }

      // Update store (this updates the timeline playhead via subscription)
      store.setCurrentTime(newTime);

      // Update time display directly (no React)
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = `${formatTime(newTime)} / ${formatTime(store.duration)}`;
      }

      // Check if we need to switch clips
      const clip = findClipAtTime(newTime, store.clips, videoTrackIds);
      const newClipId = clip?.id || null;

      if (newClipId !== lastClipId) {
        lastClipId = newClipId;
        setCurrentClipId(newClipId); // This triggers a re-render to load new clip

        // Update clip info
        if (clipInfoRef.current) {
          clipInfoRef.current.textContent = clip?.name || '';
          clipInfoRef.current.style.display = clip ? 'block' : 'none';
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, videoTrackIds, currentClipId]);

  // Reset video ready state when clip changes
  useEffect(() => {
    setIsVideoReady(false);
  }, [currentClipId, signedUrl]);

  // Sync video element when clip changes or when seeking (not playing)
  useEffect(() => {
    if (!videoRef.current || !currentClip || !signedUrl) return;

    const time = useMontageStore.getState().currentTime;
    const clipTime = time - currentClip.start;
    const sourceTime = (currentClip.sourceStart || 0) + clipTime;

    videoRef.current.currentTime = sourceTime;

    if (isPlaying) {
      videoRef.current.play().catch(() => {});
    }
  }, [currentClip, signedUrl, isPlaying]);

  // Play/pause video element
  useEffect(() => {
    if (!videoRef.current) return;

    if (isPlaying && currentClip && signedUrl) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying, currentClip, signedUrl]);

  // Sync video muted state
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = isVideoTrackMuted;
  }, [isVideoTrackMuted]);

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
            <>
              {/* Thumbnail shown until video is ready and playing */}
              {thumbnailUrl && !(isPlaying && isVideoReady) && (
                <img
                  src={thumbnailUrl}
                  alt={currentClip.name}
                  className="absolute inset-0 w-full h-full object-contain z-10"
                />
              )}
              {/* Video (hidden behind thumbnail until ready) */}
              <video
                ref={videoRef}
                src={signedUrl}
                className={cn(
                  "w-full h-full object-contain",
                  thumbnailUrl && !(isPlaying && isVideoReady) && "opacity-0"
                )}
                playsInline
                preload="auto"
                muted={isVideoTrackMuted}
                onPlaying={() => setIsVideoReady(true)}
                onCanPlay={() => setIsVideoReady(true)}
              />
            </>
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

        {/* Time display - updated via ref during playback */}
        <div
          ref={timeDisplayRef}
          className="absolute bottom-3 left-3 px-2 py-1 bg-black/70 rounded text-xs text-white/90 font-mono"
        >
          {formatTime(storeCurrentTime ?? 0)} / {formatTime(duration)}
        </div>

        {/* Clip info - updated via ref during playback */}
        <div
          ref={clipInfoRef}
          className="absolute top-3 left-3 px-2 py-1 bg-black/70 rounded text-xs text-white/80"
          style={{ display: currentClip ? 'block' : 'none' }}
        >
          {currentClip?.name || ''}
        </div>
      </div>
    </div>
  );
}
