'use client';

import { useState } from 'react';
import { ChevronDown, Check, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { TRANSITIONS_US, TRANSITIONS_FR } from '@/types/script';
import { cn } from '@/lib/utils';

interface TransitionPickerProps {
  value?: string;
  onChange: (value: string) => void;
  language?: 'en' | 'fr' | 'both';
}

// Animation CSS classes for each transition type
const TRANSITION_ANIMATIONS: Record<string, {
  animation: string;
  description: string;
  duration: string;
}> = {
  // US Transitions
  'CUT TO:': {
    animation: 'animate-cut',
    description: 'Coupe directe',
    duration: '0.1s',
  },
  'DISSOLVE TO:': {
    animation: 'animate-dissolve',
    description: 'Fondu progressif',
    duration: '1.5s',
  },
  'FADE IN:': {
    animation: 'animate-fade-in',
    description: 'Apparition progressive',
    duration: '1.5s',
  },
  'FADE OUT.': {
    animation: 'animate-fade-out',
    description: 'Disparition progressive',
    duration: '1.5s',
  },
  'FADE TO BLACK.': {
    animation: 'animate-fade-black',
    description: 'Fondu au noir',
    duration: '1.5s',
  },
  'SMASH CUT TO:': {
    animation: 'animate-smash-cut',
    description: 'Coupe violente',
    duration: '0.15s',
  },
  'MATCH CUT TO:': {
    animation: 'animate-match-cut',
    description: 'Raccord forme/mouvement',
    duration: '0.3s',
  },
  'JUMP CUT TO:': {
    animation: 'animate-jump-cut',
    description: 'Saut temporel',
    duration: '0.2s',
  },
  'WIPE TO:': {
    animation: 'animate-wipe',
    description: 'Balayage lateral',
    duration: '0.8s',
  },
  'IRIS IN:': {
    animation: 'animate-iris-in',
    description: 'Ouverture circulaire',
    duration: '1s',
  },
  'IRIS OUT:': {
    animation: 'animate-iris-out',
    description: 'Fermeture circulaire',
    duration: '1s',
  },
  // FR Transitions
  'COUPE FRANCHE': {
    animation: 'animate-cut',
    description: 'Coupe directe',
    duration: '0.1s',
  },
  'FONDU ENCHAINE': {
    animation: 'animate-dissolve',
    description: 'Fondu progressif',
    duration: '1.5s',
  },
  'OUVERTURE AU NOIR': {
    animation: 'animate-fade-in',
    description: 'Apparition progressive',
    duration: '1.5s',
  },
  'FERMETURE AU NOIR': {
    animation: 'animate-fade-out',
    description: 'Disparition progressive',
    duration: '1.5s',
  },
  'FONDU AU NOIR': {
    animation: 'animate-fade-black',
    description: 'Fondu au noir',
    duration: '1.5s',
  },
  'VOLET': {
    animation: 'animate-wipe',
    description: 'Balayage lateral',
    duration: '0.8s',
  },
};

// Add CSS animations inline via style tag
const animationStyles = `
  @keyframes cut {
    0% { opacity: 1; }
    50% { opacity: 0; }
    51% { opacity: 1; background: #1a2433; }
    100% { opacity: 1; }
  }

  @keyframes dissolve {
    0% { opacity: 1; }
    50% { opacity: 0.3; filter: blur(2px); }
    100% { opacity: 1; filter: blur(0); }
  }

  @keyframes fade-in {
    0% { opacity: 0; }
    100% { opacity: 1; }
  }

  @keyframes fade-out {
    0% { opacity: 1; }
    100% { opacity: 0; }
  }

  @keyframes fade-black {
    0% { opacity: 1; }
    50% { opacity: 0; background: #000; }
    100% { opacity: 1; }
  }

  @keyframes smash-cut {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); filter: brightness(1.5); }
    51% { transform: scale(1); filter: brightness(1); }
    100% { transform: scale(1); }
  }

  @keyframes match-cut {
    0% { transform: rotate(0deg) scale(1); }
    50% { transform: rotate(2deg) scale(1.02); }
    100% { transform: rotate(0deg) scale(1); }
  }

  @keyframes jump-cut {
    0% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    50% { transform: translateX(5px); }
    75% { transform: translateX(-2px); }
    100% { transform: translateX(0); }
  }

  @keyframes wipe {
    0% { clip-path: inset(0 100% 0 0); }
    100% { clip-path: inset(0 0 0 0); }
  }

  @keyframes iris-in {
    0% { clip-path: circle(0% at 50% 50%); }
    100% { clip-path: circle(100% at 50% 50%); }
  }

  @keyframes iris-out {
    0% { clip-path: circle(100% at 50% 50%); }
    100% { clip-path: circle(0% at 50% 50%); }
  }

  .animate-cut { animation: cut 0.3s ease-in-out; }
  .animate-dissolve { animation: dissolve 1.5s ease-in-out; }
  .animate-fade-in { animation: fade-in 1.5s ease-in-out; }
  .animate-fade-out { animation: fade-out 1.5s ease-in-out forwards; }
  .animate-fade-black { animation: fade-black 2s ease-in-out; }
  .animate-smash-cut { animation: smash-cut 0.2s ease-in-out; }
  .animate-match-cut { animation: match-cut 0.5s ease-in-out; }
  .animate-jump-cut { animation: jump-cut 0.3s ease-in-out; }
  .animate-wipe { animation: wipe 0.8s ease-in-out; }
  .animate-iris-in { animation: iris-in 1s ease-in-out; }
  .animate-iris-out { animation: iris-out 1s ease-in-out; }
`;

function TransitionPreview({
  transition,
  isPlaying
}: {
  transition: string;
  isPlaying: boolean;
}) {
  const config = TRANSITION_ANIMATIONS[transition];

  return (
    <div className="relative w-full aspect-video bg-gradient-to-br from-slate-700 to-slate-800 rounded overflow-hidden">
      {/* Scene A */}
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center",
          isPlaying && config?.animation
        )}
        key={isPlaying ? 'playing' : 'idle'}
      >
        <span className="text-white/50 text-xs font-mono">SCENE A</span>
      </div>

      {/* Overlay effect for certain transitions */}
      {isPlaying && transition.includes('BLACK') && (
        <div className="absolute inset-0 bg-black animate-pulse" />
      )}
    </div>
  );
}

