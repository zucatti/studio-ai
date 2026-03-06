'use client';

import { Shot, SHOT_TYPES, CAMERA_ANGLES, CAMERA_MOVEMENTS } from '@/types/shot';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Camera, MessageSquare, Clapperboard } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShotCardProps {
  shot: Shot;
  onEdit?: () => void;
  onDelete?: () => void;
  compact?: boolean;
}

export function ShotCard({ shot, onEdit, onDelete, compact = false }: ShotCardProps) {
  const shotTypeLabel = SHOT_TYPES.find(
    (t) => t.value === shot.cameraAnnotation?.shotType
  )?.label;
  const angleLabel = CAMERA_ANGLES.find(
    (a) => a.value === shot.cameraAnnotation?.angle
  )?.label;
  const movementLabel = CAMERA_MOVEMENTS.find(
    (m) => m.value === shot.cameraAnnotation?.movement
  )?.label;

  return (
    <Card className={cn('transition-colors hover:bg-muted/50', compact && 'p-2')}>
      <CardContent className={cn('p-4', compact && 'p-2')}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="font-mono text-xs">
                Plan {shot.shotNumber}
              </Badge>
              {shot.cameraAnnotation && (
                <div className="flex items-center gap-1">
                  {shotTypeLabel && (
                    <Badge variant="secondary" className="text-xs">
                      <Camera className="w-3 h-3 mr-1" />
                      {shotTypeLabel}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <p className="text-sm mb-2">{shot.description}</p>

            {shot.cameraAnnotation && (
              <div className="flex flex-wrap gap-1 mb-2">
                {angleLabel && (
                  <Badge variant="outline" className="text-xs">
                    {angleLabel}
                  </Badge>
                )}
                {movementLabel && (
                  <Badge variant="outline" className="text-xs">
                    {movementLabel}
                  </Badge>
                )}
              </div>
            )}

            {shot.dialogues.length > 0 && (
              <div className="mt-3 space-y-2">
                {shot.dialogues.map((dialogue) => (
                  <div
                    key={dialogue.id}
                    className="pl-3 border-l-2 border-primary/30"
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-3 h-3 text-muted-foreground" />
                      <span className="font-semibold text-xs uppercase">
                        {dialogue.characterName}
                      </span>
                      {dialogue.parenthetical && (
                        <span className="text-xs text-muted-foreground italic">
                          ({dialogue.parenthetical})
                        </span>
                      )}
                    </div>
                    <p className="text-sm italic mt-1">{dialogue.text}</p>
                  </div>
                ))}
              </div>
            )}

            {shot.actions.length > 0 && (
              <div className="mt-3 space-y-1">
                {shot.actions.map((action) => (
                  <div
                    key={action.id}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <Clapperboard className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>{action.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!compact && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
