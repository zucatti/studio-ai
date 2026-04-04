'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useMontageStore, MontageClip, MontageTrack, MontageAsset, ClipType } from '@/store/montage-store';
import { cn } from '@/lib/utils';
import { useSignedUrl } from '@/hooks/use-signed-url';
import {
  Film,
  Music,
  Type,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  GripVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MontageTimelineProps {
  className?: string;
}

const TRACK_HEADER_WIDTH = 140;
const RULER_HEIGHT = 24;
const MIN_CLIP_WIDTH = 20;

export function MontageTimeline({ className }: MontageTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizing, setResizing] = useState<{ clipId: string; edge: 'left' | 'right' } | null>(null);

  const {
    tracks,
    clips,
    currentTime,
    duration,
    scale,
    scrollLeft,
    selectedClipIds,
    addTrack,
    removeTrack,
    updateTrack,
    addClip,
    removeClip,
    updateClip,
    moveClip,
    resizeClip,
    selectClip,
    clearSelection,
    setCurrentTime,
    setScale,
    setScroll,
    getClipsForTrack,
  } = useMontageStore();

  // Total width based on duration
  const timelineWidth = useMemo(() => {
    return Math.max(duration * scale + 200, 800);
  }, [duration, scale]);

  // Handle ruler click to seek
  const handleRulerClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollLeft;
      const time = x / scale;
      setCurrentTime(Math.max(0, time));
    },
    [scale, scrollLeft, setCurrentTime]
  );

  // Handle timeline background click to seek
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent) => {
      // Only if clicking on background, not on a clip
      if ((e.target as HTMLElement).closest('.timeline-clip')) return;

      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left - TRACK_HEADER_WIDTH + scrollLeft;
      if (x < 0) return;

      const time = x / scale;
      setCurrentTime(Math.max(0, time));
      clearSelection();
    },
    [scale, scrollLeft, setCurrentTime, clearSelection]
  );

  // Handle drop from sidebar
  const handleDrop = useCallback(
    (e: React.DragEvent, trackId: string) => {
      e.preventDefault();
      const data = e.dataTransfer.getData('application/json');
      if (!data) return;

      try {
        const asset: MontageAsset = JSON.parse(data);

        // Calculate drop position
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left + scrollLeft;
        const startTime = Math.max(0, x / scale);

        // Determine clip type
        const clipType: ClipType = asset.type === 'audio' ? 'audio' : 'video';

        addClip({
          type: clipType,
          trackId,
          start: startTime,
          duration: asset.duration || 5,
          sourceDuration: asset.duration,
          assetId: asset.id,
          assetUrl: asset.url,
          thumbnailUrl: asset.thumbnailUrl,
          name: asset.name,
          color: asset.type === 'audio' ? '#22c55e' : '#8b5cf6',
          volume: 1,
        });
      } catch (err) {
        console.error('Failed to parse drop data:', err);
      }
    },
    [scrollLeft, scale, addClip]
  );

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // Handle wheel for horizontal scroll and zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setScale(scale * delta);
      } else if (e.shiftKey) {
        // Horizontal scroll
        e.preventDefault();
        setScroll(scrollLeft + e.deltaY, 0);
      }
    },
    [scale, scrollLeft, setScale, setScroll]
  );

  // Generate ruler marks
  const rulerMarks = useMemo(() => {
    const marks: { time: number; label: string; major: boolean }[] = [];
    const step = scale > 100 ? 0.5 : scale > 50 ? 1 : scale > 20 ? 2 : 5;

    for (let t = 0; t <= duration + step; t += step) {
      const major = t % (step * 2) === 0 || step >= 5;
      marks.push({
        time: t,
        label: major ? formatTime(t) : '',
        major,
      });
    }

    return marks;
  }, [duration, scale]);

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Timeline controls */}
      <div className="flex items-center gap-2 px-2 py-1 border-b border-white/5">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => addTrack('video')}
          >
            <Film className="w-3.5 h-3.5 mr-1" />
            <Plus className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => addTrack('audio')}
          >
            <Music className="w-3.5 h-3.5 mr-1" />
            <Plus className="w-3 h-3" />
          </Button>
        </div>

        <div className="flex-1" />

        {/* Zoom controls */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <button onClick={() => setScale(scale / 1.25)} className="hover:text-white">
            -
          </button>
          <span className="w-12 text-center">{Math.round(scale)}px/s</span>
          <button onClick={() => setScale(scale * 1.25)} className="hover:text-white">
            +
          </button>
        </div>
      </div>

      {/* Timeline area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
        onWheel={handleWheel}
        onClick={handleTimelineClick}
      >
        <div
          ref={timelineRef}
          className="relative"
          style={{ minWidth: timelineWidth + TRACK_HEADER_WIDTH }}
        >
          {/* Ruler */}
          <div
            className="sticky top-0 z-20 flex border-b border-white/10"
            style={{ height: RULER_HEIGHT }}
          >
            {/* Header spacer */}
            <div
              className="flex-shrink-0 border-r border-white/10"
              style={{ width: TRACK_HEADER_WIDTH }}
            />

            {/* Ruler track */}
            <div
              className="relative flex-1 cursor-pointer"
              onClick={handleRulerClick}
              style={{ width: timelineWidth }}
            >
              {rulerMarks.map(({ time, label, major }) => (
                <div
                  key={time}
                  className="absolute top-0 flex flex-col items-center"
                  style={{ left: time * scale - scrollLeft }}
                >
                  <div
                    className={cn(
                      'w-px',
                      major ? 'h-3 bg-slate-500' : 'h-2 bg-slate-700'
                    )}
                  />
                  {label && (
                    <span className="text-[9px] text-slate-500 mt-0.5">
                      {label}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Tracks */}
          <div className="relative">
            {[...tracks]
              .sort((a, b) => a.order - b.order)
              .map((track) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  clips={getClipsForTrack(track.id)}
                  scale={scale}
                  scrollLeft={scrollLeft}
                  selectedClipIds={selectedClipIds}
                  onDrop={(e) => handleDrop(e, track.id)}
                  onDragOver={handleDragOver}
                />
              ))}
          </div>

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none"
            style={{
              left: TRACK_HEADER_WIDTH + currentTime * scale - scrollLeft,
            }}
          >
            <div className="absolute -top-0 -left-1.5 w-3 h-3 bg-red-500 rounded-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Track row component
function TrackRow({
  track,
  clips,
  scale,
  scrollLeft,
  selectedClipIds,
  onDrop,
  onDragOver,
}: {
  track: MontageTrack;
  clips: MontageClip[];
  scale: number;
  scrollLeft: number;
  selectedClipIds: string[];
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
}) {
  const { updateTrack, removeTrack } = useMontageStore();

  const Icon = track.type === 'audio' ? Music : track.type === 'text' ? Type : Film;

  return (
    <div
      className="flex border-b border-white/5"
      style={{ height: track.height }}
    >
      {/* Track header */}
      <div
        className="flex-shrink-0 flex items-center gap-2 px-2 border-r border-white/10"
        style={{ width: TRACK_HEADER_WIDTH }}
      >
        <GripVertical className="w-3 h-3 text-slate-600 cursor-grab" />
        <Icon className={cn(
          'w-3.5 h-3.5',
          track.type === 'audio' ? 'text-green-400' : 'text-purple-400'
        )} />
        <span className="flex-1 text-xs text-slate-300 truncate">{track.name}</span>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => updateTrack(track.id, { locked: !track.locked })}
            className="p-1 rounded hover:bg-white/5"
            title={track.locked ? 'Déverrouiller' : 'Verrouiller'}
          >
            {track.locked ? (
              <Lock className="w-3 h-3 text-slate-500" />
            ) : (
              <Unlock className="w-3 h-3 text-slate-600" />
            )}
          </button>

          <button
            onClick={() => updateTrack(track.id, { muted: !track.muted })}
            className="p-1 rounded hover:bg-white/5"
            title={track.muted ? 'Activer' : 'Couper le son'}
          >
            {track.muted ? (
              <VolumeX className="w-3 h-3 text-slate-500" />
            ) : (
              <Volume2 className="w-3 h-3 text-slate-600" />
            )}
          </button>

          <button
            onClick={() => removeTrack(track.id)}
            className="p-1 rounded hover:bg-white/5 hover:text-red-400"
            title="Supprimer la piste"
          >
            <Trash2 className="w-3 h-3 text-slate-600" />
          </button>
        </div>
      </div>

      {/* Track content */}
      <div
        className={cn(
          'relative flex-1',
          track.locked && 'opacity-50 pointer-events-none'
        )}
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        {/* Grid lines */}
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: Math.ceil(1000 / scale) }).map((_, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-px bg-white/5"
              style={{ left: i * scale - (scrollLeft % scale) }}
            />
          ))}
        </div>

        {/* Clips */}
        {clips.map((clip) => (
          <ClipItem
            key={clip.id}
            clip={clip}
            scale={scale}
            scrollLeft={scrollLeft}
            isSelected={selectedClipIds.includes(clip.id)}
            trackHeight={track.height}
          />
        ))}
      </div>
    </div>
  );
}

