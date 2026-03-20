'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MentionInput } from '@/components/ui/mention-input';
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
import { DurationPicker } from './DurationPicker';
import { Switch } from '@/components/ui/switch';
import { Loader2, ImageIcon, Film, Play, Mic, RefreshCw, Check, ChevronRight, X } from 'lucide-react';
import { useBibleStore } from '@/store/bible-store';
import { generateReferenceName, getReferencePrefix } from '@/lib/reference-name';
import type { Plan } from '@/store/shorts-store';
import type { ShotType, CameraAngle, CameraMovement, AspectRatio } from '@/types/database';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Shot types
const SHOT_TYPES: { value: ShotType; label: string }[] = [
  { value: 'wide', label: 'Plan large' },
  { value: 'medium', label: 'Plan moyen' },
  { value: 'close_up', label: 'Gros plan' },
  { value: 'extreme_close_up', label: 'Très gros plan' },
  { value: 'over_shoulder', label: 'Par-dessus épaule' },
  { value: 'pov', label: 'Point de vue' },
];

// Camera angles
const CAMERA_ANGLES: { value: CameraAngle; label: string }[] = [
  { value: 'eye_level', label: 'Niveau des yeux' },
  { value: 'low_angle', label: 'Contre-plongée' },
  { value: 'high_angle', label: 'Plongée' },
  { value: 'dutch_angle', label: 'Angle hollandais' },
  { value: 'birds_eye', label: 'Vue aérienne' },
  { value: 'worms_eye', label: 'Contre-plongée extrême' },
];

// Camera movements
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

// Visual styles
const VISUAL_STYLES = [
  { value: 'photorealistic', label: 'Cinématique' },
  { value: 'pixar', label: 'Pixar 3D' },
  { value: 'cartoon', label: 'Cartoon' },
  { value: 'anime', label: 'Anime' },
  { value: 'illustration', label: 'Illustration' },
  { value: 'watercolor', label: 'Aquarelle' },
  { value: 'oil_painting', label: 'Peinture' },
  { value: 'noir', label: 'Film Noir' },
];

// Image generation models
const IMAGE_MODELS = [
  { value: 'kling-o1', label: 'Kling O1', description: 'Meilleure consistance personnages' },
  { value: 'nano-banana-2', label: 'Nano Banana 2', description: 'Rapide, Gemini 3.1' },
  { value: 'flux-pro', label: 'Flux Pro', description: 'Haute qualité' },
];

// Image resolutions
const IMAGE_RESOLUTIONS = [
  { value: '1K', label: '1K', description: '1024px' },
  { value: '2K', label: '2K', description: '2048px' },
  { value: '4K', label: '4K', description: '4096px' },
];

// Video generation models (via PiAPI)
const VIDEO_MODELS = [
  { value: 'kling-omni', label: 'Kling Omni', description: 'Kuaishou, meilleure qualité' },
  { value: 'seedance-2', label: 'Seedance 2', description: 'ByteDance, 15s max' },
  { value: 'sora-2', label: 'Sora 2', description: 'OpenAI, dernière version' },
  { value: 'veo-3', label: 'Veo 3', description: 'Google, dernière version' },
  { value: 'kling-2', label: 'Kling 2.0', description: 'Kuaishou, 10s' },
  { value: 'wan-2.1', label: 'Wan 2.1', description: 'Alibaba, 5s' },
  { value: 'hunyuan', label: 'Hunyuan', description: 'Tencent, 5s' },
];

// Aspect ratio dimensions for preview
const ASPECT_RATIO_CONFIG: Record<AspectRatio, { width: number; height: number; label: string; isPortrait: boolean }> = {
  '9:16': { width: 9, height: 16, label: 'Vertical', isPortrait: true },
  '16:9': { width: 16, height: 9, label: 'Horizontal', isPortrait: false },
  '1:1': { width: 1, height: 1, label: 'Carré', isPortrait: false },
  '4:5': { width: 4, height: 5, label: 'Portrait', isPortrait: true },
  '2:3': { width: 2, height: 3, label: 'Photo', isPortrait: true },
  '21:9': { width: 21, height: 9, label: 'Cinéma', isPortrait: false },
};

