'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type {
  ColorTemperature,
  ColorSaturation,
  ColorContrast,
  ColorStyle,
} from '@/types/cinematic';
import { COLOR_STYLE_OPTIONS } from '@/types/cinematic';

interface ColorGradeSelectorProps {
  value: {
    temperature: ColorTemperature;
    saturation: ColorSaturation;
    contrast: ColorContrast;
    style?: ColorStyle;
    lut_reference?: string;
  };
  onChange: (value: ColorGradeSelectorProps['value']) => void;
}

const TEMPERATURE_OPTIONS: { value: ColorTemperature; label: string; color: string }[] = [
  { value: 'cold', label: 'Froid', color: 'bg-blue-500' },
  { value: 'neutral', label: 'Neutre', color: 'bg-slate-400' },
  { value: 'warm', label: 'Chaud', color: 'bg-orange-500' },
];

const SATURATION_OPTIONS: { value: ColorSaturation; label: string }[] = [
  { value: 'monochrome', label: 'Monochrome' },
  { value: 'desaturated', label: 'Désaturé' },
  { value: 'natural', label: 'Naturel' },
  { value: 'vibrant', label: 'Vibrant' },
];

const CONTRAST_OPTIONS: { value: ColorContrast; label: string }[] = [
  { value: 'low', label: 'Bas' },
  { value: 'medium', label: 'Moyen' },
  { value: 'high', label: 'Élevé' },
];

export function ColorGradeSelector({ value, onChange }: ColorGradeSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">🎨</span>
        <Label className="text-slate-300 font-medium">Colorimétrie</Label>
      </div>

      {/* Temperature */}
      <div className="flex items-center gap-2">
        <Label className="text-slate-400 text-xs w-16">Temp.</Label>
        <div className="flex-1 flex items-center gap-1 bg-white/5 rounded-lg p-1">
          {TEMPERATURE_OPTIONS.map((temp) => (
            <button
              key={temp.value}
              onClick={() => onChange({ ...value, temperature: temp.value })}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-2 py-1 rounded-md transition-all text-xs",
                value.temperature === temp.value
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:text-white"
              )}
            >
              <span className={cn("w-2 h-2 rounded-full", temp.color)} />
              {temp.label}
            </button>
          ))}
        </div>
      </div>

      {/* Saturation */}
      <div className="flex items-center gap-2">
        <Label className="text-slate-400 text-xs w-16">Satur.</Label>
        <Select
          value={value.saturation}
          onValueChange={(v) => onChange({ ...value, saturation: v as ColorSaturation })}
        >
          <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1a2e44] border-white/10">
            {SATURATION_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Contrast */}
      <div className="flex items-center gap-2">
        <Label className="text-slate-400 text-xs w-16">Contr.</Label>
        <div className="inline-flex rounded-lg bg-white/5 p-0.5 flex-1">
          {CONTRAST_OPTIONS.map((ctr) => (
            <button
              key={ctr.value}
              onClick={() => onChange({ ...value, contrast: ctr.value })}
              className={cn(
                "flex-1 px-2 py-1 text-xs font-medium rounded-md transition-all",
                value.contrast === ctr.value
                  ? "bg-purple-500/20 text-purple-400"
                  : "text-slate-400 hover:text-white"
              )}
            >
              {ctr.label}
            </button>
          ))}
        </div>
      </div>

      {/* Style */}
      <div className="flex items-center gap-2">
        <Label className="text-slate-400 text-xs w-16">Style</Label>
        <Select
          value={value.style || '_none'}
          onValueChange={(v) => onChange({ ...value, style: v === '_none' ? undefined : v as ColorStyle })}
        >
          <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-xs flex-1">
            <SelectValue placeholder="Optionnel" />
          </SelectTrigger>
          <SelectContent className="bg-[#1a2e44] border-white/10">
            <SelectItem value="_none" className="text-xs text-slate-500">-</SelectItem>
            {COLOR_STYLE_OPTIONS.map((opt) => (
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

      {/* LUT Reference */}
      <div className="flex items-center gap-2">
        <Label className="text-slate-400 text-xs w-16">LUT</Label>
        <Input
          value={value.lut_reference || ''}
          onChange={(e) => onChange({ ...value, lut_reference: e.target.value || undefined })}
          placeholder="ex: Kodak 2383, ARRI LogC..."
          className="bg-white/5 border-white/10 text-white h-8 text-xs flex-1"
        />
      </div>
    </div>
  );
}