// Clip item component
function ClipItem({
  clip,
  scale,
  scrollLeft,
  isSelected,
  trackHeight,
}: {
  clip: MontageClip;
  scale: number;
  scrollLeft: number;
  isSelected: boolean;
  trackHeight: number;
}) {
  const clipRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, start: 0 });

  const { selectClip, moveClip, resizeClip, removeClip } = useMontageStore();
  const { signedUrl } = useSignedUrl(clip.thumbnailUrl || null);

  const left = clip.start * scale;
  const width = Math.max(MIN_CLIP_WIDTH, clip.duration * scale);

  // Handle clip click
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      selectClip(clip.id, e.shiftKey);
    },
    [clip.id, selectClip]
  );

  // Handle drag start
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const target = e.target as HTMLElement;
      const isLeftHandle = target.classList.contains('resize-left');
      const isRightHandle = target.classList.contains('resize-right');

      if (isLeftHandle) {
        setIsResizing('left');
      } else if (isRightHandle) {
        setIsResizing('right');
      } else {
        setIsDragging(true);
      }

      setDragStart({ x: e.clientX, start: clip.start });
      selectClip(clip.id, e.shiftKey);
    },
    [clip.id, clip.start, selectClip]
  );

  // Handle drag/resize
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStart.x;
      const deltaTime = deltaX / scale;

      if (isDragging) {
        const newStart = Math.max(0, dragStart.start + deltaTime);
        moveClip(clip.id, clip.trackId, newStart);
      } else if (isResizing === 'left') {
        const newStart = Math.max(0, dragStart.start + deltaTime);
        const newDuration = clip.start + clip.duration - newStart;
        if (newDuration > 0.1) {
          resizeClip(clip.id, newStart, newDuration);
        }
      } else if (isResizing === 'right') {
        const newDuration = Math.max(0.1, clip.duration + deltaTime);
        resizeClip(clip.id, clip.start, newDuration);
        setDragStart({ ...dragStart, x: e.clientX });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragStart, scale, clip, moveClip, resizeClip]);

  return (
    <div
      ref={clipRef}
      className={cn(
        'timeline-clip absolute top-1 bottom-1 rounded overflow-hidden cursor-grab',
        'border transition-all',
        isSelected
          ? 'border-white ring-1 ring-white/50'
          : 'border-white/20 hover:border-white/40',
        isDragging && 'opacity-80 cursor-grabbing',
        isResizing && 'cursor-ew-resize'
      )}
      style={{
        left,
        width,
        backgroundColor: clip.color || '#8b5cf6',
      }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
    >
      {/* Thumbnail background */}
      {signedUrl && clip.type !== 'audio' && (
        <img
          src={signedUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-60"
          draggable={false}
        />
      )}

      {/* Audio waveform placeholder */}
      {clip.type === 'audio' && (
        <div className="absolute inset-0 flex items-center px-1">
          <div className="w-full h-1/2 bg-white/20 rounded-sm" />
        </div>
      )}

      {/* Clip content */}
      <div className="relative z-10 h-full flex items-center px-2">
        <span className="text-[10px] text-white font-medium truncate drop-shadow">
          {clip.name}
        </span>
      </div>

      {/* Resize handles */}
      <div className="resize-left absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30" />
      <div className="resize-right absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30" />
    </div>
  );
}

// Format time helper
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
