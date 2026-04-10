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
  Shuffle,
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
  const rulerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizing, setResizing] = useState<{ clipId: string; edge: 'left' | 'right' } | null>(null);

  // Local state for immediate playhead feedback
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);

  // Get values from store - use selectors to minimize re-renders
  const tracks = useMontageStore((state) => state.tracks);
  const clips = useMontageStore((state) => state.clips);
  const duration = useMontageStore((state) => state.duration);
  const scale = useMontageStore((state) => state.scale);
  const scrollLeft = useMontageStore((state) => state.scrollLeft);
  const selectedClipIds = useMontageStore((state) => state.selectedClipIds);
  const isPlaying = useMontageStore((state) => state.isPlaying);

  // Actions
  const addTrack = useMontageStore((state) => state.addTrack);
  const removeTrack = useMontageStore((state) => state.removeTrack);
  const updateTrack = useMontageStore((state) => state.updateTrack);
  const addClip = useMontageStore((state) => state.addClip);
  const removeClip = useMontageStore((state) => state.removeClip);
  const updateClip = useMontageStore((state) => state.updateClip);
  const moveClip = useMontageStore((state) => state.moveClip);
  const resizeClip = useMontageStore((state) => state.resizeClip);
  const selectClip = useMontageStore((state) => state.selectClip);
  const clearSelection = useMontageStore((state) => state.clearSelection);
  const setCurrentTime = useMontageStore((state) => state.setCurrentTime);
  const setScale = useMontageStore((state) => state.setScale);
  const setScroll = useMontageStore((state) => state.setScroll);

  // Only get currentTime when NOT playing (to avoid re-renders during playback)
  const storeCurrentTime = useMontageStore((state) =>
    state.isPlaying ? null : state.currentTime
  );

  // Subscribe to currentTime changes during playback and update playhead directly (no re-render)
  useEffect(() => {
    if (!isPlaying) return;

    const unsubscribe = useMontageStore.subscribe((state) => {
      if (playheadRef.current && state.isPlaying) {
        const left = TRACK_HEADER_WIDTH + state.currentTime * state.scale - state.scrollLeft;
        playheadRef.current.style.left = `${left}px`;
      }
    });

    return unsubscribe;
  }, [isPlaying]);

  // Displayed time: scrubbing > store (when not playing) > 0
  const displayedTime = isScrubbing && scrubTime !== null
    ? scrubTime
    : (storeCurrentTime ?? useMontageStore.getState().currentTime);

  // Total width based on duration
  const timelineWidth = useMemo(() => {
    return Math.max(duration * scale + 200, 800);
  }, [duration, scale]);

  // Calculate time from mouse position on ruler
  const getTimeFromRulerEvent = useCallback(
    (e: MouseEvent | React.MouseEvent, rect?: DOMRect) => {
      const rulerRect = rect || rulerRef.current?.getBoundingClientRect();
      if (!rulerRect) return 0;
      const x = e.clientX - rulerRect.left + scrollLeft;
      return Math.max(0, Math.min(x / scale, duration || 1000));
    },
    [scale, scrollLeft, duration]
  );

  // Handle ruler mousedown to start scrubbing
  const handleRulerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const time = getTimeFromRulerEvent(e, rect);

      setIsScrubbing(true);
      setScrubTime(time);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const newTime = getTimeFromRulerEvent(moveEvent, rect);
        setScrubTime(newTime);
      };

      const handleMouseUp = (upEvent: MouseEvent) => {
        const finalTime = getTimeFromRulerEvent(upEvent, rect);
        setCurrentTime(finalTime);
        setIsScrubbing(false);
        setScrubTime(null);

        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [getTimeFromRulerEvent, setCurrentTime]
  );

  // Handle timeline background click to seek (immediate)
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent) => {
      // Only if clicking on background, not on a clip
      if ((e.target as HTMLElement).closest('.timeline-clip')) return;

      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left - TRACK_HEADER_WIDTH + scrollLeft;
      if (x < 0) return;

      const time = Math.max(0, Math.min(x / scale, duration || 1000));

      // Immediate visual update
      setScrubTime(time);
      // Then sync to store
      requestAnimationFrame(() => {
        setCurrentTime(time);
        setScrubTime(null);
      });

      clearSelection();
    },
    [scale, scrollLeft, duration, setCurrentTime, clearSelection]
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
            title="Ajouter piste vidéo"
          >
            <Film className="w-3.5 h-3.5 mr-1" />
            <Plus className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => addTrack('audio')}
            title="Ajouter piste audio"
          >
            <Music className="w-3.5 h-3.5 mr-1" />
            <Plus className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => addTrack('transition')}
            title="Ajouter piste transition"
          >
            <Shuffle className="w-3.5 h-3.5 mr-1" />
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
            {/* Header spacer - sticky to align with track headers */}
            <div
              className="flex-shrink-0 border-r border-white/10 sticky left-0 z-10 bg-[#0d1520]"
              style={{ width: TRACK_HEADER_WIDTH }}
            />

            {/* Ruler track */}
            <div
              ref={rulerRef}
              className="relative flex-1 cursor-pointer select-none"
              onMouseDown={handleRulerMouseDown}
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
                  allClips={clips}
                  scale={scale}
                  scrollLeft={scrollLeft}
                  selectedClipIds={selectedClipIds}
                  onDrop={(e) => handleDrop(e, track.id)}
                  onDragOver={handleDragOver}
                />
              ))}
          </div>

          {/* Playhead - uses ref for direct DOM updates during playback */}
          <div
            ref={playheadRef}
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none"
            style={{
              left: TRACK_HEADER_WIDTH + displayedTime * scale - scrollLeft,
            }}
          >
            <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Track row component
