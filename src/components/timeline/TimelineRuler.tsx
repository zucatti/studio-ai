'use client';

/**
 * Timeline Ruler
 *
 * Shows time markers and allows seeking by clicking.
 */

import { useCallback, useRef } from 'react';
import { useTimelineStore } from '@/store/timeline-store';

export function TimelineRuler() {
  const rulerRef = useRef<HTMLDivElement>(null);

  const {
    scale,
    duration,
    scrollX,
    currentTime,
    seekTo,
  } = useTimelineStore();

  // Calculate timeline width
  const timelineWidth = Math.max(duration * scale + 200, 1000);

  // Generate time markers
  const markers: { time: number; label: string; major: boolean }[] = [];

  // Determine marker interval based on scale
  let interval = 1; // seconds
  if (scale < 20) interval = 10;
  else if (scale < 40) interval = 5;
  else if (scale >= 100) interval = 0.5;

  for (let t = 0; t <= duration + 10; t += interval) {
    const isMajor = t % (interval >= 1 ? 5 : 1) === 0;
    markers.push({
      time: t,
      label: formatTime(t),
      major: isMajor,
    });
  }

  // Handle click to seek
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!rulerRef.current) return;

      const rect = rulerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollX - 128; // 128 = track header width
      const time = Math.max(0, x / scale);
      seekTo(time);
    },
    [scale, scrollX, seekTo]
  );

  return (
    <div className="h-8 bg-zinc-900 border-b border-zinc-800 flex">
      {/* Empty space for track headers */}
      <div className="w-32 flex-shrink-0 bg-zinc-900 border-r border-zinc-800" />

      {/* Ruler */}
      <div
        ref={rulerRef}
        className="flex-1 relative overflow-hidden cursor-pointer"
        onClick={handleClick}
      >
        <div
          className="absolute top-0 h-full"
          style={{
            width: timelineWidth,
            transform: `translateX(-${scrollX}px)`,
          }}
        >
          {/* Time markers */}
          {markers.map(({ time, label, major }) => (
            <div
              key={time}
              className="absolute top-0 flex flex-col items-center"
              style={{ left: time * scale }}
            >
              {/* Tick */}
              <div
                className={`w-px ${major ? 'h-4 bg-zinc-500' : 'h-2 bg-zinc-700'}`}
              />
              {/* Label */}
              {major && (
                <span className="text-[10px] text-zinc-500 mt-0.5">
                  {label}
                </span>
              )}
            </div>
          ))}

          {/* Current time indicator */}
          <div
            className="absolute top-0 w-3 h-3 -translate-x-1/2"
            style={{ left: currentTime * scale }}
          >
            <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-transparent border-t-red-500" />
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  return `${secs}s`;
}
