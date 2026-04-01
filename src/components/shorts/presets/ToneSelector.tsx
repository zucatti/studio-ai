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
  ToneGenre,
  ToneMood,
  TonePacing,
} from '@/types/cinematic';
import { GENRE_OPTIONS, MOOD_OPTIONS, PACING_OPTIONS } from '@/types/cinematic';

interface ToneSelectorProps {
  value: {
    genre: ToneGenre;
    mood: ToneMood;
    pacing: TonePacing;
  };
  onChange: (value: ToneSelectorProps['value']) => void;
}

// Get recommended moods for a genre
function getRecommendedMoods(genre: ToneGenre): ToneMood[] {
  return MOOD_OPTIONS
    .filter(m => m.forGenres.includes(genre))
    .map(m => m.value);
}

export function ToneSelector({ value, onChange }: ToneSelectorProps) {
  const recommendedMoods = getRecommendedMoods(value.genre);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">🎭</span>
        <Label className="text-slate-300 font-medium">Tone & Mood</Label>
      </div>

      {/* Genre */}
      <div className="flex items-center gap-2">
        <Label className="text-slate-400 text-xs w-16">Genre</Label>
        <Select
          value={value.genre}
          onValueChange={(v) => {
            const newGenre = v as ToneGenre;
            // Auto-select first recommended mood if current mood doesn't fit
            const recommended = getRecommendedMoods(newGenre);
            const newMood = recommended.includes(value.mood)
              ? value.mood
              : recommended[0] || value.mood;
            onChange({ ...value, genre: newGenre, mood: newMood });
          }}
        >
          <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1a2e44] border-white/10">
            {GENRE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Mood - show recommended moods first */}
      <div className="flex items-center gap-2">
        <Label className="text-slate-400 text-xs w-16">Mood</Label>
        <div className="flex-1 flex flex-wrap gap-1">
          {MOOD_OPTIONS.map((mood) => {
            const isRecommended = recommendedMoods.includes(mood.value);
            const isActive = value.mood === mood.value;

            return (
              <button
                key={mood.value}
                onClick={() => onChange({ ...value, mood: mood.value })}
                className={cn(
                  "px-2 py-0.5 text-xs rounded-full border transition-all",
                  isActive
                    ? "bg-green-500/20 border-green-500/50 text-green-400"
                    : isRecommended
                    ? "border-white/20 text-slate-300 hover:border-green-500/30 hover:text-green-400"
                    : "border-white/10 text-slate-500 hover:text-white hover:border-white/20"
                )}
              >
                {mood.label}
                {isRecommended && !isActive && (
                  <span className="ml-0.5 text-[8px] text-green-500">•</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pacing */}
      <div className="flex items-center gap-2">
        <Label className="text-slate-400 text-xs w-16">Rythme</Label>
        <div className="inline-flex rounded-lg bg-white/5 p-0.5 flex-1">
          {PACING_OPTIONS.map((pace) => (
            <button
              key={pace.value}
              onClick={() => onChange({ ...value, pacing: pace.value })}
              className={cn(
                "flex-1 px-2 py-1 text-xs font-medium rounded-md transition-all",
                value.pacing === pace.value
                  ? "bg-rose-500/20 text-rose-400"
                  : "text-slate-400 hover:text-white"
              )}
            >
              {pace.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
