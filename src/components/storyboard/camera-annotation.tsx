'use client';

import { useState, useRef } from 'react';
import { CameraAnnotation as CameraAnnotationType, CameraMovement } from '@/types/shot';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Camera, Info, Play } from 'lucide-react';
import {
  CAMERA_ANGLES,
  CAMERA_MOVEMENTS,
  CAMERA_MOVEMENT_CATEGORIES,
  SHOT_TYPES,
  getMovementsByCategory,
  getMovementDefinition,
  CameraMovementCategory,
} from '@/types/shot';
import { cn } from '@/lib/utils';

interface CameraAnnotationProps {
  annotation?: CameraAnnotationType;
  onChange: (annotation: CameraAnnotationType) => void;
  readOnly?: boolean;
}

// Check if preview exists for a movement
const getPreviewUrl = (movementKey: string): string | null => {
  // These will be generated and stored in public/camera-movements/
  return `/camera-movements/${movementKey}.mp4`;
};

export function CameraAnnotation({
  annotation,
  onChange,
  readOnly = false,
}: CameraAnnotationProps) {
  const [showMovementPicker, setShowMovementPicker] = useState(false);

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

  const selectedMovement = getMovementDefinition(annotation?.movement as CameraMovement || 'static');

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
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Mouvement</Label>
              <Dialog open={showMovementPicker} onOpenChange={setShowMovementPicker}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 text-xs">
                    <Info className="w-3 h-3 mr-1" />
                    Guide visuel
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-5xl max-h-[85vh]">
                  <DialogHeader>
                    <DialogTitle>Mouvements de caméra</DialogTitle>
                  </DialogHeader>
                  <CameraMovementPicker
                    selected={annotation?.movement as CameraMovement}
                    onSelect={(movement) => {
                      handleChange('movement', movement);
                      setShowMovementPicker(false);
                    }}
                    disabled={readOnly}
                  />
                </DialogContent>
              </Dialog>
            </div>

            {/* Movement selector with preview on hover */}
            <TooltipProvider delayDuration={200}>
              <Select
                value={annotation?.movement || 'static'}
                onValueChange={(v) => handleChange('movement', v)}
                disabled={readOnly}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {CAMERA_MOVEMENT_CATEGORIES.map((cat) => {
                    const movements = getMovementsByCategory(cat.value);
                    if (movements.length === 0) return null;
                    return (
                      <SelectGroup key={cat.value}>
                        <SelectLabel className="text-xs text-muted-foreground uppercase tracking-wider">
                          {cat.label}
                        </SelectLabel>
                        {movements.map((movement) => (
                          <SelectItem key={movement.value} value={movement.value}>
                            <div className="flex items-center gap-2">
                              <span>{movement.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
            </TooltipProvider>

            {/* Preview and description for selected movement */}
            {selectedMovement && selectedMovement.value !== 'static' && (
              <div className="mt-2 space-y-2">
                <MovementPreview movementKey={selectedMovement.value} />
                <p className="text-xs text-muted-foreground">
                  {selectedMovement.description}
                </p>
              </div>
            )}
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

// Movement preview component (auto-playing video/GIF)
function MovementPreview({ movementKey }: { movementKey: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasError, setHasError] = useState(false);
  const previewUrl = getPreviewUrl(movementKey);

  if (!previewUrl || hasError) {
    return (
      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Play className="w-6 h-6 mx-auto mb-1" />
          <span className="text-xs">Aperçu non disponible</span>
        </div>
      </div>
    );
  }

  return (
    <div className="aspect-video bg-muted rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        src={previewUrl}
        className="w-full h-full object-cover"
        autoPlay
        loop
        muted
        playsInline
        onError={() => setHasError(true)}
      />
    </div>
  );
}

// Full camera movement picker with previews
interface CameraMovementPickerProps {
  selected?: CameraMovement;
  onSelect: (movement: CameraMovement) => void;
  disabled?: boolean;
}

function CameraMovementPicker({ selected, onSelect, disabled }: CameraMovementPickerProps) {
  const [activeCategory, setActiveCategory] = useState<CameraMovementCategory>('dolly');
  const [hoveredMovement, setHoveredMovement] = useState<string | null>(null);

  const movements = getMovementsByCategory(activeCategory);

  return (
    <div className="flex gap-4 h-[65vh]">
      {/* Categories sidebar */}
      <div className="w-48 space-y-1 flex-shrink-0">
        <p className="text-xs text-muted-foreground mb-2 px-2">Catégories</p>
        {CAMERA_MOVEMENT_CATEGORIES.map((cat) => {
          const count = getMovementsByCategory(cat.value).length;
          return (
            <Button
              key={cat.value}
              variant={activeCategory === cat.value ? 'secondary' : 'ghost'}
              className="w-full justify-between text-sm h-9"
              onClick={() => setActiveCategory(cat.value)}
            >
              <span>{cat.label}</span>
              <span className="text-xs text-muted-foreground">{count}</span>
            </Button>
          );
        })}
      </div>

      {/* Movements grid */}
      <ScrollArea className="flex-1">
        <div className="grid grid-cols-3 gap-3 pr-4">
          {movements.map((movement) => {
            const previewUrl = getPreviewUrl(movement.value);
            const isHovered = hoveredMovement === movement.value;

            return (
              <div
                key={movement.value}
                className={cn(
                  'group relative border rounded-lg overflow-hidden cursor-pointer transition-all',
                  'hover:ring-2 hover:ring-primary/50 hover:border-primary',
                  selected === movement.value && 'ring-2 ring-primary border-primary',
                  disabled && 'opacity-50 pointer-events-none'
                )}
                onClick={() => onSelect(movement.value)}
                onMouseEnter={() => setHoveredMovement(movement.value)}
                onMouseLeave={() => setHoveredMovement(null)}
              >
                {/* Preview area */}
                <div className="aspect-video bg-muted relative">
                  {previewUrl ? (
                    <video
                      src={previewUrl}
                      className="w-full h-full object-cover"
                      autoPlay={isHovered}
                      loop
                      muted
                      playsInline
                      poster={`/camera-movements/${movement.value}.jpg`}
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                      <Play className="w-6 h-6 mb-1" />
                      <span className="text-[10px]">Aperçu</span>
                    </div>
                  )}

                  {/* Selected indicator */}
                  {selected === movement.value && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <svg className="w-3 h-3 text-primary-foreground" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Label */}
                <div className="p-2">
                  <h4 className="font-medium text-xs truncate">{movement.label}</h4>
                  <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                    {movement.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Large preview panel */}
      <div className="w-72 flex-shrink-0 border-l pl-4">
        {hoveredMovement || selected ? (
          <MovementDetailPanel movementKey={hoveredMovement || selected!} />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Survolez un mouvement pour voir l&apos;aperçu
          </div>
        )}
      </div>
    </div>
  );
}

function MovementDetailPanel({ movementKey }: { movementKey: string }) {
  const movement = getMovementDefinition(movementKey as CameraMovement);
  const [hasError, setHasError] = useState(false);

  if (!movement) return null;

  const previewUrl = getPreviewUrl(movementKey);

  return (
    <div className="space-y-3">
      {/* Video preview */}
      <div className="aspect-video bg-muted rounded-lg overflow-hidden">
        {previewUrl && !hasError ? (
          <video
            key={movementKey}
            src={previewUrl}
            className="w-full h-full object-cover"
            autoPlay
            loop
            muted
            playsInline
            onError={() => setHasError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <Play className="w-8 h-8" />
          </div>
        )}
      </div>

      {/* Info */}
      <div>
        <h3 className="font-semibold text-sm">{movement.label}</h3>
        <p className="text-xs text-muted-foreground mt-1">{movement.description}</p>
      </div>

      {/* Prompt template */}
      <div>
        <p className="text-[10px] font-medium text-muted-foreground mb-1">MODÈLE DE PROMPT</p>
        <div className="bg-muted rounded p-2 text-xs font-mono leading-relaxed">
          {movement.promptTemplate}
        </div>
      </div>
    </div>
  );
}

// Compact badge for displaying selected movement
export function CameraMovementBadge({ movement }: { movement: CameraMovement }) {
  const def = getMovementDefinition(movement);
  if (!def || def.value === 'static') return null;

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-500/10 text-blue-500 font-medium">
      {def.label}
    </span>
  );
}
