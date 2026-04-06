'use client';

import { useState, useEffect, useMemo } from 'react';
import { generateReferenceName } from '@/lib/reference-name';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MentionInput } from '@/components/ui/mention-input';
import { LightingSelector } from './presets/LightingSelector';
import { ColorGradeSelector } from './presets/ColorGradeSelector';
import { CinematicStyleSelector } from './presets/CinematicStyleSelector';
import { cinematicHeaderToPrompt, createDefaultCinematicHeader, getStyleBibleFromCinematicStyle } from '@/lib/cinematic-header-to-prompt';
import { analyzeCharacters, type PromptCharacter, type CharacterAnalysis, type VideoModelType } from '@/lib/ai/cinematic-prompt-builder';
import {
  Sparkles, Pencil, FileText, Copy, Check, MessageSquare,
  Clock, Sun, Camera, Palette, MapPin, Home, Trees, Car,
  Sunrise, Sunset, Moon, CloudSun, Cloud, CloudFog, CloudRain, CloudLightning, CircleDot
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Segment } from '@/types/cinematic';
import type { GlobalAsset } from '@/types/database';
import { toast } from 'sonner';
import type {
  CinematicHeaderConfig,
  SceneSetting,
  TimeOfDayCinematic,
  Weather,
  CinematicStyle,
} from '@/types/cinematic';
import { CINEMATIC_STYLE_OPTIONS } from '@/types/cinematic';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SequenceForCopy {
  id: string;
  title: string | null;
  sort_order: number;
  cinematic_header: CinematicHeaderConfig | null;
}

/** Character data for prompt preview */
export interface PromptCharacterData {
  id: string;
  name: string;
  visualDescription?: string;
  referenceImages?: string[];
  voiceId?: string; // fal.ai voice ID
}

interface CinematicHeaderWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: CinematicHeaderConfig | null;
  onChange: (config: CinematicHeaderConfig) => void;
  projectId: string;
  segments?: Segment[];
  locations?: Array<{ id: string; name: string; description?: string }>;
  /** Characters from Bible (for full prompt preview with Character Legend) */
  characters?: PromptCharacterData[];
  /** Whether a start frame exists (affects image budget) */
  hasStartFrame?: boolean;
  /** Other sequences to copy cinematic_header from */
  otherSequences?: SequenceForCopy[];
  /** Default view mode: 'edit' or 'prompt' */
  defaultViewMode?: 'edit' | 'prompt';
  /** If true, hide the Apply button (read-only mode) */
  readOnly?: boolean;
  /** Target video model (affects prompt syntax) */
  targetModel?: VideoModelType;
}

// Check if a config has all required fields
function isValidConfig(config: CinematicHeaderConfig | null | undefined): config is CinematicHeaderConfig {
  return !!(
    config &&
    config.lighting?.type &&
    config.camera?.type &&
    config.color_grade?.style
  );
}

