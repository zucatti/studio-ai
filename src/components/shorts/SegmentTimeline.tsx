'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, GripVertical, MessageSquare, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Segment, ShotFraming, ShotComposition } from '@/types/cinematic';
import { SHOT_FRAMING_OPTIONS, SHOT_COMPOSITION_OPTIONS, createDefaultSegment } from '@/types/cinematic';

// Constants
export const MIN_SEGMENT_DURATION = 3; // Minimum segment duration in seconds
export const MAX_TOTAL_DURATION = 15; // Kling max duration
const DEFAULT_NEW_SEGMENT_DURATION = 3; // Default duration for new segments
const TIMELINE_DISPLAY_WIDTH = 20; // Display 20s total (15s usable + 5s dark zone)

interface SegmentTimelineProps {
  segments: Segment[];
  planDuration: number; // Current total duration (sum of all segments)
  selectedSegmentId: string | null;
  onSelectSegment: (segmentId: string | null) => void;
  onSegmentsChange: (segments: Segment[]) => void;
  onEditSegment?: (segment: Segment) => void;
  onDurationChange?: (newDuration: number) => void; // Notify parent of duration changes
  className?: string;
}

/**
 * Calculate minimum plan duration = number of segments × MIN_SEGMENT_DURATION
 */
export function calculateMinPlanDuration(segmentCount: number): number {
  if (segmentCount === 0) return MIN_SEGMENT_DURATION;
  return segmentCount * MIN_SEGMENT_DURATION;
}

/**
 * Scale segments to a new plan duration with smart redistribution
 */
export function scaleSegmentsToDuration(
  segments: Segment[],
  oldDuration: number,
  newDuration: number
): Segment[] | null {
  if (segments.length === 0) return [];
  if (newDuration > MAX_TOTAL_DURATION) return null;

  const sorted = [...segments].sort((a, b) => a.start_time - b.start_time);
  const absoluteMin = segments.length * MIN_SEGMENT_DURATION;

  if (newDuration < absoluteMin) return null;

  const ratio = newDuration / oldDuration;
  const scaled: Segment[] = [];
  let currentTime = 0;

  for (let i = 0; i < sorted.length; i++) {
    const seg = sorted[i];
    const oldSegDuration = seg.end_time - seg.start_time;
    let newSegDuration = Math.max(MIN_SEGMENT_DURATION, Math.round(oldSegDuration * ratio));
    const isLast = i === sorted.length - 1;

    scaled.push({
      ...seg,
      start_time: currentTime,
      end_time: isLast ? newDuration : currentTime + newSegDuration,
    });

    currentTime = scaled[i].end_time;
  }

  return scaled;
}

// Get shot label combining framing and composition
function getShotLabel(framing: ShotFraming, composition?: ShotComposition): string {
  const framingOpt = SHOT_FRAMING_OPTIONS.find((o) => o.value === framing);
  const compositionOpt = SHOT_COMPOSITION_OPTIONS.find((o) => o.value === composition);

  const framingLabel = framingOpt?.label || framing;
  if (composition && composition !== 'single' && compositionOpt) {
    return `${framingLabel} ${compositionOpt.label}`;
  }
  return framingLabel;
}

// Get abbreviated shot type
function getShotAbbr(framing: ShotFraming, composition?: ShotComposition): string {
  const framingOpt = SHOT_FRAMING_OPTIONS.find((o) => o.value === framing);
  const compositionOpt = SHOT_COMPOSITION_OPTIONS.find((o) => o.value === composition);

  const framingAbbr = framingOpt?.abbr || 'M';
  if (composition && composition !== 'single' && compositionOpt?.abbr) {
    return `${framingAbbr} ${compositionOpt.abbr}`;
  }
  return framingAbbr;
}

// Color for shot framing
function getShotColor(framing: ShotFraming): string {
  const colors: Record<ShotFraming, string> = {
    extreme_wide: 'bg-purple-500/80',
    wide: 'bg-indigo-500/80',
    medium_wide: 'bg-blue-500/80',
    medium: 'bg-cyan-500/80',
    medium_close_up: 'bg-teal-500/80',
    close_up: 'bg-green-500/80',
    extreme_close_up: 'bg-lime-500/80',
  };
  return colors[framing] || 'bg-slate-500/80';
}

