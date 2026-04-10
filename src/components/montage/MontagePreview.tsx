'use client';

import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { useMontageStore, MontageClip } from '@/store/montage-store';
import { useSignedUrl } from '@/hooks/use-signed-url';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Film,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  SkipBack,
  SkipForward,
} from 'lucide-react';

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

// Check if URL is a video file
function isVideoFile(url: string | null | undefined): boolean {
  if (!url) return false;
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];
  const lowerUrl = url.toLowerCase();
  return videoExtensions.some(ext => lowerUrl.includes(ext)) || lowerUrl.includes('/videos/');
}

// Find clip at a given time (with small tolerance for clips that start very close to current time)
function findClipAtTime(
  time: number,
  clips: Record<string, MontageClip>,
  videoTrackIds: string[]
): MontageClip | null {
  // Small tolerance to handle clips that don't start exactly at 0
  const tolerance = 0.5;

  for (const trackId of videoTrackIds) {
    const clip = Object.values(clips).find(
      (c) =>
        c.trackId === trackId &&
        time >= c.start - tolerance &&
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
  // Volume state
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

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
  const { signedUrl, isLoading: isLoadingVideo, error: videoError } = useSignedUrl(currentClip?.assetUrl || null);

  // Get signed URL for thumbnail (shown when not playing)
  const { signedUrl: thumbnailUrl } = useSignedUrl(currentClip?.thumbnailUrl || null);

  // Update current clip when timeline position changes (scrubbing or initial load)
  // DON'T update during playback - let the video play naturally until it ends
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

  // Reset video ready state when clip changes
  useEffect(() => {
    setIsVideoReady(false);
  }, [currentClipId, signedUrl]);

  // Seek video when timeline position changes (while paused)
  // Note: We always get currentTime from store directly because storeCurrentTime
  // is null during playback and might be stale when pausing
  useEffect(() => {
    if (!videoRef.current || !currentClip || !signedUrl || isPlaying) return;

    // Always get fresh time from store (not storeCurrentTime which was null during playback)
    const time = useMontageStore.getState().currentTime;
    const clipTime = time - currentClip.start;
    const sourceTime = (currentClip.sourceStart || 0) + clipTime;

    videoRef.current.currentTime = sourceTime;
  }, [storeCurrentTime, currentClip, signedUrl, isPlaying]);

  // Handle video timeupdate - VIDEO drives the timeline, not the other way around
  const handleVideoTimeUpdate = useCallback(() => {
    if (!videoRef.current || !currentClip || !isPlaying) return;

    const videoTime = videoRef.current.currentTime;
    const timelineTime = currentClip.start + videoTime - (currentClip.sourceStart || 0);

    // Update store (this moves the timeline playhead)
    useMontageStore.getState().setCurrentTime(timelineTime);

    // Update time display directly (no React re-render)
    if (timeDisplayRef.current) {
      const store = useMontageStore.getState();
      timeDisplayRef.current.textContent = `${formatTime(timelineTime)} / ${formatTime(store.duration)}`;
    }
  }, [currentClip, isPlaying]);

  // Handle video ended
  const handleVideoEnded = useCallback(() => {
    const store = useMontageStore.getState();
    store.pause();
    store.setCurrentTime(0);
  }, []);

  // Play/pause video element
  useEffect(() => {
    if (!videoRef.current) return;

    if (isPlaying && currentClip && signedUrl) {
      // Seek to correct position before playing
      const time = useMontageStore.getState().currentTime;
      const clipTime = time - currentClip.start;
      const sourceTime = (currentClip.sourceStart || 0) + clipTime;
      videoRef.current.currentTime = sourceTime;
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying, currentClip, signedUrl]);

  // Sync video muted state
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = isVideoTrackMuted || isMuted;
  }, [isVideoTrackMuted, isMuted]);

  // Handle volume change
  const handleVolumeChange = useCallback((value: number[]) => {
    if (!videoRef.current) return;
    const newVolume = value[0];
    videoRef.current.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    const newMuted = !isMuted;
    videoRef.current.muted = newMuted || isVideoTrackMuted;
    setIsMuted(newMuted);
  }, [isMuted, isVideoTrackMuted]);

  // Skip forward/backward
  const skip = useCallback((seconds: number) => {
    const store = useMontageStore.getState();
    const newTime = Math.max(0, Math.min(store.duration, store.currentTime + seconds));
    store.setCurrentTime(newTime);
  }, []);

  // Handle seek from slider
  const handleSeek = useCallback((value: number[]) => {
    const store = useMontageStore.getState();
    store.setCurrentTime(value[0]);
  }, []);

  // Fullscreen
  const handleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex items-center justify-center p-4',
        className
      )}
    >
      {/* Preview container with fixed aspect ratio */}
      <div
        className="relative group bg-black rounded-lg overflow-hidden"
        style={{
          aspectRatio: ratio,
          width: ratio >= 1 ? 'auto' : '100%',
          height: ratio >= 1 ? '100%' : 'auto',
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      >
        {currentClip && signedUrl ? (
          currentClip.type === 'video' ? (
            <>
              {/* Thumbnail shown until video is ready and playing */}
              {thumbnailUrl && !(isPlaying && isVideoReady) && !isVideoFile(thumbnailUrl) && (
                <img
                  src={thumbnailUrl}
                  alt={currentClip.name}
                  className="absolute inset-0 w-full h-full object-contain z-10"
                />
              )}
              {/* Video - plays naturally, drives the timeline */}
              <video
                ref={videoRef}
                key={currentClip.id}
                src={signedUrl}
                className="w-full h-full object-contain"
                playsInline
                preload="auto"
                muted={isVideoTrackMuted || isMuted}
                onPlaying={() => setIsVideoReady(true)}
                onCanPlay={() => setIsVideoReady(true)}
                onTimeUpdate={handleVideoTimeUpdate}
                onEnded={handleVideoEnded}
                onError={(e) => console.error('[MontagePreview] Video error:', e.currentTarget.error?.message || 'unknown error')}
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

        {/* Clip info - top left */}
        <div
          ref={clipInfoRef}
          className="absolute top-3 left-3 px-2 py-1 bg-black/70 rounded text-xs text-white/80 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ display: currentClip ? 'block' : 'none' }}
        >
          {currentClip?.name || ''}
        </div>

        {/* Fullscreen button - top right, always visible on hover */}
        <button
          onClick={handleFullscreen}
          className="absolute top-3 right-3 p-2 rounded-lg bg-black/50 hover:bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          title="Plein écran"
        >
          <Maximize className="w-4 h-4" />
        </button>

        {/* Center play button (only when paused) */}
        {!isPlaying && (
          <button
            onClick={togglePlayback}
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
              <Play className="w-8 h-8 text-white ml-1" fill="white" />
            </div>
          </button>
        )}

        {/* Custom controls overlay - hover only */}
        <div
          className={cn(
            'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 transition-opacity',
            'opacity-0 group-hover:opacity-100'
          )}
        >
          {/* Progress bar */}
          <Slider
            value={[storeCurrentTime ?? 0]}
            max={duration || 1}
            step={0.1}
            onValueChange={handleSeek}
            className="mb-3"
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={() => skip(-5)}
              >
                <SkipBack className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={togglePlayback}
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={() => skip(5)}
              >
                <SkipForward className="h-4 w-4" />
              </Button>

              {/* Time display */}
              <span
                ref={timeDisplayRef}
                className="text-white text-xs ml-2 font-mono"
              >
                {formatTime(storeCurrentTime ?? 0)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={toggleMute}
              >
                {isMuted || isVideoTrackMuted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>

              <div className="w-20">
                <Slider
                  value={[isMuted ? 0 : volume]}
                  max={1}
                  step={0.1}
                  onValueChange={handleVolumeChange}
                />
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={handleFullscreen}
              >
                <Maximize className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
