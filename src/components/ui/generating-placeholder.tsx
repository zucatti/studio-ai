'use client';

import { useState, useEffect } from 'react';
import { Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AspectRatio } from '@/types/database';

type PlaceholderStatus = 'queued' | 'generating' | 'uploading' | 'completed' | 'error';

interface GeneratingPlaceholderProps {
  aspectRatio: AspectRatio;
  status?: PlaceholderStatus;
  progress?: number; // 0-100 for models that support it
  className?: string;
  label?: string; // Optional label to show
  startedAt?: string | number; // Timestamp when generation started
}

// Format elapsed time as "Xm Ys" or "Xs"
function formatElapsedTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

// Map aspect ratios to padding-bottom percentages for responsive sizing
const ASPECT_RATIO_PADDING: Record<AspectRatio, string> = {
  '16:9': '56.25%',   // 9/16 * 100
  '9:16': '177.78%',  // 16/9 * 100
  '1:1': '100%',
  '4:5': '125%',      // 5/4 * 100
  '2:3': '150%',      // 3/2 * 100
  '21:9': '42.86%',   // 9/21 * 100
};

const STATUS_LABELS: Record<PlaceholderStatus, string> = {
  queued: 'En file d\'attente...',
  generating: 'Génération en cours...',
  uploading: 'Sauvegarde...',
  completed: 'Terminé!',
  error: 'Erreur',
};

export function GeneratingPlaceholder({
  aspectRatio,
  status = 'generating',
  progress,
  className,
  label,
  startedAt,
}: GeneratingPlaceholderProps) {
  const paddingBottom = ASPECT_RATIO_PADDING[aspectRatio] || '100%';
  const isActive = status === 'queued' || status === 'generating' || status === 'uploading';
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Elapsed time counter
  useEffect(() => {
    if (!isActive) {
      return;
    }

    // Calculate start time
    const startTime = startedAt
      ? typeof startedAt === 'string'
        ? new Date(startedAt).getTime()
        : startedAt
      : Date.now();

    const updateElapsed = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedSeconds(elapsed);
    };

    // Update immediately and then every second
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [isActive, startedAt]);

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-lg',
        className
      )}
      style={{ paddingBottom }}
    >
      {/* Animated rainbow radial gradient background */}
      {isActive && (
        <div
          className="absolute inset-0"
          style={{
            background: 'conic-gradient(from 0deg, #ff0000, #ff8000, #ffff00, #00ff00, #00ffff, #0080ff, #8000ff, #ff0080, #ff0000)',
            animation: 'rainbow-spin 3s linear infinite',
            filter: 'blur(30px)',
            opacity: 0.6,
            transform: 'scale(1.3)',
          }}
        />
      )}

      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        {/* Icon with pulsing ring */}
        <div className="relative">
          <Wand2 className="w-8 h-8 text-white/80" />
          {isActive && (
            <div className="absolute inset-0 -m-2 rounded-full border-2 border-white/30 animate-ping" />
          )}
        </div>

        {/* Status text */}
        <span className="text-sm font-medium text-white">
          {STATUS_LABELS[status] || status}
        </span>

        {/* Optional label */}
        {label && (
          <span className="text-xs text-white/70 bg-black/40 px-2 py-0.5 rounded">
            {label}
          </span>
        )}

        {/* Progress percentage */}
        {progress !== undefined && progress > 0 && (
          <span className="text-lg font-bold text-white/90">
            {Math.round(progress)}%
          </span>
        )}

        {/* Elapsed time */}
        {isActive && (
          <span className="text-xs text-white/60 tabular-nums">
            {formatElapsedTime(elapsedSeconds)}
          </span>
        )}
      </div>

      {/* CSS for rainbow animation */}
      <style jsx>{`
        @keyframes rainbow-spin {
          from {
            transform: scale(1.3) rotate(0deg);
          }
          to {
            transform: scale(1.3) rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
