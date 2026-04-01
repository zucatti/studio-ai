'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  DialogFooter,
} from '@/components/ui/dialog';
import { MessageSquare, Video, Clapperboard, Save, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Segment, ShotType, CameraMovement, DialogueTone } from '@/types/cinematic';
import {
  SHOT_TYPE_OPTIONS,
  CAMERA_MOVEMENT_OPTIONS,
  DIALOGUE_TONE_OPTIONS,
} from '@/types/cinematic';

interface SegmentEditorProps {
  segment: Segment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (segment: Segment) => void;
  characters?: Array<{ id: string; name: string }>; // Available characters for dialogue
  planDuration: number;
}

export function SegmentEditor({
  segment,
  open,
  onOpenChange,
  onSave,
  characters = [],
  planDuration,
}: SegmentEditorProps) {
  // Local form state
  const [formData, setFormData] = useState<Partial<Segment>>({});

  // Reset form when segment changes
  useEffect(() => {
    if (segment) {
      setFormData({ ...segment });
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
          character_id: '',
          character_name: '',
          tone: 'neutral' as DialogueTone,
          text: '',
        },
      }));
    }
  }, [hasDialogue]);

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

  // Handle character selection (also sets character_name)
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
      id: segment.id, // Ensure ID is preserved
    };

    onSave(updated);
    onOpenChange(false);
  }, [segment, formData, onSave, onOpenChange]);

  // Duration display
  const duration = formData.end_time && formData.start_time
    ? (formData.end_time - formData.start_time).toFixed(1)
    : '0.0';

  if (!segment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-slate-900 border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Clapperboard className="w-5 h-5 text-indigo-400" />
            Edit Segment
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Configure shot timing, framing, and dialogue for this segment.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Timing Row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Start Time</Label>
              <Input
                type="number"
                step="0.1"
                min={0}
                max={formData.end_time ? formData.end_time - 0.5 : planDuration}
                value={formData.start_time || 0}
                onChange={(e) => updateField('start_time', parseFloat(e.target.value) || 0)}
                className="bg-slate-800/50 border-white/10 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">End Time</Label>
              <Input
                type="number"
                step="0.1"
                min={formData.start_time ? formData.start_time + 0.5 : 0.5}
                max={planDuration}
                value={formData.end_time || 0}
                onChange={(e) => updateField('end_time', parseFloat(e.target.value) || 0)}
                className="bg-slate-800/50 border-white/10 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Duration</Label>
              <div className="h-9 flex items-center px-3 bg-slate-800/30 border border-white/5 rounded-md text-slate-400">
                {duration}s
              </div>
            </div>
          </div>

          {/* Shot Type & Subject Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Shot Type</Label>
              <Select
                value={formData.shot_type || 'medium'}
                onValueChange={(v) => updateField('shot_type', v as ShotType)}
              >
                <SelectTrigger className="bg-slate-800/50 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-white/10">
                  {SHOT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-white">
                      <div className="flex flex-col">
                        <span>{opt.label}</span>
                        <span className="text-xs text-slate-400">{opt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Subject</Label>
              <Input
                value={formData.subject || ''}
                onChange={(e) => updateField('subject', e.target.value)}
                placeholder="e.g. @Sarah, the knife, both characters"
                className="bg-slate-800/50 border-white/10 text-white placeholder:text-slate-500"
              />
            </div>
          </div>

          {/* Camera Movement & Framing Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Camera Movement</Label>
              <Select
                value={formData.camera_movement || 'static'}
                onValueChange={(v) => updateField('camera_movement', v as CameraMovement)}
              >
                <SelectTrigger className="bg-slate-800/50 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-white/10 max-h-60">
                  {CAMERA_MOVEMENT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-white">
                      <div className="flex flex-col">
                        <span>{opt.label}</span>
                        <span className="text-xs text-slate-400">{opt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Framing Details</Label>
              <Input
                value={formData.framing || ''}
                onChange={(e) => updateField('framing', e.target.value)}
                placeholder="e.g. Tight framing from nose up"
                className="bg-slate-800/50 border-white/10 text-white placeholder:text-slate-500"
              />
            </div>
          </div>

          {/* Action */}
          <div className="space-y-2">
            <Label className="text-slate-300">Action</Label>
            <Textarea
              value={formData.action || ''}
              onChange={(e) => updateField('action', e.target.value)}
              placeholder="Describe what happens in this shot..."
              rows={2}
              className="bg-slate-800/50 border-white/10 text-white placeholder:text-slate-500 resize-none"
            />
          </div>

          {/* Environment */}
          <div className="space-y-2">
            <Label className="text-slate-300">Environment</Label>
            <Input
              value={formData.environment || ''}
              onChange={(e) => updateField('environment', e.target.value)}
              placeholder="e.g. Kitchen background softly blurred"
              className="bg-slate-800/50 border-white/10 text-white placeholder:text-slate-500"
            />
          </div>

          {/* Dialogue Section */}
          <div className="border-t border-white/10 pt-4">
            <div className="flex items-center justify-between mb-4">
              <Label className="text-slate-300 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Dialogue
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleDialogue}
                className={cn(
                  'border-white/10',
                  hasDialogue
                    ? 'bg-green-500/20 border-green-500/30 text-green-400'
                    : 'text-slate-400'
                )}
              >
                {hasDialogue ? 'Remove Dialogue' : 'Add Dialogue'}
              </Button>
            </div>

            {hasDialogue && (
              <div className="grid gap-4 p-4 bg-slate-800/30 rounded-lg border border-white/5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-xs">Character</Label>
                    <Select
                      value={formData.dialogue?.character_id || ''}
                      onValueChange={handleCharacterSelect}
                    >
                      <SelectTrigger className="bg-slate-800/50 border-white/10 text-white">
                        <SelectValue placeholder="Select character" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-white/10">
                        {characters.map((char) => (
                          <SelectItem key={char.id} value={char.id} className="text-white">
                            {char.name}
                          </SelectItem>
                        ))}
                        {characters.length === 0 && (
                          <SelectItem value="__none__" disabled className="text-slate-500">
                            No characters available
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-xs">Tone</Label>
                    <Select
                      value={formData.dialogue?.tone || 'neutral'}
                      onValueChange={(v) => updateDialogueField('tone', v)}
                    >
                      <SelectTrigger className="bg-slate-800/50 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-white/10">
                        {DIALOGUE_TONE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-white">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-400 text-xs">Dialogue Text</Label>
                  <Textarea
                    value={formData.dialogue?.text || ''}
                    onChange={(e) => updateDialogueField('text', e.target.value)}
                    placeholder="What does the character say?"
                    rows={2}
                    className="bg-slate-800/50 border-white/10 text-white placeholder:text-slate-500 resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Custom Prompt Override (Advanced) */}
          <div className="space-y-2">
            <Label className="text-slate-300 flex items-center gap-2">
              <Video className="w-4 h-4" />
              Custom Prompt Override
              <span className="text-xs text-slate-500">(optional)</span>
            </Label>
            <Textarea
              value={formData.custom_prompt || ''}
              onChange={(e) => updateField('custom_prompt', e.target.value)}
              placeholder="Override the auto-generated prompt with your own..."
              rows={2}
              className="bg-slate-800/50 border-white/10 text-white placeholder:text-slate-500 resize-none font-mono text-sm"
            />
          </div>
        </div>

        <DialogFooter className="border-t border-white/10 pt-4">
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
            Save Segment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
