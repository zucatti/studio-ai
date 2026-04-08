'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { generateReferenceName } from '@/lib/reference-name';
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
  Plus,
  Trash2,
  GripVertical,
  Zap,
  Video,
  Camera,
  RotateCcw,
  Loader2,
  Target,
  Volume2,
  Wind,
  Sun,
  ChevronDown,
  Eye,
} from 'lucide-react';
import { VideoCard } from '@/components/shorts/VideoCard';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { TonePicker } from './TonePicker';
import type { Segment, ShotFraming, ShotComposition, CameraMovement, DialogueTone, SegmentElement, ElementType, DialoguePresence } from '@/types/cinematic';
import {
  SHOT_FRAMING_OPTIONS,
  SHOT_COMPOSITION_OPTIONS,
  CAMERA_MOVEMENT_OPTIONS,
  ELEMENT_TYPE_OPTIONS,
  createDefaultElement,
} from '@/types/cinematic';

// ============================================================================
// Camera Movement Preview Component
// ============================================================================

// CSS animations for camera movements
const CAMERA_ANIMATIONS: Record<CameraMovement, string> = {
  static: '',
  slow_dolly_in: 'animate-dolly-in',
  slow_dolly_out: 'animate-dolly-out',
  dolly_left: 'animate-dolly-left',
  dolly_right: 'animate-dolly-right',
  tracking_forward: 'animate-tracking-forward',
  tracking_backward: 'animate-tracking-backward',
  pan_left: 'animate-pan-left',
  pan_right: 'animate-pan-right',
  tilt_up: 'animate-tilt-up',
  tilt_down: 'animate-tilt-down',
  crane_up: 'animate-crane-up',
  crane_down: 'animate-crane-down',
  orbit_cw: 'animate-orbit-cw',
  orbit_ccw: 'animate-orbit-ccw',
  handheld: 'animate-handheld',
  zoom_in: 'animate-zoom-in',
  zoom_out: 'animate-zoom-out',
};

interface CameraPreviewProps {
  movement: CameraMovement;
  framing: ShotFraming;
  composition?: ShotComposition;
}

function CameraPreview({ movement, framing, composition }: CameraPreviewProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [key, setKey] = useState(0);

  const replay = () => {
    setKey(k => k + 1);
    setIsPlaying(true);
  };

  // Get framing scale for preview (simulate different shot sizes)
  const getFramingScale = (f: ShotFraming): number => {
    const scales: Record<ShotFraming, number> = {
      extreme_wide: 1,
      wide: 1.2,
      medium_wide: 1.4,
      medium: 1.6,
      medium_close_up: 1.9,
      close_up: 2.3,
      extreme_close_up: 2.8,
    };
    return scales[f] || 1.6;
  };

  const animationClass = isPlaying ? CAMERA_ANIMATIONS[movement] : '';
  const baseScale = getFramingScale(framing);

  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden border border-white/10">
      {/* Cinematic letterbox bars */}
      <div className="absolute inset-x-0 top-0 h-[8%] bg-black z-10" />
      <div className="absolute inset-x-0 bottom-0 h-[8%] bg-black z-10" />

      {/* Preview image with animation */}
      <div
        key={key}
        className={cn(
          'absolute inset-0 transition-transform',
          animationClass
        )}
        style={{
          backgroundImage: 'url(https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800&q=80)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transform: `scale(${baseScale})`,
        }}
      />

      {/* Composition overlay guides */}
      {composition === 'two_shot' && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="w-1/3 h-2/3 border-2 border-dashed border-white/30 rounded-lg mx-2" />
          <div className="w-1/3 h-2/3 border-2 border-dashed border-white/30 rounded-lg mx-2" />
        </div>
      )}
      {composition === 'over_shoulder' && (
        <div className="absolute inset-0 z-20 pointer-events-none">
          <div className="absolute left-0 bottom-0 w-1/3 h-2/3 border-2 border-dashed border-white/30 rounded-tr-3xl" />
          <div className="absolute right-1/4 top-1/4 w-1/3 h-1/2 border-2 border-dashed border-white/30 rounded-lg" />
        </div>
      )}

      {/* Movement label */}
      <div className="absolute bottom-[10%] left-4 z-20">
        <span className="px-3 py-1.5 bg-black/70 text-white text-sm font-medium rounded">
          {CAMERA_MOVEMENT_OPTIONS.find(o => o.value === movement)?.label || 'Static'}
        </span>
      </div>

      {/* Replay button */}
      <button
        onClick={replay}
        className="absolute bottom-[10%] right-4 z-20 p-2 bg-black/70 hover:bg-black/90 text-white rounded-full transition-colors"
        title="Replay animation"
      >
        <RotateCcw className="w-5 h-5" />
      </button>

      {/* Framing indicator */}
      <div className="absolute top-[10%] left-4 z-20">
        <span className="px-3 py-1.5 bg-indigo-600/80 text-white text-sm font-medium rounded">
          {SHOT_FRAMING_OPTIONS.find(o => o.value === framing)?.label}
          {composition && composition !== 'single' && (
            <> · {SHOT_COMPOSITION_OPTIONS.find(o => o.value === composition)?.label}</>
          )}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Element Type Icons
