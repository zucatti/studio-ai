'use client';

/**
 * Timeline Clip
 *
 * Renders a single clip on the timeline.
 * Supports selection, dragging, and resizing.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useTimelineStore, TimelineClip, Track } from '@/store/timeline-store';
import { TimelineAudioWaveform } from './TimelineAudioWaveform';

interface TimelineClipComponentProps {
  clip: TimelineClip;
  track: Track;
  scale: number;
}

const CLIP_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  sequence: {
    bg: 'bg-blue-900/80',
    border: 'border-blue-500',
    text: 'text-blue-100',
  },
  video: {
    bg: 'bg-emerald-900/80',
    border: 'border-emerald-500',
    text: 'text-emerald-100',
  },
  image: {
    bg: 'bg-purple-900/80',
    border: 'border-purple-500',
    text: 'text-purple-100',
  },
  audio: {
    bg: 'bg-green-900/80',
    border: 'border-green-500',
    text: 'text-green-100',
  },
  transition: {
    bg: 'bg-yellow-900/80',
    border: 'border-yellow-500',
    text: 'text-yellow-100',
  },
};

const TRANSITION_ICONS: Record<string, string> = {
  fade: '◐',
  fadeblack: '◑',
  fadewhite: '◒',
  dissolve: '◓',
  slideleft: '←',
  slideright: '→',
  slideup: '↑',
  slidedown: '↓',
  wipe: '▮',
  zoom: '⊙',
  none: '|',
};

export function TimelineClipComponent({ clip, track, scale }: TimelineClipComponentProps) {
  const {
    selectedClipIds,
    selectClip,
    moveClip,
    resizeClip,
    clearSelection,
  } = useTimelineStore();

  const clipRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, start: 0, duration: 0 });

  const isSelected = selectedClipIds.includes(clip.id);
  const colors = CLIP_COLORS[clip.type] || CLIP_COLORS.video;

  const width = clip.duration * scale;
  const left = clip.start * scale;

  // Handle click to select
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      selectClip(clip.id, e.shiftKey || e.metaKey);
    },
    [clip.id, selectClip]
  );

  // Handle drag start
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (track.locked) return;
      if (isResizing) return;

      e.preventDefault();
      setIsDragging(true);
      setDragStart({
        x: e.clientX,
        start: clip.start,
        duration: clip.duration,
      });
    },
    [clip.start, clip.duration, track.locked, isResizing]
  );

  // Handle resize start
  const handleResizeStart = useCallback(
    (e: React.MouseEvent, edge: 'left' | 'right') => {
      if (track.locked) return;

      e.preventDefault();
      e.stopPropagation();
      setIsResizing(edge);
      setDragStart({
        x: e.clientX,
        start: clip.start,
        duration: clip.duration,
      });
    },
    [clip.start, clip.duration, track.locked]
  );

  // Handle mouse move
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStart.x;
      const deltaTime = deltaX / scale;

      if (isDragging) {
        const newStart = Math.max(0, dragStart.start + deltaTime);
        moveClip(clip.id, newStart);
      } else if (isResizing === 'left') {
        const newStart = Math.max(0, dragStart.start + deltaTime);
        const newDuration = dragStart.duration - deltaTime;
        if (newDuration > 0.1) {
          resizeClip(clip.id, newDuration, 'left');
        }
      } else if (isResizing === 'right') {
        const newDuration = Math.max(0.1, dragStart.duration + deltaTime);
        resizeClip(clip.id, newDuration, 'right');
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    isDragging,
    isResizing,
    dragStart,
    scale,
    clip.id,
    moveClip,
    resizeClip,
  ]);

  // Render content based on type
  const renderContent = () => {
    if (clip.type === 'audio') {
      return (
        <TimelineAudioWaveform
          assetUrl={clip.assetUrl}
          width={width}
          sourceStart={clip.sourceStart}
          sourceEnd={clip.sourceEnd}
        />
      );
    }

    if (clip.type === 'transition') {
      return (
        <div className="flex items-center justify-center h-full gap-1">
          <span className="text-lg">{TRANSITION_ICONS[clip.transitionType || 'fade']}</span>
          <span className="text-xs">{clip.transitionType || 'fade'}</span>
        </div>
      );
    }

    // Sequence, video, or image
    return (
      <>
        {clip.thumbnailUrl && (
          <div className="absolute inset-0 overflow-hidden rounded">
            <img
              src={clip.thumbnailUrl}
              alt=""
              className="h-full w-full object-cover opacity-60"
            />
          </div>
        )}
        <div className="relative z-10 px-2 py-1 truncate text-xs font-medium">
          {clip.label || clip.type}
        </div>
      </>
    );
  };

  return (
    <div
      ref={clipRef}
      className={cn(
        'absolute top-1 bottom-1 rounded border cursor-pointer',
        'transition-shadow duration-100',
        colors.bg,
        colors.border,
        colors.text,
        isSelected && 'ring-2 ring-white ring-offset-1 ring-offset-zinc-900',
        isDragging && 'opacity-70 cursor-grabbing',
        track.locked && 'opacity-50 cursor-not-allowed'
      )}
      style={{
        left,
        width: Math.max(width, 20),
      }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
    >
      {/* Left resize handle */}
      {!track.locked && clip.type !== 'transition' && (
        <div
          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 z-20"
          onMouseDown={(e) => handleResizeStart(e, 'left')}
        />
      )}

      {/* Content */}
      <div className="relative h-full overflow-hidden">
        {renderContent()}
      </div>

      {/* Right resize handle */}
      {!track.locked && clip.type !== 'transition' && (
        <div
          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 z-20"
          onMouseDown={(e) => handleResizeStart(e, 'right')}
        />
      )}

      {/* Duration label */}
      {width > 40 && (
        <div className="absolute bottom-0.5 right-1 text-[10px] opacity-70">
          {clip.duration.toFixed(1)}s
        </div>
      )}
    </div>
  );
}
