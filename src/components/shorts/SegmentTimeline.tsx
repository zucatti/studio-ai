'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, MessageSquare, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Segment, ShotFraming, ShotComposition } from '@/types/cinematic';
import { SHOT_FRAMING_OPTIONS, SHOT_COMPOSITION_OPTIONS, createDefaultSegment } from '@/types/cinematic';

// Constants
export const MIN_SEGMENT_DURATION = 1; // Minimum segment duration in seconds (1s per shot)
export const MIN_PLAN_DURATION = 3; // Minimum total plan duration (Kling minimum)
export const MAX_TOTAL_DURATION = 15; // Kling max duration
const DEFAULT_NEW_SEGMENT_DURATION = 3; // Default duration for new segments
const TIMELINE_DISPLAY_WIDTH = 20; // Display 20s total (15s usable + 5s dark zone)
const SNAP_THRESHOLD = 0.3; // Snap within 0.3 seconds

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
 * Calculate minimum plan duration
 * Must be at least MIN_PLAN_DURATION (3s) and fit all segments at MIN_SEGMENT_DURATION (1s) each
 */
export function calculateMinPlanDuration(segmentCount: number): number {
  if (segmentCount === 0) return MIN_PLAN_DURATION;
  return Math.max(MIN_PLAN_DURATION, segmentCount * MIN_SEGMENT_DURATION);
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

  // Resize state - now tracks which segment and which edge (left or right)
  const [resizing, setResizing] = useState<{
    segmentId: string;
    edge: 'left' | 'right';
    initialX: number;
    initialTime: number;
  } | null>(null);

  // Drag move state - for moving entire segment
  const [moving, setMoving] = useState<{
    segmentId: string;
    initialX: number;
    initialStart: number;
    initialEnd: number;
  } | null>(null);


  // Sorted segments
  const sortedSegments = useMemo(
    () => [...segments].sort((a, b) => a.start_time - b.start_time),
    [segments]
  );

  // Calculate total duration from segments (max end_time, supports non-contiguous)
  const totalDuration = useMemo(() => {
    if (sortedSegments.length === 0) return 0;
    return sortedSegments.reduce((max, seg) => Math.max(max, seg.end_time), 0);
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
  // RESIZE HANDLING (with snapping and overlap prevention)
  // ========================================

  // Find snap targets (other segment edges + plan boundaries)
  const getSnapTargets = useCallback(
    (excludeSegmentId: string): number[] => {
      const targets: number[] = [0, planDuration]; // Snap to 0 and plan duration
      for (const seg of sortedSegments) {
        if (seg.id !== excludeSegmentId) {
          targets.push(seg.start_time, seg.end_time);
        }
      }
      return targets;
    },
    [sortedSegments, planDuration]
  );

  // Apply snapping to a time value
  const applySnap = useCallback(
    (time: number, snapTargets: number[]): number => {
      for (const target of snapTargets) {
        if (Math.abs(time - target) <= SNAP_THRESHOLD) {
          return target;
        }
      }
      return time;
    },
    []
  );

  // Check if a time range would overlap with other segments
  const wouldOverlap = useCallback(
    (segmentId: string, newStart: number, newEnd: number): boolean => {
      for (const seg of sortedSegments) {
        if (seg.id === segmentId) continue;
        // Check if ranges overlap (excluding exact touching)
        if (newStart < seg.end_time && newEnd > seg.start_time) {
          return true;
        }
      }
      return false;
    },
    [sortedSegments]
  );

  const handleEdgeDragStart = useCallback(
    (e: React.MouseEvent, segmentId: string, edge: 'left' | 'right') => {
      e.stopPropagation();
      e.preventDefault();
      const segment = sortedSegments.find((s) => s.id === segmentId);
      if (!segment) return;

      const initialTime = edge === 'left' ? segment.start_time : segment.end_time;

      setResizing({
        segmentId,
        edge,
        initialX: e.clientX,
        initialTime,
      });
    },
    [sortedSegments]
  );

  const handleResizeMove = useCallback(
    (e: MouseEvent) => {
      if (!resizing || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      let newTime = pixelToTime(mouseX);

      // Round to 0.5s precision
      newTime = Math.round(newTime * 2) / 2;

      const segment = sortedSegments.find((s) => s.id === resizing.segmentId);
      if (!segment) return;

      // Get snap targets
      const snapTargets = getSnapTargets(resizing.segmentId);

      // Apply snapping
      newTime = applySnap(newTime, snapTargets);

      // Calculate new start/end based on which edge is being dragged
      let newStart = segment.start_time;
      let newEnd = segment.end_time;

      if (resizing.edge === 'left') {
        newStart = newTime;
        // Enforce minimum duration
        if (newEnd - newStart < MIN_SEGMENT_DURATION) {
          newStart = newEnd - MIN_SEGMENT_DURATION;
        }
        // Don't go below 0
        if (newStart < 0) newStart = 0;
      } else {
        newEnd = newTime;
        // Enforce minimum duration
        if (newEnd - newStart < MIN_SEGMENT_DURATION) {
          newEnd = newStart + MIN_SEGMENT_DURATION;
        }
        // Don't exceed timeline display
        if (newEnd > TIMELINE_DISPLAY_WIDTH) newEnd = TIMELINE_DISPLAY_WIDTH;
      }

      // Check for overlap
      if (wouldOverlap(resizing.segmentId, newStart, newEnd)) {
        return; // Don't update if it would cause overlap
      }

      // Update segment
      const updated = sortedSegments.map((seg) => {
        if (seg.id === resizing.segmentId) {
          return { ...seg, start_time: newStart, end_time: newEnd };
        }
        return seg;
      });

      onSegmentsChange(updated);
    },
    [resizing, sortedSegments, pixelToTime, getSnapTargets, applySnap, wouldOverlap, onSegmentsChange]
  );

  const handleResizeEnd = useCallback(() => {
    if (resizing) {
      // Notify parent of new duration (max end_time of all segments)
      const maxEnd = sortedSegments.reduce((max, seg) => Math.max(max, seg.end_time), 0);
      onDurationChange?.(maxEnd);
    }
    setResizing(null);
  }, [resizing, sortedSegments, onDurationChange]);

  // ========================================
  // MOVE SEGMENT HANDLING (drag entire segment)
  // ========================================

  const handleMoveStart = useCallback(
    (e: React.MouseEvent, segmentId: string) => {
      e.stopPropagation();
      e.preventDefault();
      const segment = sortedSegments.find((s) => s.id === segmentId);
      if (!segment) return;

      setMoving({
        segmentId,
        initialX: e.clientX,
        initialStart: segment.start_time,
        initialEnd: segment.end_time,
      });
    },
    [sortedSegments]
  );

  const handleMoveMove = useCallback(
    (e: MouseEvent) => {
      if (!moving || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const deltaX = e.clientX - moving.initialX;
      const deltaTime = (deltaX / rect.width) * TIMELINE_DISPLAY_WIDTH;

      const segment = sortedSegments.find((s) => s.id === moving.segmentId);
      if (!segment) return;

      const duration = moving.initialEnd - moving.initialStart;
      let newStart = moving.initialStart + deltaTime;
      let newEnd = newStart + duration;

      // Round to 0.5s precision
      newStart = Math.round(newStart * 2) / 2;
      newEnd = newStart + duration;

      // Don't go below 0
      if (newStart < 0) {
        newStart = 0;
        newEnd = duration;
      }

      // Don't exceed timeline display
      if (newEnd > TIMELINE_DISPLAY_WIDTH) {
        newEnd = TIMELINE_DISPLAY_WIDTH;
        newStart = newEnd - duration;
      }

      // Get snap targets and apply snapping to both edges
      const snapTargets = getSnapTargets(moving.segmentId);
      const snappedStart = applySnap(newStart, snapTargets);
      const snappedEnd = applySnap(newEnd, snapTargets);

      // If start snapped, adjust end; if end snapped, adjust start
      if (snappedStart !== newStart) {
        newStart = snappedStart;
        newEnd = newStart + duration;
      } else if (snappedEnd !== newEnd) {
        newEnd = snappedEnd;
        newStart = newEnd - duration;
      }

      // Check for overlap
      if (wouldOverlap(moving.segmentId, newStart, newEnd)) {
        return; // Don't update if it would cause overlap
      }

      // Update segment
      const updated = sortedSegments.map((seg) => {
        if (seg.id === moving.segmentId) {
          return { ...seg, start_time: newStart, end_time: newEnd };
        }
        return seg;
      });

      onSegmentsChange(updated);
    },
    [moving, sortedSegments, getSnapTargets, applySnap, wouldOverlap, onSegmentsChange]
  );

  const handleMoveEnd = useCallback(() => {
    if (moving) {
      const maxEnd = sortedSegments.reduce((max, seg) => Math.max(max, seg.end_time), 0);
      onDurationChange?.(maxEnd);
    }
    setMoving(null);
  }, [moving, sortedSegments, onDurationChange]);

  // ========================================
  // ATTACH RESIZE/MOVE LISTENERS
  // ========================================

  useEffect(() => {
    if (!resizing && !moving) return;

    const handleMove = (e: MouseEvent) => {
      if (resizing) handleResizeMove(e);
      if (moving) handleMoveMove(e);
    };
    const handleUp = () => {
      if (resizing) handleResizeEnd();
      if (moving) handleMoveEnd();
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [resizing, moving, handleResizeMove, handleResizeEnd, handleMoveMove, handleMoveEnd]);

  // ========================================
  // ADD / DELETE SEGMENTS
  // ========================================

  const handleAddSegment = useCallback(() => {
    // Find the max end time of all segments
    const maxEndTime = sortedSegments.reduce((max, seg) => Math.max(max, seg.end_time), 0);
    const newStartTime = maxEndTime;
    const newEndTime = newStartTime + DEFAULT_NEW_SEGMENT_DURATION;

    const newSegment = createDefaultSegment(newStartTime, DEFAULT_NEW_SEGMENT_DURATION);
    const updated = [...segments, newSegment];
    onSegmentsChange(updated);
    onSelectSegment(newSegment.id);
    onDurationChange?.(newEndTime);
  }, [segments, sortedSegments, onSegmentsChange, onSelectSegment, onDurationChange]);

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
      // Recalculate max end time after deletion
      const newMaxEnd = updated.reduce((max, seg) => Math.max(max, seg.end_time), 0);
      onDurationChange?.(newMaxEnd);

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

  // Always allow adding segments (total duration can exceed 15s)
  const canAddSegment = true;

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

        {/* Dark zone after plan duration */}
        <div
          className="absolute top-0 bottom-0 bg-slate-950/50 pointer-events-none"
          style={{
            left: `${timeToPercent(planDuration)}%`,
            right: 0,
          }}
        >
          {/* Diagonal stripes pattern */}
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(100,116,139,0.3) 8px, rgba(100,116,139,0.3) 16px)',
            }}
          />
        </div>

        {/* Plan duration limit line - offset slightly to not overlap segments */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-orange-500/80 z-10"
          style={{ left: `calc(${timeToPercent(planDuration)}% + 4px)` }}
        />

        {/* Segments */}
        {sortedSegments.map((segment, index) => {
          const left = timeToPercent(segment.start_time);
          const width = timeToPercent(segment.end_time - segment.start_time);
          const isSelected = selectedSegmentId === segment.id;
          const duration = segment.end_time - segment.start_time;
          const isMoving = moving?.segmentId === segment.id;
          const isResizing = resizing?.segmentId === segment.id;
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
                (isMoving || isResizing) && 'ring-2 ring-blue-400 z-30'
              )}
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 3)}%`,
              }}
              onClick={() => onSelectSegment(segment.id)}
              onDoubleClick={() => onEditSegment?.(segment)}
            >
              {/* Move handle - center of segment (must be BEFORE resize handles for z-order) */}
              <div
                className="absolute left-3 right-3 top-0 bottom-0 cursor-move"
                onMouseDown={(e) => handleMoveStart(e, segment.id)}
              />

              {/* Left resize handle - always visible */}
              <div
                className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize bg-white/40 hover:bg-white/70 rounded-l flex items-center justify-center"
                onMouseDown={(e) => handleEdgeDragStart(e, segment.id, 'left')}
              >
                <div className="w-0.5 h-6 bg-white/80 rounded-full" />
              </div>

              {/* Right resize handle - always visible */}
              <div
                className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize bg-white/40 hover:bg-white/70 rounded-r flex items-center justify-center"
                onMouseDown={(e) => handleEdgeDragStart(e, segment.id, 'right')}
              >
                <div className="w-0.5 h-6 bg-white/80 rounded-full" />
              </div>

              {/* Content - adapts to segment width */}
              <div className="absolute inset-0 px-4 flex items-center justify-center min-w-0 pointer-events-none">
                {width < 15 ? (
                  /* Small (1-2s): Stacked vertically - centered with spacing */
                  <div className="flex flex-col items-center justify-center gap-1">
                    <span className="bg-black/30 px-1 rounded text-white/90 text-[9px] font-medium">
                      {getShotAbbr(segment.shot_framing, segment.shot_composition)}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <span className="text-white/70 text-[9px] font-bold">
                        {Math.round(duration)}s
                      </span>
                      {hasElements && (
                        <MessageSquare className="w-2 h-2 text-white/60" />
                      )}
                    </div>
                  </div>
                ) : (
                  /* Medium+: Shot type + duration + icon horizontal */
                  <div className="flex items-center gap-2">
                    <span className="bg-black/30 px-1 rounded text-white/90 text-[10px] font-medium truncate">
                      {width > 25
                        ? getShotLabel(segment.shot_framing, segment.shot_composition)
                        : getShotAbbr(segment.shot_framing, segment.shot_composition)}
                    </span>
                    <span className="text-white/80 text-[10px] font-bold">
                      {Math.round(duration)}s
                    </span>
                    {hasElements && (
                      <MessageSquare className="w-2.5 h-2.5 text-white/70" />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

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
          title="Ajouter un segment (+3s)"
        >
          <Plus className="w-3 h-3 mr-1" />
          Ajouter
          <span className="ml-1 text-slate-500">(+3s)</span>
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

        {/* Duration indicator */}
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className={cn(
            'text-slate-400',
            totalDuration > MAX_TOTAL_DURATION && 'text-orange-400'
          )}>
            Total: <span className={totalDuration > MAX_TOTAL_DURATION ? 'text-orange-300' : 'text-green-400'}>{totalDuration}s</span>
            {totalDuration > MAX_TOTAL_DURATION && <span className="ml-1">({'>'}{MAX_TOTAL_DURATION}s)</span>}
          </span>
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