// ============================================================================

const ELEMENT_ICONS: Record<ElementType, React.ReactNode> = {
  action: <Zap className="w-3 h-3" />,
  dialogue: <MessageSquare className="w-3 h-3" />,
  focus: <Target className="w-3 h-3" />,
  sfx: <Volume2 className="w-3 h-3" />,
  physics: <Wind className="w-3 h-3" />,
  lighting: <Sun className="w-3 h-3" />,
};

const ELEMENT_COLORS: Record<ElementType, string> = {
  action: 'amber',
  dialogue: 'indigo',
  focus: 'cyan',
  sfx: 'green',
  physics: 'blue',
  lighting: 'yellow',
};

const ELEMENT_PLACEHOLDERS: Record<ElementType, string> = {
  action: 'approaches slowly, hands clenched...',
  dialogue: 'What did you find in my phone?',
  focus: 'maintaining eye contact with the camera',
  sfx: 'Rhythmic metallic tink-tink of spoon against porcelain',
  physics: 'Small wisps of steam rising from the coffee cup',
  lighting: 'Sunlight glints sharply off the chrome',
};

// ============================================================================
// Element Editor Component
// ============================================================================

interface ElementEditorProps {
  element: SegmentElement;
  index: number;
  characters: Array<{ id: string; name: string }>;
  onChange: (element: SegmentElement) => void;
  onDelete: () => void;
  canDelete: boolean;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
  projectId: string;
}

