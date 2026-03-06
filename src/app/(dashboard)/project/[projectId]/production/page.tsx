'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSceneStore } from '@/store/scene-store';
import { Shot } from '@/types/shot';
import { VideoPlayer, GenerationStatus } from '@/components/production';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Video,
  Play,
  Download,
  Check,
  Clock,
  Loader2,
  X,
  Sparkles,
} from 'lucide-react';

export default function ProductionPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { getScenesByProject, updateShot } = useSceneStore();
  const scenes = getScenesByProject(projectId);

  const [previewShot, setPreviewShot] = useState<Shot | null>(null);

  const allShots = useMemo(() => {
    return scenes.flatMap((scene) =>
      scene.shots.map((shot) => ({
        ...shot,
        sceneName: `${scene.heading.intExt}. ${scene.heading.location}`,
        sceneId: scene.id,
      }))
    );
  }, [scenes]);

  const stats = useMemo(() => {
    const total = allShots.length;
    const completed = allShots.filter(
      (s) => s.generationStatus === 'completed'
    ).length;
    const generating = allShots.filter(
      (s) => s.generationStatus === 'generating'
    ).length;
    const pending = allShots.filter(
      (s) => s.generationStatus === 'pending'
    ).length;
    const failed = allShots.filter(
      (s) => s.generationStatus === 'failed'
    ).length;
    const ready = allShots.filter(
      (s) =>
        s.generationStatus === 'not_started' &&
        s.firstFrame?.validated &&
        s.lastFrame?.validated
    ).length;

    return {
      total,
      completed,
      generating,
      pending,
      failed,
      ready,
      progress: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }, [allShots]);

  const handleGenerate = (sceneId: string, shotId: string) => {
    // Mock: Set to pending, then after delay set to generating, then completed
    updateShot(sceneId, shotId, { generationStatus: 'pending' });

    setTimeout(() => {
      updateShot(sceneId, shotId, { generationStatus: 'generating' });
    }, 1000);

    setTimeout(() => {
      updateShot(sceneId, shotId, {
        generationStatus: 'completed',
        generatedVideoUrl: '/mock-video.mp4',
      });
    }, 5000);
  };

  const handleGenerateAll = () => {
    const readyShots = allShots.filter(
      (s) =>
        s.generationStatus === 'not_started' &&
        s.firstFrame?.validated &&
        s.lastFrame?.validated
    );

    readyShots.forEach((shot, index) => {
      setTimeout(() => {
        handleGenerate(shot.sceneId, shot.id);
      }, index * 2000);
    });
  };

  if (allShots.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Video className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Aucun plan à générer.</p>
          <p className="text-sm mt-1">
            Créez d&apos;abord des plans dans l&apos;onglet Script.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video className="w-5 h-5" />
          <h2 className="text-xl font-semibold">Production</h2>
        </div>
        <div className="flex items-center gap-2">
          {stats.ready > 0 && (
            <Button onClick={handleGenerateAll}>
              <Sparkles className="w-4 h-4 mr-2" />
              Générer tout ({stats.ready})
            </Button>
          )}
          {stats.completed === stats.total && stats.total > 0 && (
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Exporter
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-blue-500">{stats.ready}</p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Play className="w-3 h-3" />
              Prêts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-yellow-500">{stats.pending}</p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Clock className="w-3 h-3" />
              En attente
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-blue-400">
              {stats.generating}
            </p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Loader2 className="w-3 h-3" />
              En cours
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-slate-300">{stats.completed}</p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Check className="w-3 h-3" />
              Terminés
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-red-500">{stats.failed}</p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <X className="w-3 h-3" />
              Échecs
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Progress bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Progression globale</span>
            <span className="text-sm text-muted-foreground">
              {stats.completed}/{stats.total} ({stats.progress}%)
            </span>
          </div>
          <Progress value={stats.progress} className="h-3" />
        </CardContent>
      </Card>

      {/* Generation list */}
      <div className="space-y-4">
        <h3 className="font-medium">Liste des plans</h3>
        {allShots.map((shot) => (
          <GenerationStatus
            key={shot.id}
            shot={shot}
            sceneName={shot.sceneName}
            progress={shot.generationStatus === 'generating' ? 50 : 0}
            onGenerate={() => handleGenerate(shot.sceneId, shot.id)}
            onRetry={() => handleGenerate(shot.sceneId, shot.id)}
            onPreview={() => setPreviewShot(shot)}
          />
        ))}
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewShot} onOpenChange={() => setPreviewShot(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Plan {previewShot?.shotNumber} - Aperçu
            </DialogTitle>
          </DialogHeader>
          <VideoPlayer
            src={previewShot?.generatedVideoUrl}
            title={previewShot?.description}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
