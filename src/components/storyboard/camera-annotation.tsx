'use client';

import { CameraAnnotation as CameraAnnotationType } from '@/types/shot';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Camera } from 'lucide-react';
import { CAMERA_ANGLES, CAMERA_MOVEMENTS, SHOT_TYPES } from '@/types/shot';

interface CameraAnnotationProps {
  annotation?: CameraAnnotationType;
  onChange: (annotation: CameraAnnotationType) => void;
  readOnly?: boolean;
}

export function CameraAnnotation({
  annotation,
  onChange,
  readOnly = false,
}: CameraAnnotationProps) {
  const handleChange = (
    field: keyof CameraAnnotationType,
    value: string
  ) => {
    onChange({
      angle: annotation?.angle || 'eye_level',
      shotType: annotation?.shotType || 'medium',
      ...annotation,
      [field]: value,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Camera className="w-4 h-4" />
          Annotations caméra
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label className="text-xs">Type de plan</Label>
            <Select
              value={annotation?.shotType || 'medium'}
              onValueChange={(v) => handleChange('shotType', v)}
              disabled={readOnly}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHOT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Angle</Label>
            <Select
              value={annotation?.angle || 'eye_level'}
              onValueChange={(v) => handleChange('angle', v)}
              disabled={readOnly}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAMERA_ANGLES.map((angle) => (
                  <SelectItem key={angle.value} value={angle.value}>
                    {angle.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Mouvement</Label>
            <Select
              value={annotation?.movement || 'static'}
              onValueChange={(v) => handleChange('movement', v)}
              disabled={readOnly}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAMERA_MOVEMENTS.map((movement) => (
                  <SelectItem key={movement.value} value={movement.value}>
                    {movement.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Notes (optionnel)</Label>
            <Textarea
              value={annotation?.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Notes supplémentaires..."
              rows={2}
              disabled={readOnly}
              className="text-sm"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
