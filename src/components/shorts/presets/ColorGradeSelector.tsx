'use client';

import { cn } from '@/lib/utils';
import type { ColorStyle } from '@/types/cinematic';

interface ColorGradeSelectorProps {
  value: {
    style: ColorStyle;
  };
  onChange: (value: ColorGradeSelectorProps['value']) => void;
}

// Visual style cards with color representations
const COLOR_STYLES: {
  value: ColorStyle;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: 'cinematic',
    label: 'Cinematic',
    description: 'Film classique',
    icon: (
      <div className="w-full h-full rounded overflow-hidden flex">
        <div className="w-1/3 bg-gradient-to-b from-amber-700 to-amber-900" />
        <div className="w-1/3 bg-gradient-to-b from-slate-600 to-slate-800" />
        <div className="w-1/3 bg-gradient-to-b from-cyan-800 to-cyan-950" />
      </div>
    ),
  },
  {
    value: 'vintage',
    label: 'Vintage',
    description: 'Rétro, délavé',
    icon: (
      <div className="w-full h-full rounded overflow-hidden bg-gradient-to-br from-amber-200 via-orange-100 to-amber-300 relative">
        <div className="absolute inset-0 bg-amber-900/20" />
        <div className="absolute bottom-0 right-0 w-2/3 h-2/3 bg-gradient-radial from-amber-100/50 to-transparent" />
      </div>
    ),
  },
  {
    value: 'modern',
    label: 'Modern',
    description: 'Net, épuré',
    icon: (
      <div className="w-full h-full rounded overflow-hidden bg-gradient-to-br from-slate-100 via-white to-slate-200 relative">
        <div className="absolute top-1 right-1 w-3 h-3 bg-sky-400 rounded-full" />
        <div className="absolute bottom-1 left-1 w-2 h-2 bg-emerald-400 rounded-full" />
      </div>
    ),
  },
  {
    value: 'noir',
    label: 'Noir',
    description: 'Sombre, contrasté',
    icon: (
      <div className="w-full h-full rounded overflow-hidden bg-slate-950 relative">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-slate-600 to-transparent" />
        <div className="absolute bottom-1 left-1 w-4 h-1 bg-amber-500/70" />
      </div>
    ),
  },
  {
    value: 'pastel',
    label: 'Pastel',
    description: 'Doux, subtil',
    icon: (
      <div className="w-full h-full rounded overflow-hidden flex">
        <div className="w-1/3 bg-gradient-to-b from-pink-200 to-pink-300" />
        <div className="w-1/3 bg-gradient-to-b from-sky-200 to-sky-300" />
        <div className="w-1/3 bg-gradient-to-b from-violet-200 to-violet-300" />
      </div>
    ),
  },
  {
    value: 'teal_orange',
    label: 'Teal & Orange',
    description: 'Blockbuster',
    icon: (
      <div className="w-full h-full rounded overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-teal-600 via-teal-700 to-cyan-800" />
        <div className="absolute bottom-0 right-0 w-2/3 h-2/3 bg-gradient-radial from-orange-500/80 to-transparent" />
      </div>
    ),
  },
  {
    value: 'black_white',
    label: 'Noir & Blanc',
    description: 'Monochrome',
    icon: (
      <div className="w-full h-full rounded overflow-hidden relative bg-gradient-to-br from-white via-slate-400 to-slate-900">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-4 bg-slate-800 rounded-sm" />
        </div>
      </div>
    ),
  },
  {
    value: 'saturated',
    label: 'Saturé',
    description: 'Hyper-vivid',
    icon: (
      <div className="w-full h-full rounded overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-r from-fuchsia-500 via-yellow-400 to-cyan-400" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/30" />
      </div>
    ),
  },
];

export function ColorGradeSelector({ value, onChange }: ColorGradeSelectorProps) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {COLOR_STYLES.map((style) => (
        <button
          key={style.value}
          onClick={() => onChange({ style: style.value })}
          className={cn(
            'flex flex-col items-center gap-2 p-3 rounded-xl border transition-all text-center',
            value.style === style.value
              ? 'bg-purple-500/20 border-purple-500/50'
              : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
          )}
        >
          {/* Visual Preview */}
          <div className="w-12 h-8 rounded-md overflow-hidden shadow-inner">
            {style.icon}
          </div>
          {/* Label */}
          <div>
            <div
              className={cn(
                'text-xs font-medium',
                value.style === style.value ? 'text-purple-300' : 'text-slate-300'
              )}
            >
              {style.label}
            </div>
            <div
              className={cn(
                'text-[10px]',
                value.style === style.value ? 'text-purple-400/70' : 'text-slate-500'
              )}
            >
              {style.description}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
