'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { MentionInput } from '@/components/ui/mention-input';
import { MentionText, type MentionEntity } from '@/components/ui/mention-text';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { StorageImg } from '@/components/ui/storage-image';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { DurationPicker } from './DurationPicker';
import { SegmentTimeline } from './SegmentTimeline';
import { SegmentEditor } from './SegmentEditor';
import {
  Wand2,
  RefreshCw,
  Loader2,
  ImageIcon,
  ChevronDown,
  ChevronRight,
  Film,
  Clapperboard,
  Settings2,
} from 'lucide-react';
import { useBibleStore } from '@/store/bible-store';
import { generateReferenceName, getReferencePrefix } from '@/lib/reference-name';
import type { Plan } from '@/store/shorts-store';
import type { ShotType, CameraAngle, CameraMovement } from '@/types/database';
import type { Segment, CinematicHeaderConfig } from '@/types/cinematic';
import { getPlanDisplayTitle } from '@/types/cinematic';

const SHOT_TYPES: { value: ShotType; label: string }[] = [
  { value: 'wide', label: 'Plan large' },
  { value: 'medium', label: 'Plan moyen' },
  { value: 'close_up', label: 'Gros plan' },
  { value: 'extreme_close_up', label: 'Très gros plan' },
  { value: 'over_shoulder', label: 'Par-dessus épaule' },
  { value: 'pov', label: 'Point de vue' },
];

const CAMERA_ANGLES: { value: CameraAngle; label: string }[] = [
  { value: 'eye_level', label: 'Niveau des yeux' },
  { value: 'low_angle', label: 'Contre-plongée' },
  { value: 'high_angle', label: 'Plongée' },
  { value: 'dutch_angle', label: 'Angle hollandais' },
  { value: 'birds_eye', label: 'Vue aérienne' },
  { value: 'worms_eye', label: 'Contre-plongée extrême' },
];

const CAMERA_MOVEMENTS: { value: CameraMovement; label: string }[] = [
  { value: 'static', label: 'Statique' },
  { value: 'slow_dolly_in', label: 'Dolly in lent' },
  { value: 'slow_dolly_out', label: 'Dolly out lent' },
  { value: 'tracking_forward', label: 'Travelling avant' },
  { value: 'tracking_backward', label: 'Travelling arrière' },
  { value: 'orbit_180', label: 'Orbite 180°' },
  { value: 'handheld', label: 'Caméra à l\'épaule' },
  { value: 'smooth_zoom_in', label: 'Zoom in doux' },
  { value: 'smooth_zoom_out', label: 'Zoom out doux' },
];

interface PlanEditorProps {
  plan: Plan | null;
  projectId: string;
  onUpdate: (updates: Partial<Plan>) => void;
  onGenerate: (planId: string) => Promise<void>;
  isGenerating: boolean;
  characters?: Array<{ id: string; name: string }>;
}

