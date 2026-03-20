'use client';

import { cn } from '@/lib/utils';

const DURATIONS = [
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
  { value: 15, label: '15s' },
];

interface DurationPickerProps {
  value: number;
  onChange: (duration: number) => void;
  className?: string;
  compact?: boolean;
}

export function DurationPicker({ value, onChange, className, compact }: DurationPickerProps) {
  return (
    <div className={cn('inline-flex rounded-lg bg-slate-800/50 p-0.5', className)}>
      {DURATIONS.map((duration, index) => (
        <button
          key={duration.value}
          type="button"
          onClick={() => onChange(duration.value)}
          className={cn(
            'font-medium transition-all',
            compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
            index === 0 && 'rounded-l-md',
            index === DURATIONS.length - 1 && 'rounded-r-md',
            value === duration.value
              ? 'bg-blue-600 text-white rounded-md shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          )}
        >
          {duration.label}
        </button>
      ))}
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
