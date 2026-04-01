'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type {
  LightingType,
  LightingStyle,
  LightingSource,
  LightingModifier,
} from '@/types/cinematic';
import { LIGHTING_OPTIONS } from '@/types/cinematic';

interface LightingSelectorProps {
  value: {
    type: LightingType;
    style: LightingStyle;
    source?: LightingSource;
    modifiers?: LightingModifier[];
  };
  onChange: (value: LightingSelectorProps['value']) => void;
}

const LIGHTING_TYPES: { value: LightingType; label: string }[] = [
  { value: 'natural', label: 'Naturel' },
  { value: 'artificial', label: 'Artificiel' },
  { value: 'mixed', label: 'Mixte' },
];

const LIGHTING_SOURCES: { value: LightingSource; label: string }[] = [
  { value: 'single_source', label: 'Source unique' },
  { value: 'three_point', label: 'Trois points' },
  { value: 'practical', label: 'Pratique (visible)' },
  { value: 'ambient', label: 'Ambiant' },
];

const LIGHTING_MODIFIERS: { value: LightingModifier; label: string }[] = [
  { value: 'diffused', label: 'Diffusé' },
  { value: 'direct', label: 'Direct' },
  { value: 'bounced', label: 'Réfléchi' },
  { value: 'colored', label: 'Coloré' },
];

export function LightingSelector({ value, onChange }: LightingSelectorProps) {
  const toggleModifier = (modifier: LightingModifier) => {
    const currentModifiers = value.modifiers || [];
    const hasModifier = currentModifiers.includes(modifier);

    onChange({
      ...value,
      modifiers: hasModifier
        ? currentModifiers.filter(m => m !== modifier)
        : [...currentModifiers, modifier],
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">💡</span>
        <Label className="text-slate-300 font-medium">Éclairage</Label>
      </div>

      {/* Type (radio buttons) */}
      <div className="flex items-center gap-2">
        <Label className="text-slate-400 text-xs w-16">Type</Label>
        <div className="inline-flex rounded-lg bg-white/5 p-0.5">
          {LIGHTING_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => onChange({ ...value, type: type.value })}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-all",
                value.type === type.value
                  ? "bg-amber-500/20 text-amber-400"
                  : "text-slate-400 hover:text-white"
              )}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Style */}
      <div className="flex items-center gap-2">
        <Label className="text-slate-400 text-xs w-16">Style</Label>
        <Select
          value={value.style}
          onValueChange={(v) => onChange({ ...value, style: v as LightingStyle })}
        >
          <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1a2e44] border-white/10">
            {LIGHTING_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                <div>
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-slate-500 ml-2">{opt.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Source */}
      <div className="flex items-center gap-2">
        <Label className="text-slate-400 text-xs w-16">Source</Label>
        <Select
          value={value.source || '_none'}
          onValueChange={(v) => onChange({ ...value, source: v === '_none' ? undefined : v as LightingSource })}
        >
          <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-xs flex-1">
            <SelectValue placeholder="Optionnel" />
          </SelectTrigger>
          <SelectContent className="bg-[#1a2e44] border-white/10">
            <SelectItem value="_none" className="text-xs text-slate-500">-</SelectItem>
            {LIGHTING_SOURCES.map((src) => (
              <SelectItem key={src.value} value={src.value} className="text-xs">
                {src.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Modifiers (toggle chips) */}
      <div className="flex items-center gap-2">
        <Label className="text-slate-400 text-xs w-16">Effets</Label>
        <div className="flex flex-wrap gap-1">
          {LIGHTING_MODIFIERS.map((mod) => {
            const isActive = value.modifiers?.includes(mod.value);
            return (
              <button
                key={mod.value}
                onClick={() => toggleModifier(mod.value)}
                className={cn(
                  "px-2 py-0.5 text-xs rounded-full border transition-all",
                  isActive
                    ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                    : "border-white/10 text-slate-500 hover:text-white hover:border-white/20"
                )}
              >
                {mod.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
