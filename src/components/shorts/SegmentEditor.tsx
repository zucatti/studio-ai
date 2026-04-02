'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
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
  Copy,
  Check,
  FileText,
  Pencil,
  Plus,
  Trash2,
  GripVertical,
  Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Segment, ShotType, CameraMovement, DialogueTone, ShotBeat } from '@/types/cinematic';
import {
  SHOT_TYPE_OPTIONS,
  CAMERA_MOVEMENT_OPTIONS,
  DIALOGUE_TONE_OPTIONS,
  createDefaultBeat,
} from '@/types/cinematic';

// ============================================================================
// Beat Editor Component
// ============================================================================

interface BeatEditorProps {
  beat: ShotBeat;
  index: number;
  characters: Array<{ id: string; name: string }>;
  onChange: (beat: ShotBeat) => void;
  onDelete: () => void;
  canDelete: boolean;
}

function BeatEditor({ beat, index, characters, onChange, onDelete, canDelete }: BeatEditorProps) {
  const selectedCharacter = characters.find(c => c.id === beat.character_id);

  const handleCharacterChange = (characterId: string) => {
    const character = characters.find(c => c.id === characterId);
    onChange({
      ...beat,
      character_id: characterId === '_none' ? undefined : characterId,
      character_name: character?.name,
    });
  };

  return (
    <div className="relative p-3 bg-slate-800/30 rounded-lg border border-white/5 space-y-3">
      {/* Header with character select and delete */}
      <div className="flex items-center gap-2">
        <GripVertical className="w-4 h-4 text-slate-600 cursor-grab" />
        <span className="text-[10px] text-slate-500 font-mono">#{index + 1}</span>

        <Select
          value={beat.character_id || '_none'}
          onValueChange={handleCharacterChange}
        >
          <SelectTrigger className="bg-slate-800/50 border-white/10 text-white h-7 text-xs flex-1 max-w-[150px]">
            <SelectValue placeholder="Character" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-white/10">
            <SelectItem value="_none" className="text-slate-400 text-xs">
              No character
            </SelectItem>
            {characters.map((char) => (
              <SelectItem key={char.id} value={char.id} className="text-white text-xs">
                @{char.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-6 w-6 p-0 text-slate-500 hover:text-red-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Action field */}
      <div className="space-y-1">
        <Label className="text-slate-500 text-[10px] flex items-center gap-1">
          <Play className="w-3 h-3" />
          Action
        </Label>
        <Input
          value={beat.action || ''}
          onChange={(e) => onChange({ ...beat, action: e.target.value || undefined })}
          placeholder="swallows hard, holds up the phone, turns away..."
          className="bg-slate-800/50 border-white/10 text-white h-8 text-xs placeholder:text-slate-600"
        />
      </div>

      {/* Dialogue fields */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label className="text-slate-500 text-[10px] flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            Dialogue
          </Label>
          {beat.dialogue && (
            <Select
              value={beat.tone || 'neutral'}
              onValueChange={(v) => onChange({ ...beat, tone: v as DialogueTone })}
            >
              <SelectTrigger className="bg-slate-800/50 border-white/10 text-white h-6 text-[10px] w-24">
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
          )}
        </div>
        <Textarea
          value={beat.dialogue || ''}
          onChange={(e) => onChange({ ...beat, dialogue: e.target.value || undefined })}
          placeholder='"What did you find?"'
          rows={2}
          className="bg-slate-800/50 border-white/10 text-white placeholder:text-slate-600 resize-none text-sm"
        />
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface SegmentEditorProps {
  segment: Segment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (segment: Segment) => void;
  characters?: Array<{ id: string; name: string }>;
  locations?: Array<{ id: string; name: string }>;
  planDuration: number;
  segmentIndex?: number;
  projectId: string;
}

// Extract subject from description or first beat
function extractSubject(segment: Partial<Segment>): string | null {
  // First try description
  if (segment.description) {
    const match = segment.description.match(/[@#!][A-Za-z][A-Za-z0-9_]*/);
    if (match) return match[0];
  }
  // Then try first beat with character
  const firstBeatWithChar = segment.beats?.find(b => b.character_name);
  if (firstBeatWithChar?.character_name) {
    return `@${firstBeatWithChar.character_name}`;
  }
  return null;
}

export function SegmentEditor({
  segment,
  open,
  onOpenChange,
  onSave,
  characters = [],
  planDuration,
  segmentIndex = 0,
  projectId,
}: SegmentEditorProps) {
  const [formData, setFormData] = useState<Partial<Segment>>({});
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');

  // Reset form when segment changes
  useEffect(() => {
    if (segment) {
      // Migrate old dialogue to beats if needed
      const beats = segment.beats || [];
      if (beats.length === 0 && segment.dialogue) {
        beats.push({
          id: crypto.randomUUID(),
          character_id: segment.dialogue.character_id,
          character_name: segment.dialogue.character_name,
          dialogue: segment.dialogue.text,
          tone: segment.dialogue.tone,
        });
      }
      setFormData({ ...segment, beats });
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

  // Beat handlers
  const beats = formData.beats || [];

  const addBeat = useCallback(() => {
    const newBeat = createDefaultBeat();
    setFormData((prev) => ({
      ...prev,
      beats: [...(prev.beats || []), newBeat],
    }));
  }, []);

  const updateBeat = useCallback((index: number, beat: ShotBeat) => {
    setFormData((prev) => ({
      ...prev,
      beats: (prev.beats || []).map((b, i) => (i === index ? beat : b)),
    }));
  }, []);

  const deleteBeat = useCallback((index: number) => {
    setFormData((prev) => ({
      ...prev,
      beats: (prev.beats || []).filter((_, i) => i !== index),
    }));
  }, []);

  // Handle save
  const handleSave = useCallback(() => {
    if (!segment) return;

    const updated: Segment = {
      ...segment,
      ...formData,
      id: segment.id,
      // Clear legacy dialogue field
      dialogue: undefined,
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
    const subject = extractSubject(formData);

    const lines: string[] = [];

    // Shot header
    lines.push(`SHOT ${shotNum} (${startTime}–${endTime}) — ${shotType}${subject ? `, ${subject}` : ''}:`);
    lines.push('');

    // Description
    if (formData.description) {
      lines.push(formData.description);
      lines.push('');
    }

    // Beats
    const beatsToRender = formData.beats || [];
    for (const beat of beatsToRender) {
      if (!beat.action && !beat.dialogue) continue;

      let beatLine = '';

      if (beat.character_name && beat.action && beat.dialogue) {
        // Full: "Sarah swallows hard and says coldly: "text""
        const tone = beat.tone && beat.tone !== 'neutral' ? ` ${beat.tone}` : '';
        beatLine = `${beat.character_name} ${beat.action} and says${tone}:\n"${beat.dialogue}"`;
      } else if (beat.character_name && beat.dialogue) {
        // Character + dialogue: "Mark responds coldly: "text""
        const tone = beat.tone && beat.tone !== 'neutral' ? ` ${beat.tone}` : '';
        beatLine = `${beat.character_name} says${tone}:\n"${beat.dialogue}"`;
      } else if (beat.action && beat.dialogue) {
        // Action + dialogue (no specific character)
        const tone = beat.tone && beat.tone !== 'neutral' ? ` ${beat.tone}` : '';
        beatLine = `${beat.action}. Says${tone}: "${beat.dialogue}"`;
      } else if (beat.character_name && beat.action) {
        // Character + action only
        beatLine = `${beat.character_name} ${beat.action}.`;
      } else if (beat.action) {
        // Action only
        beatLine = beat.action + '.';
      } else if (beat.dialogue) {
        // Dialogue only
        beatLine = `"${beat.dialogue}"`;
      }

      if (beatLine) {
        lines.push(beatLine);
        lines.push('');
      }
    }

    // Camera notes
    if (formData.camera_movement && formData.camera_movement !== 'static') {
      const movement = CAMERA_MOVEMENT_OPTIONS.find(o => o.value === formData.camera_movement)?.label || '';
      lines.push(`Camera: ${movement}.`);
    }
    if (formData.camera_notes) {
      lines.push(formData.camera_notes);
    }

    return lines.join('\n').trim();
  }, [formData, segmentIndex]);

  // Copy prompt
  const copyPrompt = useCallback(() => {
    navigator.clipboard.writeText(promptPreview);
    setCopied(true);
    toast.success('Prompt copied!');
    setTimeout(() => setCopied(false), 2000);
  }, [promptPreview]);

  if (!segment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden bg-slate-900 border-white/10 p-0 [&>button]:hidden">
        <div className="flex flex-col h-full max-h-[90vh]">
          {/* Header */}
          <DialogHeader className="px-6 py-4 border-b border-white/10 flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-white">
                <Clapperboard className="w-5 h-5 text-indigo-400" />
                Shot {segmentIndex + 1}
              </DialogTitle>

              {/* View Mode Toggle */}
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
              {viewMode === 'edit' ? 'Compose your shot with description and beats' : 'Generated prompt preview'}
            </DialogDescription>
          </DialogHeader>

          {/* Content */}
          <div className="flex-1 overflow-hidden min-h-[400px]">
            {viewMode === 'edit' ? (
              <div className="h-full overflow-y-auto p-6 space-y-5">
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
                    <Label className="text-slate-300 text-xs">Camera Movement</Label>
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

                {/* Description */}
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Description</Label>
                  <Textarea
                    value={formData.description || ''}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Visual setup: framing, atmosphere, what's in frame..."
                    rows={3}
                    className="bg-slate-800/50 border-white/10 text-white placeholder:text-slate-600 resize-none text-sm"
                  />
                </div>

                {/* Beats Section */}
                <div className="border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-slate-300 text-xs">Beats</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addBeat}
                      className="h-7 text-xs border-white/10 text-slate-400 hover:text-white"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Beat
                    </Button>
                  </div>

                  {beats.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-sm border border-dashed border-white/10 rounded-lg">
                      No beats yet. Add action or dialogue.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {beats.map((beat, index) => (
                        <BeatEditor
                          key={beat.id}
                          beat={beat}
                          index={index}
                          characters={characters}
                          onChange={(b) => updateBeat(index, b)}
                          onDelete={() => deleteBeat(index)}
                          canDelete={true}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Camera Notes */}
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Camera Notes (optional)</Label>
                  <Input
                    value={formData.camera_notes || ''}
                    onChange={(e) => updateField('camera_notes', e.target.value || undefined)}
                    placeholder="Slight push-in, subtle drift to the right..."
                    className="bg-slate-800/50 border-white/10 text-white h-9 text-sm placeholder:text-slate-600"
                  />
                </div>
              </div>
            ) : (
              /* Preview Mode */
              <div className="h-full flex flex-col p-6 space-y-3">
                <div className="flex items-center justify-between flex-shrink-0">
                  <Label className="text-slate-300 text-xs">Generated Prompt</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyPrompt}
                    className="h-7 text-xs border-white/10 text-slate-400 hover:text-white"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1.5 text-green-400" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1.5" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
                <div className="flex-1 p-4 bg-slate-950/50 rounded-lg border border-white/10 overflow-y-auto">
                  <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                    {promptPreview}
                  </pre>
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
