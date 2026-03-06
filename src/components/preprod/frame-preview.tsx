'use client';

import { Shot } from '@/types/shot';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ImagePlus,
  Check,
  X,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface FramePreviewProps {
  shot: Shot;
  sceneName?: string;
  onUploadFirstFrame?: () => void;
  onUploadLastFrame?: () => void;
  onValidateFirstFrame?: (validated: boolean) => void;
  onValidateLastFrame?: (validated: boolean) => void;
}

export function FramePreview({
  shot,
  sceneName,
  onUploadFirstFrame,
  onUploadLastFrame,
  onValidateFirstFrame,
  onValidateLastFrame,
}: FramePreviewProps) {
  const [expanded, setExpanded] = useState(true);

  const isComplete =
    shot.firstFrame?.validated && shot.lastFrame?.validated;

  return (
    <Card className={cn(isComplete && 'border-green-500/50')}>
      <CardHeader
        className="cursor-pointer flex flex-row items-center justify-between py-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="font-mono">
            Plan {shot.shotNumber}
          </Badge>
          {sceneName && (
            <span className="text-sm text-muted-foreground">{sceneName}</span>
          )}
          {isComplete && (
            <Badge variant="default" className="bg-green-500">
              <Check className="w-3 h-3 mr-1" />
              Validé
            </Badge>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
            {shot.description}
          </p>

          <div className="grid grid-cols-2 gap-4">
            {/* First Frame */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">First Frame</span>
                {shot.firstFrame?.validated !== undefined && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-7',
                      shot.firstFrame.validated
                        ? 'text-green-500'
                        : 'text-muted-foreground'
                    )}
                    onClick={() =>
                      onValidateFirstFrame?.(!shot.firstFrame?.validated)
                    }
                  >
                    {shot.firstFrame.validated ? (
                      <>
                        <Check className="w-4 h-4 mr-1" />
                        Validé
                      </>
                    ) : (
                      <>
                        <X className="w-4 h-4 mr-1" />
                        Non validé
                      </>
                    )}
                  </Button>
                )}
              </div>
              <div className="aspect-video rounded-lg bg-muted flex items-center justify-center overflow-hidden border">
                {shot.firstFrame?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shot.firstFrame.imageUrl}
                    alt="First frame"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Button
                    variant="ghost"
                    className="flex flex-col gap-2 h-full w-full"
                    onClick={onUploadFirstFrame}
                  >
                    <ImagePlus className="w-8 h-8" />
                    <span className="text-xs">Ajouter</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Arrow */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden lg:flex">
              <ArrowRight className="w-6 h-6 text-muted-foreground" />
            </div>

            {/* Last Frame */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Last Frame</span>
                {shot.lastFrame?.validated !== undefined && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-7',
                      shot.lastFrame.validated
                        ? 'text-green-500'
                        : 'text-muted-foreground'
                    )}
                    onClick={() =>
                      onValidateLastFrame?.(!shot.lastFrame?.validated)
                    }
                  >
                    {shot.lastFrame.validated ? (
                      <>
                        <Check className="w-4 h-4 mr-1" />
                        Validé
                      </>
                    ) : (
                      <>
                        <X className="w-4 h-4 mr-1" />
                        Non validé
                      </>
                    )}
                  </Button>
                )}
              </div>
              <div className="aspect-video rounded-lg bg-muted flex items-center justify-center overflow-hidden border">
                {shot.lastFrame?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shot.lastFrame.imageUrl}
                    alt="Last frame"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Button
                    variant="ghost"
                    className="flex flex-col gap-2 h-full w-full"
                    onClick={onUploadLastFrame}
                  >
                    <ImagePlus className="w-8 h-8" />
                    <span className="text-xs">Ajouter</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
