'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Loader2, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PromptWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSubject?: string; // Pre-filled from @mentions
  initialLocation?: string; // Pre-filled from #mentions
  onPromptGenerated: (prompt: string) => void;
  projectId: string;
}

// Style options
const STYLES = [
  { value: 'photorealistic', label: 'Photo realiste', icon: '📷' },
  { value: 'cinematic', label: 'Cinematique', icon: '🎬' },
  { value: 'editorial', label: 'Editorial', icon: '📰' },
  { value: 'fine_art', label: 'Fine Art', icon: '🎨' },
  { value: 'cartoon', label: 'Cartoon', icon: '🖌️' },
  { value: 'anime', label: 'Anime', icon: '✨' },
  { value: 'illustration', label: 'Illustration', icon: '🖼️' },
  { value: '3d_render', label: '3D Render', icon: '🎮' },
] as const;

// Time of day options
const TIME_OF_DAY = [
  { value: 'golden_hour', label: 'Golden Hour', description: 'Lumiere doree, coucher/lever de soleil' },
  { value: 'blue_hour', label: 'Blue Hour', description: 'Lumiere bleue, aube/crepuscule' },
  { value: 'day', label: 'Jour', description: 'Lumiere naturelle du jour' },
  { value: 'night', label: 'Nuit', description: 'Eclairage nocturne, lumieres artificielles' },
  { value: 'overcast', label: 'Ciel couvert', description: 'Lumiere douce et diffuse' },
  { value: 'studio', label: 'Studio', description: 'Eclairage controle, fond neutre' },
] as const;

// Framing options
const FRAMING = [
  { value: 'extreme_closeup', label: 'Tres gros plan', description: 'Visage, details' },
  { value: 'closeup', label: 'Gros plan', description: 'Tete et epaules' },
  { value: 'medium', label: 'Plan moyen', description: 'Mi-corps' },
  { value: 'full', label: 'Plan pied', description: 'Corps entier' },
  { value: 'wide', label: 'Plan large', description: 'Sujet dans son environnement' },
  { value: 'extreme_wide', label: 'Plan tres large', description: 'Paysage, contexte' },
] as const;

// Mood options
const MOODS = [
  { value: 'joyful', label: 'Joyeux', emoji: '😊' },
  { value: 'melancholic', label: 'Melancolique', emoji: '😔' },
  { value: 'mysterious', label: 'Mysterieux', emoji: '🌙' },
  { value: 'dramatic', label: 'Dramatique', emoji: '🎭' },
  { value: 'peaceful', label: 'Paisible', emoji: '🌸' },
  { value: 'energetic', label: 'Energique', emoji: '⚡' },
  { value: 'romantic', label: 'Romantique', emoji: '💕' },
  { value: 'dark', label: 'Sombre', emoji: '🖤' },
] as const;

// Camera angle options
const CAMERA_ANGLES = [
  { value: 'eye_level', label: 'Hauteur d\'oeil' },
  { value: 'low_angle', label: 'Contre-plongee' },
  { value: 'high_angle', label: 'Plongee' },
  { value: 'dutch_angle', label: 'Angle hollandais' },
  { value: 'overhead', label: 'Vue aerienne' },
] as const;

type WizardStep = 'subject' | 'style' | 'composition' | 'mood' | 'review';

interface WizardData {
  subject: string;
  action: string;
  location: string;
  style: string;
  timeOfDay: string;
  framing: string;
  cameraAngle: string;
  mood: string;
  additionalDetails: string;
}