function ElementEditor({ element, index, characters, onChange, onDelete, canDelete, isDragging, onDragStart, onDragOver, onDrop, onDragEnd, projectId }: ElementEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Get element type config
  const elementConfig = ELEMENT_TYPE_OPTIONS.find(o => o.value === element.type);
  const needsCharacter = elementConfig?.needsCharacter ?? false;
  const color = ELEMENT_COLORS[element.type] || 'slate';

  // Estimate dialogue duration based on word count and speech patterns
  // Use content_en if available (more accurate for English prompt), fallback to content
  const estimateDuration = useMemo(() => {
    if (element.type !== 'dialogue') return null;

    // Prefer English version for estimation (more accurate)
    const text = (element.content_en || element.content || '').trim();
    if (!text) return null;

    // Count words (split by whitespace)
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;

    // Base rate: 150 words/min = 2.5 words/sec
    // Adjust by tone
    const toneMultipliers: Record<string, number> = {
      neutral: 1.0,
      angry: 0.85,      // Faster, more intense
      fearful: 0.9,     // Slightly faster, breathless
      sad: 1.2,         // Slower, more pauses
      joyful: 0.95,     // Slightly faster
      sarcastic: 1.1,   // Slower, more emphasis
      whispered: 1.15,  // Slower, deliberate
      shouted: 0.8,     // Fast and loud
    };

    const toneMultiplier = toneMultipliers[element.tone || 'neutral'] || 1.0;

    // Add time for punctuation pauses
    const commas = (text.match(/,/g) || []).length;
    const periods = (text.match(/[.!?]/g) || []).length;
    const ellipsis = (text.match(/\.\.\./g) || []).length;
    const pauseTime = (commas * 0.15) + (periods * 0.3) + (ellipsis * 0.5);

    // Calculate duration
    const baseDuration = (wordCount / 2.5) * toneMultiplier;
    const totalDuration = baseDuration + pauseTime;

    return Math.round(totalDuration * 10) / 10; // Round to 0.1s
  }, [element.content, element.content_en, element.tone, element.type]);

  const handleCharacterChange = (characterId: string) => {
    const character = characters.find(c => c.id === characterId);
    const noCharacter = characterId === '_none';
    onChange({
      ...element,
      character_id: noCharacter ? undefined : characterId,
      character_name: character?.name,
      // Switch to action if removing character while in dialogue mode
      type: noCharacter && element.type === 'dialogue' ? 'action' : element.type,
      // Clear dialogue-specific fields if switching to action
      tone: noCharacter && element.type === 'dialogue' ? undefined : element.tone,
      presence: noCharacter && element.type === 'dialogue' ? undefined : element.presence,
    });
  };

  const handleTypeChange = (type: ElementType) => {
    const typeConfig = ELEMENT_TYPE_OPTIONS.find(o => o.value === type);
    const typeNeedsCharacter = typeConfig?.needsCharacter ?? false;

    onChange({
      ...element,
      type,
      // Clear character if switching to a type that doesn't need one
      character_id: typeNeedsCharacter ? element.character_id : undefined,
      character_name: typeNeedsCharacter ? element.character_name : undefined,
      // Clear dialogue-specific fields if not dialogue
      tone: type === 'dialogue' ? element.tone : undefined,
      presence: type === 'dialogue' ? element.presence : undefined,
    });
  };

  // Get background color class for element type
  const getBgColorClass = (type: ElementType, isSelected: boolean) => {
    const colors: Record<ElementType, string> = {
      action: isSelected ? 'bg-amber-600/80' : '',
      dialogue: isSelected ? 'bg-indigo-600/80' : '',
      focus: isSelected ? 'bg-cyan-600/80' : '',
      sfx: isSelected ? 'bg-green-600/80' : '',
      physics: isSelected ? 'bg-blue-600/80' : '',
      lighting: isSelected ? 'bg-yellow-600/80' : '',
    };
    return colors[type] || '';
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative p-3 bg-slate-800/30 rounded-lg border border-white/5 space-y-3 transition-all",
        isDragging && "opacity-50 border-blue-500/50"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver?.(e);
      }}
      onDrop={() => onDrop?.()}
    >
      {/* Header row: index, type selector, character (if applicable), delete */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Drag handle - ONLY this element is draggable */}
        <div
          draggable
          onDragStart={(e) => {
            // Set the entire container as the drag image
            if (containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              e.dataTransfer.setDragImage(containerRef.current, rect.width / 2, 20);
            }
            e.dataTransfer.effectAllowed = 'move';
            onDragStart?.();
          }}
          onDragEnd={() => onDragEnd?.()}
          className="cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4 text-slate-500 hover:text-slate-300 flex-shrink-0" />
        </div>
        <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">#{index + 1}</span>

        {/* Type selector dropdown */}
        <Select
          value={element.type}
          onValueChange={(v) => handleTypeChange(v as ElementType)}
        >
          <SelectTrigger className={cn(
            "h-7 text-xs w-[110px] border-white/10",
            getBgColorClass(element.type, true),
            element.type ? 'text-white' : 'text-slate-400'
          )}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-white/10">
            {ELEMENT_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-white text-xs">
                <div className="flex items-center gap-2">
                  {ELEMENT_ICONS[opt.value]}
                  {opt.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Character select - only for types that need it */}
        {needsCharacter && (
          <Select
            value={element.character_id || '_none'}
            onValueChange={handleCharacterChange}
          >
            <SelectTrigger className="bg-slate-800/50 border-white/10 text-white h-7 text-xs w-[130px]">
              <SelectValue placeholder="Character" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-white/10">
              <SelectItem value="_none" className="text-slate-400 text-xs">
                —
              </SelectItem>
              {characters.map((char) => (
                <SelectItem key={char.id} value={char.id} className="text-white text-xs">
                  @{char.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Dialogue options: on/off toggle and tone */}
        {element.type === 'dialogue' && (
          <>
            {/* On/Off toggle */}
            <div className="inline-flex rounded-md bg-slate-800/50 p-0.5 border border-white/10">
              <button
                type="button"
                onClick={() => onChange({ ...element, presence: 'on' })}
                className={cn(
                  'px-2 py-1 text-[10px] font-medium rounded transition-all',
                  (!element.presence || element.presence === 'on')
                    ? 'bg-green-600/80 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                ON
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...element, presence: 'off' })}
                className={cn(
                  'px-2 py-1 text-[10px] font-medium rounded transition-all',
                  element.presence === 'off'
                    ? 'bg-slate-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                OFF
              </button>
            </div>

            {/* Tone picker */}
            <TonePicker
              value={element.tone || 'neutral'}
              onChange={(v) => onChange({ ...element, tone: v })}
              className="w-[140px]"
            />
          </>
        )}

        <div className="flex-1" />

        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-6 w-6 p-0 text-slate-500 hover:text-red-400 flex-shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Content with MentionInput */}
      <div className="relative">
        <MentionInput
          value={element.content || ''}
          onChange={(v) => onChange({ ...element, content: v })}
          placeholder={ELEMENT_PLACEHOLDERS[element.type] || 'Enter content...'}
          projectId={projectId}
          fixedHeight="60px"
          className="bg-slate-800/50 border-white/10 text-white placeholder:text-slate-600 text-sm"
        />
        {/* Translation indicator - shows if content_en exists and differs */}
        {element.content_en && element.content_en !== element.content && (
          <div className="absolute right-2 top-2 px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 text-[10px]">
            EN ✓
          </div>
        )}
        {/* Duration estimate for dialogue */}
        {element.type === 'dialogue' && (
          <div className="absolute right-2 bottom-1.5 text-[10px] text-slate-500 tabular-nums">
            {estimateDuration !== null ? `~${estimateDuration}s` : '—'}
          </div>
        )}
      </div>
    </div>
  );
}

// Legacy alias for backward compatibility
const BeatEditor = ElementEditor;

// ============================================================================
// Main Component
// ============================================================================

interface SegmentEditorProps {
  segment: Segment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (segment: Segment, suggestedDuration?: number) => void;
  characters?: Array<{ id: string; name: string }>;
  locations?: Array<{ id: string; name: string }>;
  planDuration: number;
  segmentIndex?: number;
  projectId: string;
  shotId: string;
}

// Extract subject from description or first element
function extractSubject(segment: Partial<Segment>): string | null {
  // First try description
  if (segment.description) {
    const match = segment.description.match(/[@#!][A-Za-z][A-Za-z0-9_]*/);
    if (match) return match[0];
  }
  // Then try first element with character (using elements or legacy beats)
  const elements = segment.elements || segment.beats;
  const firstElementWithChar = elements?.find(e => e.character_name);
  if (firstElementWithChar?.character_name) {
    return generateReferenceName(firstElementWithChar.character_name, '@');
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
  shotId,
}: SegmentEditorProps) {
  const [formData, setFormData] = useState<Partial<Segment>>({});
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  const [showVideoPreview, setShowVideoPreview] = useState(true); // Toggle between camera and video preview

  // Reset form when segment changes
  useEffect(() => {
    if (segment) {
      // Migrate old dialogue/beats to elements if needed
      let elements = segment.elements || segment.beats || [];
      if (elements.length === 0 && segment.dialogue) {
        elements = [{
          id: crypto.randomUUID(),
          character_id: segment.dialogue.character_id,
          character_name: segment.dialogue.character_name,
          type: 'dialogue' as const,
          content: segment.dialogue.text,
          tone: segment.dialogue.tone,
        }];
      }
      setFormData({ ...segment, elements, beats: undefined });
      // Load preview URL from segment (persist across segment switches)
      setPreviewVideoUrl(segment.preview_video_url || null);
      setShowVideoPreview(true);
      setIsPreviewing(false);
      setPreviewJobId(null);
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

  // Element handlers (use elements, fallback to beats for backward compatibility)
  const elements = formData.elements || formData.beats || [];

  const addElement = useCallback((type: ElementType = 'action') => {
    const newElement = createDefaultElement(type);
    setFormData((prev) => ({
      ...prev,
      elements: [...(prev.elements || prev.beats || []), newElement],
      beats: undefined, // Clear legacy beats field
    }));
  }, []);

  const updateElement = useCallback((index: number, element: SegmentElement) => {
    setFormData((prev) => ({
      ...prev,
      elements: (prev.elements || prev.beats || []).map((e, i) => (i === index ? element : e)),
      beats: undefined,
    }));
  }, []);

  const deleteElement = useCallback((index: number) => {
    setFormData((prev) => ({
      ...prev,
      elements: (prev.elements || prev.beats || []).filter((_, i) => i !== index),
      beats: undefined,
    }));
  }, []);

  const insertElementAfter = useCallback((index: number, type: ElementType = 'action') => {
    const newElement = createDefaultElement(type);
    setFormData((prev) => {
      const currentElements = prev.elements || prev.beats || [];
      const newElements = [
        ...currentElements.slice(0, index + 1),
        newElement,
        ...currentElements.slice(index + 1),
      ];
      return { ...prev, elements: newElements, beats: undefined };
    });
  }, []);

  // Drag-and-drop state
  const [draggedElementIndex, setDraggedElementIndex] = useState<number | null>(null);

  const moveElement = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setFormData((prev) => {
      const currentElements = [...(prev.elements || prev.beats || [])];
      const [movedElement] = currentElements.splice(fromIndex, 1);
      currentElements.splice(toIndex, 0, movedElement);
      return { ...prev, elements: currentElements, beats: undefined };
    });
  }, []);

  const handleDragStart = useCallback((index: number) => {
    setDraggedElementIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedElementIndex === null || draggedElementIndex === index) return;
  }, [draggedElementIndex]);

  const handleDrop = useCallback((index: number) => {
    if (draggedElementIndex === null) return;
    moveElement(draggedElementIndex, index);
    setDraggedElementIndex(null);
  }, [draggedElementIndex, moveElement]);

  const handleDragEnd = useCallback(() => {
    setDraggedElementIndex(null);
  }, []);

  // Persist preview URL to database without triggering full save
  const persistPreviewUrl = useCallback(async (videoUrl: string) => {
    if (!segment) return;

    try {
      // First, fetch the current shot to get all segments
      const getResponse = await fetch(`/api/projects/${projectId}/shots/${shotId}`);
      if (!getResponse.ok) {
        console.error('[SegmentEditor] Failed to fetch shot for preview URL update');
        return;
      }
      const shot = await getResponse.json();
      const segments = shot.segments || [];

      // Update the segment at the current index
      const updatedSegments = segments.map((seg: Segment, idx: number) =>
        idx === segmentIndex
          ? { ...seg, preview_video_url: videoUrl }
          : seg
      );

      // Call the shot PATCH endpoint to update segments
      const response = await fetch(`/api/projects/${projectId}/shots/${shotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: updatedSegments,
        }),
      });

      if (!response.ok) {
        console.error('[SegmentEditor] Failed to persist preview URL');
      } else {
        console.log('[SegmentEditor] Preview URL persisted to database');
      }
    } catch (error) {
      console.error('[SegmentEditor] Error persisting preview URL:', error);
    }
  }, [segment, projectId, shotId, segmentIndex]);

  // Handle save - calls Claude to translate and evaluate duration
  const handleSave = useCallback(async () => {
    if (!segment) return;

    const currentElements = formData.elements || formData.beats || [];

    // If we have elements with content, process them with Claude
    if (currentElements.some(el => el.content)) {
      setIsProcessing(true);
      try {
        const response = await fetch(`/api/projects/${projectId}/shots/${shotId}/process-segment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            elements: currentElements,
            description: formData.description,
            camera_movement: formData.camera_movement,
          }),
        });

        if (response.ok) {
          const data = await response.json();

          // Update elements with English translations
          const updated: Segment = {
            ...segment,
            ...formData,
            id: segment.id,
            elements: data.elements,
            // Clear legacy fields
            dialogue: undefined,
            beats: undefined,
          };

          // Show duration suggestion if significantly different
          if (data.duration_reasoning) {
            toast.success(`Durée suggérée: ${data.suggested_duration}s`, {
              description: data.duration_reasoning,
              duration: 5000,
            });
          }

          onSave(updated, data.suggested_duration);
          onOpenChange(false);
        } else {
          // API failed, save without processing
          const errorData = await response.json().catch(() => ({}));
          console.error('[SegmentEditor] Process API failed:', response.status, errorData);
          const updated: Segment = {
            ...segment,
            ...formData,
            id: segment.id,
            dialogue: undefined,
            beats: undefined,
          };
          onSave(updated);
          onOpenChange(false);
        }
      } catch (error) {
        console.error('[SegmentEditor] Process error:', error);
        // Save without processing on error
        const updated: Segment = {
          ...segment,
          ...formData,
          id: segment.id,
          dialogue: undefined,
          beats: undefined,
        };
        onSave(updated);
        onOpenChange(false);
      } finally {
        setIsProcessing(false);
      }
    } else {
      // No elements with content, save directly
      const updated: Segment = {
        ...segment,
        ...formData,
        id: segment.id,
        dialogue: undefined,
        beats: undefined,
      };
      onSave(updated);
      onOpenChange(false);
    }
  }, [segment, formData, onSave, onOpenChange, projectId, shotId]);

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

    // Build shot type label: "MEDIUM TWO-SHOT" or just "MEDIUM"
    const framingLabel = SHOT_FRAMING_OPTIONS.find(o => o.value === formData.shot_framing)?.label.toUpperCase() || 'MEDIUM';
    const compositionLabel = SHOT_COMPOSITION_OPTIONS.find(o => o.value === formData.shot_composition)?.label.toUpperCase();
    const shotType = compositionLabel && formData.shot_composition !== 'single'
      ? `${framingLabel} ${compositionLabel}`
      : framingLabel;
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

    // Elements
    const elementsToRender = formData.elements || formData.beats || [];
    // Track which characters have dialogue for voice assignment
    const dialogueCharacterIds: string[] = [];
    for (const el of elementsToRender) {
      if (el.type === 'dialogue' && el.character_id && !dialogueCharacterIds.includes(el.character_id)) {
        dialogueCharacterIds.push(el.character_id);
      }
    }

    for (const el of elementsToRender) {
      if (!el.content) continue;

      // Use content_en for prompt preview (what will be sent to fal.ai)
      const textContent = el.content_en || el.content;
      let elementLine = '';

      switch (el.type) {
        case 'dialogue': {
          const tone = el.tone && el.tone !== 'neutral' ? ` ${el.tone}` : '';
          const offScreen = el.presence === 'off' ? ' (off-screen)' : '';

          if (el.character_id && el.character_name) {
            const voiceIndex = dialogueCharacterIds.indexOf(el.character_id) + 1;
            const voiceTag = voiceIndex <= 2 ? ` <<<voice_${voiceIndex}>>>` : '';
            const charRef = generateReferenceName(el.character_name, '@');
            elementLine = `[Dialogue lipsync: ${charRef}${offScreen} says${tone}${voiceTag}: "${textContent}"]`;
          } else if (el.character_name) {
            const charRef = generateReferenceName(el.character_name, '@');
            elementLine = `[Dialogue lipsync: ${charRef}${offScreen} says${tone}: "${textContent}"]`;
          } else {
            elementLine = `[Dialogue lipsync: Says${offScreen}${tone}: "${textContent}"]`;
          }
          break;
        }
        case 'action': {
          if (el.character_name) {
            const charRef = generateReferenceName(el.character_name, '@');
            elementLine = `[Action: ${charRef} ${textContent}]`;
          } else {
            elementLine = `[Action: ${textContent}]`;
          }
          break;
        }
        case 'focus': {
          if (el.character_name) {
            const charRef = generateReferenceName(el.character_name, '@');
            elementLine = `[Focus on ${charRef}${textContent ? ': ' + textContent : ''}]`;
          } else if (textContent) {
            elementLine = `[Focus: ${textContent}]`;
          }
          break;
        }
        case 'sfx':
          elementLine = `[SFX: ${textContent}]`;
          break;
        case 'physics':
          elementLine = `[Physics: ${textContent}]`;
          break;
        case 'lighting':
          elementLine = `[Lighting: ${textContent}]`;
          break;
        default:
          elementLine = textContent;
      }

      if (elementLine) {
        lines.push(elementLine);
      }
    }

    // Camera notes
    if (formData.camera_movement && formData.camera_movement !== 'static') {
      const movement = CAMERA_MOVEMENT_OPTIONS.find(o => o.value === formData.camera_movement)?.label || '';
      lines.push(`Camera: ${movement}.`);
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

  // Handle preview generation
  const handlePreview = useCallback(async () => {
    if (!segment) return;

    // Build current segment state
    const currentSegment = {
      ...segment,
      ...formData,
      id: segment.id,
    };

    setIsPreviewing(true);
    setPreviewVideoUrl(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/shots/${shotId}/preview-segment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment: currentSegment }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to queue preview');
      }

      const data = await response.json();
      setPreviewJobId(data.jobId);
      toast.success(`Preview lancé (${data.duration}s, Grok 480p)`);

      // Poll for completion
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/jobs/${data.jobId}`);
          if (!statusRes.ok) return;

          const statusData = await statusRes.json();
          const job = statusData.job;

          if (job?.status === 'completed') {
            // Result is in result_data.videoUrl
            const videoUrl = job.result_data?.videoUrl;
            if (videoUrl) {
              clearInterval(pollInterval);
              setPreviewVideoUrl(videoUrl);
              setShowVideoPreview(true); // Auto-switch to video preview
              setIsPreviewing(false);
              // Persist to database so URL survives segment switches
              persistPreviewUrl(videoUrl);
              toast.success('Preview prêt !');
            }
          } else if (job?.status === 'failed') {
            clearInterval(pollInterval);
            setIsPreviewing(false);
            toast.error(`Preview échoué: ${job.error_message || 'Unknown error'}`);
          }
        } catch {
          // Ignore polling errors
        }
      }, 2000);

      // Stop polling after 2 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        if (isPreviewing) {
          setIsPreviewing(false);
          toast.error('Preview timeout');
        }
      }, 120000);

    } catch (error) {
      console.error('[SegmentEditor] Preview error:', error);
      toast.error(error instanceof Error ? error.message : 'Preview failed');
      setIsPreviewing(false);
    }
  }, [segment, formData, projectId, shotId, isPreviewing, persistPreviewUrl]);

  if (!segment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-[1600px] h-[90vh] overflow-hidden bg-slate-900 border-white/10 p-0 [&>button]:hidden">
        <div className="flex flex-col h-full">
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

          {/* Content - use relative/absolute for reliable height */}
          <div className="flex-1 relative">
            {viewMode === 'edit' ? (
              <div className="absolute inset-0 flex">
                {/* Left Panel - Camera Preview (scrolls independently) */}
                <div className="w-[40%] h-full flex-shrink-0 p-6 border-r border-white/10 overflow-y-auto">
                  {/* Toggle Camera/Video Preview - show when generating or when video exists */}
                  {(previewVideoUrl || isPreviewing) && (
                    <div className="flex gap-1 mb-2 p-0.5 bg-slate-800/50 rounded-lg w-fit">
                      <button
                        onClick={() => setShowVideoPreview(false)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                          !showVideoPreview
                            ? "bg-slate-700 text-white"
                            : "text-slate-400 hover:text-white"
                        )}
                      >
                        <Camera className="w-3.5 h-3.5" />
                        Caméra
                      </button>
                      <button
                        onClick={() => setShowVideoPreview(true)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                          showVideoPreview
                            ? (isPreviewing ? "bg-amber-500/50 text-black" : "bg-amber-500 text-black")
                            : "text-slate-400 hover:text-white"
                        )}
                      >
                        <Video className="w-3.5 h-3.5" />
                        {isPreviewing ? 'Génération...' : 'Preview'}
                      </button>
                    </div>
                  )}

                  {/* Camera Preview or Video Preview */}
                  <div className="aspect-video mb-5">
                    {!showVideoPreview ? (
                      // Camera tab selected - always show camera preview
                      <CameraPreview
                        movement={formData.camera_movement || 'static'}
                        framing={formData.shot_framing || 'medium'}
                        composition={formData.shot_composition}
                      />
                    ) : previewVideoUrl ? (
                      // Video tab selected + video ready
                      <div className="relative w-full h-full">
                        {/* Badge PREVIEW */}
                        <div className="absolute top-2 left-2 z-10 px-2 py-1 bg-amber-500 text-black text-[10px] font-bold rounded">
                          PREVIEW 480p
                        </div>
                        <VideoCard
                          videoUrl={previewVideoUrl}
                          aspectRatio="16:9"
                          autoPlay
                          className="w-full h-full border-amber-500/50"
                        />
                      </div>
                    ) : isPreviewing ? (
                      // Video tab selected + generating
                      <div className="relative w-full h-full bg-slate-900 rounded-lg overflow-hidden border border-amber-500/30 flex items-center justify-center">
                        <div className="text-center">
                          <Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto mb-2" />
                          <div className="text-sm text-slate-400">Génération preview...</div>
                          <div className="text-xs text-slate-500 mt-1">Grok 480p (~30s)</div>
                        </div>
                      </div>
                    ) : (
                      // Video tab selected but no video and not generating - show camera as fallback
                      <CameraPreview
                        movement={formData.camera_movement || 'static'}
                        framing={formData.shot_framing || 'medium'}
                        composition={formData.shot_composition}
                      />
                    )}
                  </div>

                  {/* Shot Settings */}
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-slate-300 text-xs">Cadrage</Label>
                        <Select
                          value={formData.shot_framing || 'medium'}
                          onValueChange={(v) => updateField('shot_framing', v as ShotFraming)}
                        >
                          <SelectTrigger className="bg-slate-800/50 border-white/10 text-white h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-white/10">
                            {SHOT_FRAMING_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-white">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-slate-300 text-xs">Composition</Label>
                        <Select
                          value={formData.shot_composition || 'single'}
                          onValueChange={(v) => updateField('shot_composition', v as ShotComposition)}
                        >
                          <SelectTrigger className="bg-slate-800/50 border-white/10 text-white h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-white/10">
                            {SHOT_COMPOSITION_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-white">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
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
                </div>

                {/* Right Panel - Elements (uses absolute for reliable height) */}
                <div className="w-[60%] h-full flex flex-col">
                  {/* Elements Header - FIXED at top */}
                  <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-white/10">
                    <Label className="text-slate-300 text-xs">Elements</Label>
                    <Select onValueChange={(type) => addElement(type as ElementType)}>
                      <SelectTrigger className="h-7 w-[140px] text-xs border-white/10 text-slate-400 hover:text-white bg-transparent">
                        <Plus className="w-3 h-3 mr-1" />
                        <span>Add Element</span>
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-white/10">
                        {ELEMENT_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-white text-xs">
                            <div className="flex items-center gap-2">
                              {ELEMENT_ICONS[opt.value]}
                              {opt.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Elements List - THIS IS THE ONLY SCROLLABLE PART */}
                  <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
                    {elements.length === 0 ? (
                      <div className="text-center py-6 text-slate-500 text-sm border border-dashed border-white/10 rounded-lg">
                        No elements yet. Add action, dialogue, SFX, etc.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {elements.map((element, index) => (
                          <div key={element.id}>
                            <ElementEditor
                              element={element}
                              index={index}
                              characters={characters}
                              onChange={(e) => updateElement(index, e)}
                              onDelete={() => deleteElement(index)}
                              canDelete={true}
                              isDragging={draggedElementIndex === index}
                              onDragStart={() => handleDragStart(index)}
                              onDragOver={(e) => handleDragOver(e, index)}
                              onDrop={() => handleDrop(index)}
                              onDragEnd={handleDragEnd}
                              projectId={projectId}
                            />
                            {/* Insert button between elements */}
                            <div className="group relative h-2 -my-0.5">
                              <button
                                onClick={() => insertElementAfter(index)}
                                className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <div className="flex items-center gap-2 px-3 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/30 hover:bg-blue-500/30 transition-colors">
                                  <Plus className="w-3 h-3 text-blue-400" />
                                  <span className="text-[10px] text-blue-400 font-medium">Insert element</span>
                                </div>
                              </button>
                              <div className="absolute inset-x-4 top-1/2 h-px bg-white/5 group-hover:bg-blue-500/20 transition-colors" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Preview Mode */
              <div className="absolute inset-0 flex flex-col p-6 space-y-3">
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
                <div className="flex-1 min-h-0 p-4 bg-slate-950/50 rounded-lg border border-white/10 overflow-y-auto">
                  <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                    {promptPreview}
                  </pre>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 flex-shrink-0">
            {/* Left side - Preview button */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handlePreview}
                disabled={isProcessing || isPreviewing}
                className="border-amber-500/30 text-amber-400 hover:text-amber-300 hover:border-amber-500/50"
              >
                {isPreviewing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Génération...
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 mr-2" />
                    Prévisualiser
                  </>
                )}
              </Button>
              {previewVideoUrl && (
                <span className="text-xs text-green-400 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Preview prêt
                </span>
              )}
            </div>

            {/* Right side - Cancel/Save */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isProcessing}
                className="border-white/10 text-slate-400"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isProcessing}
                className="bg-indigo-600 hover:bg-indigo-500 text-white min-w-[140px]"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Shot
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
