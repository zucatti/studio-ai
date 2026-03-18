'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AspectRatio } from '@/types/database';

type PlaceholderStatus = 'queued' | 'generating' | 'uploading' | 'completed' | 'error';

interface GeneratingPlaceholderProps {
  aspectRatio: AspectRatio;
  status?: PlaceholderStatus;
  progress?: number; // 0-100 for models that support it
  className?: string;
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
  generating: 'Generation en cours...',
  uploading: 'Sauvegarde...',
  completed: 'Termine!',
  error: 'Erreur',
};

export function GeneratingPlaceholder({
  aspectRatio,
  status = 'generating',
  progress,
  className,
}: GeneratingPlaceholderProps) {
  const paddingBottom = ASPECT_RATIO_PADDING[aspectRatio] || '100%';

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-white/10',
        className
      )}
      style={{ paddingBottom }}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        {/* Animated background shimmer */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />

        {/* Spinner */}
        <div className="relative">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          {/* Progress ring (if progress available) */}
          {progress !== undefined && progress > 0 && (
            <svg className="absolute inset-0 w-8 h-8 -rotate-90">
              <circle
                cx="16"
                cy="16"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-blue-500/30"
              />
              <circle
                cx="16"
                cy="16"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={`${progress * 0.88} 88`}
                className="text-blue-500"
              />
            </svg>
          )}
        </div>

        {/* Status text */}
        <span className="text-xs text-slate-400 font-medium">
          {STATUS_LABELS[status] || status}
        </span>

        {/* Progress percentage */}
        {progress !== undefined && progress > 0 && (
          <span className="text-xs text-slate-500 tabular-nums">
            {Math.round(progress)}%
          </span>
        )}
      </div>
    </div>
  );
}
