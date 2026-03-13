'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Camera, Move, Eye, StickyNote } from 'lucide-react';
import {
  SHOT_TYPES,
  CAMERA_ANGLES,
  CAMERA_MOVEMENTS,
  CAMERA_MOVEMENT_CATEGORIES,
  type ShotType,
  type CameraAngle,
  type CameraMovement,
} from '@/types/shot';

interface CameraSettingsProps {
  shotType: ShotType | null;
  cameraAngle: CameraAngle | null;
  cameraMovement: CameraMovement | null;
  cameraNotes: string | null;
  onUpdate: (updates: {
    shot_type?: ShotType | null;
    camera_angle?: CameraAngle | null;
    camera_movement?: CameraMovement | null;
    camera_notes?: string | null;
  }) => void;
  compact?: boolean;
}

export function CameraSettings({
  shotType,
  cameraAngle,
  cameraMovement,
  cameraNotes,
  onUpdate,
  compact = false,
}: CameraSettingsProps) {
  // Group movements by category
  const movementsByCategory = CAMERA_MOVEMENT_CATEGORIES.map((cat) => ({
    ...cat,
    movements: CAMERA_MOVEMENTS.filter((m) => m.category === cat.value),
  })).filter((cat) => cat.movements.length > 0);

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        <Select
          value={shotType || 'none'}
          onValueChange={(v) => onUpdate({ shot_type: v === 'none' ? null : (v as ShotType) })}
        >
          <SelectTrigger className="w-44 h-8 bg-white/5 border-white/10 text-white text-xs">
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent className="bg-[#1a2433] border-white/10">
            <SelectItem value="none" className="text-slate-400 text-xs">Aucun</SelectItem>
            {SHOT_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value} className="text-white text-xs">
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={cameraAngle || 'none'}
          onValueChange={(v) => onUpdate({ camera_angle: v === 'none' ? null : (v as CameraAngle) })}
        >
          <SelectTrigger className="w-36 h-8 bg-white/5 border-white/10 text-white text-xs">
            <SelectValue placeholder="Angle" />
          </SelectTrigger>
          <SelectContent className="bg-[#1a2433] border-white/10">
            <SelectItem value="none" className="text-slate-400 text-xs">Aucun</SelectItem>
            {CAMERA_ANGLES.map((angle) => (
              <SelectItem key={angle.value} value={angle.value} className="text-white text-xs">
                {angle.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={cameraMovement || 'none'}
          onValueChange={(v) => onUpdate({ camera_movement: v === 'none' ? null : (v as CameraMovement) })}
        >
          <SelectTrigger className="w-40 h-8 bg-white/5 border-white/10 text-white text-xs">
            <SelectValue placeholder="Mouvement" />
          </SelectTrigger>
          <SelectContent className="bg-[#1a2433] border-white/10 max-h-64">
            <SelectItem value="none" className="text-slate-400 text-xs">Aucun</SelectItem>
            {movementsByCategory.map((cat) => (
              <div key={cat.value}>
                <div className="px-2 py-1 text-[10px] text-slate-500 font-medium">
                  {cat.label}
                </div>
                {cat.movements.map((mov) => (
                  <SelectItem key={mov.value} value={mov.value} className="text-white text-xs pl-4">
                    {mov.label}
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Shot Type */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-slate-300 text-sm">
            <Camera className="w-4 h-4 text-blue-400" />
            Type de plan
          </Label>
          <Select
            value={shotType || 'none'}
            onValueChange={(v) => onUpdate({ shot_type: v === 'none' ? null : (v as ShotType) })}
          >
            <SelectTrigger className="bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="Selectionner..." />
            </SelectTrigger>
            <SelectContent className="bg-[#1a2433] border-white/10">
              <SelectItem value="none" className="text-slate-400">Aucun</SelectItem>
              {SHOT_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value} className="text-white">
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Camera Angle */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-slate-300 text-sm">
            <Eye className="w-4 h-4 text-green-400" />
            Angle
          </Label>
          <Select
            value={cameraAngle || 'none'}
            onValueChange={(v) => onUpdate({ camera_angle: v === 'none' ? null : (v as CameraAngle) })}
          >
            <SelectTrigger className="bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="Selectionner..." />
            </SelectTrigger>
            <SelectContent className="bg-[#1a2433] border-white/10">
              <SelectItem value="none" className="text-slate-400">Aucun</SelectItem>
              {CAMERA_ANGLES.map((angle) => (
                <SelectItem key={angle.value} value={angle.value} className="text-white">
                  {angle.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Camera Movement */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-slate-300 text-sm">
            <Move className="w-4 h-4 text-purple-400" />
            Mouvement
          </Label>
          <Select
            value={cameraMovement || 'none'}
            onValueChange={(v) => onUpdate({ camera_movement: v === 'none' ? null : (v as CameraMovement) })}
          >
            <SelectTrigger className="bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="Selectionner..." />
            </SelectTrigger>
            <SelectContent className="bg-[#1a2433] border-white/10 max-h-80">
              <SelectItem value="none" className="text-slate-400">Aucun</SelectItem>
              {movementsByCategory.map((cat) => (
                <div key={cat.value}>
                  <div className="px-2 py-1.5 text-xs text-slate-500 font-medium border-t border-white/5 first:border-0">
                    {cat.label}
                  </div>
                  {cat.movements.map((mov) => (
                    <SelectItem
                      key={mov.value}
                      value={mov.value}
                      className="text-white pl-4"
                      title={mov.description}
                    >
                      {mov.label}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Camera Notes */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2 text-slate-300 text-sm">
          <StickyNote className="w-4 h-4 text-yellow-400" />
          Notes techniques
        </Label>
        <Textarea
          value={cameraNotes || ''}
          onChange={(e) => onUpdate({ camera_notes: e.target.value || null })}
          placeholder="Notes sur le cadrage, l'eclairage, les accessoires..."
          className="bg-white/5 border-white/10 text-white min-h-[80px] resize-none"
        />
      </div>
    </div>
  );
}
