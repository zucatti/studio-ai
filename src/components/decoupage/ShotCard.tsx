'use client';

import { useState } from 'react';
import {
  GripVertical,
  Trash2,
  MoreVertical,
  ChevronUp,
  ChevronDown,
  Image,
  Video,
  Edit,
  Camera,
} from 'lucide-react';
import { StorageImg } from '@/components/ui/storage-image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CameraSettings } from './CameraSettings';
import { TimelineBinding } from './TimelineBinding';
import {
  SHOT_TYPES,
  CAMERA_ANGLES,
  CAMERA_MOVEMENTS,
  type ShotType,
  type CameraAngle,
  type CameraMovement,
} from '@/types/shot';
import { cn } from '@/lib/utils';

interface Character {
  id: string;
  name: string;
}

interface Shot {
  id: string;
  shot_number: number;
  description: string;
  shot_type: ShotType | null;
  camera_angle: CameraAngle | null;
  camera_movement: CameraMovement | null;
  camera_notes: string | null;
  storyboard_image_url: string | null;
  start_time: number | null;
  end_time: number | null;
  has_vocals: boolean;
  lip_sync_enabled: boolean;
  singing_character_id: string | null;
}

interface ShotCardProps {
  shot: Shot;
  sceneNumber: number;
  characters: Character[];
  hasAudio: boolean;
  currentAudioTime: number;
  onUpdate: (updates: Partial<Shot>) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}

export function ShotCard({
  shot,
  sceneNumber,
  characters,
  hasAudio,
  currentAudioTime,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst = false,
  isLast = false,
}: ShotCardProps) {
  const [description, setDescription] = useState(shot.description);
  const [showCameraDialog, setShowCameraDialog] = useState(false);

  const getShotTypeLabel = () => {
    if (!shot.shot_type) return null;
    return SHOT_TYPES.find((t) => t.value === shot.shot_type)?.label;
  };

  const getCameraAngleLabel = () => {
    if (!shot.camera_angle) return null;
    return CAMERA_ANGLES.find((a) => a.value === shot.camera_angle)?.label;
  };

  const getCameraMovementLabel = () => {
    if (!shot.camera_movement || shot.camera_movement === 'static') return null;
    return CAMERA_MOVEMENTS.find((m) => m.value === shot.camera_movement)?.label;
  };

  return (
    <>
      <div className="group relative rounded-lg border border-white/10 bg-white/5 overflow-hidden hover:border-white/20 transition-colors">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 border-b border-white/5">
          <div className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="w-4 h-4 text-slate-500" />
          </div>

          <span className="text-xs font-mono font-semibold text-white">
            S{sceneNumber}P{shot.shot_number}
          </span>

          {/* Camera badges */}
          <div className="flex items-center gap-1 flex-1">
            {getShotTypeLabel() && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                {getShotTypeLabel()}
              </span>
            )}
            {getCameraAngleLabel() && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                {getCameraAngleLabel()}
              </span>
            )}
            {getCameraMovementLabel() && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                {getCameraMovementLabel()}
              </span>
            )}
          </div>

          {/* Status icons */}
          <div className="flex items-center gap-1">
            {shot.storyboard_image_url && (
              <span title="Storyboard genere">
                <Image className="w-3.5 h-3.5 text-green-400" />
              </span>
            )}
            {shot.has_vocals && (
              <span title="Lip sync active">
                <Video className="w-3.5 h-3.5 text-red-400" />
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              onClick={onMoveUp}
              disabled={isFirst}
              className="h-6 w-6 text-slate-400 hover:text-white disabled:opacity-30"
            >
              <ChevronUp className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onMoveDown}
              disabled={isLast}
              className="h-6 w-6 text-slate-400 hover:text-white disabled:opacity-30"
            >
              <ChevronDown className="w-3 h-3" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-slate-400 hover:text-white"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[#1a2433] border-white/10">
                <DropdownMenuItem
                  onClick={() => setShowCameraDialog(true)}
                  className="text-slate-300 focus:text-white focus:bg-white/5"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Parametres camera
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-red-400 focus:text-red-300 focus:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Content */}
        <div className="p-3 space-y-3">
          {/* Storyboard thumbnail */}
          {shot.storyboard_image_url && (
            <div className="relative aspect-video w-full max-w-xs rounded overflow-hidden bg-black/20">
              <StorageImg
                src={shot.storyboard_image_url}
                alt={`Shot ${shot.shot_number} storyboard`}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Description */}
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              if (description !== shot.description) {
                onUpdate({ description });
              }
            }}
            placeholder="Description du plan..."
            className="bg-white/5 border-white/10 text-white text-sm min-h-[60px] resize-none placeholder:text-slate-500"
          />

          {/* Quick camera settings */}
          <CameraSettings
            shotType={shot.shot_type}
            cameraAngle={shot.camera_angle}
            cameraMovement={shot.camera_movement}
            cameraNotes={shot.camera_notes}
            onUpdate={onUpdate}
            compact
          />

          {/* Timeline binding */}
          {hasAudio && (
            <TimelineBinding
              startTime={shot.start_time}
              endTime={shot.end_time}
              hasVocals={shot.has_vocals}
              lipSyncEnabled={shot.lip_sync_enabled}
              singingCharacterId={shot.singing_character_id}
              characters={characters}
              currentTime={currentAudioTime}
              onSetStartTime={() => onUpdate({ start_time: currentAudioTime })}
              onSetEndTime={() => onUpdate({ end_time: currentAudioTime })}
              onToggleVocals={() =>
                onUpdate({
                  has_vocals: !shot.has_vocals,
                  lip_sync_enabled: !shot.has_vocals,
                })
              }
              onSetSingingCharacter={(id) => onUpdate({ singing_character_id: id })}
            />
          )}
        </div>
      </div>

      {/* Camera settings dialog */}
      <Dialog open={showCameraDialog} onOpenChange={setShowCameraDialog}>
        <DialogContent className="max-w-lg bg-[#0d1520] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Camera className="w-5 h-5 text-blue-400" />
              Parametres camera - S{sceneNumber}P{shot.shot_number}
            </DialogTitle>
          </DialogHeader>
          <CameraSettings
            shotType={shot.shot_type}
            cameraAngle={shot.camera_angle}
            cameraMovement={shot.camera_movement}
            cameraNotes={shot.camera_notes}
            onUpdate={onUpdate}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
