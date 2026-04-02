'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LightingSelector } from './presets/LightingSelector';
import { CameraSelector } from './presets/CameraSelector';
import { ColorGradeSelector } from './presets/ColorGradeSelector';
import { ToneSelector } from './presets/ToneSelector';
import { cinematicHeaderToPrompt, createDefaultCinematicHeader } from '@/lib/cinematic-header-to-prompt';
import {
  Sparkles, Pencil, FileText, Copy, Check, MessageSquare,
  Clock, Sun, Camera, Heart, Palette,
  Sunrise, Sunset, Moon, CloudSun, Cloud, CloudFog, CloudRain, CloudLightning, CircleDot
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Segment } from '@/types/cinematic';
import { toast } from 'sonner';
import type {
  CinematicHeaderConfig,
  TimeOfDayCinematic,
  Weather,
} from '@/types/cinematic';

interface CinematicHeaderWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: CinematicHeaderConfig | null;
  onChange: (config: CinematicHeaderConfig) => void;
  projectId: string;
  segments?: Segment[];
}

// Check if a config has all required fields
function isValidConfig(config: CinematicHeaderConfig | null | undefined): config is CinematicHeaderConfig {
  return !!(
    config &&
    config.lighting?.type &&
    config.camera?.type &&
    config.color_grade?.style &&
    config.tone?.genre
  );
}

