'use client';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { LightingType, LightingStyle } from '@/types/cinematic';

interface LightingSelectorProps {
  value: {
    type: LightingType;
    style: LightingStyle;
  };
  onChange: (value: LightingSelectorProps['value']) => void;
}

const LIGHTING_TYPES: { value: LightingType; label: string }[] = [
  { value: 'natural', label: 'Naturel' },
  { value: 'artificial', label: 'Artificiel' },
  { value: 'mixed', label: 'Mixte' },
];

// Visual style cards with gradient representations
const LIGHTING_STYLES: {
  value: LightingStyle;
  label: string;
  description: string;
  gradient: string;
  icon: React.ReactNode;
}[] = [
  {
    value: 'high_key',
    label: 'High-key',
    description: 'Lumineux, peu d\'ombres',
    gradient: 'bg-gradient-to-br from-white via-slate-100 to-slate-200',
    icon: (
      <div className="w-full h-full bg-gradient-to-br from-white via-amber-50 to-amber-100 rounded" />
    ),
  },
  {
    value: 'low_key',
    label: 'Low-key',
    description: 'Sombre, dramatique',
    gradient: 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700',
    icon: (
      <div className="w-full h-full bg-slate-900 rounded relative overflow-hidden">
        <div className="absolute top-1 right-1 w-4 h-4 bg-gradient-radial from-amber-400/60 to-transparent rounded-full blur-[2px]" />
      </div>
    ),
  },
  {
    value: 'dramatic',
    label: 'Dramatique',
    description: 'Fort contraste',
    gradient: 'bg-gradient-to-r from-slate-900 via-slate-600 to-white',
    icon: (
      <div className="w-full h-full rounded overflow-hidden flex">
        <div className="w-1/2 bg-slate-900" />
        <div className="w-1/2 bg-gradient-to-r from-slate-400 to-amber-100" />
      </div>
    ),
  },
  {
    value: 'soft',
    label: 'Doux',
    description: 'Diffus, subtil',
    gradient: 'bg-gradient-to-br from-slate-300 via-slate-200 to-slate-100',
    icon: (
      <div className="w-full h-full bg-gradient-to-br from-slate-300 via-slate-200 to-amber-50 rounded blur-[1px]" />
    ),
  },
  {
    value: 'harsh',
    label: 'Dur',
    description: 'Ombres nettes',
    gradient: 'bg-gradient-to-br from-white to-slate-900',
    icon: (
      <div className="w-full h-full rounded overflow-hidden relative">
        <div className="absolute inset-0 bg-amber-100" />
        <div
          className="absolute inset-0 bg-slate-900"
          style={{ clipPath: 'polygon(100% 0, 100% 100%, 30% 100%)' }}
        />
      </div>
    ),
  },
  {
    value: 'silhouette',
    label: 'Silhouette',
    description: 'Contre-jour',
    gradient: 'bg-gradient-to-t from-orange-400 via-amber-300 to-amber-100',
    icon: (
      <div className="w-full h-full rounded overflow-hidden relative bg-gradient-to-t from-orange-400 via-amber-200 to-amber-100">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-5 bg-slate-900 rounded-t-full" />
      </div>
    ),
  },
];

export function LightingSelector({ value, onChange }: LightingSelectorProps) {
  return (
    <div className="space-y-4">
      {/* Type */}
      <div className="flex items-center gap-2">
        <Label className="text-slate-400 text-xs w-16">Type</Label>
        <div className="inline-flex rounded-lg bg-white/5 p-0.5">
          {LIGHTING_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => onChange({ ...value, type: type.value })}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-all',
                value.type === type.value
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Style Cards */}
      <div className="grid grid-cols-3 gap-2">
        {LIGHTING_STYLES.map((style) => (
          <button
            key={style.value}
            onClick={() => onChange({ ...value, style: style.value })}
            className={cn(
              'flex flex-col items-center gap-2 p-3 rounded-xl border transition-all text-center',
              value.style === style.value
                ? 'bg-amber-500/20 border-amber-500/50'
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
                  value.style === style.value ? 'text-amber-300' : 'text-slate-300'
                )}
              >
                {style.label}
              </div>
              <div
                className={cn(
                  'text-[10px]',
                  value.style === style.value ? 'text-amber-400/70' : 'text-slate-500'
                )}
              >
                {style.description}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
