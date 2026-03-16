'use client';

import { Shot, SHOT_TYPES, CAMERA_ANGLES, CAMERA_MOVEMENTS } from '@/types/shot';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProjectMentionText } from '@/components/ui/project-mention-text';
import { StorageImg } from '@/components/ui/storage-image';
import { ImagePlus, Camera, MessageSquare, Clapperboard } from 'lucide-react';

interface ShotViewerProps {
  shot: Shot;
  sceneName?: string;
  onUploadImage?: () => void;
}

export function ShotViewer({ shot, sceneName, onUploadImage }: ShotViewerProps) {
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
    <div className="space-y-4">
      {/* Main Image */}
      <Card className="overflow-hidden">
        <div className="aspect-video relative bg-muted flex items-center justify-center">
          {shot.storyboardImage ? (
            <StorageImg
              src={shot.storyboardImage}
              alt={`Plan ${shot.shotNumber}`}
              className="object-contain w-full h-full"
            />
          ) : (
            <div className="flex flex-col items-center gap-4 text-muted-foreground">
              <ImagePlus className="w-16 h-16" />
              <p>Aucune image de storyboard</p>
              <Button variant="outline" onClick={onUploadImage}>
                <ImagePlus className="w-4 h-4 mr-2" />
                Ajouter une image
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Shot Info */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono">
              Plan {shot.shotNumber}
            </Badge>
            {sceneName && (
              <Badge variant="secondary" className="text-xs">
                {sceneName}
              </Badge>
            )}
          </div>

          <p className="text-sm">
            <ProjectMentionText text={shot.description} />
          </p>

          {/* Camera annotations */}
          {shot.cameraAnnotation && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Caméra</span>
              </div>
              <div className="flex flex-wrap gap-2 pl-6">
                {shotTypeLabel && (
                  <Badge variant="outline">{shotTypeLabel}</Badge>
                )}
                {angleLabel && <Badge variant="outline">{angleLabel}</Badge>}
                {movementLabel && (
                  <Badge variant="outline">{movementLabel}</Badge>
                )}
              </div>
              {shot.cameraAnnotation.notes && (
                <p className="text-sm text-muted-foreground pl-6">
                  {shot.cameraAnnotation.notes}
                </p>
              )}
            </div>
          )}

          {/* Dialogues */}
          {shot.dialogues.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Dialogues</span>
              </div>
              <div className="space-y-2 pl-6">
                {shot.dialogues.map((dialogue) => (
                  <div
                    key={dialogue.id}
                    className="border-l-2 border-primary/30 pl-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs uppercase">
                        {dialogue.characterName}
                      </span>
                      {dialogue.parenthetical && (
                        <span className="text-xs text-muted-foreground italic">
                          ({dialogue.parenthetical})
                        </span>
                      )}
                    </div>
                    <p className="text-sm italic">
                      <ProjectMentionText text={dialogue.text} />
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {shot.actions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clapperboard className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Actions</span>
              </div>
              <div className="space-y-1 pl-6">
                {shot.actions.map((action) => (
                  <p key={action.id} className="text-sm text-muted-foreground">
                    <ProjectMentionText text={action.description} />
                  </p>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
