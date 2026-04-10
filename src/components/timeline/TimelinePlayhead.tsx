'use client';

/**
 * Timeline Playhead
 *
 * Vertical line indicating current playback position.
 */

interface TimelinePlayheadProps {
  currentTime: number;
  scale: number;
  height: number;
}

export function TimelinePlayhead({ currentTime, scale, height }: TimelinePlayheadProps) {
  const left = currentTime * scale + 128; // 128 = track header width

  return (
    <div
      className="absolute top-0 w-px bg-red-500 pointer-events-none z-30"
      style={{
        left,
        height: Math.max(height, 100),
      }}
    >
      {/* Glow effect */}
      <div className="absolute inset-0 w-px bg-red-500 blur-sm" />
    </div>
  );
}
