'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LightingSelector } from './presets/LightingSelector';
import { CameraSelector } from './presets/CameraSelector';
import { ColorGradeSelector } from './presets/ColorGradeSelector';
import { ToneSelector } from './presets/ToneSelector';
import { cinematicHeaderToPrompt, createDefaultCinematicHeader, createGenrePreset } from '@/lib/cinematic-header-to-prompt';
import {
  Loader2, Save, Sparkles, BookOpen, Pencil, FileText, Copy, Check,
  Clock, Sun, Camera, Heart, Palette,
  Sunrise, Sunset, Moon, CloudSun, Cloud, CloudFog, CloudRain, CloudLightning, CircleDot
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Segment } from '@/types/cinematic';
import { toast } from 'sonner';
import type {
  CinematicHeaderConfig,
  CinematicPreset,
  TimeOfDayCinematic,
  Weather,
  ToneGenre,
} from '@/types/cinematic';
import { TIME_OF_DAY_OPTIONS, GENRE_OPTIONS } from '@/types/cinematic';

interface CinematicHeaderWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: CinematicHeaderConfig | null;
  onChange: (config: CinematicHeaderConfig) => void;
  projectId: string;
  segments?: Segment[];
}

const WEATHER_OPTIONS: { value: Weather; label: string }[] = [
  { value: 'clear', label: 'Clair' },
  { value: 'cloudy', label: 'Nuageux' },
  { value: 'overcast', label: 'Couvert' },
  { value: 'rain', label: 'Pluie' },
  { value: 'fog', label: 'Brouillard' },
  { value: 'storm', label: 'Orage' },
];

