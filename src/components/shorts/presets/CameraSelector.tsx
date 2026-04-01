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
  CameraTypeCinematic,
  LensType,
  ApertureStyle,
  FocusStyle,
} from '@/types/cinematic';
import { CAMERA_TYPE_OPTIONS } from '@/types/cinematic';

interface CameraSelectorProps {
  value: {
    type: CameraTypeCinematic;
    lens: LensType;
    aperture: ApertureStyle;
    focus?: FocusStyle;
  };
  onChange: (value: CameraSelectorProps['value']) => void;
}

const LENS_OPTIONS: { value: LensType; label: string; mm: string }[] = [
  { value: 'wide', label: 'Grand angle', mm: '16-24mm' },
  { value: 'standard', label: 'Standard', mm: '35-50mm' },
  { value: 'telephoto', label: 'Téléobjectif', mm: '85-200mm' },
  { value: 'macro', label: 'Macro', mm: 'Macro' },
  { value: 'anamorphic', label: 'Anamorphique', mm: 'Cinéma' },
];

const APERTURE_OPTIONS: { value: ApertureStyle; label: string; desc: string }[] = [
  { value: 'shallow_dof', label: 'Faible', desc: 'f/1.4-2.8' },
  { value: 'medium_dof', label: 'Moyenne', desc: 'f/4-5.6' },
  { value: 'deep_dof', label: 'Profonde', desc: 'f/8-16' },
];

const FOCUS_OPTIONS: { value: FocusStyle; label: string }[] = [
  { value: 'sharp', label: 'Net' },
  { value: 'soft_focus', label: 'Flou doux' },
  { value: 'rack_focus', label: 'Rack focus' },
  { value: 'pull_focus', label: 'Pull focus' },
];

export function CameraSelector({ value, onChange }: CameraSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">🎥</span>
        <Label className="text-slate-300 font-medium">Caméra</Label>
      </div>

      {/* Camera Type */}
      <div className="flex items-center gap-2">
        <Label className="text-slate-400 text-xs w-16">Type</Label>
        <Select
          value={value.type}
          onValueChange={(v) => onChange({ ...value, type: v as CameraTypeCinematic })}
        >
          <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1a2e44] border-white/10">
            {CAMERA_TYPE_OPTIONS.map((opt) => (
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

      {/* Lens */}
      <div className="flex items-center gap-2">
        <Label className="text-slate-400 text-xs w-16">Objectif</Label>
        <Select
          value={value.lens}
          onValueChange={(v) => onChange({ ...value, lens: v as LensType })}
        >
          <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1a2e44] border-white/10">
            {LENS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-slate-500">({opt.mm})</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Aperture / Depth of Field */}
      <div className="flex items-center gap-2">
        <Label className="text-slate-400 text-xs w-16">PDC</Label>
        <div className="inline-flex rounded-lg bg-white/5 p-0.5 flex-1">
          {APERTURE_OPTIONS.map((apt) => (
            <button
              key={apt.value}
              onClick={() => onChange({ ...value, aperture: apt.value })}
              className={cn(
                "flex-1 px-2 py-1 text-xs font-medium rounded-md transition-all text-center",
                value.aperture === apt.value
                  ? "bg-blue-500/20 text-blue-400"
                  : "text-slate-400 hover:text-white"
              )}
              title={apt.desc}
            >
              {apt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Focus */}
      <div className="flex items-center gap-2">
        <Label className="text-slate-400 text-xs w-16">Focus</Label>
        <Select
          value={value.focus || '_none'}
          onValueChange={(v) => onChange({ ...value, focus: v === '_none' ? undefined : v as FocusStyle })}
        >
          <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-xs flex-1">
            <SelectValue placeholder="Par défaut" />
          </SelectTrigger>
          <SelectContent className="bg-[#1a2e44] border-white/10">
            <SelectItem value="_none" className="text-xs text-slate-500">Par défaut</SelectItem>
            {FOCUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