function TransitionCard({
  transition,
  isSelected,
  onSelect,
}: {
  transition: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const config = TRANSITION_ANIMATIONS[transition];

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPlaying(true);
    setTimeout(() => setIsPlaying(false), 2000);
  };

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group relative p-3 rounded-lg border cursor-pointer transition-all",
        isSelected
          ? "border-purple-500 bg-purple-500/20"
          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
      )}
    >
      {/* Preview */}
      <div className="relative mb-2">
        <TransitionPreview transition={transition} isPlaying={isPlaying} />

        {/* Play button */}
        <button
          onClick={handlePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
            <Play className="w-4 h-4 text-white fill-white" />
          </div>
        </button>
      </div>

      {/* Label */}
      <div className="flex items-center gap-2">
        {isSelected && <Check className="w-4 h-4 text-purple-400 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-sm font-medium truncate",
            isSelected ? "text-purple-300" : "text-white"
          )}>
            {transition}
          </p>
          {config && (
            <p className="text-xs text-slate-500 truncate">{config.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function TransitionPicker({
  value,
  onChange,
  language = 'both',
}: TransitionPickerProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (transition: string) => {
    onChange(transition);
    setOpen(false);
  };

  const showUS = language === 'en' || language === 'both';
  const showFR = language === 'fr' || language === 'both';

  return (
    <>
      {/* Inject animation styles */}
      <style dangerouslySetInnerHTML={{ __html: animationStyles }} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between bg-white/5 border-white/10 text-white hover:bg-white/10"
          >
            <span className={cn(!value && 'text-slate-400')}>
              {value || 'Choisir une transition...'}
            </span>
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-[#1a2433] border-white/10 max-w-3xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-white">Choisir une transition</DialogTitle>
          </DialogHeader>

          <div className="overflow-y-auto max-h-[60vh] pr-2 -mr-2">
            {showUS && (
              <div className="mb-6">
                <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
                  Transitions (US)
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  {TRANSITIONS_US.map((transition) => (
                    <TransitionCard
                      key={transition}
                      transition={transition}
                      isSelected={value === transition}
                      onSelect={() => handleSelect(transition)}
                    />
                  ))}
                </div>
              </div>
            )}

            {showFR && (
              <div>
                <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
                  Transitions (FR)
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  {TRANSITIONS_FR.map((transition) => (
                    <TransitionCard
                      key={transition}
                      transition={transition}
                      isSelected={value === transition}
                      onSelect={() => handleSelect(transition)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