interface PlanEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: Plan | null;
  projectId: string;
  aspectRatio: AspectRatio;
  onUpdate: (updates: Partial<Plan>) => void;
  onGenerateFrames: (planId: string, frameType: 'first' | 'last' | 'both', options: GenerationOptions) => Promise<void>;
  onGenerateVideo: (planId: string, options: VideoGenerationOptions) => Promise<void>;
  isGeneratingFrames: boolean;
  isGeneratingVideo: boolean;
}

export interface GenerationOptions {
  visualStyle: string;
  imageModel: string;
  resolution: string;
}

export interface VideoGenerationOptions {
  videoModel: string;
  duration: number;
}

type SelectedFrame = 'in' | 'out' | null;

export function PlanEditorModal({
  open,
  onOpenChange,
  plan,
  projectId,
  aspectRatio,
  onUpdate,
  onGenerateFrames,
  onGenerateVideo,
  isGeneratingFrames,
  isGeneratingVideo,
}: PlanEditorModalProps) {
  // Selected frame for editing
  const [selectedFrame, setSelectedFrame] = useState<SelectedFrame>(null);

  // Description for each frame
  const [descriptionIn, setDescriptionIn] = useState('');
  const [descriptionOut, setDescriptionOut] = useState('');

  // Dialogue settings
  const [hasDialogue, setHasDialogue] = useState(false);
  const [dialogueText, setDialogueText] = useState('');
  const [dialogueCharacterId, setDialogueCharacterId] = useState<string | null>(null);

  // Generation settings
  const [visualStyle, setVisualStyle] = useState('photorealistic');
  const [imageModel, setImageModel] = useState('kling-o1');
  const [resolution, setResolution] = useState('2K');
  const [videoModel, setVideoModel] = useState('kling-omni');

  // Hover states
  const [hoveredFrame, setHoveredFrame] = useState<'in' | 'out' | null>(null);

  const { projectAssets, fetchProjectAssets } = useBibleStore();

  // Fetch project assets for mentions
  useEffect(() => {
    fetchProjectAssets(projectId);
  }, [projectId, fetchProjectAssets]);

  // Reset selected frame when modal closes
  useEffect(() => {
    if (!open) {
      setSelectedFrame(null);
    }
  }, [open]);

  // Sync state with plan
  useEffect(() => {
    if (plan) {
      const desc = plan.description || '';
      const separator = ' | OUT: ';
      const inPrefix = 'IN: ';

      if (desc.startsWith(inPrefix) && desc.includes(separator)) {
        const sepIndex = desc.indexOf(separator);
        setDescriptionIn(desc.substring(inPrefix.length, sepIndex).trim());
        setDescriptionOut(desc.substring(sepIndex + separator.length).trim());
      } else {
        setDescriptionIn(desc);
        setDescriptionOut('');
      }
      setHasDialogue(plan.has_dialogue ?? false);
      setDialogueText(plan.dialogue_text ?? '');
      setDialogueCharacterId(plan.dialogue_character_id ?? null);
    }
  }, [plan?.id, plan?.description, plan?.has_dialogue, plan?.dialogue_text, plan?.dialogue_character_id]);

  // Get characters for dialogue picker
  const dialogueCharacters = useMemo(() => {
    return projectAssets
      .filter((asset) => asset.asset_type === 'character')
      .map((asset) => {
        const data = asset.data as Record<string, unknown> | null;
        return {
          id: asset.id,
          name: asset.name,
          voice_id: (data?.voice_id as string) || null,
        };
      });
  }, [projectAssets]);

  const ratioConfig = ASPECT_RATIO_CONFIG[aspectRatio] || ASPECT_RATIO_CONFIG['9:16'];

  // Calculate frame preview dimensions - fill available height
  const getFrameStyle = () => {
    // Use most of the available height (90vh modal - header ~100px - padding)
    const maxFrameHeight = 550;
    const ratio = ratioConfig.width / ratioConfig.height;
    const height = maxFrameHeight;
    const width = height * ratio;
    return { width, height };
  };

  const frameStyle = getFrameStyle();

  if (!plan) return null;

  // Combine descriptions for storage
  const combineDescriptions = (inDesc: string, outDesc: string): string => {
    if (!outDesc.trim()) return inDesc;
    return `IN: ${inDesc} | OUT: ${outDesc}`;
  };

  const handleDescriptionChange = (value: string, type: 'in' | 'out') => {
    if (type === 'in') {
      setDescriptionIn(value);
      onUpdate({ description: combineDescriptions(value, descriptionOut) });
    } else {
      setDescriptionOut(value);
      onUpdate({ description: combineDescriptions(descriptionIn, value) });
    }
  };

  const handleGenerateFrame = async (type: 'in' | 'out') => {
    const frameType = type === 'in' ? 'first' : 'last';
    await onGenerateFrames(plan.id, frameType, { visualStyle, imageModel, resolution });
    toast.success(`Frame ${type === 'in' ? 'In' : 'Out'} générée`);
  };

  const handleGenerateBothFrames = async () => {
    await onGenerateFrames(plan.id, 'both', { visualStyle, imageModel, resolution });
    toast.success('Frames générées');
  };

  const handleGenerateVideo = async () => {
    if (!plan.storyboard_image_url) {
      toast.error('Générez d\'abord la Frame In');
      return;
    }
    await onGenerateVideo(plan.id, { videoModel, duration: plan.duration });
    toast.success('Vidéo en cours de génération...');
  };

  const hasFrameIn = !!plan.storyboard_image_url;
  const hasFrameOut = !!plan.last_frame_url;
  const canGenerateVideo = hasFrameIn && hasFrameOut;

  // Render a frame
  const renderFrame = (type: 'in' | 'out') => {
    const imageUrl = type === 'in' ? plan.storyboard_image_url : plan.last_frame_url;
    const hasImage = !!imageUrl;
    const isSelected = selectedFrame === type;
    const isHovered = hoveredFrame === type;
    const label = type === 'in' ? 'Frame In' : 'Frame Out';
    const borderColor = type === 'in' ? 'border-green-500' : 'border-red-500';
    const borderColorDim = type === 'in' ? 'border-green-500/30' : 'border-red-500/30';
    const labelBg = type === 'in' ? 'bg-green-500/80' : 'bg-red-500/80';

    return (
      <div
        className={cn(
          'relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200',
          isSelected ? `ring-2 ${borderColor} ring-offset-2 ring-offset-[#0a0e12]` : borderColorDim,
          'border-2'
        )}
        style={frameStyle}
        onMouseEnter={() => setHoveredFrame(type)}
        onMouseLeave={() => setHoveredFrame(null)}
        onClick={() => setSelectedFrame(isSelected ? null : type)}
      >
        {/* Image or placeholder */}
        {hasImage ? (
          <StorageImg
            src={imageUrl}
            alt={label}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-slate-800/50 flex items-center justify-center">
            <ImageIcon className="w-16 h-16 text-slate-600" />
          </div>
        )}

        {/* Label - top left inside image */}
        <div className={cn('absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-medium text-white', labelBg)}>
          {label}
        </div>

        {/* Hover overlay with Play/Refresh - only button is clickable for generation */}
        {isHovered && !isGeneratingFrames && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center pointer-events-none">
            <button
              className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center hover:bg-white/40 transition-colors pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation();
                handleGenerateFrame(type);
              }}
            >
              {hasImage ? (
                <RefreshCw className="w-6 h-6 text-white" />
              ) : (
                <Play className="w-8 h-8 text-white fill-white" />
              )}
            </button>
          </div>
        )}

        {/* Loading overlay */}
        {isGeneratingFrames && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-white animate-spin" />
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] bg-[#0f1419] border-white/10 p-0 overflow-hidden flex flex-col">
        {/* HEADER */}
        <DialogHeader className="px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-white flex items-center gap-2">
              <Film className="w-5 h-5 text-blue-400" />
              Plan {plan.shot_number}
              <span className="ml-2 px-2 py-0.5 rounded bg-white/5 text-xs text-slate-400">
                {ratioConfig.label} ({aspectRatio})
              </span>
            </DialogTitle>
          </div>

          {/* Camera Settings Row */}
          <div className="flex items-center gap-4 mt-4">
            <div className="flex items-center gap-2">
              <Label className="text-slate-400 text-xs whitespace-nowrap">Durée</Label>
              <DurationPicker
                value={plan.duration}
                onChange={(duration) => onUpdate({ duration })}
                compact
              />
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-slate-400 text-xs whitespace-nowrap">Type</Label>
              <Select
                value={plan.shot_type || ''}
                onValueChange={(v) => onUpdate({ shot_type: v as ShotType })}
              >
                <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-xs w-[130px]">
                  <SelectValue placeholder="..." />
                </SelectTrigger>
                <SelectContent className="bg-[#1a2e44] border-white/10">
                  {SHOT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value} className="text-xs">
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-slate-400 text-xs whitespace-nowrap">Angle</Label>
              <Select
                value={plan.camera_angle || ''}
                onValueChange={(v) => onUpdate({ camera_angle: v as CameraAngle })}
              >
                <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-xs w-[140px]">
                  <SelectValue placeholder="..." />
                </SelectTrigger>
                <SelectContent className="bg-[#1a2e44] border-white/10">
                  {CAMERA_ANGLES.map((angle) => (
                    <SelectItem key={angle.value} value={angle.value} className="text-xs">
                      {angle.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-slate-400 text-xs whitespace-nowrap">Mouvement</Label>
              <Select
                value={plan.camera_movement || ''}
                onValueChange={(v) => onUpdate({ camera_movement: v as CameraMovement })}
              >
                <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-xs w-[140px]">
                  <SelectValue placeholder="..." />
                </SelectTrigger>
                <SelectContent className="bg-[#1a2e44] border-white/10">
                  {CAMERA_MOVEMENTS.map((movement) => (
                    <SelectItem key={movement.value} value={movement.value} className="text-xs">
                      {movement.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogHeader>

        {/* MAIN CONTENT */}
        <div className="flex flex-1 overflow-hidden">
          {/* CENTER: Frames Area - fills all available height */}
          <div className="flex-1 p-4 flex bg-[#0a0e12] overflow-hidden">
            {/* Frames container - frames at edges when selected */}
            <div className={cn(
              "flex w-full",
              selectedFrame ? "justify-between items-stretch h-full" : "justify-center items-center h-full"
            )}>
              {/* Frame In - pushed to left when selected */}
              <div className="flex-shrink-0 flex items-center">
                {renderFrame('in')}
              </div>

              {/* Middle section: Arrow or Edit Panel */}
              {selectedFrame ? (
                // Edit Panel in the middle - uses frame height as reference
                <div className="flex-1 mx-4 flex items-center justify-center">
                  <div
                    className={cn(
                      "bg-slate-900/95 backdrop-blur border rounded-xl p-4 shadow-2xl flex flex-col w-full",
                      selectedFrame === 'in' ? 'border-green-500/50' : 'border-red-500/50'
                    )}
                    style={{ height: Math.min(frameStyle.height, 500) }}
                  >
                    {/* Header - compact */}
                    <div className="flex items-center justify-between mb-2 flex-shrink-0">
                      <span className={cn(
                        "text-sm font-medium",
                        selectedFrame === 'in' ? 'text-green-400' : 'text-red-400'
                      )}>
                        {selectedFrame === 'in' ? 'Frame In' : 'Frame Out'}
                      </span>
                      <Button
                        size="sm"
                        className="bg-white/10 hover:bg-white/20 text-white h-7"
                        onClick={() => setSelectedFrame(null)}
                      >
                        <Check className="w-3 h-3 mr-1" />
                        OK
                      </Button>
                    </div>

                    {/* Content area - splits between description and dialogue */}
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                      {/* Description - fills available space */}
                      <div className={cn(
                        "flex flex-col min-h-0",
                        hasDialogue ? "flex-[3]" : "flex-1"
                      )}>
                        <Label className="text-slate-400 text-xs mb-1 block flex-shrink-0">Description</Label>
                        <div className="flex-1 min-h-0">
                          <MentionInput
                            value={selectedFrame === 'in' ? descriptionIn : descriptionOut}
                            onChange={(v) => handleDescriptionChange(v, selectedFrame)}
                            placeholder="Décrivez la scène... (@Personnage #Lieu)"
                            projectId={projectId}
                            minHeight="100%"
                            className="h-full"
                          />
                        </div>
                      </div>

                      {/* Dialogue section - dynamic height */}
                      <div className={cn(
                        "border-t border-white/10 pt-2 mt-2",
                        hasDialogue ? "flex-[2] flex flex-col min-h-0" : "flex-shrink-0"
                      )}>
                        {/* Dialogue header: Personnage à gauche, toggle à droite */}
                        <div className="flex items-center justify-between flex-shrink-0">
                          <div className="flex items-center gap-2">
                            <Mic className="w-3 h-3 text-slate-400" />
                            {hasDialogue ? (
                              <Select
                                value={dialogueCharacterId || ''}
                                onValueChange={(v) => {
                                  setDialogueCharacterId(v);
                                  onUpdate({ dialogue_character_id: v });
                                }}
                              >
                                <SelectTrigger className="bg-white/5 border-white/10 text-white h-7 text-xs w-32">
                                  <SelectValue placeholder="Personnage" />
                                </SelectTrigger>
                                <SelectContent className="bg-[#1a2e44] border-white/10">
                                  {dialogueCharacters.map((char) => (
                                    <SelectItem key={char.id} value={char.id} className="text-xs">
                                      {char.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Label className="text-slate-400 text-xs">Dialogue</Label>
                            )}
                          </div>
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <Label className="text-slate-500 text-xs">{hasDialogue ? 'ON' : 'OFF'}</Label>
                            <Switch
                              checked={hasDialogue}
                              onCheckedChange={(checked) => {
                                setHasDialogue(checked);
                                onUpdate({ has_dialogue: checked });
                              }}
                            />
                          </div>
                        </div>
                        {hasDialogue && (
                          <textarea
                            value={dialogueText}
                            onChange={(e) => {
                              setDialogueText(e.target.value);
                              onUpdate({ dialogue_text: e.target.value });
                            }}
                            placeholder="Ce que le personnage dit..."
                            className="flex-1 mt-2 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 resize-none min-h-[60px]"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                // Button to generate both when no selection
                <div className="flex-shrink-0 px-8">
                  <Button
                    variant="outline"
                    size="lg"
                    className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                    onClick={handleGenerateBothFrames}
                    disabled={isGeneratingFrames}
                  >
                    {isGeneratingFrames ? (
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    ) : (
                      <Play className="w-5 h-5 mr-2 fill-current" />
                    )}
                    Générer
                  </Button>
                </div>
              )}

              {/* Frame Out - pushed to right when selected */}
              <div className="flex-shrink-0 flex items-center">
                {renderFrame('out')}
              </div>
            </div>
          </div>


          {/* RIGHT PANEL: Generation Settings */}
          <div className="w-[260px] flex-shrink-0 border-l border-white/10 p-4 overflow-y-auto space-y-4 bg-[#0d1218]">
            {/* Image Generation Section */}
            <div>
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                Génération d'images
              </h3>

              <div className="space-y-3">
                <div>
                  <Label className="text-slate-300 text-xs mb-1 block">Style visuel</Label>
                  <Select value={visualStyle} onValueChange={setVisualStyle}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a2e44] border-white/10">
                      {VISUAL_STYLES.map((style) => (
                        <SelectItem key={style.value} value={style.value} className="text-xs">
                          {style.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-slate-400 text-xs mb-1 block">Modèle</Label>
                  <Select value={imageModel} onValueChange={setImageModel}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a2e44] border-white/10">
                      {IMAGE_MODELS.map((model) => (
                        <SelectItem key={model.value} value={model.value} className="text-xs">
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-slate-400 text-xs mb-1 block">Résolution</Label>
                  <Select value={resolution} onValueChange={setResolution}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a2e44] border-white/10">
                      {IMAGE_RESOLUTIONS.map((res) => (
                        <SelectItem key={res.value} value={res.value} className="text-xs">
                          {res.label} ({res.description})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="border-t border-white/5" />

            {/* Video Generation Section */}
            <div>
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                Génération vidéo
              </h3>

              <div className="space-y-3">
                <div>
                  <Label className="text-slate-300 text-xs mb-1 block">Modèle</Label>
                  <Select value={videoModel} onValueChange={setVideoModel}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a2e44] border-white/10">
                      {VIDEO_MODELS.map((model) => (
                        <SelectItem key={model.value} value={model.value} className="text-xs">
                          <div>
                            <span>{model.label}</span>
                            <span className="text-slate-500 ml-1">{model.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className={cn(
                    'w-full',
                    canGenerateVideo
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                      : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  )}
                  onClick={handleGenerateVideo}
                  disabled={!canGenerateVideo || isGeneratingVideo}
                >
                  {isGeneratingVideo ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Génération...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2 fill-current" />
                      Générer la vidéo
                    </>
                  )}
                </Button>

                {!canGenerateVideo && (
                  <p className="text-[10px] text-slate-500 text-center">
                    Frame In et Out requises
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