export function SegmentTimeline({
  segments,
  planDuration,
  selectedSegmentId,
  onSelectSegment,
  onSegmentsChange,
  onEditSegment,
  onDurationChange,
  className,
}: SegmentTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Resize state
  const [resizing, setResizing] = useState<{
    borderIndex: number;
    initialX: number;
    initialTime: number;
  } | null>(null);

  // Drag reorder state
  const [draggingSegment, setDraggingSegment] = useState<{
    segmentId: string;
    segmentIndex: number;
  } | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  // Sorted segments
  const sortedSegments = useMemo(
    () => [...segments].sort((a, b) => a.start_time - b.start_time),
    [segments]
  );

  // Calculate total duration from segments
  const totalDuration = useMemo(() => {
    if (sortedSegments.length === 0) return 0;
    return sortedSegments[sortedSegments.length - 1].end_time;
  }, [sortedSegments]);

  // Is over limit?
  const isOverLimit = totalDuration > MAX_TOTAL_DURATION;

  // Convert time to percentage (based on TIMELINE_DISPLAY_WIDTH)
  const timeToPercent = useCallback(
    (time: number) => (time / TIMELINE_DISPLAY_WIDTH) * 100,
    []
  );

  // Convert pixel position to time
  const pixelToTime = useCallback(
    (pixelX: number) => {
      if (!containerRef.current) return 0;
      const rect = containerRef.current.getBoundingClientRect();
      return (pixelX / rect.width) * TIMELINE_DISPLAY_WIDTH;
    },
    []
  );

  // Format time
  const formatTime = useCallback((seconds: number) => {
    const rounded = Math.round(seconds);
    return `${rounded}s`;
  }, []);

  // ========================================
  // RESIZE HANDLING
  // ========================================

  const handleBorderDragStart = useCallback(
    (e: React.MouseEvent, borderIndex: number) => {
      e.stopPropagation();
      e.preventDefault();
      const borderTime = sortedSegments[borderIndex].end_time;

      setResizing({
        borderIndex,
        initialX: e.clientX,
        initialTime: borderTime,
      });
    },
    [sortedSegments]
  );

  const handleResizeMove = useCallback(
    (e: MouseEvent) => {
      if (!resizing || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      let newBorderTime = Math.round(pixelToTime(mouseX));

      // Get adjacent segments
      const leftSegment = sortedSegments[resizing.borderIndex];
      const rightSegment = sortedSegments[resizing.borderIndex + 1];

      // Constraints
      const minTime = leftSegment.start_time + MIN_SEGMENT_DURATION;
      const maxTime = rightSegment
        ? rightSegment.end_time - MIN_SEGMENT_DURATION
        : MAX_TOTAL_DURATION;

      newBorderTime = Math.max(minTime, Math.min(maxTime, newBorderTime));

      // Update segments
      const updated = sortedSegments.map((seg, i) => {
        if (i === resizing.borderIndex) {
          return { ...seg, end_time: newBorderTime };
        }
        if (i === resizing.borderIndex + 1) {
          return { ...seg, start_time: newBorderTime };
        }
        return seg;
      });

      onSegmentsChange(updated);
    },
    [resizing, sortedSegments, pixelToTime, onSegmentsChange]
  );

  const handleResizeEnd = useCallback(() => {
    if (resizing) {
      // Notify parent of new duration
      const newDuration = sortedSegments[sortedSegments.length - 1]?.end_time || 0;
      onDurationChange?.(newDuration);
    }
    setResizing(null);
  }, [resizing, sortedSegments, onDurationChange]);

  // ========================================
  // DRAG REORDER HANDLING
  // ========================================

  const handleDragStart = useCallback(
    (e: React.DragEvent, segmentId: string, segmentIndex: number) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', segmentId);

      // Create custom drag image
      const dragEl = e.currentTarget.closest('[data-segment]') as HTMLElement;
      if (dragEl) {
        const rect = dragEl.getBoundingClientRect();
        e.dataTransfer.setDragImage(dragEl, rect.width / 2, rect.height / 2);
      }

      setDraggingSegment({ segmentId, segmentIndex });
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      if (draggingSegment && targetIndex !== draggingSegment.segmentIndex) {
        setDropTargetIndex(targetIndex);
      }
    },
    [draggingSegment]
  );

  const handleDragLeave = useCallback(() => {
    setDropTargetIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();

      if (!draggingSegment || targetIndex === draggingSegment.segmentIndex) {
        setDraggingSegment(null);
        setDropTargetIndex(null);
        return;
      }

      const sourceIndex = draggingSegment.segmentIndex;

      // Reorder: remove from source, insert at target
      const newSegments = [...sortedSegments];
      const [removed] = newSegments.splice(sourceIndex, 1);

      // Adjust target index if source was before target
      const adjustedTarget = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      newSegments.splice(adjustedTarget, 0, removed);

      // Recalculate timecodes (preserve durations, update positions)
      let currentTime = 0;
      const reorderedSegments = newSegments.map((seg) => {
        const duration = seg.end_time - seg.start_time;
        const updated = {
          ...seg,
          start_time: currentTime,
          end_time: currentTime + duration,
        };
        currentTime += duration;
        return updated;
      });

      onSegmentsChange(reorderedSegments);
      setDraggingSegment(null);
      setDropTargetIndex(null);
    },
    [draggingSegment, sortedSegments, onSegmentsChange]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingSegment(null);
    setDropTargetIndex(null);
  }, []);

  // ========================================
  // ATTACH RESIZE LISTENERS
  // ========================================

  useEffect(() => {
    if (!resizing) return;

    const handleMove = (e: MouseEvent) => handleResizeMove(e);
    const handleUp = () => handleResizeEnd();

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [resizing, handleResizeMove, handleResizeEnd]);

  // ========================================
  // ADD / DELETE SEGMENTS
  // ========================================

  const handleAddSegment = useCallback(() => {
    const newCount = segments.length + 1;
    const maxSegs = Math.floor(MAX_TOTAL_DURATION / MIN_SEGMENT_DURATION);

    // Can't add more than max segments
    if (newCount > maxSegs) {
      return;
    }

    // Calculate if we need to redistribute
    const newTotalIfSimpleAdd = totalDuration + DEFAULT_NEW_SEGMENT_DURATION;

    if (newTotalIfSimpleAdd <= MAX_TOTAL_DURATION) {
      // Simple add - there's room
      const newSegment = createDefaultSegment(totalDuration, DEFAULT_NEW_SEGMENT_DURATION);
      const updated = [...segments, newSegment];
      onSegmentsChange(updated);
      onSelectSegment(newSegment.id);
      onDurationChange?.(newTotalIfSimpleAdd);
    } else {
      // Need to redistribute: shrink existing segments to make room for new one
      // New segment gets MIN_SEGMENT_DURATION, others share the remaining time proportionally
      const spaceForExisting = MAX_TOTAL_DURATION - MIN_SEGMENT_DURATION;
      const ratio = spaceForExisting / totalDuration;

      // Redistribute existing segments
      let currentTime = 0;
      const redistributed: Segment[] = sortedSegments.map((seg, i) => {
        const oldDuration = seg.end_time - seg.start_time;
        // Scale proportionally but ensure minimum
        let newDur = Math.max(MIN_SEGMENT_DURATION, Math.round(oldDuration * ratio));

        const updated = {
          ...seg,
          start_time: currentTime,
          end_time: currentTime + newDur,
        };
        currentTime += newDur;
        return updated;
      });

      // Adjust last existing segment to fit exactly before new segment
      if (redistributed.length > 0) {
        const lastIdx = redistributed.length - 1;
        redistributed[lastIdx] = {
          ...redistributed[lastIdx],
          end_time: spaceForExisting,
        };
      }

      // Add new segment at the end
      const newSegment = createDefaultSegment(spaceForExisting, MIN_SEGMENT_DURATION);
      const updated = [...redistributed, newSegment];

      onSegmentsChange(updated);
      onSelectSegment(newSegment.id);
      onDurationChange?.(MAX_TOTAL_DURATION);
    }
  }, [segments, sortedSegments, totalDuration, onSegmentsChange, onSelectSegment, onDurationChange]);

  const handleDeleteSegment = useCallback(
    (segmentId: string) => {
      if (segments.length <= 1) return;

      const segmentIndex = sortedSegments.findIndex((s) => s.id === segmentId);
      if (segmentIndex === -1) return;

      const deletedSegment = sortedSegments[segmentIndex];
      const deletedDuration = deletedSegment.end_time - deletedSegment.start_time;
      const remaining = sortedSegments.filter((s) => s.id !== segmentId);

      // Recalculate timecodes
      let currentTime = 0;
      const updated = remaining.map((seg) => {
        const duration = seg.end_time - seg.start_time;
        const newSeg = {
          ...seg,
          start_time: currentTime,
          end_time: currentTime + duration,
        };
        currentTime += duration;
        return newSeg;
      });

      onSegmentsChange(updated);
      onDurationChange?.(totalDuration - deletedDuration);

      // Select adjacent segment
      if (selectedSegmentId === segmentId) {
        const newSelectedIndex = Math.min(segmentIndex, updated.length - 1);
        onSelectSegment(updated[newSelectedIndex]?.id || null);
      }
    },
    [segments, sortedSegments, totalDuration, selectedSegmentId, onSegmentsChange, onSelectSegment, onDurationChange]
  );

  // Keyboard handler for Delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSegmentId && segments.length > 1) {
        if (
          document.activeElement?.tagName === 'INPUT' ||
          document.activeElement?.tagName === 'TEXTAREA'
        ) {
          return;
        }
        e.preventDefault();
        handleDeleteSegment(selectedSegmentId);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedSegmentId, segments.length, handleDeleteSegment]);

  // Can add segment? Based on max number of segments that can fit (each at MIN_SEGMENT_DURATION)
  const maxSegments = Math.floor(MAX_TOTAL_DURATION / MIN_SEGMENT_DURATION); // 15/3 = 5
  const canAddSegment = segments.length < maxSegments;

  // Space remaining (can be 0 but still allow adding if we can redistribute)
  const spaceRemaining = MAX_TOTAL_DURATION - totalDuration;

  return (
    <div className={cn('space-y-2 select-none', className)}>
      {/* Timeline header */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>0s</span>
        <div className="flex items-center gap-2">
          <span>Segments ({segments.length})</span>
          {isOverLimit && (
            <span className="flex items-center gap-1 text-red-400">
              <AlertTriangle className="w-3 h-3" />
              Dépasse {MAX_TOTAL_DURATION}s !
            </span>
          )}
        </div>
        <span className={cn(
          totalDuration > MAX_TOTAL_DURATION ? 'text-red-400' : 'text-slate-400'
        )}>
          {formatTime(totalDuration)} / {MAX_TOTAL_DURATION}s
        </span>
      </div>

      {/* Timeline track */}
      <div
        ref={containerRef}
        className="relative h-20 bg-slate-900/50 rounded-lg border border-white/10 overflow-hidden select-none"
      >
        {/* Time markers (every second up to display width) */}
        {Array.from({ length: TIMELINE_DISPLAY_WIDTH + 1 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'absolute top-0 bottom-0 border-l',
              i <= MAX_TOTAL_DURATION ? 'border-white/10' : 'border-red-500/20'
            )}
            style={{ left: `${timeToPercent(i)}%` }}
          >
            {i % 3 === 0 && (
              <span className={cn(
                'absolute bottom-1 left-1 text-[9px]',
                i <= MAX_TOTAL_DURATION ? 'text-slate-500' : 'text-red-500/50'
              )}>
                {i}s
              </span>
            )}
          </div>
        ))}

        {/* Dark zone after 15s */}
        <div
          className="absolute top-0 bottom-0 bg-red-900/30 pointer-events-none"
          style={{
            left: `${timeToPercent(MAX_TOTAL_DURATION)}%`,
            right: 0,
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-red-400/50 text-xs font-medium rotate-[-10deg]">
              ZONE LIMITE
            </span>
          </div>
          {/* Diagonal stripes pattern */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(239,68,68,0.3) 10px, rgba(239,68,68,0.3) 20px)',
            }}
          />
        </div>

        {/* 15s limit line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500/60 z-30"
          style={{ left: `${timeToPercent(MAX_TOTAL_DURATION)}%` }}
        />

        {/* Segments */}
        {sortedSegments.map((segment, index) => {
          const left = timeToPercent(segment.start_time);
          const width = timeToPercent(segment.end_time - segment.start_time);
          const isSelected = selectedSegmentId === segment.id;
          const duration = segment.end_time - segment.start_time;
          const isLast = index === sortedSegments.length - 1;
          const isDragging = draggingSegment?.segmentId === segment.id;
          const isDropTarget = dropTargetIndex === index;
          const hasElements = (segment.elements?.length || 0) > 0 || (segment.beats?.length || 0) > 0;

          return (
            <div
              key={segment.id}
              data-segment={segment.id}
              className={cn(
                'absolute top-2 bottom-2 rounded cursor-pointer transition-all group',
                getShotColor(segment.shot_framing),
                isSelected
                  ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900 z-20'
                  : 'hover:brightness-110',
                isDragging && 'opacity-50 z-10',
                isDropTarget && 'ring-2 ring-blue-400 ring-offset-1 ring-offset-slate-900'
              )}
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 3)}%`,
              }}
              onClick={() => onSelectSegment(segment.id)}
              onDoubleClick={() => onEditSegment?.(segment)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
            >
              {/* Drop indicator line (before this segment) */}
              {isDropTarget && draggingSegment && draggingSegment.segmentIndex > index && (
                <div className="absolute -left-1 top-0 bottom-0 w-1 bg-blue-400 rounded-full z-30" />
              )}
              {/* Drop indicator line (after this segment) */}
              {isDropTarget && draggingSegment && draggingSegment.segmentIndex < index && (
                <div className="absolute -right-1 top-0 bottom-0 w-1 bg-blue-400 rounded-full z-30" />
              )}

              {/* Drag handle */}
              <div
                draggable
                onDragStart={(e) => handleDragStart(e, segment.id, index)}
                onDragEnd={handleDragEnd}
                className="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-l"
              >
                <GripVertical className="w-3 h-3 text-white/70" />
              </div>

              {/* Resize handle (right edge) - only between segments */}
              {!isLast && (
                <div
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 flex items-center justify-center hover:bg-white/30 translate-x-1/2"
                  onMouseDown={(e) => handleBorderDragStart(e, index)}
                >
                  <div className="w-0.5 h-8 bg-white/60 rounded-full" />
                </div>
              )}

              {/* Content */}
              <div className="absolute inset-0 pl-5 pr-2 flex items-center justify-between min-w-0 pointer-events-none">
                {/* Left: Shot type */}
                <div className="flex items-center gap-1 text-white/90 text-[10px] font-medium min-w-0">
                  <span className="bg-black/30 px-1 rounded truncate">
                    {width > 15
                      ? getShotLabel(segment.shot_framing, segment.shot_composition)
                      : getShotAbbr(segment.shot_framing, segment.shot_composition)}
                  </span>
                  {hasElements && (
                    <MessageSquare className="w-2.5 h-2.5 flex-shrink-0 opacity-75" />
                  )}
                </div>

                {/* Center: Shot number */}
                <div className="text-white/80 text-[11px] font-bold flex-shrink-0 bg-black/20 px-1.5 py-0.5 rounded">
                  {index + 1}
                </div>

                {/* Right: Duration */}
                <div className="text-white/60 text-[10px] flex-shrink-0">
                  {Math.round(duration)}s
                </div>
              </div>
            </div>
          );
        })}

        {/* Drop zone at the end (for reordering to last position) */}
        {draggingSegment && (
          <div
            className={cn(
              'absolute top-2 bottom-2 w-8 rounded border-2 border-dashed transition-colors',
              dropTargetIndex === sortedSegments.length
                ? 'border-blue-400 bg-blue-400/20'
                : 'border-white/20 bg-white/5'
            )}
            style={{
              left: `${timeToPercent(totalDuration)}%`,
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDropTargetIndex(sortedSegments.length);
            }}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, sortedSegments.length)}
          />
        )}

        {/* Empty state */}
        {segments.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
            Aucun segment - cliquez + pour ajouter
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'border-white/20 text-slate-400 hover:text-white',
            !canAddSegment && 'opacity-50 cursor-not-allowed'
          )}
          onClick={handleAddSegment}
          disabled={!canAddSegment}
          title={
            canAddSegment
              ? spaceRemaining >= DEFAULT_NEW_SEGMENT_DURATION
                ? 'Ajouter un segment (3s)'
                : 'Ajouter un segment (redistribue les autres)'
              : `Maximum ${maxSegments} segments atteint`
          }
        >
          <Plus className="w-3 h-3 mr-1" />
          Ajouter
          {canAddSegment && (
            <span className="ml-1 text-slate-500">
              {spaceRemaining >= DEFAULT_NEW_SEGMENT_DURATION ? '(+3s)' : '(redistribue)'}
            </span>
          )}
        </Button>

        {selectedSegmentId && segments.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            className="border-red-500/30 text-red-400 hover:text-red-300 hover:border-red-500/50"
            onClick={() => handleDeleteSegment(selectedSegmentId)}
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Supprimer
          </Button>
        )}

        {/* Remaining space indicator */}
        <div className="ml-auto flex items-center gap-2 text-xs">
          {spaceRemaining > 0 ? (
            <span className="text-slate-400">
              Reste: <span className="text-green-400">{spaceRemaining}s</span>
            </span>
          ) : (
            <span className="text-red-400">Limite atteinte</span>
          )}
        </div>

        {/* Selected segment info */}
        {selectedSegmentId && (
          <div className="text-xs text-slate-400">
            {(() => {
              const s = segments.find((seg) => seg.id === selectedSegmentId);
              if (!s) return null;
              const idx = sortedSegments.findIndex((seg) => seg.id === s.id);
              return (
                <span>
                  Shot {idx + 1}: {formatTime(s.start_time)} → {formatTime(s.end_time)}
                </span>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
