'use client';

/**
 * Timeline Tracks
 *
 * Container for all tracks in the timeline.
 * Handles scrolling and drop zone logic.
 */

import { useRef, useCallback } from 'react';
import { useTimelineStore, Track } from '@/store/timeline-store';
import { TimelineTrack } from './TimelineTrack';
import { TimelinePlayhead } from './TimelinePlayhead';

interface TimelineTracksProps {
  tracks: Track[];
}

export function TimelineTracks({ tracks }: TimelineTracksProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    scale,
    duration,
    scrollX,
    setScroll,
    draggedItem,
    updateDropTarget,
    dropItem,
    currentTime,
  } = useTimelineStore();

  // Calculate timeline width
  const timelineWidth = Math.max(duration * scale + 200, 1000);

  // Handle scroll
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.target as HTMLDivElement;
      setScroll(target.scrollLeft, target.scrollTop);
    },
    [setScroll]
  );

  // Handle drag over
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';

      if (!draggedItem || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollX;
      const y = e.clientY - rect.top;

      // Calculate time from x position
      const time = Math.max(0, x / scale);

      // Find which track we're over
      const trackElements = containerRef.current.querySelectorAll('[data-track-id]');
      let targetTrackId: string | null = null;

      trackElements.forEach((el) => {
        const trackRect = el.getBoundingClientRect();
        const relativeY = e.clientY - trackRect.top;
        if (relativeY >= 0 && relativeY < trackRect.height) {
          targetTrackId = el.getAttribute('data-track-id');
        }
      });

      if (targetTrackId) {
        const track = tracks.find((t) => t.id === targetTrackId);
        const valid = isDropValid(draggedItem.type, track?.type);

        updateDropTarget({
          trackId: targetTrackId,
          time: Math.round(time * 10) / 10, // Snap to 0.1s
          valid,
        });
      } else {
        updateDropTarget(null);
      }
    },
    [draggedItem, scale, scrollX, tracks, updateDropTarget]
  );

  // Handle drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dropItem();
    },
    [dropItem]
  );

  // Handle drag leave
  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      // Only clear if leaving the container entirely
      if (!containerRef.current?.contains(e.relatedTarget as Node)) {
        updateDropTarget(null);
      }
    },
    [updateDropTarget]
  );

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto relative bg-zinc-950"
      onScroll={handleScroll}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
    >
      <div
        className="relative"
        style={{ width: timelineWidth, minHeight: '100%' }}
      >
        {/* Tracks */}
        <div className="flex flex-col">
          {tracks.map((track) => (
            <TimelineTrack key={track.id} track={track} />
          ))}
        </div>

        {/* Playhead */}
        <TimelinePlayhead
          currentTime={currentTime}
          scale={scale}
          height={tracks.length * 64} // 64px per track
        />
      </div>
    </div>
  );
}

// Check if drop is valid for track type
function isDropValid(
  itemType: 'sequence' | 'rush-video' | 'rush-image' | 'audio',
  trackType?: string
): boolean {
  if (!trackType) return false;

  switch (itemType) {
    case 'sequence':
    case 'rush-video':
      return trackType === 'video';
    case 'rush-image':
      return trackType === 'image' || trackType === 'video';
    case 'audio':
      return trackType === 'audio';
    default:
      return false;
  }
}
