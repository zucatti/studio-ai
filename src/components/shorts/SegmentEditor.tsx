'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MentionInput } from '@/components/ui/mention-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  MessageSquare,
  Clapperboard,
  Save,
  X,
  Sparkles,
  Copy,
  Check,
  MapPin,
  Camera,
  Move,
  Eye,
  Zap,
  Heart,
  FileText,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Segment, ShotType, CameraMovement, DialogueTone } from '@/types/cinematic';
import {
  SHOT_TYPE_OPTIONS,
  CAMERA_MOVEMENT_OPTIONS,
  DIALOGUE_TONE_OPTIONS,
} from '@/types/cinematic';

// ============================================================================
// Shot Presets - Quick configurations
// ============================================================================

interface ShotPreset {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  config: Partial<Segment>;
  suggestedFraming?: string[];
  suggestedActions?: string[];
}

const SHOT_PRESETS: ShotPreset[] = [
  {
    id: 'establishing',
    label: 'Establishing',
    icon: <MapPin className="w-4 h-4" />,
    description: 'Set the scene with a wide view',
    config: {
      shot_type: 'wide',
      camera_movement: 'static',
    },
    suggestedFraming: [
      'Camera low, ground level',
      'High angle looking down',
      'Centered composition',
      'Symmetrical framing',
    ],
    suggestedActions: [
      'Fog obscures the floor',
      'Lights illuminate the scene',
      'Wind moves through the space',
      'Shadows dance on walls',
    ],
  },
  {
    id: 'dialogue_cu',
    label: 'Dialogue',
    icon: <MessageSquare className="w-4 h-4" />,
    description: 'Close-up for intimate dialogue',
    config: {
      shot_type: 'close_up',
      camera_movement: 'static',
    },
    suggestedFraming: [
      'Tight on face',
      'Eyes and mouth visible',
      'Shallow depth of field',
      'Side lighting on face',
    ],
    suggestedActions: [
      'Direct eye contact with camera',
      'Looks away thoughtfully',
      'A tear runs down cheek',
      'Slight smile forms',
    ],
  },
  {
    id: 'action',
    label: 'Action',
    icon: <Zap className="w-4 h-4" />,
    description: 'Dynamic movement shot',
    config: {
      shot_type: 'medium',
      camera_movement: 'tracking_forward',
    },
    suggestedFraming: [
      'Following the movement',
      'Low angle for power',
      'Dutch angle for tension',
      'Handheld energy',
    ],
    suggestedActions: [
      'Runs toward camera',
      'Throws punch',
      'Jumps and lands',
      'Quick turn and react',
    ],
  },
  {
    id: 'reveal',
    label: 'Reveal',
    icon: <Eye className="w-4 h-4" />,
    description: 'Dramatic reveal with camera movement',
    config: {
      shot_type: 'medium_wide',
      camera_movement: 'slow_dolly_in',
    },
    suggestedFraming: [
      'Subject in center',
      'Slow approach',
      'Pull-back reveals context',
      'Crane up reveals scope',
    ],
    suggestedActions: [
      'Turns slowly to camera',
      'Steps into light',
      'Object revealed in frame',
      'Character appears from shadow',
    ],
  },
  {
    id: 'reaction',
    label: 'Reaction',
    icon: <Heart className="w-4 h-4" />,
    description: 'Capture emotional response',
    config: {
      shot_type: 'close_up',
      camera_movement: 'static',
    },
    suggestedFraming: [
      'Tight on expression',
      'Profile view',
      'Over shoulder of speaker',
      'Soft focus background',
    ],
    suggestedActions: [
      'Eyes widen',
      'Breath catches',
      'Tears well up',
      'Subtle nod',
    ],
  },
  {
    id: 'detail',
    label: 'Detail/Insert',
    icon: <Camera className="w-4 h-4" />,
    description: 'Extreme close-up on object or detail',
    config: {
      shot_type: 'extreme_close_up',
      camera_movement: 'static',
    },
    suggestedFraming: [
      'Macro lens feel',
      'Isolated subject',
      'Dramatic lighting on detail',
      'Rack focus to detail',
    ],
    suggestedActions: [
      'Hand reaches for object',
      'Finger presses button',
      'Drop falls',
      'Light catches surface',
    ],
  },
];

// ============================================================================
// Framing suggestions by shot type
// ============================================================================