export function PromptWizard({
  open,
  onOpenChange,
  initialSubject = '',
  initialLocation = '',
  onPromptGenerated,
  projectId,
}: PromptWizardProps) {
  const [step, setStep] = useState<WizardStep>('subject');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState('');

  const [data, setData] = useState<WizardData>({
    subject: initialSubject,
    action: '',
    location: initialLocation,
    style: 'photorealistic',
    timeOfDay: 'golden_hour',
    framing: 'medium',
    cameraAngle: 'eye_level',
    mood: 'peaceful',
    additionalDetails: '',
  });

  const updateData = (key: keyof WizardData, value: string) => {
    setData(prev => ({ ...prev, [key]: value }));
  };

  const steps: WizardStep[] = ['subject', 'style', 'composition', 'mood', 'review'];
  const currentStepIndex = steps.indexOf(step);

  const canProceed = () => {
    switch (step) {
      case 'subject':
        return data.subject.trim().length > 0;
      case 'style':
        return data.style.length > 0;
      case 'composition':
        return data.framing.length > 0;
      case 'mood':
        return data.mood.length > 0;
      default:
        return true;
    }
  };

  const goNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      if (steps[nextIndex] === 'review') {
        generatePrompt();
      }
      setStep(steps[nextIndex]);
    }
  };

  const goPrev = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setStep(steps[prevIndex]);
    }
  };

  const generatePrompt = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        const result = await res.json();
        setGeneratedPrompt(result.prompt);
      } else {
        // Fallback: generate locally
        setGeneratedPrompt(buildLocalPrompt(data));
      }
    } catch {
      // Fallback: generate locally
      setGeneratedPrompt(buildLocalPrompt(data));
    } finally {
      setIsGenerating(false);
    }
  };

  const buildLocalPrompt = (d: WizardData): string => {
    const parts: string[] = [];

    // Style prefix
    const styleMap: Record<string, string> = {
      photorealistic: 'Photorealistic photograph of',
      cinematic: 'Cinematic shot of',
      editorial: 'Editorial fashion photograph of',
      fine_art: 'Fine art portrait of',
      cartoon: 'Cartoon style illustration of',
      anime: 'Anime style illustration of',
      illustration: 'Digital illustration of',
      '3d_render': '3D rendered image of',
    };
    parts.push(styleMap[d.style] || 'Image of');

    // Subject and action
    if (d.subject) {
      parts.push(d.subject);
      if (d.action) {
        parts.push(d.action);
      }
    }

    // Location
    if (d.location) {
      parts.push(`in ${d.location}`);
    }

    // Time of day
    const timeMap: Record<string, string> = {
      golden_hour: 'during golden hour, warm sunlight',
      blue_hour: 'during blue hour, soft twilight',
      day: 'in natural daylight',
      night: 'at night, artificial lighting',
      overcast: 'under overcast sky, soft diffused light',
      studio: 'in a professional studio setting',
    };
    if (timeMap[d.timeOfDay]) {
      parts.push(timeMap[d.timeOfDay]);
    }

    // Framing
    const framingMap: Record<string, string> = {
      extreme_closeup: 'extreme close-up shot',
      closeup: 'close-up portrait',
      medium: 'medium shot',
      full: 'full body shot',
      wide: 'wide angle shot',
      extreme_wide: 'extreme wide landscape shot',
    };
    if (framingMap[d.framing]) {
      parts.push(framingMap[d.framing]);
    }

    // Camera angle
    const angleMap: Record<string, string> = {
      eye_level: '',
      low_angle: 'shot from low angle',
      high_angle: 'shot from high angle',
      dutch_angle: 'dutch angle',
      overhead: 'overhead shot',
    };
    if (angleMap[d.cameraAngle]) {
      parts.push(angleMap[d.cameraAngle]);
    }

    // Mood
    const moodMap: Record<string, string> = {
      joyful: 'joyful and bright atmosphere',
      melancholic: 'melancholic and contemplative mood',
      mysterious: 'mysterious and enigmatic atmosphere',
      dramatic: 'dramatic and intense mood',
      peaceful: 'peaceful and serene atmosphere',
      energetic: 'energetic and dynamic mood',
      romantic: 'romantic and soft atmosphere',
      dark: 'dark and moody atmosphere',
    };
    if (moodMap[d.mood]) {
      parts.push(moodMap[d.mood]);
    }

    // Additional details
    if (d.additionalDetails) {
      parts.push(d.additionalDetails);
    }

    // Quality tags
    parts.push('high quality, detailed, professional');

    return parts.filter(Boolean).join(', ');
  };

  const handleUsePrompt = () => {
    onPromptGenerated(generatedPrompt);
    onOpenChange(false);
    // Reset for next time
    setStep('subject');
    setGeneratedPrompt('');
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {steps.map((s, i) => (
        <div
          key={s}
          className={cn(
            'w-2 h-2 rounded-full transition-colors',
            i <= currentStepIndex ? 'bg-blue-500' : 'bg-white/20'
          )}
        />
      ))}
    </div>
  );

  const renderSubjectStep = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-slate-300">Qui ou quoi ? *</Label>
        <Textarea
          value={data.subject}
          onChange={(e) => updateData('subject', e.target.value)}
          placeholder="@Morgana, une jeune femme aux cheveux roux..."
          className="bg-white/5 border-white/10 text-white min-h-[80px]"
        />
        <p className="text-xs text-slate-500">
          Utilisez @Personnage ou #Lieu pour referencer la Bible
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-slate-300">Que fait le sujet ?</Label>
        <Textarea
          value={data.action}
          onChange={(e) => updateData('action', e.target.value)}
          placeholder="regarde vers l'horizon, les cheveux au vent..."
          className="bg-white/5 border-white/10 text-white min-h-[60px]"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-slate-300">Ou ?</Label>
        <Textarea
          value={data.location}
          onChange={(e) => updateData('location', e.target.value)}
          placeholder="#LaPlage, une plage deserte au coucher du soleil..."
          className="bg-white/5 border-white/10 text-white min-h-[60px]"
        />
      </div>
    </div>
  );

  const renderStyleStep = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-slate-300">Style visuel *</Label>
        <div className="grid grid-cols-2 gap-2">
          {STYLES.map((style) => (
            <button
              key={style.value}
              type="button"
              onClick={() => updateData('style', style.value)}
              className={cn(
                'p-3 rounded-lg border text-left transition-all',
                data.style === style.value
                  ? 'bg-blue-500/20 border-blue-500 text-white'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
              )}
            >
              <span className="text-lg mr-2">{style.icon}</span>
              <span className="text-sm font-medium">{style.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderCompositionStep = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label className="text-slate-300">Cadrage *</Label>
        <div className="grid grid-cols-2 gap-2">
          {FRAMING.map((frame) => (
            <button
              key={frame.value}
              type="button"
              onClick={() => updateData('framing', frame.value)}
              className={cn(
                'p-2 rounded-lg border text-left transition-all',
                data.framing === frame.value
                  ? 'bg-blue-500/20 border-blue-500 text-white'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
              )}
            >
              <div className="text-sm font-medium">{frame.label}</div>
              <div className="text-xs text-slate-500">{frame.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-slate-300">Angle de camera</Label>
        <div className="flex flex-wrap gap-2">
          {CAMERA_ANGLES.map((angle) => (
            <button
              key={angle.value}
              type="button"
              onClick={() => updateData('cameraAngle', angle.value)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm transition-all',
                data.cameraAngle === angle.value
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10'
              )}
            >
              {angle.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-slate-300">Lumiere / Moment</Label>
        <div className="grid grid-cols-2 gap-2">
          {TIME_OF_DAY.map((time) => (
            <button
              key={time.value}
              type="button"
              onClick={() => updateData('timeOfDay', time.value)}
              className={cn(
                'p-2 rounded-lg border text-left transition-all',
                data.timeOfDay === time.value
                  ? 'bg-blue-500/20 border-blue-500 text-white'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
              )}
            >
              <div className="text-sm font-medium">{time.label}</div>
              <div className="text-xs text-slate-500">{time.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderMoodStep = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label className="text-slate-300">Ambiance / Mood *</Label>
        <div className="grid grid-cols-2 gap-2">
          {MOODS.map((mood) => (
            <button
              key={mood.value}
              type="button"
              onClick={() => updateData('mood', mood.value)}
              className={cn(
                'p-3 rounded-lg border text-left transition-all',
                data.mood === mood.value
                  ? 'bg-blue-500/20 border-blue-500 text-white'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
              )}
            >
              <span className="text-lg mr-2">{mood.emoji}</span>
              <span className="text-sm font-medium">{mood.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-slate-300">Details supplementaires</Label>
        <Textarea
          value={data.additionalDetails}
          onChange={(e) => updateData('additionalDetails', e.target.value)}
          placeholder="Cheveux au vent, reflets dores sur la peau, regard pensif..."
          className="bg-white/5 border-white/10 text-white min-h-[80px]"
        />
      </div>
    </div>
  );

  const renderReviewStep = () => (
    <div className="space-y-4">
      {isGenerating ? (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <span className="text-slate-400">Generation du prompt optimal...</span>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label className="text-slate-300">Prompt genere</Label>
            <Textarea
              value={generatedPrompt}
              onChange={(e) => setGeneratedPrompt(e.target.value)}
              className="bg-white/5 border-white/10 text-white min-h-[120px]"
            />
            <p className="text-xs text-slate-500">
              Vous pouvez modifier le prompt avant de l'utiliser
            </p>
          </div>

          <Button
            onClick={handleUsePrompt}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Utiliser ce prompt
          </Button>
        </>
      )}
    </div>
  );

  const renderCurrentStep = () => {
    switch (step) {
      case 'subject':
        return renderSubjectStep();
      case 'style':
        return renderStyleStep();
      case 'composition':
        return renderCompositionStep();
      case 'mood':
        return renderMoodStep();
      case 'review':
        return renderReviewStep();
    }
  };

  const stepTitles: Record<WizardStep, string> = {
    subject: 'Sujet',
    style: 'Style',
    composition: 'Composition',
    mood: 'Ambiance',
    review: 'Prompt final',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d1829] border-white/10 text-white max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-blue-400" />
            Assistant de composition - {stepTitles[step]}
          </DialogTitle>
        </DialogHeader>

        {renderStepIndicator()}

        <div className="py-2">
          {renderCurrentStep()}
        </div>

        {step !== 'review' && (
          <div className="flex justify-between pt-4 border-t border-white/10">
            <Button
              variant="ghost"
              onClick={goPrev}
              disabled={currentStepIndex === 0}
              className="text-slate-400 hover:text-white"
            >
              Precedent
            </Button>
            <Button
              onClick={goNext}
              disabled={!canProceed()}
              className="bg-blue-500 hover:bg-blue-600"
            >
              {step === 'mood' ? 'Generer le prompt' : 'Suivant'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