export function CinematicHeaderWizard({
  open,
  onOpenChange,
  value,
  onChange,
  projectId,
  segments = [],
  locations = [],
  characters = [],
  hasStartFrame = true,
  otherSequences = [],
  defaultViewMode = 'edit',
  readOnly = false,
  targetModel = 'kling-omni',
}: CinematicHeaderWizardProps) {
  // Local state for editing - ensure we have valid defaults
  const [config, setConfig] = useState<CinematicHeaderConfig>(
    isValidConfig(value) ? value : createDefaultCinematicHeader()
  );

  // View mode state
  const [viewMode, setViewMode] = useState<'edit' | 'prompt'>(defaultViewMode);
  const [activeTab, setActiveTab] = useState<'tone' | 'time' | 'lighting' | 'color' | 'notes'>('tone');

  // Location mode: 'custom' for free text, 'bible' for Bible locations
  const [locationMode, setLocationMode] = useState<'custom' | 'bible'>(
    config.scene?.location_id ? 'bible' : 'custom'
  );
  const [copied, setCopied] = useState(false);

  // Sync with external value when dialog opens
  useEffect(() => {
    if (open) {
      setConfig(isValidConfig(value) ? value : createDefaultCinematicHeader());
      setViewMode(defaultViewMode);
    }
  }, [open, value, defaultViewMode]);

  // Generate prompt preview (header only)
  const headerPrompt = useMemo(() => {
    return cinematicHeaderToPrompt(config);
  }, [config]);

  // Analyze characters: Stars (with images) vs Figurants (description only)
  const characterAnalysis = useMemo(() => {
    if (characters.length === 0) return null;

    // Convert PromptCharacterData to a Map<string, GlobalAsset> for analyzeCharacters
    const charMap = new Map<string, GlobalAsset>();
    for (const char of characters) {
      // Cast through unknown to satisfy TypeScript (analyzeCharacters only needs id, name, reference_images, data)
      const asset = {
        id: char.id,
        name: char.name,
        asset_type: 'character' as const,
        reference_images: char.referenceImages || [],
        data: {
          visual_description: char.visualDescription,
          fal_voice_id: char.voiceId,
        },
      } as unknown as GlobalAsset;
      charMap.set(char.id, asset);
    }

    return analyzeCharacters(charMap, hasStartFrame, targetModel);
  }, [characters, hasStartFrame, targetModel]);

  // Build character lookup by name (for beats that use character_name)
  const characterByName = useMemo(() => {
    const lookup = new Map<string, PromptCharacter>();
    if (!characterAnalysis) return lookup;

    for (const char of characterAnalysis.all.values()) {
      // Store by uppercase name for case-insensitive matching
      lookup.set(char.name.toUpperCase(), char);
    }
    return lookup;
  }, [characterAnalysis]);

  // Helper: Get character reference
  // Kling: @Element1, @Element2
  // Seedance: @image1, @image2
  const getCharRef = (charName: string): string => {
    const normalizedName = charName.toUpperCase().replace(/\s+/g, '');
    const char = characterByName.get(normalizedName) || characterByName.get(charName.toUpperCase());

    if (char?.isStar && char.elementIndex && characterAnalysis) {
      // Use model-specific prefix
      const prefix = characterAnalysis.modelConfig.elementPrefix;
      return `${prefix}${char.elementIndex}`;
    }
    if (char?.visualDescription) {
      return `${charName} (${char.visualDescription})`;
    }
    return generateReferenceName(charName, '@');
  };

  // Helper: Get voice reference
  // Kling: <<<voice_1>>> (requires voice_ids parameter)
  // Seedance: Returns voice description or empty (native audio)
  const getVoiceRef = (charName: string): string => {
    const normalizedName = charName.toUpperCase().replace(/\s+/g, '');
    const char = characterByName.get(normalizedName) || characterByName.get(charName.toUpperCase());

    if (!characterAnalysis) return '';

    if (characterAnalysis.modelConfig.voiceSyntax === 'kling' && char?.voiceIndex) {
      return `<<<voice_${char.voiceIndex}>>>`;
    }

    // Seedance: use voice description if available
    if (characterAnalysis.modelConfig.voiceSyntax === 'audio-ref' && char?.voiceDescription) {
      return char.voiceDescription;
    }

    return '';
  };

  // Helper: Format time
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Helper: Estimate dialogue duration (~2.5 words/sec, adjusted by tone)
  const estimateDuration = (text: string, tone?: string): number => {
    const words = text.split(/\s+/).filter(w => w.length > 0).length;
    const toneMultipliers: Record<string, number> = {
      neutral: 1.0, angry: 0.85, fearful: 0.9, sad: 1.2, joyful: 0.95,
      sarcastic: 1.1, whispered: 1.15, shouted: 0.8, warmly: 1.0, coldly: 1.1,
    };
    const mult = toneMultipliers[tone || 'neutral'] || 1.0;
    const commas = (text.match(/,/g) || []).length;
    const periods = (text.match(/[.!?]/g) || []).length;
    return Math.round(((words / 2.5) * mult + commas * 0.15 + periods * 0.3) * 10) / 10;
  };

  // Helper: Get tone description
  const getToneDesc = (tone?: string): string => {
    if (!tone || tone === 'neutral') return '';
    const descs: Record<string, string> = {
      angry: 'in an angry tone', fearful: 'fearfully', sad: 'sadly',
      joyful: 'joyfully', sarcastic: 'sarcastically', whispered: 'whispering',
      shouted: 'shouting', warmly: 'warmly', coldly: 'coldly', flatly: 'flatly',
    };
    return descs[tone] || `${tone}`;
  };

  // Generate full prompt with segments
  const fullPrompt = useMemo(() => {
    const lines: string[] = [];

    // Part 1: Cinematic Style Header
    lines.push('=== CINEMATIC STYLE ===');
    lines.push(headerPrompt);

    // Part 2: Character Legend (if we have character data)
    if (characterAnalysis && characterAnalysis.stars.length > 0) {
      const isKling = characterAnalysis.modelConfig.voiceSyntax === 'kling';
      const isSeedance = characterAnalysis.modelConfig.voiceSyntax === 'audio-ref';
      const prefix = isKling ? 'Element' : 'image';

      lines.push('');
      lines.push('=== CHARACTER LEGEND ===');

      for (const star of characterAnalysis.stars) {
        const desc = star.visualDescription || star.name;

        if (isKling) {
          // Kling: "Element 1 = Name: description [Voice 1]"
          const voiceInfo = star.voiceIndex ? ` [Voice ${star.voiceIndex}]` : '';
          lines.push(`${prefix} ${star.elementIndex} = ${star.name}: ${desc}${voiceInfo}`);
        } else {
          // Seedance: "image 1 = Name: description (voice: elderly warm voice)"
          const voiceInfo = star.voiceDescription ? ` (voice: ${star.voiceDescription})` : '';
          lines.push(`${prefix} ${star.elementIndex} = ${star.name}: ${desc}${voiceInfo}`);
        }
      }

      // Figurants with dialogue potential
      const figurantsWithDesc = characterAnalysis.figurants.filter(f => f.visualDescription);
      if (figurantsWithDesc.length > 0) {
        lines.push('');
        lines.push('Additional characters (no reference images):');
        for (const fig of figurantsWithDesc) {
          const voiceInfo = isSeedance && fig.voiceDescription ? ` (voice: ${fig.voiceDescription})` : '';
          lines.push(`- ${fig.name}: ${fig.visualDescription}${voiceInfo}`);
        }
      }
    }

    // Part 3: Shots
    if (segments.length > 0) {
      lines.push('');
      lines.push('=== SHOTS ===');

      segments.forEach((segment, index) => {
        const shotNum = index + 1;
        const startTime = formatTime(segment.start_time);
        const endTime = formatTime(segment.end_time);

        // Build shot type: "MEDIUM TWO-SHOT" or just "MEDIUM"
        const framing = segment.shot_framing?.replace(/_/g, ' ').toUpperCase() || 'MEDIUM';
        const composition = segment.shot_composition && segment.shot_composition !== 'single'
          ? ` ${segment.shot_composition.replace(/_/g, '-').toUpperCase()}`
          : '';
        const shotType = `${framing}${composition}`;

        // Camera movement
        const camera = segment.camera_movement && segment.camera_movement !== 'static'
          ? segment.camera_movement.replace(/_/g, ' ')
          : 'static camera';

        lines.push('');
        lines.push(`Shot ${shotNum} (${startTime}-${endTime}): ${shotType}. Camera: ${camera}.`);

        // Description
        if (segment.description) {
          lines.push(segment.description);
        }

        // Render beats with auto-calculated timecodes
        if (segment.beats?.length) {
          // Calculate beat timecodes (similar to cinematic-prompt-builder.ts)
          const segmentDuration = segment.end_time - segment.start_time;
          const beatDurations = segment.beats.map(b => {
            if (b.type === 'dialogue' && b.content) {
              const words = b.content.split(/\s+/).filter(w => w.length > 0).length;
              return (words / 2.5); // ~150 words/min = 2.5 words/sec
            }
            return 1.5; // Action beats default
          });
          const totalEstimated = beatDurations.reduce((s, d) => s + d, 0);
          const scale = totalEstimated > 0 ? segmentDuration / totalEstimated : 1;

          let currentTime = segment.start_time;
          for (let i = 0; i < segment.beats.length; i++) {
            const beat = segment.beats[i];
            if (!beat.content) continue;

            const duration = beatDurations[i] * scale;
            const beatEnd = Math.min(currentTime + duration, segment.end_time);
            const timeRange = `${formatTime(currentTime)}-${formatTime(beatEnd)}`;

            if (beat.type === 'dialogue' && beat.character_name) {
              const charRef = getCharRef(beat.character_name);
              const voiceRef = getVoiceRef(beat.character_name);
              const toneDesc = getToneDesc(beat.tone);
              const offScreen = beat.presence === 'off' ? ' (off-screen)' : '';

              if (voiceRef) {
                lines.push(`${timeRange}: ${charRef}${offScreen} says ${voiceRef}${toneDesc ? ' ' + toneDesc : ''}: "${beat.content}"`);
              } else {
                lines.push(`${timeRange}: ${charRef}${offScreen} says${toneDesc ? ' ' + toneDesc : ''}: "${beat.content}"`);
              }
            } else if (beat.type === 'dialogue') {
              const toneDesc = getToneDesc(beat.tone);
              lines.push(`${timeRange}: Says${toneDesc ? ' ' + toneDesc : ''}: "${beat.content}"`);
            } else {
              // Action beat
              if (beat.character_name) {
                const charRef = getCharRef(beat.character_name);
                lines.push(`${timeRange}: ${charRef} ${beat.content}`);
              } else {
                lines.push(`${timeRange}: ${beat.content}`);
              }
            }

            currentTime = beatEnd;
          }
        }
      });
    }

    // Part 4: Style Bible (at the very end - "Constraint Sandwich")
    const effectiveStyle = config.cinematic_style || 'cinematic_realism';
    const styleBible = getStyleBibleFromCinematicStyle(effectiveStyle, config.custom_style_bible);
    lines.push('');
    lines.push('=== STYLE BIBLE ===');
    lines.push(styleBible || 'cinematic lighting, 35mm film grain, anamorphic lens flares, moody color grade, shallow depth of field, high production value');

    return lines.join('\n');
  }, [headerPrompt, segments, config.cinematic_style, config.custom_style_bible, characterAnalysis, getCharRef, getVoiceRef]);

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

        <div className="flex-1 overflow-hidden relative flex flex-col min-h-[400px]">
          {viewMode === 'edit' ? (
            <>
              {/* Copy from another sequence (only in edit mode, not readOnly) */}
              {!readOnly && otherSequences.filter(s => isValidConfig(s.cinematic_header)).length > 0 && (
                <div className="px-4 py-2 border-b border-white/10 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-xs text-slate-500">Copier de</span>
                    <Select
                      value=""
                      onValueChange={(sequenceId) => {
                        const seq = otherSequences.find(s => s.id === sequenceId);
                        if (seq?.cinematic_header) {
                          setConfig(seq.cinematic_header);
                          toast.success(`Style copié de "${seq.title || `Séquence ${seq.sort_order + 1}`}"`);
                        }
                      }}
                    >
                      <SelectTrigger className="h-7 w-72 bg-slate-800/50 border-white/10 text-xs text-slate-300">
                        <SelectValue placeholder="Sélectionner une séquence..." />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-white/10">
                        {otherSequences
                          .filter(s => isValidConfig(s.cinematic_header))
                          .sort((a, b) => a.sort_order - b.sort_order)
                          .map((seq) => (
                            <SelectItem key={seq.id} value={seq.id} className="text-white text-xs">
                              {seq.title || `Séquence ${seq.sort_order + 1}`}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Category Tabs */}
              <div className="px-4 py-3 border-b border-white/10 flex-shrink-0">
                <div className="inline-flex rounded-lg bg-slate-800/50 p-1 gap-1">
                  {[
                    { id: 'tone' as const, label: 'Style', icon: Sparkles },
                    { id: 'time' as const, label: 'Scène', icon: MapPin },
                    { id: 'lighting' as const, label: 'Éclairage', icon: Sun },
                    // Camera tab hidden - camera movement is per-segment, not global
                    { id: 'color' as const, label: 'Colorimétrie', icon: Palette },
                    { id: 'notes' as const, label: 'Notes', icon: MessageSquare },
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

              {/* Tab Content - Fixed height */}
              <div className="h-[400px] p-4">
                {activeTab === 'time' && (
                  <div className="space-y-3">
                    {/* INT / EXT */}
                    <div>
                      <Label className="text-slate-400 text-xs mb-1.5 block">Intérieur / Extérieur</Label>
                      <div className="inline-flex rounded-lg bg-slate-800/50 p-0.5 gap-0.5">
                        {[
                          { value: 'int', label: 'INT.', icon: Home },
                          { value: 'ext', label: 'EXT.', icon: Trees },
                          { value: 'int_ext', label: 'INT./EXT.', icon: Car },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setConfig({
                              ...config,
                              scene: { ...config.scene, setting: opt.value as SceneSetting }
                            })}
                            className={cn(
                              'px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5',
                              config.scene?.setting === opt.value
                                ? 'bg-blue-500/30 text-blue-300'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                            )}
                          >
                            <opt.icon className="w-3.5 h-3.5" />
                            <span className="text-xs font-medium">{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Location */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <Label className="text-slate-400 text-xs">Lieu</Label>
                        {/* Mode toggle */}
                        <div className="inline-flex rounded-md bg-slate-800/50 p-0.5 border border-white/10">
                          <button
                            type="button"
                            onClick={() => {
                              setLocationMode('custom');
                              setConfig({
                                ...config,
                                scene: { ...config.scene, setting: config.scene?.setting || 'int', location_id: undefined }
                              });
                            }}
                            className={cn(
                              'px-2.5 py-1 text-[10px] font-medium rounded transition-all',
                              locationMode === 'custom'
                                ? 'bg-blue-500/30 text-blue-300'
                                : 'text-slate-400 hover:text-slate-200'
                            )}
                          >
                            Description
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setLocationMode('bible');
                              setConfig({
                                ...config,
                                scene: { ...config.scene, setting: config.scene?.setting || 'int', location_custom: undefined }
                              });
                            }}
                            disabled={locations.length === 0}
                            className={cn(
                              'px-2.5 py-1 text-[10px] font-medium rounded transition-all',
                              locationMode === 'bible'
                                ? 'bg-blue-500/30 text-blue-300'
                                : locations.length === 0
                                  ? 'text-slate-600 cursor-not-allowed'
                                  : 'text-slate-400 hover:text-slate-200'
                            )}
                          >
                            Bible
                          </button>
                        </div>
                      </div>

                      {locationMode === 'custom' ? (
                        <Input
                          value={config.scene?.location_custom || ''}
                          onChange={(e) => setConfig({
                            ...config,
                            scene: { ...config.scene, setting: config.scene?.setting || 'int', location_custom: e.target.value }
                          })}
                          placeholder="Dark, moody kitchen lit by a single pendant light..."
                          className="h-8 bg-slate-800/50 border-white/10 text-white text-sm placeholder:text-slate-500"
                        />
                      ) : (
                        <Select
                          value={config.scene?.location_id || ''}
                          onValueChange={(locationId) => {
                            const location = locations.find(l => l.id === locationId);
                            setConfig({
                              ...config,
                              scene: {
                                ...config.scene,
                                setting: config.scene?.setting || 'int',
                                location_id: locationId,
                                location_custom: location?.description || location?.name
                              }
                            });
                          }}
                        >
                          <SelectTrigger className="h-8 bg-slate-800/50 border-white/10 text-white text-sm">
                            <SelectValue placeholder="Sélectionner un lieu..." />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-white/10">
                            {locations.map((loc) => (
                              <SelectItem key={loc.id} value={loc.id} className="text-white">
                                {loc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    {/* Time of Day */}
                    <div>
                      <Label className="text-slate-400 text-xs mb-1.5 block">Moment de la journée</Label>
                      <div className="grid grid-cols-8 gap-1.5">
                        {[
                          { value: 'dawn', label: 'Aube', icon: Sunrise, color: 'text-orange-300' },
                          { value: 'morning', label: 'Matin', icon: CloudSun, color: 'text-yellow-300' },
                          { value: 'midday', label: 'Midi', icon: Sun, color: 'text-yellow-400' },
                          { value: 'afternoon', label: 'Après-midi', icon: Sun, color: 'text-amber-400' },
                          { value: 'golden_hour', label: 'Golden', icon: Sunset, color: 'text-orange-400' },
                          { value: 'dusk', label: 'Crépusc.', icon: Sunset, color: 'text-purple-400' },
                          { value: 'blue_hour', label: 'Blue', icon: Moon, color: 'text-blue-400' },
                          { value: 'night', label: 'Nuit', icon: Moon, color: 'text-indigo-400' },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setConfig({ ...config, time_of_day: opt.value as TimeOfDayCinematic })}
                            className={cn(
                              'flex flex-col items-center gap-1 p-2 rounded-lg border transition-all',
                              config.time_of_day === opt.value
                                ? 'bg-blue-500/20 border-blue-500/50'
                                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                            )}
                          >
                            <opt.icon className={cn('w-4 h-4', config.time_of_day === opt.value ? 'text-blue-300' : opt.color)} />
                            <span className={cn(
                              'text-[9px] font-medium',
                              config.time_of_day === opt.value ? 'text-blue-300' : 'text-slate-400'
                            )}>
                              {opt.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Weather - only show for EXT */}
                    {(config.scene?.setting === 'ext' || config.scene?.setting === 'int_ext') && (
                      <div>
                        <Label className="text-slate-400 text-xs mb-1.5 block">Météo</Label>
                        <div className="grid grid-cols-7 gap-1.5">
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
                                'flex flex-col items-center gap-1 p-2 rounded-lg border transition-all',
                                config.weather === opt.value || (!config.weather && !opt.value)
                                  ? 'bg-blue-500/20 border-blue-500/50'
                                  : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                              )}
                            >
                              <opt.icon className={cn(
                                'w-4 h-4',
                                config.weather === opt.value || (!config.weather && !opt.value) ? 'text-blue-300' : opt.color
                              )} />
                              <span className={cn(
                                'text-[9px] font-medium',
                                config.weather === opt.value || (!config.weather && !opt.value) ? 'text-blue-300' : 'text-slate-500'
                              )}>
                                {opt.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
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

                {activeTab === 'tone' && (
                  <div className="space-y-3">
                    {/* Cinematic Style Presets with video previews */}
                    <CinematicStyleSelector
                      value={config.cinematic_style}
                      onChange={(style) => setConfig({ ...config, cinematic_style: style })}
                    />

                    {/* Style Bible Preview/Editor */}
                    {config.cinematic_style && (
                      <div>
                        <Label className="text-slate-400 text-xs mb-1.5 block">
                          Style Bible (fin de chaque prompt)
                        </Label>
                        {config.cinematic_style === 'custom' ? (
                          <Textarea
                            value={config.custom_style_bible || ''}
                            onChange={(e) => setConfig({ ...config, custom_style_bible: e.target.value })}
                            placeholder="Ex: cinematic lighting, 35mm film grain, moody color grade, shallow depth of field, high production value"
                            className="bg-white/5 border-white/10 text-slate-300 text-xs resize-none"
                            rows={2}
                          />
                        ) : (
                          <div className="p-2 bg-white/5 rounded-lg border border-white/10">
                            <p className="text-xs text-slate-400 italic leading-relaxed">
                              {CINEMATIC_STYLE_OPTIONS.find(s => s.value === config.cinematic_style)?.styleBible}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
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

                {activeTab === 'notes' && (
                  <div className="space-y-3">
                    <Label className="text-slate-400 text-xs block">
                      Notes additionnelles (incluses dans le prompt)
                    </Label>
                    <MentionInput
                      value={config.additional_notes || ''}
                      onChange={(v) => setConfig({ ...config, additional_notes: v || undefined })}
                      placeholder="Notes additionnelles... @character, #lieu, !look (ex: ambiance Blade Runner, focus sur les mains)"
                      projectId={projectId}
                      minHeight="120px"
                      className="bg-white/5 border-white/10"
                    />
                    <p className="text-[10px] text-slate-500">
                      Utilisez les mentions pour référencer des éléments de la Bible : @personnage, #lieu, !look
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Prompt View */
            <div className="absolute inset-0 flex flex-col p-4 space-y-3">
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
              <div className="flex-1 min-h-0 p-4 bg-slate-950/50 rounded-lg border border-white/10 overflow-y-auto">
                <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                  {fullPrompt}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-white/10">
          {readOnly ? (
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-white/10"
            >
              Fermer
            </Button>
          ) : (
            <>
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
            </>
          )}
        </div>

      </DialogContent>
    </Dialog>
  );
}