const FRAMING_BY_SHOT_TYPE: Record<ShotType, string[]> = {
  extreme_wide: ['Vast landscape', 'Establishing shot', 'Tiny figures in frame', 'Epic scale'],
  wide: ['Full scene context', 'All characters visible', 'Environment prominent', 'Balanced composition'],
  medium_wide: ['Subject with environment', 'Full body visible', 'Room to move', 'Context and subject'],
  medium: ['Waist up', 'Conversational distance', 'Gestures visible', 'Classic interview framing'],
  medium_close_up: ['Chest up', 'Intimate but not intense', 'Expressions clear', 'Some body language'],
  close_up: ['Face fills frame', 'Emotions prominent', 'Shallow DOF', 'Eye contact possible'],
  extreme_close_up: ['Eyes only', 'Single detail', 'Texture visible', 'Macro feel'],
  over_shoulder: ['Speaker partially visible', 'Listener in focus', 'Depth in frame', 'Conversation framing'],
  pov: ['First person view', 'Hands visible in frame', 'Subjective camera', 'What character sees'],
  insert: ['Object isolated', 'Detail shot', 'Narrative significance', 'Cut-away feel'],
  two_shot: ['Both characters equal', 'Relationship visible', 'Balanced framing', 'Interaction space'],
};

// ============================================================================
// Component
// ============================================================================

interface SegmentEditorProps {
  segment: Segment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (segment: Segment) => void;
  characters?: Array<{ id: string; name: string }>;
  locations?: Array<{ id: string; name: string }>;
  planDuration: number;
  segmentIndex?: number; // For prompt preview (SHOT 1, SHOT 2, etc.)
  projectId: string;
}

