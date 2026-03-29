'use client';

import { useState } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Scissors, Moon, Sun, Layers } from 'lucide-react';
import type { TransitionType } from '@/types/database';

interface TransitionPickerProps {
  transitionType: TransitionType;
  transitionDuration: number;
  onTransitionChange: (type: TransitionType, duration: number) => void;
  disabled?: boolean;
  className?: string;
}

const TRANSITIONS: {
  type: TransitionType;
  label: string;
  icon: typeof Scissors;
  description: string;
}[] = [
  {
    type: 'cut',
    label: 'Cut',
    icon: Scissors,
    description: 'Coupe franche, pas de transition',
  },
  {
    type: 'fadeblack',
    label: 'Fondu noir',
    icon: Moon,
    description: 'Fondu vers le noir puis vers le plan suivant',
  },
  {
    type: 'fadewhite',
    label: 'Fondu blanc',
    icon: Sun,
    description: 'Fondu vers le blanc puis vers le plan suivant',
  },
  {
    type: 'dissolve',
    label: 'Dissolve',
    icon: Layers,
    description: 'Fondu enchaîné entre les deux plans',
  },
];

const DURATION_PRESETS = [
  { value: 0.5, label: '0.5s' },
  { value: 1.0, label: '1s' },
  { value: 1.5, label: '1.5s' },
];

export function TransitionPicker({
  transitionType,
  transitionDuration,
  onTransitionChange,
  disabled = false,
  className,
}: TransitionPickerProps) {
  const [open, setOpen] = useState(false);

  const currentTransition = TRANSITIONS.find((t) => t.type === transitionType) || TRANSITIONS[0];
  const Icon = currentTransition.icon;

  const handleTypeChange = (type: TransitionType) => {
    onTransitionChange(type, transitionDuration);
  };

  const handleDurationChange = (duration: number) => {
    onTransitionChange(transitionType, duration);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className={cn(
            'flex items-center justify-center w-6 h-6 rounded-full transition-all',
            'hover:scale-110 hover:bg-white/20',
            transitionType === 'cut'
              ? 'bg-slate-600/50 text-slate-400'
              : 'bg-purple-500/70 text-white',
            disabled && 'opacity-50 cursor-not-allowed',
            className
          )}
          title={`${currentTransition.label} (${transitionDuration}s)`}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-3 bg-slate-900 border-white/10"
        align="center"
        side="top"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3">
          {/* Header */}
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Transition
          </div>

          {/* Transition types */}
          <div className="grid grid-cols-2 gap-2">
            {TRANSITIONS.map((transition) => {
              const TransIcon = transition.icon;
              const isSelected = transitionType === transition.type;
              return (
                <button
                  key={transition.type}
                  onClick={() => handleTypeChange(transition.type)}
                  className={cn(
                    'flex items-center gap-2 p-2 rounded-lg transition-colors text-left',
                    isSelected
                      ? 'bg-purple-500/30 border border-purple-500/50'
                      : 'bg-white/5 border border-white/10 hover:bg-white/10'
                  )}
                >
                  <TransIcon
                    className={cn(
                      'w-4 h-4 flex-shrink-0',
                      isSelected ? 'text-purple-400' : 'text-slate-400'
                    )}
                  />
                  <div>
                    <div
                      className={cn(
                        'text-xs font-medium',
                        isSelected ? 'text-purple-300' : 'text-white'
                      )}
                    >
                      {transition.label}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Duration (only shown for non-cut transitions) */}
          {transitionType !== 'cut' && (
            <>
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider pt-2">
                Durée
              </div>
              <div className="flex gap-2">
                {DURATION_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => handleDurationChange(preset.value)}
                    className={cn(
                      'flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors',
                      transitionDuration === preset.value
                        ? 'bg-purple-500/30 border border-purple-500/50 text-purple-300'
                        : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10'
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Description */}
          <p className="text-[10px] text-slate-500 pt-1">
            {currentTransition.description}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default TransitionPicker;