function TrackRow({
  track,
  allClips,
  scale,
  scrollLeft,
  selectedClipIds,
  onDrop,
  onDragOver,
}: {
  track: MontageTrack;
  allClips: Record<string, MontageClip>;
  scale: number;
  scrollLeft: number;
  selectedClipIds: string[];
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
}) {
  const { updateTrack, removeTrack } = useMontageStore();

  // Memoize clips for this track to avoid re-renders
  const clips = useMemo(() => {
    const filtered = Object.values(allClips)
      .filter((clip) => clip.trackId === track.id)
      .sort((a, b) => a.start - b.start);
    console.log(`[TrackRow] Track ${track.id} (${track.name}): ${filtered.length} clips from ${Object.keys(allClips).length} total`);
    return filtered;
  }, [allClips, track.id, track.name]);

  const Icon = track.type === 'audio' ? Music : track.type === 'text' ? Type : track.type === 'transition' ? Shuffle : Film;

  return (
    <div
      className="flex border-b border-white/5"
      style={{ height: track.height }}
    >
      {/* Track header - sticky to stay visible on horizontal scroll */}
      <div
        className="flex-shrink-0 flex items-center gap-2 px-2 border-r border-white/10 sticky left-0 z-10 bg-[#0d1520]"
        style={{ width: TRACK_HEADER_WIDTH }}
      >
        <GripVertical className="w-3 h-3 text-slate-600 cursor-grab" />
        <Icon className={cn(
          'w-3.5 h-3.5',
          track.type === 'audio' ? 'text-green-400' :
          track.type === 'transition' ? 'text-orange-400' : 'text-purple-400'
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

// Check if URL is a video file
function isVideoFile(url: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];
  const lowerUrl = url.toLowerCase();
  // Check extension or path pattern
  return videoExtensions.some(ext => lowerUrl.includes(ext)) || lowerUrl.includes('/videos/');
}

// Video thumbnail component - shows first frame of video
function VideoThumbnail({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedData = () => {
      // Seek to 0.1s to show first frame (some videos have black first frame at 0)
      video.currentTime = 0.1;
    };

    video.addEventListener('loadeddata', handleLoadedData);
    return () => video.removeEventListener('loadeddata', handleLoadedData);
  }, [src]);

  return (
    <video
      ref={videoRef}
      src={src}
      className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none"
      muted
      playsInline
      preload="metadata"
    />
  );
}

// Clip item component - optimized with local state for immediate visual feedback
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
  const { selectClip, moveClip, resizeClip, updateClip } = useMontageStore();
  const { signedUrl: thumbnailSignedUrl, isLoading, error } = useSignedUrl(clip.thumbnailUrl || null);
  // For audio clips, sign the asset URL for waveform display
  const { signedUrl: audioSignedUrl } = useSignedUrl(clip.type === 'audio' ? (clip.assetUrl || null) : null);

  // Debug logging
  useEffect(() => {
    console.log(`[ClipItem] ${clip.id}: thumbnailUrl=${clip.thumbnailUrl?.substring(0, 50)}, thumbnailSignedUrl=${thumbnailSignedUrl?.substring(0, 50)}, isLoading=${isLoading}, error=${error?.message}`);
  }, [clip.id, clip.thumbnailUrl, thumbnailSignedUrl, isLoading, error]);

  // Local state for immediate visual feedback during drag/resize
  const [localPosition, setLocalPosition] = useState<{
    start: number;
    duration: number;
    sourceStart: number;
  } | null>(null);
  const [interactionType, setInteractionType] = useState<'drag' | 'resize-left' | 'resize-right' | null>(null);

  // Ref to track initial values without causing re-renders
  const dragStartRef = useRef({ x: 0, start: 0, duration: 0, sourceStart: 0 });

  // Use local position during interaction, otherwise use store values
  const displayStart = localPosition?.start ?? clip.start;
  const displayDuration = localPosition?.duration ?? clip.duration;

  const left = displayStart * scale;
  const width = Math.max(MIN_CLIP_WIDTH, displayDuration * scale);

  // Handle clip click
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      selectClip(clip.id, e.shiftKey);
    },
    [clip.id, selectClip]
  );

  // Handle drag/resize start
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const target = e.target as HTMLElement;
      const isLeftHandle = target.classList.contains('resize-left');
      const isRightHandle = target.classList.contains('resize-right');

      // Store initial values
      dragStartRef.current = {
        x: e.clientX,
        start: clip.start,
        duration: clip.duration,
        sourceStart: clip.sourceStart || 0,
      };

      // Set interaction type
      if (isLeftHandle) {
        setInteractionType('resize-left');
      } else if (isRightHandle) {
        setInteractionType('resize-right');
      } else {
        setInteractionType('drag');
      }

      // Initialize local position for immediate feedback
      setLocalPosition({
        start: clip.start,
        duration: clip.duration,
        sourceStart: clip.sourceStart || 0,
      });

      selectClip(clip.id, e.shiftKey);
    },
    [clip.id, clip.start, clip.duration, clip.sourceStart, selectClip]
  );

  // Handle drag/resize movement and completion
  useEffect(() => {
    if (!interactionType) return;

    const maxDuration = clip.sourceDuration || clip.duration;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaTime = deltaX / scale;

      if (interactionType === 'drag') {
        // Move clip - update local position immediately
        const newStart = Math.max(0, dragStartRef.current.start + deltaTime);
        setLocalPosition((prev) => prev ? { ...prev, start: newStart } : null);
      } else if (interactionType === 'resize-left') {
        // Resize from left - affects start, duration, and sourceStart
        const newStart = Math.max(0, dragStartRef.current.start + deltaTime);
        const endTime = dragStartRef.current.start + dragStartRef.current.duration;
        let newDuration = endTime - newStart;

        // Calculate new sourceStart
        const trimAmount = newStart - dragStartRef.current.start;
        let newSourceStart = Math.max(0, dragStartRef.current.sourceStart + trimAmount);

        // Limit sourceStart
        const maxSourceStart = maxDuration - 0.1;
        newSourceStart = Math.min(newSourceStart, maxSourceStart);

        // Limit duration based on available source
        const availableDuration = maxDuration - newSourceStart;
        newDuration = Math.min(newDuration, availableDuration);
        newDuration = Math.max(0.1, newDuration);

        setLocalPosition({
          start: newStart,
          duration: newDuration,
          sourceStart: newSourceStart,
        });
      } else if (interactionType === 'resize-right') {
        // Resize from right - only affects duration
        let newDuration = Math.max(0.1, dragStartRef.current.duration + deltaTime);

        // Limit to max duration for media clips
        if (clip.type === 'video' || clip.type === 'image' || clip.type === 'audio') {
          const availableDuration = maxDuration - (localPosition?.sourceStart ?? clip.sourceStart ?? 0);
          newDuration = Math.min(newDuration, availableDuration);
        }

        setLocalPosition((prev) => prev ? { ...prev, duration: newDuration } : null);
      }
    };

    const handleMouseUp = () => {
      // Commit final position to store
      if (localPosition) {
        if (interactionType === 'drag') {
          moveClip(clip.id, clip.trackId, localPosition.start);
        } else if (interactionType === 'resize-left') {
          updateClip(clip.id, {
            start: localPosition.start,
            duration: localPosition.duration,
            sourceStart: localPosition.sourceStart,
          });
        } else if (interactionType === 'resize-right') {
          resizeClip(clip.id, clip.start, localPosition.duration);
        }
      }

      // Clear local state
      setLocalPosition(null);
      setInteractionType(null);
    };

    // Use passive: false to allow preventDefault if needed
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [interactionType, scale, clip, localPosition, moveClip, resizeClip, updateClip]);

  const isDragging = interactionType === 'drag';
  const isResizing = interactionType === 'resize-left' || interactionType === 'resize-right';

  return (
    <div
      ref={clipRef}
      className={cn(
        'timeline-clip absolute top-1 bottom-1 rounded overflow-hidden cursor-grab',
        'border',
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
        // Remove transition during interaction for immediate feedback
        transition: interactionType ? 'none' : 'border-color 150ms',
      }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
    >
      {/* Thumbnail background - use video element if URL is a video file */}
      {thumbnailSignedUrl && clip.type !== 'audio' && clip.type !== 'transition' && (
        isVideoFile(thumbnailSignedUrl) ? (
          <VideoThumbnail src={thumbnailSignedUrl} />
        ) : (
          <img
            src={thumbnailSignedUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-60"
            draggable={false}
          />
        )
      )}

      {/* Audio waveform visualization */}
      {clip.type === 'audio' && audioSignedUrl && (
        <AudioWaveform
          audioUrl={audioSignedUrl}
          width={width}
          height={trackHeight - 8}
          color="rgba(255, 255, 255, 0.6)"
        />
      )}

      {/* Transition visual */}
      {clip.type === 'transition' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-1 opacity-60">
            <div className="w-0 h-0 border-t-4 border-b-4 border-l-6 border-transparent border-l-white" />
            <Shuffle className="w-4 h-4" />
            <div className="w-0 h-0 border-t-4 border-b-4 border-r-6 border-transparent border-r-white" />
          </div>
        </div>
      )}

      {/* Clip content */}
      <div className="relative z-10 h-full flex items-center px-2">
        <span className={cn(
          'text-[10px] font-medium truncate',
          clip.type === 'audio'
            ? 'text-black/80'
            : 'text-white drop-shadow'
        )}>
          {clip.name}
        </span>
      </div>

      {/* Resize handles */}
      <div className="resize-left absolute left-0 top-0 bottom-0 w-3 z-20 cursor-ew-resize hover:bg-white/40" />
      <div className="resize-right absolute right-0 top-0 bottom-0 w-3 z-20 cursor-ew-resize hover:bg-white/40" />
    </div>
  );
}

