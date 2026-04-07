'use client';

import { Camera, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRushCreatorStore, type RushMode } from '@/store/rush-creator-store';

export function RushModeToggle() {
  const { mode, setMode } = useRushCreatorStore();

  return (
    <div className="inline-flex rounded-lg bg-white/5 p-0.5 border border-white/10">
      <button
        type="button"
        onClick={() => setMode('photo')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-all',
          mode === 'photo'
            ? 'bg-blue-500 text-white'
            : 'text-slate-400 hover:text-white'
        )}
      >
        <Camera className="w-3.5 h-3.5" />
        Photo
      </button>
      <button
        type="button"
        onClick={() => setMode('video')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-all',
          mode === 'video'
            ? 'bg-purple-500 text-white'
            : 'text-slate-400 hover:text-white'
        )}
      >
        <Video className="w-3.5 h-3.5" />
        Vidéo
      </button>
    </div>
  );
}
