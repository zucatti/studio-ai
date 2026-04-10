'use client';

/**
 * Timeline Preview
 *
 * Video preview panel showing the current frame.
 */

import { useRef, useEffect, useState } from 'react';
import { Play, Pause, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTimelineStore, selectVisualClips } from '@/store/timeline-store';

export function TimelinePreview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeClip, setActiveClip] = useState<{ url: string; offset: number } | null>(null);

  const {
    currentTime,
    isPlaying,
    togglePlayback,
    setCurrentTime,
    clips,
  } = useTimelineStore();

  const visualClips = useTimelineStore(selectVisualClips);

  // Find the active clip at current time
  useEffect(() => {
    let found = false;

    for (const clip of visualClips) {
      if (currentTime >= clip.start && currentTime < clip.start + clip.duration) {
        const url = clip.assetUrl || clip.thumbnailUrl;
        if (url && clip.type !== 'image') {
          const offset = currentTime - clip.start + (clip.sourceStart || 0);
          setActiveClip({ url, offset });
          found = true;
        }
        break;
      }
    }

    if (!found) {
      setActiveClip(null);
    }
  }, [currentTime, visualClips]);

  // Sync video with current time
  useEffect(() => {
    if (!videoRef.current || !activeClip) return;

    const video = videoRef.current;

    // Load new source if changed
    if (video.src !== activeClip.url) {
      video.src = activeClip.url;
      video.load();
    }

    // Seek to correct position
    if (Math.abs(video.currentTime - activeClip.offset) > 0.1) {
      video.currentTime = activeClip.offset;
    }
  }, [activeClip]);

  // Handle playback
  useEffect(() => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  // Update current time during playback
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setCurrentTime(currentTime + 1 / 30); // 30fps
    }, 1000 / 30);

    return () => clearInterval(interval);
  }, [isPlaying, currentTime, setCurrentTime]);

  return (
    <div className="w-80 bg-zinc-900 border-l border-zinc-800 flex flex-col">
      {/* Video container */}
      <div className="relative aspect-video bg-black">
        {activeClip ? (
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            muted
            playsInline
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
            No clip at current time
          </div>
        )}

        {/* Overlay controls */}
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 bg-black/50 hover:bg-black/70"
            onClick={togglePlayback}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 bg-black/50 hover:bg-black/70"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Info panel */}
      <div className="flex-1 p-3 overflow-auto">
        <h3 className="text-sm font-medium text-zinc-400 mb-2">Preview</h3>

        {activeClip ? (
          <div className="text-xs text-zinc-500 space-y-1">
            <p>Time: {currentTime.toFixed(2)}s</p>
            <p>Offset: {activeClip.offset.toFixed(2)}s</p>
          </div>
        ) : (
          <p className="text-xs text-zinc-600">
            Move the playhead over a clip to preview.
          </p>
        )}
      </div>
    </div>
  );
}