export function PlanEditor({ plan, projectId, onUpdate, onGenerate, isGenerating, characters = [] }: PlanEditorProps) {
  const [description, setDescription] = useState('');
  const [title, setTitle] = useState('');
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [editingSegment, setEditingSegment] = useState<Segment | null>(null);
  const [showCinematicSettings, setShowCinematicSettings] = useState(false);
  const { projectAssets, fetchProjectAssets } = useBibleStore();

  // Sync title with plan
  useEffect(() => {
    if (plan) {
      setTitle(plan.title || '');
    }
  }, [plan?.id, plan?.title]);

  // Handle segments change
  const handleSegmentsChange = useCallback((segments: Segment[]) => {
    onUpdate({ segments });
  }, [onUpdate]);

  // Handle segment save from editor
  const handleSegmentSave = useCallback((segment: Segment) => {
    if (!plan?.segments) return;
    const updated = plan.segments.map((s) => s.id === segment.id ? segment : s);
    onUpdate({ segments: updated });
    setEditingSegment(null);
  }, [plan?.segments, onUpdate]);

  // Handle edit segment (double-click)
  const handleEditSegment = useCallback((segment: Segment) => {
    setEditingSegment(segment);
  }, []);

  // Fetch project assets for mentions
  useEffect(() => {
    fetchProjectAssets(projectId);
  }, [projectId, fetchProjectAssets]);

  // Sync description with plan
  useEffect(() => {
    if (plan) {
      setDescription(plan.description);
    }
  }, [plan?.id]);

  // Build mention entities
  const mentionEntities = useMemo((): MentionEntity[] => {
    return projectAssets.map((asset) => {
      const assetType = asset.asset_type as 'character' | 'location' | 'prop';
      const prefix = getReferencePrefix(assetType);
      const reference = generateReferenceName(asset.name, prefix);
      const data = asset.data as Record<string, unknown> | null;

      return {
        reference,
        name: asset.name,
        type: assetType,
        visual_description: (data?.visual_description as string) || undefined,
        reference_images: asset.reference_images || undefined,
      };
    });
  }, [projectAssets]);

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <ImageIcon className="w-12 h-12 text-slate-600 mb-4" />
        <p className="text-slate-400">Sélectionnez un plan pour le modifier</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Storyboard preview */}
      <div className="rounded-xl overflow-hidden bg-slate-800/50 h-[350px] relative flex items-center justify-center">
        {plan.storyboard_image_url ? (
          <>
            <StorageImg
              src={plan.storyboard_image_url}
              alt={`Plan ${plan.shot_number}`}
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-3 right-3 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="bg-black/60 hover:bg-black/80 text-white border-0"
                onClick={() => onGenerate(plan.id)}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Régénérer
              </Button>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center">
            <ImageIcon className="w-12 h-12 text-slate-600 mb-4" />
            <Button
              onClick={() => onGenerate(plan.id)}
              disabled={isGenerating}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Génération...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Générer
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Plan Title */}
      <div className="space-y-2">
        <Label className="text-slate-300 text-sm">Nom du plan</Label>
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            onUpdate({ title: e.target.value || null });
          }}
          placeholder={getPlanDisplayTitle(plan)}
          className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
        />
      </div>

      {/* Duration */}
      <div className="space-y-2">
        <Label className="text-slate-300 text-sm">Durée</Label>
        <DurationPicker
          value={plan.duration}
          onChange={(duration) => onUpdate({ duration })}
        />
      </div>

      {/* Segments Timeline */}
      <div className="space-y-2">
        <Label className="text-slate-300 text-sm flex items-center gap-2">
          <Clapperboard className="w-4 h-4 text-indigo-400" />
          Segments (Shots)
        </Label>
        <SegmentTimeline
          segments={plan.segments || []}
          planDuration={plan.duration}
          selectedSegmentId={selectedSegmentId}
          onSelectSegment={setSelectedSegmentId}
          onSegmentsChange={handleSegmentsChange}
          onEditSegment={handleEditSegment}
        />
      </div>

      {/* Segment Editor Dialog */}
      <SegmentEditor
        segment={editingSegment}
        open={!!editingSegment}
        onOpenChange={(open) => !open && setEditingSegment(null)}
        onSave={handleSegmentSave}
        characters={characters}
        planDuration={plan.duration}
      />

      {/* Description */}
      <div className="space-y-2">
        <Label className="text-slate-300 text-sm">Description</Label>
        <MentionInput
          value={description}
          onChange={(newValue) => {
            setDescription(newValue);
            if (newValue !== plan.description) {
              onUpdate({ description: newValue });
            }
          }}
          placeholder="Décrivez le plan... (@Personnage #Lieu)"
          projectId={projectId}
          minHeight="100px"
        />
        {plan.description && (
          <div className="text-xs text-slate-500 mt-1">
            <MentionText text={plan.description} entities={mentionEntities} />
          </div>
        )}
      </div>

      {/* Camera settings */}
      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <Label className="text-slate-300 text-sm">Type de plan</Label>
          <Select
            value={plan.shot_type || ''}
            onValueChange={(v) => onUpdate({ shot_type: v as ShotType })}
          >
            <SelectTrigger className="bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="Sélectionner" />
            </SelectTrigger>
            <SelectContent className="bg-[#1a2e44] border-white/10">
              {SHOT_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-slate-300 text-sm">Angle</Label>
          <Select
            value={plan.camera_angle || ''}
            onValueChange={(v) => onUpdate({ camera_angle: v as CameraAngle })}
          >
            <SelectTrigger className="bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="Sélectionner" />
            </SelectTrigger>
            <SelectContent className="bg-[#1a2e44] border-white/10">
              {CAMERA_ANGLES.map((angle) => (
                <SelectItem key={angle.value} value={angle.value}>
                  {angle.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-slate-300 text-sm">Mouvement</Label>
          <Select
            value={plan.camera_movement || ''}
            onValueChange={(v) => onUpdate({ camera_movement: v as CameraMovement })}
          >
            <SelectTrigger className="bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="Sélectionner" />
            </SelectTrigger>
            <SelectContent className="bg-[#1a2e44] border-white/10">
              {CAMERA_MOVEMENTS.map((movement) => (
                <SelectItem key={movement.value} value={movement.value}>
                  {movement.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
