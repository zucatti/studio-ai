'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
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
  Copy,
  Check,
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
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');

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
              {viewMode === 'edit' ? 'Build your shot with presets and suggestions' : 'Generated prompt preview'}
            </DialogDescription>
          </DialogHeader>

          {/* Content - Fixed height for consistent modal size */}
          <div className="flex-1 overflow-hidden min-h-[350px]">
            {viewMode === 'edit' ? (
              /* Edit Mode - Single Column Layout */
              <div className="h-full overflow-y-auto p-6 space-y-5">
                {/* Shot Type & Camera - Top Row */}
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
                    <Label className="text-slate-300 text-xs">Camera</Label>
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

                {/* Description - Full Width */}
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Description</Label>
                  <MentionInput
                    value={formData.description || ''}
                    onChange={(value) => updateField('description', value)}
                    placeholder="@Character #Location !Prop — describe what happens..."
                    projectId={projectId}
                    minHeight="120px"
                  />
                </div>

                {/* Dialogue Section - Full Width */}
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
            ) : (
              /* Preview Mode - Same layout as Edit */
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