// Extract subject from description (first @mention or #mention)
function extractSubject(description: string): string {
  const match = description.match(/[@#!][A-Za-z][A-Za-z0-9_]*/);
  return match ? match[0] : 'subject';
}

export function SegmentEditor({
  segment,
  open,
  onOpenChange,
  onSave,
  characters = [],
  locations = [],
  planDuration,
  segmentIndex = 0,
  projectId,
}: SegmentEditorProps) {
  // Local form state
  const [formData, setFormData] = useState<Partial<Segment>>({});
  const [copied, setCopied] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');

  // Reset form when segment changes
  useEffect(() => {
    if (segment) {
      setFormData({ ...segment });
      setActivePreset(null);
    } else {
      setFormData({});
    }
  }, [segment]);

  // Update form field
  const updateField = useCallback(
    <K extends keyof Segment>(field: K, value: Segment[K]) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  // Apply preset
  const applyPreset = useCallback((preset: ShotPreset) => {
    setFormData((prev) => ({
      ...prev,
      ...preset.config,
    }));
    setActivePreset(preset.id);
  }, []);

  // Add suggestion to field
  const addToField = useCallback((field: 'framing' | 'environment', text: string) => {
    setFormData((prev) => {
      const current = prev[field] || '';
      const newValue = current ? `${current} ${text}` : text;
      return { ...prev, [field]: newValue };
    });
  }, []);

  // Handle dialogue toggle
  const hasDialogue = !!formData.dialogue;
  const toggleDialogue = useCallback(() => {
    if (hasDialogue) {
      setFormData((prev) => {
        const { dialogue, ...rest } = prev;
        return rest;
      });
    } else {
      setFormData((prev) => ({
        ...prev,
        dialogue: {
          character_id: characters[0]?.id || '',
          character_name: characters[0]?.name || '',
          tone: 'neutral' as DialogueTone,
          text: '',
        },
      }));
    }
  }, [hasDialogue, characters]);

  // Update dialogue field
  const updateDialogueField = useCallback(
    (field: string, value: string) => {
      setFormData((prev) => ({
        ...prev,
        dialogue: {
          ...prev.dialogue,
          character_id: prev.dialogue?.character_id || '',
          character_name: prev.dialogue?.character_name || '',
          text: prev.dialogue?.text || '',
          [field]: value,
        },
      }));
    },
    []
  );

  // Handle character selection
  const handleCharacterSelect = useCallback(
    (characterId: string) => {
      const character = characters.find((c) => c.id === characterId);
      setFormData((prev) => ({
        ...prev,
        dialogue: {
          ...prev.dialogue,
          character_id: characterId,
          character_name: character?.name || '',
          text: prev.dialogue?.text || '',
        },
      }));
    },
    [characters]
  );

  // Handle save
  const handleSave = useCallback(() => {
    if (!segment) return;

    const updated: Segment = {
      ...segment,
      ...formData,
      id: segment.id,
    };

    onSave(updated);
    onOpenChange(false);
  }, [segment, formData, onSave, onOpenChange]);

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Generate prompt preview
  const promptPreview = useMemo(() => {
    const shotNum = segmentIndex + 1;
    const startTime = formatTime(formData.start_time || 0);
    const endTime = formatTime(formData.end_time || 0);

    const shotType = SHOT_TYPE_OPTIONS.find(o => o.value === formData.shot_type)?.label.toUpperCase() || 'MEDIUM';
    const subject = formData.description ? extractSubject(formData.description) : 'subject';

    const lines: string[] = [];
    lines.push(`SHOT ${shotNum} (${startTime}–${endTime}) — ${shotType}, ${subject}:`);

    if (formData.framing) {
      lines.push(formData.framing + '.');
    }

    if (formData.description) {
      lines.push(formData.description + '.');
    }

    if (formData.dialogue?.text && formData.dialogue?.character_name) {
      const tone = formData.dialogue.tone ? `, ${formData.dialogue.tone}` : '';
      lines.push(`${formData.dialogue.character_name} says${tone}: "${formData.dialogue.text}"`);
    }

    if (formData.environment) {
      lines.push(formData.environment + '.');
    }

    if (formData.camera_movement && formData.camera_movement !== 'static') {
      const movement = CAMERA_MOVEMENT_OPTIONS.find(o => o.value === formData.camera_movement)?.label || '';
      lines.push(`Camera: ${movement}.`);
    }

    return lines.join('\n');
  }, [formData, segmentIndex]);

  // Copy prompt to clipboard
  const copyPrompt = useCallback(() => {
    navigator.clipboard.writeText(promptPreview);
    setCopied(true);
    toast.success('Prompt copied!');
    setTimeout(() => setCopied(false), 2000);
  }, [promptPreview]);

  // Get current shot type for suggestions
  const currentShotType = formData.shot_type || 'medium';
  const currentPreset = SHOT_PRESETS.find(p => p.id === activePreset);
  const framingSuggestions = currentPreset?.suggestedFraming || FRAMING_BY_SHOT_TYPE[currentShotType] || [];

  if (!segment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden bg-slate-900 border-white/10 p-0">
        <div className="flex flex-col h-full max-h-[90vh]">
          {/* Header */}
          <DialogHeader className="px-6 py-4 border-b border-white/10 flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-white">
                <Clapperboard className="w-5 h-5 text-indigo-400" />
                Shot {segmentIndex + 1}
              </DialogTitle>

              {/* View Mode Toggle - mr-8 to avoid X close button */}
              <div className="inline-flex rounded-lg bg-slate-800/50 p-0.5 mr-8">
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
                  onClick={() => setViewMode('preview')}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5',
                    viewMode === 'preview'
                      ? 'bg-slate-700 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  )}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Preview
                </button>
              </div>
            </div>
            <DialogDescription className="text-slate-400">
              {viewMode === 'edit' ? 'Build your shot with presets and suggestions' : 'Generated prompt preview'}
            </DialogDescription>
          </DialogHeader>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {viewMode === 'edit' ? (
              /* Edit Mode - Two Column Layout */
              <div className="h-full overflow-y-auto p-6">
                <div className="grid grid-cols-2 gap-6">
                  {/* Left Column - Shot Setup */}
                  <div className="space-y-5">
                    {/* Presets */}
                    <div className="space-y-2">
                      <Label className="text-slate-300 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        Quick Presets
                      </Label>
                      <div className="grid grid-cols-3 gap-2">
                        {SHOT_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            onClick={() => applyPreset(preset)}
                            className={cn(
                              'p-2.5 rounded-lg border text-left transition-all',
                              activePreset === preset.id
                                ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                                : 'bg-slate-800/50 border-white/10 text-slate-300 hover:bg-slate-800 hover:border-white/20'
                            )}
                          >
                            <div className="flex items-center gap-1.5">
                              {preset.icon}
                              <span className="font-medium text-xs">{preset.label}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Shot Type & Camera Movement */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-slate-300 text-xs">Shot Type</Label>
                        <Select
                          value={formData.shot_type || 'medium'}
                          onValueChange={(v) => updateField('shot_type', v as ShotType)}
                        >
                          <SelectTrigger className="bg-slate-800/50 border-white/10 text-white h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-white/10">
                            {SHOT_TYPE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-white">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-slate-300 text-xs flex items-center gap-1">
                          <Move className="w-3 h-3" />
                          Camera
                        </Label>
                        <Select
                          value={formData.camera_movement || 'static'}
                          onValueChange={(v) => updateField('camera_movement', v as CameraMovement)}
                        >
                          <SelectTrigger className="bg-slate-800/50 border-white/10 text-white h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-white/10 max-h-60">
                            {CAMERA_MOVEMENT_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-white">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Framing */}
                    <div className="space-y-1.5">
                      <Label className="text-slate-300 text-xs">Framing</Label>
                      <Input
                        value={formData.framing || ''}
                        onChange={(e) => updateField('framing', e.target.value)}
                        placeholder="Camera position, angle..."
                        className="bg-slate-800/50 border-white/10 text-white placeholder:text-slate-500 h-9"
                      />
                      <div className="flex flex-wrap gap-1">
                        {framingSuggestions.slice(0, 4).map((suggestion, i) => (
                          <button
                            key={i}
                            onClick={() => addToField('framing', suggestion)}
                            className="px-1.5 py-0.5 text-[10px] bg-slate-700/50 text-slate-400 rounded hover:bg-slate-700 hover:text-slate-300"
                          >
                            + {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column - Content */}
                  <div className="space-y-5">
                    {/* Description with mentions */}
                    <div className="space-y-1.5">
                      <Label className="text-slate-300 text-xs">Description</Label>
                      <MentionInput
                        value={formData.description || ''}
                        onChange={(value) => updateField('description', value)}
                        placeholder="@Character #Location !Prop — describe what happens..."
                        projectId={projectId}
                        minHeight="100px"
                      />
                    </div>

                    {/* Environment */}
                    <div className="space-y-1.5">
                      <Label className="text-slate-300 text-xs">Environment</Label>
                      <Input
                        value={formData.environment || ''}
                        onChange={(e) => updateField('environment', e.target.value)}
                        placeholder="Lighting, atmosphere..."
                        className="bg-slate-800/50 border-white/10 text-white placeholder:text-slate-500 h-9"
                      />
                    </div>

                    {/* Dialogue Section */}
                    <div className="border-t border-white/10 pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <Label className="text-slate-300 text-xs flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5" />
                          Dialogue
                        </Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={toggleDialogue}
                          className={cn(
                            'h-7 text-xs border-white/10',
                            hasDialogue
                              ? 'bg-green-500/20 border-green-500/30 text-green-400'
                              : 'text-slate-400'
                          )}
                        >
                          {hasDialogue ? 'Remove' : 'Add'}
                        </Button>
                      </div>

                      {hasDialogue && (
                        <div className="space-y-3 p-3 bg-slate-800/30 rounded-lg border border-white/5">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-slate-400 text-[10px]">Character</Label>
                              <Select
                                value={formData.dialogue?.character_id || ''}
                                onValueChange={handleCharacterSelect}
                              >
                                <SelectTrigger className="bg-slate-800/50 border-white/10 text-white h-8 text-xs">
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-800 border-white/10">
                                  {characters.map((char) => (
                                    <SelectItem key={char.id} value={char.id} className="text-white text-xs">
                                      {char.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-slate-400 text-[10px]">Tone</Label>
                              <Select
                                value={formData.dialogue?.tone || 'neutral'}
                                onValueChange={(v) => updateDialogueField('tone', v)}
                              >
                                <SelectTrigger className="bg-slate-800/50 border-white/10 text-white h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-800 border-white/10">
                                  {DIALOGUE_TONE_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value} className="text-white text-xs">
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-slate-400 text-[10px]">Line</Label>
                            <Textarea
                              value={formData.dialogue?.text || ''}
                              onChange={(e) => updateDialogueField('text', e.target.value)}
                              placeholder='"Not in this life."'
                              rows={2}
                              className="bg-slate-800/50 border-white/10 text-white placeholder:text-slate-500 resize-none text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Preview Mode */
              <div className="h-full overflow-y-auto p-6">
                <div className="max-w-2xl mx-auto">
                  <div className="flex items-center justify-between mb-4">
                    <Label className="text-slate-300 flex items-center gap-2">
                      <Clapperboard className="w-4 h-4 text-amber-400" />
                      Generated Prompt
                    </Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyPrompt}
                      className="border-white/10 text-slate-400 hover:text-white"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 mr-2 text-green-400" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-2" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="p-4 bg-slate-950/50 rounded-lg border border-white/10">
                    <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                      {promptPreview}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-white/10 text-slate-400"
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Shot
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
