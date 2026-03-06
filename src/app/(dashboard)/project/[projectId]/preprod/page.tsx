'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useSceneStore } from '@/store/scene-store';
import { FramePreview } from '@/components/preprod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Frame, Check, AlertCircle } from 'lucide-react';

export default function PreprodPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { getScenesByProject, updateShot } = useSceneStore();
  const scenes = getScenesByProject(projectId);

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
    const withFirstFrame = allShots.filter((s) => s.firstFrame?.imageUrl).length;
    const withLastFrame = allShots.filter((s) => s.lastFrame?.imageUrl).length;
    const validated = allShots.filter(
      (s) => s.firstFrame?.validated && s.lastFrame?.validated
    ).length;

    return {
      total,
      withFirstFrame,
      withLastFrame,
      validated,
      progress: total > 0 ? Math.round((validated / total) * 100) : 0,
    };
  }, [allShots]);

  const handleValidateFirstFrame = (
    sceneId: string,
    shotId: string,
    validated: boolean
  ) => {
    const shot = allShots.find((s) => s.id === shotId);
    updateShot(sceneId, shotId, {
      firstFrame: {
        ...shot?.firstFrame,
        id: shot?.firstFrame?.id || crypto.randomUUID(),
        validated,
      },
    });
  };

  const handleValidateLastFrame = (
    sceneId: string,
    shotId: string,
    validated: boolean
  ) => {
    const shot = allShots.find((s) => s.id === shotId);
    updateShot(sceneId, shotId, {
      lastFrame: {
        ...shot?.lastFrame,
        id: shot?.lastFrame?.id || crypto.randomUUID(),
        validated,
      },
    });
  };

  if (allShots.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Frame className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Aucun plan à préparer.</p>
          <p className="text-sm mt-1">
            Créez d&apos;abord des plans dans l&apos;onglet Script.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Frame className="w-5 h-5" />
        <h2 className="text-xl font-semibold">Préproduction</h2>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Plans totaux
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              First Frames
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {stats.withFirstFrame}/{stats.total}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Last Frames
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {stats.withLastFrame}/{stats.total}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500" />
              Validés
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-500">
              {stats.validated}/{stats.total}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Progress bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Progression</span>
            <span className="text-sm text-muted-foreground">
              {stats.progress}%
            </span>
          </div>
          <Progress value={stats.progress} className="h-2" />
        </CardContent>
      </Card>

      {/* Info banner */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="py-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-blue-500">Frames de référence</p>
            <p className="text-muted-foreground mt-1">
              Définissez la première et dernière image de chaque plan pour
              guider la génération vidéo. Validez chaque paire une fois
              satisfait.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Shots list */}
      <div className="space-y-4">
        {allShots.map((shot) => (
          <FramePreview
            key={shot.id}
            shot={shot}
            sceneName={shot.sceneName}
            onValidateFirstFrame={(validated) =>
              handleValidateFirstFrame(shot.sceneId, shot.id, validated)
            }
            onValidateLastFrame={(validated) =>
              handleValidateLastFrame(shot.sceneId, shot.id, validated)
            }
          />
        ))}
      </div>
    </div>
  );
}
