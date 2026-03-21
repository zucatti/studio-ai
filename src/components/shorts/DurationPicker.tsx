'use client';

import { cn } from '@/lib/utils';
import { useMemo } from 'react';

const DURATIONS = [3, 5, 7, 9, 10, 12, 15];

interface DurationPickerProps {
  value: number;
  onChange: (duration: number) => void;
  className?: string;
  compact?: boolean;
}

export function DurationPicker({ value, onChange, className, compact }: DurationPickerProps) {
  // Find the closest valid duration
  const currentIndex = useMemo(() => {
    const idx = DURATIONS.indexOf(value);
    if (idx !== -1) return idx;
    // Find closest
    let closest = 0;
    let minDiff = Math.abs(DURATIONS[0] - value);
    for (let i = 1; i < DURATIONS.length; i++) {
      const diff = Math.abs(DURATIONS[i] - value);
      if (diff < minDiff) {
        minDiff = diff;
        closest = i;
      }
    }
    return closest;
  }, [value]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = parseInt(e.target.value, 10);
    onChange(DURATIONS[idx]);
  };

  const progress = (currentIndex / (DURATIONS.length - 1)) * 100;

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* Duration display */}
      <div className={cn(
        'font-bold text-blue-400 tabular-nums',
        compact ? 'text-sm w-8' : 'text-lg w-10'
      )}>
        {value}s
      </div>

      {/* Slider container */}
      <div className="relative flex-1 min-w-[120px] h-6 flex items-center">
        {/* Track background */}
        <div className="absolute left-0 right-0 h-1.5 bg-slate-700 rounded-full overflow-hidden">
          {/* Progress fill */}
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Tick marks */}
        <div className="absolute left-0 right-0 flex items-center justify-between pointer-events-none">
          {DURATIONS.map((dur, idx) => (
            <div
              key={dur}
              className={cn(
                'w-1 h-1 rounded-full transition-colors',
                idx <= currentIndex ? 'bg-blue-300' : 'bg-slate-600'
              )}
            />
          ))}
        </div>

        {/* Actual slider input */}
        <input
          type="range"
          min={0}
          max={DURATIONS.length - 1}
          step={1}
          value={currentIndex}
          onChange={handleSliderChange}
          className={cn(
            'absolute inset-0 w-full appearance-none bg-transparent cursor-pointer z-10',
            // Thumb styling - centered with margin-top trick
            '[&::-webkit-slider-thumb]:appearance-none',
            '[&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4',
            '[&::-webkit-slider-thumb]:rounded-full',
            '[&::-webkit-slider-thumb]:bg-white',
            '[&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-blue-500/30',
            '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-400',
            '[&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing',
            '[&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110',
            '[&::-webkit-slider-thumb]:-mt-[5px]',
            // Firefox
            '[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4',
            '[&::-moz-range-thumb]:rounded-full',
            '[&::-moz-range-thumb]:bg-white',
            '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-blue-400',
            '[&::-moz-range-thumb]:cursor-grab',
            // Track
            '[&::-webkit-slider-runnable-track]:h-1.5',
            '[&::-webkit-slider-runnable-track]:bg-transparent',
            '[&::-moz-range-track]:h-1.5',
            '[&::-moz-range-track]:bg-transparent'
          )}
        />
      </div>

      {/* Min/Max labels */}
      {!compact && (
        <div className="text-[10px] text-slate-500 w-6 text-right">
          {DURATIONS[DURATIONS.length - 1]}s
        </div>
      )}
    </div>
  );
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}