// Audio waveform visualization component
function AudioWaveform({
  audioUrl,
  width,
  height,
  color = '#22c55e',
}: {
  audioUrl: string;
  width: number;
  height: number;
  color?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveformData, setWaveformData] = useState<number[] | null>(null);

  // Load and analyze audio
  useEffect(() => {
    if (!audioUrl) return;

    let cancelled = false;
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

    const loadAudio = async () => {
      try {
        // Use proxy to avoid CORS issues with B2 signed URLs
        const proxyUrl = `/api/storage/proxy?url=${encodeURIComponent(audioUrl)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch audio: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        if (cancelled) return;

        // Get channel data (use first channel)
        const channelData = audioBuffer.getChannelData(0);

        // Sample the waveform (reduce to ~200 points)
        const samples = 200;
        const blockSize = Math.floor(channelData.length / samples);
        const peaks: number[] = [];

        for (let i = 0; i < samples; i++) {
          const start = i * blockSize;
          let max = 0;
          for (let j = 0; j < blockSize; j++) {
            const val = Math.abs(channelData[start + j] || 0);
            if (val > max) max = val;
          }
          peaks.push(max);
        }

        setWaveformData(peaks);
      } catch (err) {
        console.error('Failed to load audio for waveform:', err);
      }
    };

    loadAudio();

    return () => {
      cancelled = true;
      audioContext.close();
    };
  }, [audioUrl]);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size with device pixel ratio for sharpness
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw waveform
    const barWidth = width / waveformData.length;
    const centerY = height / 2;

    ctx.fillStyle = color;

    waveformData.forEach((peak, i) => {
      const barHeight = Math.max(2, peak * height * 0.9);
      const x = i * barWidth;
      const y = centerY - barHeight / 2;

      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    });
  }, [waveformData, width, height, color]);

  if (!waveformData) {
    // Loading state - show placeholder bars
    return (
      <div className="absolute inset-0 flex items-center justify-center gap-0.5 opacity-30">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="w-1 bg-current"
            style={{ height: `${20 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width, height }}
    />
  );
}

// Format time helper
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
