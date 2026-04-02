'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Segment, ShotType } from '@/types/cinematic';
import { SHOT_TYPE_OPTIONS, createDefaultSegment } from '@/types/cinematic';

// Minimum segment duration in seconds
export const MIN_SEGMENT_DURATION = 3;

interface SegmentTimelineProps {
  segments: Segment[];
  planDuration: number; // Total plan duration
  selectedSegmentId: string | null;
  onSelectSegment: (segmentId: string | null) => void;
  onSegmentsChange: (segments: Segment[]) => void;
  onEditSegment?: (segment: Segment) => void;
  className?: string;
}

/**
 * Calculate minimum plan duration = number of segments × MIN_SEGMENT_DURATION
 * This is the absolute minimum (when all segments are at 3s)
 */
export function calculateMinPlanDuration(segmentCount: number): number {
  if (segmentCount === 0) return 3; // Default min
  return segmentCount * MIN_SEGMENT_DURATION;
}

/**
 * Scale segments to a new plan duration with smart redistribution
 * - Segments that would go below MIN_SEGMENT_DURATION stay at MIN_SEGMENT_DURATION
 * - Other segments absorb the extra reduction
 * - Returns null if impossible (all segments already at minimum)
 */
export function scaleSegmentsToDuration(
  segments: Segment[],
  oldDuration: number,
  newDuration: number
): Segment[] | null {
  if (segments.length === 0) return [];

  const sorted = [...segments].sort((a, b) => a.start_time - b.start_time);
  const absoluteMin = segments.length * MIN_SEGMENT_DURATION;

  // Can't go below absolute minimum
  if (newDuration < absoluteMin) {
    return null;
  }

  // If increasing, simple proportional scaling
  if (newDuration >= oldDuration) {
    const ratio = newDuration / oldDuration;
    const scaled: Segment[] = [];
    let currentTime = 0;

    for (let i = 0; i < sorted.length; i++) {
      const seg = sorted[i];
      const oldSegDuration = seg.end_time - seg.start_time;
      const newSegDuration = Math.round(oldSegDuration * ratio);
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

  // Decreasing: smart redistribution
  const ratio = newDuration / oldDuration;

  // First pass: calculate scaled durations, identify segments that hit minimum
  const segmentData = sorted.map((seg) => {
    const oldDur = seg.end_time - seg.start_time;
    const scaledDur = Math.round(oldDur * ratio);
    const wouldHitMin = scaledDur < MIN_SEGMENT_DURATION;
    return {
      seg,
      oldDur,
      scaledDur: wouldHitMin ? MIN_SEGMENT_DURATION : scaledDur,
      hitMin: wouldHitMin,
    };
  });

  // Calculate how much extra time we used by enforcing minimums
  const totalScaled = segmentData.reduce((sum, d) => sum + d.scaledDur, 0);
  let excess = totalScaled - newDuration;

  // Second pass: reduce segments that didn't hit minimum to absorb excess
  if (excess > 0) {
    // Sort by duration descending to reduce larger segments first
    const reducible = segmentData
      .map((d, i) => ({ ...d, index: i }))
      .filter((d) => !d.hitMin && d.scaledDur > MIN_SEGMENT_DURATION)
      .sort((a, b) => b.scaledDur - a.scaledDur);

    for (const item of reducible) {
      if (excess <= 0) break;
      const canReduce = item.scaledDur - MIN_SEGMENT_DURATION;
      const reduction = Math.min(canReduce, excess);
      segmentData[item.index].scaledDur -= reduction;
      excess -= reduction;
    }
  }

  // Build final segments
  const scaled: Segment[] = [];
  let currentTime = 0;

  for (let i = 0; i < sorted.length; i++) {
    const isLast = i === sorted.length - 1;
    const duration = segmentData[i].scaledDur;

    scaled.push({
      ...sorted[i],
      start_time: currentTime,
      end_time: isLast ? newDuration : currentTime + duration,
    });

    currentTime = scaled[i].end_time;
  }

  return scaled;
}

// Get short label for shot type
function getShotTypeLabel(type: ShotType): string {
  const option = SHOT_TYPE_OPTIONS.find((o) => o.value === type);
  return option?.label || type;
}

// Get abbreviated shot type (for compact display)
function getShotTypeAbbr(type: ShotType): string {
  const abbrs: Record<ShotType, string> = {
    extreme_wide: 'XW',
    wide: 'W',
    medium_wide: 'MW',
    medium: 'M',
    medium_close_up: 'MCU',
    close_up: 'CU',
    extreme_close_up: 'XCU',
    over_shoulder: 'OTS',
    pov: 'POV',
    insert: 'INS',
    two_shot: '2S',
  };
  return abbrs[type] || type;
}

// Color for shot type
function getShotTypeColor(type: ShotType): string {
  const colors: Record<ShotType, string> = {
    extreme_wide: 'bg-purple-500/80',
    wide: 'bg-indigo-500/80',
    medium_wide: 'bg-blue-500/80',
    medium: 'bg-cyan-500/80',
    medium_close_up: 'bg-teal-500/80',
    close_up: 'bg-green-500/80',
    extreme_close_up: 'bg-lime-500/80',
    over_shoulder: 'bg-amber-500/80',
    pov: 'bg-orange-500/80',
    insert: 'bg-rose-500/80',
    two_shot: 'bg-pink-500/80',
  };
  return colors[type] || 'bg-slate-500/80';
}

export function SegmentTimeline({
  segments,
  planDuration,
  selectedSegmentId,
  onSelectSegment,
  onSegmentsChange,
  onEditSegment,
  className,
}: SegmentTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{
    borderIndex: number; // Index of the border being dragged (between segment i and i+1)
    initialX: number;
    initialTime: number;
  } | null>(null);

  // Sorted segments by start_time - these should always be contiguous
  const sortedSegments = useMemo(
    () => [...segments].sort((a, b) => a.start_time - b.start_time),
    [segments]
  );

  // Normalize segments to ensure they're contiguous and fill the plan
  const normalizeSegments = useCallback(
    (segs: Segment[]): Segment[] => {
      if (segs.length === 0) return [];

      const sorted = [...segs].sort((a, b) => a.start_time - b.start_time);
      const normalized: Segment[] = [];
      let currentTime = 0;

      for (let i = 0; i < sorted.length; i++) {
        const seg = sorted[i];
        const isLast = i === sorted.length - 1;
        const duration = seg.end_time - seg.start_time;

        normalized.push({
          ...seg,
          start_time: currentTime,
          end_time: isLast ? planDuration : currentTime + duration,
        });

        currentTime = normalized[i].end_time;
      }

      return normalized;
    },
    [planDuration]
  );

  // Convert time to percentage
  const timeToPercent = useCallback(
    (time: number) => (time / planDuration) * 100,
    [planDuration]
  );

  // Convert percentage to time
  const percentToTime = useCallback(
    (percent: number) => (percent / 100) * planDuration,
    [planDuration]
  );

  // Format time as whole seconds
  const formatTime = useCallback((seconds: number) => {
    const rounded = Math.round(seconds);
    const mins = Math.floor(rounded / 60);
    const secs = rounded % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  }, []);

  // Handle border drag start (border between segment i and i+1)
  const handleBorderDragStart = useCallback(
    (e: React.MouseEvent, borderIndex: number) => {
      e.stopPropagation();
      const borderTime = sortedSegments[borderIndex].end_time;

      setDragging({
        borderIndex,
        initialX: e.clientX,
        initialTime: borderTime,
      });
    },
    [sortedSegments]
  );

  // Handle border drag move
  const handleDragMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const deltaX = e.clientX - dragging.initialX;
      const deltaPercent = (deltaX / rect.width) * 100;
      const deltaTime = percentToTime(deltaPercent);

      // Calculate new border time
      let newBorderTime = Math.round(dragging.initialTime + deltaTime);

      // Constraints: min MIN_SEGMENT_DURATION for each adjacent segment
      const leftSegment = sortedSegments[dragging.borderIndex];
      const rightSegment = sortedSegments[dragging.borderIndex + 1];

      const minTime = leftSegment.start_time + MIN_SEGMENT_DURATION;
      const maxTime = rightSegment.end_time - MIN_SEGMENT_DURATION;

      newBorderTime = Math.max(minTime, Math.min(maxTime, newBorderTime));

      // Update both segments
      const updated = sortedSegments.map((seg, i) => {
        if (i === dragging.borderIndex) {
          return { ...seg, end_time: newBorderTime };
        }
        if (i === dragging.borderIndex + 1) {
          return { ...seg, start_time: newBorderTime };
        }
        return seg;
      });

      onSegmentsChange(updated);
    },
    [dragging, sortedSegments, percentToTime, onSegmentsChange]
  );

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDragging(null);
  }, []);

  // Attach drag listeners
  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent) => handleDragMove(e);
    const handleUp = () => handleDragEnd();

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, handleDragMove, handleDragEnd]);

  // Add new segment - redistribute space equally
  const handleAddSegment = useCallback(() => {
    const newCount = segments.length + 1;
    const segmentDuration = Math.floor(planDuration / newCount);

    if (segmentDuration < MIN_SEGMENT_DURATION) {
      return; // Can't fit more segments (each must be at least MIN_SEGMENT_DURATION)
    }

    // Redistribute all segments equally
    const redistributed: Segment[] = [];
    let currentTime = 0;

    for (let i = 0; i < sortedSegments.length; i++) {
      redistributed.push({
        ...sortedSegments[i],
        start_time: currentTime,
        end_time: currentTime + segmentDuration,
      });
      currentTime += segmentDuration;
    }

    // Add the new segment taking remaining space (last segment goes to planDuration)
    const newSegment = createDefaultSegment(currentTime, planDuration - currentTime);
    redistributed.push(newSegment);

    onSegmentsChange(redistributed);
    onSelectSegment(newSegment.id);
  }, [sortedSegments, segments.length, planDuration, onSegmentsChange, onSelectSegment]);

  // Delete segment - previous segment expands to fill the gap
  // Cannot delete the last segment (minimum 1 segment required)
  const handleDeleteSegment = useCallback(
    (segmentId: string) => {
      // Prevent deleting the last segment
      if (segments.length <= 1) {
        return;
      }

      const segmentIndex = sortedSegments.findIndex((s) => s.id === segmentId);
      if (segmentIndex === -1) return;

      const deletedSegment = sortedSegments[segmentIndex];
      const remaining = segments.filter((s) => s.id !== segmentId);

      // Previous segment absorbs the deleted segment's duration
      // If deleting first segment, next segment absorbs it instead
      const sorted = [...remaining].sort((a, b) => a.start_time - b.start_time);

      const updated = sorted.map((seg, i) => {
        if (segmentIndex === 0) {
          // Deleted first segment: first remaining starts at 0
          if (i === 0) {
            return { ...seg, start_time: 0 };
          }
        } else {
          // Deleted middle/last: previous segment expands
          if (i === segmentIndex - 1) {
            return { ...seg, end_time: deletedSegment.end_time };
          }
          // Shift segments after the deleted one
          if (i >= segmentIndex) {
            // Already shifted by filter, just ensure contiguity
          }
        }
        return seg;
      });

      // Ensure last segment ends at planDuration
      if (updated.length > 0) {
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          end_time: planDuration,
        };
      }

      onSegmentsChange(updated);

      // Select previous segment (or next if deleting first)
      if (selectedSegmentId === segmentId) {
        const newSelectedIndex = segmentIndex === 0 ? 0 : segmentIndex - 1;
        const newSelected = updated[newSelectedIndex];
        onSelectSegment(newSelected?.id || null);
      }
    },
    [segments, sortedSegments, planDuration, selectedSegmentId, onSegmentsChange, onSelectSegment]
  );

  // Keyboard handler for Delete key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSegmentId && segments.length > 1) {
        // Don't delete if user is typing in an input
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

  // Can add segment if we can fit at least MIN_SEGMENT_DURATION per segment
  const canAddSegment = useMemo(() => {
    const newCount = segments.length + 1;
    const segmentDuration = Math.floor(planDuration / newCount);
    return segmentDuration >= MIN_SEGMENT_DURATION;
  }, [segments.length, planDuration]);

  return (
    <div className={cn('space-y-2', className)}>
      {/* Timeline header */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>0s</span>
        <span>Segments ({segments.length})</span>
        <span>{formatTime(planDuration)}</span>
      </div>

      {/* Timeline track */}
      <div
        ref={containerRef}
        className="relative h-16 bg-slate-900/50 rounded-lg border border-white/10 overflow-hidden"
      >
        {/* Time markers */}
        {Array.from({ length: Math.ceil(planDuration) + 1 }).map((_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 border-l border-white/5"
            style={{ left: `${timeToPercent(i)}%` }}
          >
            {i % 5 === 0 && (
              <span className="absolute top-1 left-1 text-[9px] text-slate-600">
                {i}s
              </span>
            )}
          </div>
        ))}

        {/* Segments */}
        {sortedSegments.map((segment, index) => {
          const left = timeToPercent(segment.start_time);
          const width = timeToPercent(segment.end_time - segment.start_time);
          const isSelected = selectedSegmentId === segment.id;
          const duration = segment.end_time - segment.start_time;
          const isLast = index === sortedSegments.length - 1;

          return (
            <div
              key={segment.id}
              className={cn(
                'absolute top-1 bottom-1 rounded-sm cursor-pointer transition-all',
                getShotTypeColor(segment.shot_type),
                isSelected
                  ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900 z-10'
                  : 'hover:brightness-110'
              )}
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 2)}%`,
              }}
              onClick={() => onSelectSegment(segment.id)}
              onDoubleClick={() => onEditSegment?.(segment)}
            >
              {/* Border handle (right edge) - only between segments, not on last */}
              {!isLast && (
                <div
                  className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize z-20 flex items-center justify-center hover:bg-white/30 translate-x-1/2"
                  onMouseDown={(e) => handleBorderDragStart(e, index)}
                >
                  <div className="w-0.5 h-6 bg-white/60 rounded-full" />
                </div>
              )}

              {/* Content */}
              <div className="absolute inset-x-1 inset-y-0 flex items-center justify-between min-w-0 px-1.5 pointer-events-none">
                {/* Left: Shot type (full if wide enough, abbr otherwise) */}
                <div className="flex items-center gap-1 text-white/90 text-[10px] font-medium min-w-0">
                  <span className="bg-black/30 px-1 rounded truncate">
                    {width > 20 ? getShotTypeLabel(segment.shot_type) : getShotTypeAbbr(segment.shot_type)}
                  </span>
                  {segment.dialogue && (
                    <MessageSquare className="w-2.5 h-2.5 flex-shrink-0 opacity-75" />
                  )}
                </div>

                {/* Center: Shot number */}
                <div className="text-white/80 text-[11px] font-bold flex-shrink-0">
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
          className="border-white/20 text-slate-400 hover:text-white"
          onClick={handleAddSegment}
          disabled={!canAddSegment}
        >
          <Plus className="w-3 h-3 mr-1" />
          Ajouter
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

        {/* Selected segment info */}
        {selectedSegmentId && (
          <div className="ml-auto text-xs text-slate-400">
            {(() => {
              const s = segments.find((seg) => seg.id === selectedSegmentId);
              if (!s) return null;
              return (
                <span>
                  Shot {sortedSegments.findIndex((seg) => seg.id === s.id) + 1}:{' '}
                  {getShotTypeLabel(s.shot_type)} ({formatTime(s.start_time)} → {formatTime(s.end_time)})
                </span>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