// Check if a config has all required fields
function isValidConfig(config: CinematicHeaderConfig | null | undefined): config is CinematicHeaderConfig {
  return !!(
    config &&
    config.lighting?.type &&
    config.camera?.type &&
    config.color_grade?.temperature &&
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
  const [activeTab, setActiveTab] = useState<'time' | 'lighting' | 'camera' | 'tone' | 'color'>('time');
  const [copied, setCopied] = useState(false);

  // Presets state
  const [presets, setPresets] = useState<CinematicPreset[]>([]);
  const [isLoadingPresets, setIsLoadingPresets] = useState(false);
  const [savePresetName, setSavePresetName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isSavingPreset, setIsSavingPreset] = useState(false);

  // Sync with external value when dialog opens
  useEffect(() => {
    if (open) {
      setConfig(isValidConfig(value) ? value : createDefaultCinematicHeader());
    }
  }, [open, value]);

  // Load presets
  useEffect(() => {
    if (open) {
      loadPresets();
    }
  }, [open, projectId]);

  const loadPresets = async () => {
    setIsLoadingPresets(true);
    try {
      const res = await fetch(`/api/cinematic-presets?project_id=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setPresets(data.presets || []);
      }
    } catch (error) {
      console.error('Error loading presets:', error);
    } finally {
      setIsLoadingPresets(false);
    }
  };

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

        const shotType = segment.shot_type?.toUpperCase() || 'MEDIUM';
        const subject = segment.description?.match(/[@#!][A-Za-z][A-Za-z0-9_]*/)?.[0] || 'subject';

        lines.push('');
        lines.push(`SHOT ${shotNum} (${startTime}–${endTime}) — ${shotType}, ${subject}:`);
        if (segment.description) lines.push(segment.description);
        if (segment.camera_movement && segment.camera_movement !== 'static') {
          lines.push(`Camera: ${segment.camera_movement.replace(/_/g, ' ')}`);
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

  // Apply a preset
  const applyPreset = (preset: CinematicPreset) => {
    setConfig({
      ...preset.config,
      preset_id: preset.id,
      preset_name: preset.name,
    });
    toast.success(`Preset "${preset.name}" appliqué`);
  };

  // Apply genre preset
  const applyGenrePreset = (genre: ToneGenre) => {
    const preset = createGenrePreset(genre);
    setConfig(preset);
    toast.success(`Style ${GENRE_OPTIONS.find(g => g.value === genre)?.label} appliqué`);
  };

  // Save as preset
  const handleSavePreset = async () => {
    if (!savePresetName.trim()) {
      toast.error('Entrez un nom pour le preset');
      return;
    }

    setIsSavingPreset(true);
    try {
      const res = await fetch('/api/cinematic-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: savePresetName.trim(),
          config,
          project_id: projectId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPresets([data.preset, ...presets]);
        setConfig({
          ...config,
          preset_id: data.preset.id,
          preset_name: data.preset.name,
        });
        setSavePresetName('');
        setShowSaveDialog(false);
        toast.success('Preset sauvegardé');
      } else {
        toast.error('Erreur lors de la sauvegarde');
      }
    } catch (error) {
      console.error('Error saving preset:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSavingPreset(false);
    }
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
              Composer le style cinématique
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
              {/* Presets Section */}
              <div className="px-4 py-3 border-b border-white/10 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-slate-400" />
                    <Label className="text-slate-300 text-sm">Presets</Label>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-white/10"
                    onClick={() => setShowSaveDialog(true)}
                  >
                    <Save className="w-3 h-3 mr-1" />
                    Sauvegarder
                  </Button>
                </div>

                {isLoadingPresets ? (
                  <div className="flex items-center gap-2 py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    <span className="text-xs text-slate-500">Chargement...</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {/* Genre quick presets */}
                    {GENRE_OPTIONS.slice(0, 4).map((genre) => (
                      <button
                        key={genre.value}
                        onClick={() => applyGenrePreset(genre.value)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                          "border-white/10 text-slate-400 hover:border-amber-500/30 hover:text-amber-400 hover:bg-amber-500/10"
                        )}
                      >
                        {genre.label}
                      </button>
                    ))}

                    {/* Saved presets */}
                    {presets.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => applyPreset(preset)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                          config.preset_id === preset.id
                            ? "border-blue-500/50 text-blue-400 bg-blue-500/10"
                            : "border-white/10 text-slate-400 hover:border-blue-500/30 hover:text-blue-400"
                        )}
                      >
                        {preset.name}
                      </button>
                    ))}

                    {presets.length === 0 && (
                      <span className="text-xs text-slate-500 py-1">
                        Aucun preset sauvegardé
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Category Tabs */}
              <div className="px-4 py-3 border-b border-white/10 flex-shrink-0">
                <div className="inline-flex rounded-lg bg-slate-800/50 p-1 gap-1">
                  {[
                    { id: 'time' as const, label: 'Temporalité', icon: Clock },
                    { id: 'lighting' as const, label: 'Éclairage', icon: Sun },
                    { id: 'camera' as const, label: 'Caméra', icon: Camera },
                    { id: 'tone' as const, label: 'Tone & Mood', icon: Heart },
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
              <div className="h-[320px] overflow-y-auto p-6">
                {activeTab === 'time' && (
                  <div className="space-y-6">
                    {/* Time of Day */}
                    <div className="space-y-3">
                      <Label className="text-slate-300 font-medium text-sm">Moment de la journée</Label>
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
                    </div>

                    {/* Weather */}
                    <div className="space-y-3">
                      <Label className="text-slate-300 font-medium text-sm">Météo</Label>
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

        {/* Save Preset Dialog */}
        {showSaveDialog && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-[#1a2433] border border-white/10 rounded-lg p-4 w-80">
              <h3 className="text-white font-medium mb-3">Sauvegarder le preset</h3>
              <Input
                value={savePresetName}
                onChange={(e) => setSavePresetName(e.target.value)}
                placeholder="Nom du preset..."
                className="bg-white/5 border-white/10 text-white mb-3"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowSaveDialog(false);
                    setSavePresetName('');
                  }}
                  className="border-white/10"
                >
                  Annuler
                </Button>
                <Button
                  size="sm"
                  onClick={handleSavePreset}
                  disabled={isSavingPreset || !savePresetName.trim()}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isSavingPreset ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Sauvegarder'
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