export function CinematicHeaderWizard({
  open,
  onOpenChange,
  value,
  onChange,
  projectId,
  segments = [],
}: CinematicHeaderWizardProps) {
  // Local state for editing - ensure we have valid defaults
  const [config, setConfig] = useState<CinematicHeaderConfig>(
    isValidConfig(value) ? value : createDefaultCinematicHeader()
  );

  // View mode state
  const [viewMode, setViewMode] = useState<'edit' | 'prompt'>('edit');
  const [activeTab, setActiveTab] = useState<'tone' | 'time' | 'lighting' | 'camera' | 'color'>('tone');
  const [copied, setCopied] = useState(false);

  // Sync with external value when dialog opens
  useEffect(() => {
    if (open) {
      setConfig(isValidConfig(value) ? value : createDefaultCinematicHeader());
    }
  }, [open, value]);

  // Generate prompt preview (header only)
  const headerPrompt = useMemo(() => {
    return cinematicHeaderToPrompt(config);
  }, [config]);

  // Generate full prompt with segments
  const fullPrompt = useMemo(() => {
    const lines: string[] = [];

    // Header
    lines.push('=== CINEMATIC STYLE ===');
    lines.push(headerPrompt);

    // Segments
    if (segments.length > 0) {
      lines.push('');
      lines.push('=== SHOTS ===');
      segments.forEach((segment, index) => {
        const shotNum = index + 1;
        const startMins = Math.floor(segment.start_time / 60);
        const startSecs = Math.floor(segment.start_time % 60);
        const endMins = Math.floor(segment.end_time / 60);
        const endSecs = Math.floor(segment.end_time % 60);
        const startTime = `${startMins}:${startSecs.toString().padStart(2, '0')}`;
        const endTime = `${endMins}:${endSecs.toString().padStart(2, '0')}`;

        // Build shot type: "MEDIUM TWO-SHOT" or just "MEDIUM"
        const framing = segment.shot_framing?.replace(/_/g, ' ').toUpperCase() || 'MEDIUM';
        const composition = segment.shot_composition && segment.shot_composition !== 'single'
          ? ` ${segment.shot_composition.replace(/_/g, ' ').toUpperCase()}`
          : '';
        const shotType = `${framing}${composition}`;

        // Extract subject from description or first beat
        let subject = segment.description?.match(/[@#!][A-Za-z][A-Za-z0-9_]*/)?.[0];
        if (!subject && segment.beats?.length) {
          const firstBeatWithChar = segment.beats.find(b => b.character_name);
          if (firstBeatWithChar?.character_name) {
            subject = `@${firstBeatWithChar.character_name}`;
          }
        }

        lines.push('');
        lines.push(`SHOT ${shotNum} (${startTime}–${endTime}) — ${shotType}${subject ? `, ${subject}` : ''}:`);
        lines.push('');

        if (segment.description) {
          lines.push(segment.description);
          lines.push('');
        }

        // Render beats
        if (segment.beats?.length) {
          for (const beat of segment.beats) {
            if (!beat.content) continue;

            let beatLine = '';
            if (beat.type === 'dialogue') {
              const tone = beat.tone && beat.tone !== 'neutral' ? ` ${beat.tone}` : '';
              const offScreen = beat.presence === 'off' ? ' (off)' : '';
              if (beat.character_name) {
                beatLine = `${beat.character_name}${offScreen} says${tone}:\n"${beat.content}"`;
              } else {
                beatLine = `Says${offScreen}${tone}: "${beat.content}"`;
              }
            } else {
              // Action beat
              if (beat.character_name) {
                beatLine = `${beat.character_name} ${beat.content}`;
              } else {
                beatLine = beat.content;
              }
              if (beatLine && !/[.!?]$/.test(beatLine)) {
                beatLine += '.';
              }
            }

            if (beatLine) {
              lines.push(beatLine);
              lines.push('');
            }
          }
        }

        // Camera
        if (segment.camera_movement && segment.camera_movement !== 'static') {
          lines.push(`Camera: ${segment.camera_movement.replace(/_/g, ' ')}.`);
        }
      });
    }

    return lines.join('\n');
  }, [headerPrompt, segments]);

  // Copy prompt to clipboard
  const copyPrompt = () => {
    navigator.clipboard.writeText(fullPrompt);
    setCopied(true);
    toast.success('Prompt copié !');
    setTimeout(() => setCopied(false), 2000);
  };

  // Apply changes
  const handleApply = () => {
    onChange(config);
    onOpenChange(false);
    toast.success('Style cinématique appliqué');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] bg-[#0f1419] border-white/10 overflow-hidden flex flex-col [&>button]:hidden">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              Description cinématique
            </DialogTitle>

            {/* Edit/Prompt Toggle */}
            <div className="inline-flex rounded-lg bg-slate-800/50 p-0.5">
              <button
                onClick={() => setViewMode('edit')}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5',
                  viewMode === 'edit'
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                onClick={() => setViewMode('prompt')}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5',
                  viewMode === 'prompt'
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                <FileText className="w-3.5 h-3.5" />
                Prompt
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col min-h-[400px]">
          {viewMode === 'edit' ? (
            <>
              {/* Category Tabs */}
              <div className="px-4 py-3 border-b border-white/10 flex-shrink-0">
                <div className="inline-flex rounded-lg bg-slate-800/50 p-1 gap-1">
                  {[
                    { id: 'tone' as const, label: 'Genre', icon: Heart },
                    { id: 'time' as const, label: 'Temporalité', icon: Clock },
                    { id: 'lighting' as const, label: 'Éclairage', icon: Sun },
                    { id: 'camera' as const, label: 'Caméra', icon: Camera },
                    { id: 'color' as const, label: 'Colorimétrie', icon: Palette },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        'px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2',
                        activeTab === tab.id
                          ? 'bg-slate-700 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                      )}
                    >
                      <tab.icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Content - Fixed height to prevent resize on tab change */}
              <div className="h-[380px] overflow-y-auto p-6">
                {activeTab === 'time' && (
                  <div className="space-y-6">
                    {/* Time of Day */}
                    <div className="grid grid-cols-4 gap-3">
                        {[
                          { value: 'dawn', label: 'Aube', icon: Sunrise, color: 'text-orange-300' },
                          { value: 'morning', label: 'Matin', icon: CloudSun, color: 'text-yellow-300' },
                          { value: 'midday', label: 'Midi', icon: Sun, color: 'text-yellow-400' },
                          { value: 'afternoon', label: 'Après-midi', icon: Sun, color: 'text-amber-400' },
                          { value: 'golden_hour', label: 'Golden Hour', icon: Sunset, color: 'text-orange-400' },
                          { value: 'dusk', label: 'Crépuscule', icon: Sunset, color: 'text-purple-400' },
                          { value: 'blue_hour', label: 'Blue Hour', icon: Moon, color: 'text-blue-400' },
                          { value: 'night', label: 'Nuit', icon: Moon, color: 'text-indigo-400' },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setConfig({ ...config, time_of_day: opt.value as TimeOfDayCinematic })}
                            className={cn(
                              'flex flex-col items-center gap-2 p-4 rounded-xl border transition-all',
                              config.time_of_day === opt.value
                                ? 'bg-blue-500/20 border-blue-500/50'
                                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                            )}
                          >
                            <opt.icon className={cn('w-8 h-8', config.time_of_day === opt.value ? 'text-blue-300' : opt.color)} />
                            <span className={cn(
                              'text-xs font-medium',
                              config.time_of_day === opt.value ? 'text-blue-300' : 'text-slate-400'
                            )}>
                              {opt.label}
                            </span>
                          </button>
                        ))}
                    </div>

                    {/* Weather */}
                    <div className="grid grid-cols-7 gap-2">
                        {[
                          { value: undefined, label: 'Aucune', icon: CircleDot, color: 'text-slate-500' },
                          { value: 'clear', label: 'Clair', icon: Sun, color: 'text-yellow-400' },
                          { value: 'cloudy', label: 'Nuageux', icon: CloudSun, color: 'text-slate-300' },
                          { value: 'overcast', label: 'Couvert', icon: Cloud, color: 'text-slate-400' },
                          { value: 'fog', label: 'Brouillard', icon: CloudFog, color: 'text-slate-400' },
                          { value: 'rain', label: 'Pluie', icon: CloudRain, color: 'text-blue-400' },
                          { value: 'storm', label: 'Orage', icon: CloudLightning, color: 'text-purple-400' },
                        ].map((opt) => (
                          <button
                            key={opt.value || 'none'}
                            onClick={() => setConfig({ ...config, weather: opt.value as Weather | undefined })}
                            className={cn(
                              'flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all',
                              config.weather === opt.value || (!config.weather && !opt.value)
                                ? 'bg-blue-500/20 border-blue-500/50'
                                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                            )}
                          >
                            <opt.icon className={cn(
                              'w-5 h-5',
                              config.weather === opt.value || (!config.weather && !opt.value) ? 'text-blue-300' : opt.color
                            )} />
                            <span className={cn(
                              'text-[10px] font-medium',
                              config.weather === opt.value || (!config.weather && !opt.value) ? 'text-blue-300' : 'text-slate-500'
                            )}>
                              {opt.label}
                            </span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                {activeTab === 'lighting' && (
                  <div className="max-w-2xl">
                    <LightingSelector
                      value={config.lighting}
                      onChange={(lighting) => setConfig({ ...config, lighting })}
                    />
                  </div>
                )}

                {activeTab === 'camera' && (
                  <div className="max-w-2xl">
                    <CameraSelector
                      value={config.camera}
                      onChange={(camera) => setConfig({ ...config, camera })}
                    />
                  </div>
                )}

                {activeTab === 'tone' && (
                  <div className="max-w-2xl">
                    <ToneSelector
                      value={config.tone}
                      onChange={(tone) => setConfig({ ...config, tone })}
                    />
                  </div>
                )}

                {activeTab === 'color' && (
                  <div className="max-w-2xl">
                    <ColorGradeSelector
                      value={config.color_grade}
                      onChange={(color_grade) => setConfig({ ...config, color_grade })}
                    />
                  </div>
                )}
              </div>

              {/* Notes - Common to all tabs */}
              <div className="px-6 py-3 border-t border-white/10 flex-shrink-0">
                <div className="flex items-start gap-3">
                  <MessageSquare className="w-4 h-4 text-slate-500 mt-2 flex-shrink-0" />
                  <Textarea
                    value={config.additional_notes || ''}
                    onChange={(e) => setConfig({ ...config, additional_notes: e.target.value || undefined })}
                    placeholder="Notes additionnelles... (ex: ambiance Blade Runner, style Wes Anderson, néons roses)"
                    className="bg-white/5 border-white/10 text-white text-sm resize-none h-16 placeholder:text-slate-500"
                  />
                </div>
              </div>
            </>
          ) : (
            /* Prompt View */
            <div className="h-full flex flex-col p-4 space-y-3">
              <div className="flex items-center justify-between flex-shrink-0">
                <Label className="text-slate-300 text-sm">Prompt final (style + shots)</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyPrompt}
                  className="h-7 text-xs border-white/10 text-slate-400 hover:text-white"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1.5 text-green-400" />
                      Copié
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                      Copier
                    </>
                  )}
                </Button>
              </div>
              <div className="flex-1 p-4 bg-slate-950/50 rounded-lg border border-white/10 overflow-y-auto">
                <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                  {fullPrompt}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-white/10">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-white/10"
          >
            Annuler
          </Button>
          <Button
            onClick={handleApply}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Appliquer
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
