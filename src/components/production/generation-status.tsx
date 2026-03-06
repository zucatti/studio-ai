'use client';

import { Shot, GenerationStatus as GenStatus } from '@/types/shot';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Play,
  Loader2,
  Check,
  X,
  Clock,
  RefreshCw,
  Video,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface GenerationStatusProps {
  shot: Shot;
  sceneName?: string;
  progress?: number;
  onGenerate?: () => void;
  onRetry?: () => void;
  onPreview?: () => void;
}

const statusConfig: Record<
  GenStatus,
  { label: string; icon: React.ReactNode; color: string }
> = {
  not_started: {
    label: 'Non démarré',
    icon: <Clock className="w-4 h-4" />,
    color: 'text-muted-foreground',
  },
  pending: {
    label: 'En attente',
    icon: <Clock className="w-4 h-4" />,
    color: 'text-yellow-500',
  },
  generating: {
    label: 'Génération...',
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
    color: 'text-blue-500',
  },
  completed: {
    label: 'Terminé',
    icon: <Check className="w-4 h-4" />,
    color: 'text-green-500',
  },
  failed: {
    label: 'Échec',
    icon: <X className="w-4 h-4" />,
    color: 'text-red-500',
  },
};

export function GenerationStatus({
  shot,
  sceneName,
  progress = 0,
  onGenerate,
  onRetry,
  onPreview,
}: GenerationStatusProps) {
  const status = statusConfig[shot.generationStatus];
  const isReady =
    shot.firstFrame?.validated && shot.lastFrame?.validated;

  return (
    <Card
      className={cn(
        shot.generationStatus === 'completed' && 'border-green-500/50',
        shot.generationStatus === 'failed' && 'border-red-500/50',
        shot.generationStatus === 'generating' && 'border-blue-500/50'
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="font-mono">
                Plan {shot.shotNumber}
              </Badge>
              {sceneName && (
                <span className="text-sm text-muted-foreground">{sceneName}</span>
              )}
            </div>

            <p className="text-sm mt-2 line-clamp-2">{shot.description}</p>

            {/* Status indicator */}
            <div className={cn('flex items-center gap-2 mt-3', status.color)}>
              {status.icon}
              <span className="text-sm font-medium">{status.label}</span>
            </div>

            {/* Progress bar for generating status */}
            {shot.generationStatus === 'generating' && (
              <div className="mt-3">
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {progress}% complété
                </p>
              </div>
            )}

            {/* Readiness indicator */}
            {shot.generationStatus === 'not_started' && !isReady && (
              <p className="text-xs text-muted-foreground mt-2">
                Les frames de référence doivent être validées avant la
                génération.
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            {shot.generationStatus === 'not_started' && (
              <Button
                size="sm"
                disabled={!isReady}
                onClick={onGenerate}
              >
                <Play className="w-4 h-4 mr-1" />
                Générer
              </Button>
            )}

            {shot.generationStatus === 'completed' && (
              <>
                <Button size="sm" variant="outline" onClick={onPreview}>
                  <Eye className="w-4 h-4 mr-1" />
                  Voir
                </Button>
                <Button size="sm" variant="ghost" onClick={onRetry}>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Régénérer
                </Button>
              </>
            )}

            {shot.generationStatus === 'failed' && (
              <Button size="sm" variant="destructive" onClick={onRetry}>
                <RefreshCw className="w-4 h-4 mr-1" />
                Réessayer
              </Button>
            )}

            {shot.generationStatus === 'pending' && (
              <Badge variant="outline" className="text-yellow-500">
                <Clock className="w-3 h-3 mr-1" />
                File d&apos;attente
              </Badge>
            )}

            {shot.generationStatus === 'generating' && (
              <Button size="sm" variant="outline" disabled>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                En cours...
              </Button>
            )}
          </div>
        </div>

        {/* Video thumbnail if completed */}
        {shot.generationStatus === 'completed' && shot.generatedVideoUrl && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center gap-3">
              <div className="w-32 h-18 rounded bg-muted flex items-center justify-center">
                <Video className="w-8 h-8 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Vidéo générée</p>
                <p className="text-xs text-muted-foreground">
                  Cliquez sur &quot;Voir&quot; pour prévisualiser
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
