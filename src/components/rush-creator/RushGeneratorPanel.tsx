'use client';

import { useState, useCallback, useEffect } from 'react';
import { Sparkles, Loader2, ChevronDown, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MentionInput } from '@/components/ui/mention-input';
import { cn } from '@/lib/utils';
import { useRushCreatorStore } from '@/store/rush-creator-store';
import { RushModeToggle } from './RushModeToggle';
import type { AspectRatio } from '@/types/database';

const ASPECT_RATIO_OPTIONS: { value: AspectRatio; label: string }[] = [
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: '4:5', label: '4:5' },
  { value: '1:1', label: '1:1' },
  { value: '2:3', label: '2:3' },
];

const IMAGE_MODEL_OPTIONS = [
  { value: 'fal-ai/nano-banana-2', label: 'Nano Banana' },
  { value: 'seedream-5', label: 'Seedream 5' },
  { value: 'kling-o1', label: 'Kling O1' },
  { value: 'grok', label: 'Grok' },
  { value: 'gpt-image-1.5', label: 'GPT 1.5' },
] as const;

const VIDEO_MODEL_OPTIONS = [
  { value: 'kling-omni', label: 'Kling Omni' },
  { value: 'veo-3', label: 'Veo 3.1' },
  { value: 'seedance-2', label: 'Seedance 2' },
  { value: 'grok-720p', label: 'Grok' },
] as const;

// Duration limits per video model
const VIDEO_DURATION_LIMITS: Record<string, { min: number; max: number }> = {
  'kling-omni': { min: 3, max: 15 },
  'veo-3': { min: 4, max: 8 },
  'seedance-2': { min: 3, max: 15 },
  'grok-720p': { min: 3, max: 10 },
};

export function RushGeneratorPanel() {
  const {
    mode,
    currentProjectId,
    prompt,
    setPrompt,
    aspectRatio,
    setAspectRatio,
    model,
    setModel,
    resolution,
    setResolution,
    duration,
    setDuration,
    generate,
  } = useRushCreatorStore();

  // Get duration limits for current model
  const durationLimits = VIDEO_DURATION_LIMITS[model] || { min: 3, max: 15 };
  const clampedDuration = Math.min(Math.max(duration, durationLimits.min), durationLimits.max);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quantity, setQuantity] = useState(1);

  // Clamp duration when model changes
  useEffect(() => {
    if (mode === 'video' && duration !== clampedDuration) {
      setDuration(clampedDuration);
    }
  }, [mode, model, duration, clampedDuration, setDuration]);


  const modelOptions = mode === 'photo' ? IMAGE_MODEL_OPTIONS : VIDEO_MODEL_OPTIONS;
  const maxQuantity = mode === 'photo' ? 8 : 4;

  const handleQuantityChange = (delta: number) => {
    setQuantity(prev => Math.min(maxQuantity, Math.max(1, prev + delta)));
  };

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || !currentProjectId || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Generate multiple items based on quantity
      const promises = [];
      for (let i = 0; i < quantity; i++) {
        promises.push(generate());
      }
      await Promise.all(promises);
      // Keep prompt for iteration - user can clear manually if needed
    } catch (err) {
      console.error('[RushGenerator] Error:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [prompt, currentProjectId, generate, isSubmitting, setPrompt, quantity]);

  // Handle Cmd/Ctrl + Enter to submit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className="border-t border-white/10 bg-[#0d1520]/95 backdrop-blur-sm px-6 py-4">
      {/* Toolbar row */}
      <div className="flex items-center gap-3 mb-3">
        {/* Mode toggle */}
        <RushModeToggle />

        <div className="w-px h-6 bg-white/10" />

        {/* Aspect ratio */}
        <div className="relative">
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
            className="h-9 pl-3 pr-8 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-blue-500/50 focus:outline-none appearance-none cursor-pointer hover:bg-white/10 transition-colors"
          >
            {ASPECT_RATIO_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-[#1a2433]">
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>

        {/* Quantity picker (photos only) */}
        {mode === 'photo' && (
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => handleQuantityChange(-1)}
              disabled={quantity <= 1}
              className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-6 text-center text-white text-sm font-medium">{quantity}</span>
            <button
              type="button"
              onClick={() => handleQuantityChange(1)}
              disabled={quantity >= maxQuantity}
              className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="w-px h-6 bg-white/10" />

        {/* Model toggle */}
        <div className="inline-flex rounded-lg bg-white/5 p-0.5 border border-white/10">
          {modelOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setModel(opt.value)}
              className={cn(
                'px-2.5 py-1.5 text-sm font-medium rounded-md transition-all',
                model === opt.value
                  ? mode === 'photo' ? 'bg-blue-500 text-white' : 'bg-purple-500 text-white'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Resolution toggle (photos only) */}
        {mode === 'photo' && (
          <div className="inline-flex rounded-lg bg-white/5 p-0.5 border border-white/10">
            {(['1K', '2K', '4K'] as const).map((res) => (
              <button
                key={res}
                type="button"
                onClick={() => setResolution(res)}
                className={cn(
                  'px-2.5 py-1.5 text-sm font-medium rounded-md transition-all',
                  resolution === res
                    ? 'bg-emerald-500 text-white'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                {res}
              </button>
            ))}
          </div>
        )}

        {/* Duration slider (video only) */}
        {mode === 'video' && (
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 h-9">
            <span className="text-xs text-slate-400">Durée</span>
            <input
              type="range"
              min={durationLimits.min}
              max={durationLimits.max}
              value={clampedDuration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-20 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500 focus:outline-none focus:ring-0"
            />
            <span className="text-sm text-white font-medium w-6">{clampedDuration}s</span>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Keyboard hint */}
        <span className="text-xs text-slate-500">⌘↵ pour générer</span>

        {/* Generate button */}
        <Button
          onClick={handleGenerate}
          disabled={isSubmitting}
          className={cn(
            'h-9 px-4',
            mode === 'photo'
              ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'
              : 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700',
            'text-white shadow-lg font-medium'
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Envoi...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Générer {mode === 'photo' && quantity > 1 ? `(${quantity})` : ''}
            </>
          )}
        </Button>
      </div>

      {/* Prompt input - full width */}
      <div onKeyDown={handleKeyDown}>
        {currentProjectId ? (
          <MentionInput
            value={prompt}
            onChange={setPrompt}
            placeholder={mode === 'photo'
              ? '@Personnage dans #Lieu avec /style...'
              : 'Décrivez la vidéo avec /style...'
            }
            minHeight="80px"
            projectId={currentProjectId}
            mediaType={mode === 'photo' ? 'image' : 'video'}
            className="bg-white/5 border-white/10 text-base"
          />
        ) : (
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={mode === 'photo'
              ? 'Décrivez l\'image à générer...'
              : 'Décrivez la vidéo à générer...'
            }
            className="w-full min-h-[80px] px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white text-base placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 resize-none"
          />
        )}
      </div>
    </div>
  );
}
