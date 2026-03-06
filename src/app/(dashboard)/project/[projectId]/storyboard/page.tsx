'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useSceneStore } from '@/store/scene-store';
import { Shot, CameraAnnotation as CameraAnnotationType } from '@/types/shot';
import { ShotViewer, ThumbnailStrip, CameraAnnotation } from '@/components/storyboard';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';

export default function StoryboardPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { getScenesByProject, updateShot } = useSceneStore();
  const scenes = getScenesByProject(projectId);

  const [selectedSceneId, setSelectedSceneId] = useState<string | 'all'>('all');
  const [currentShotIndex, setCurrentShotIndex] = useState(0);

  // Flatten all shots from all scenes (or selected scene)
  const allShots = useMemo(() => {
    if (selectedSceneId === 'all') {
      return scenes.flatMap((scene) =>
        scene.shots.map((shot) => ({
          ...shot,
          sceneName: `${scene.heading.intExt}. ${scene.heading.location}`,
          sceneId: scene.id,
        }))
      );
    }
    const scene = scenes.find((s) => s.id === selectedSceneId);
    if (!scene) return [];
    return scene.shots.map((shot) => ({
      ...shot,
      sceneName: `${scene.heading.intExt}. ${scene.heading.location}`,
      sceneId: scene.id,
    }));
  }, [scenes, selectedSceneId]);

  const currentShot = allShots[currentShotIndex];

  const handlePrevShot = () => {
    setCurrentShotIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNextShot = () => {
    setCurrentShotIndex((prev) => Math.min(allShots.length - 1, prev + 1));
  };

  const handleSelectShot = (shot: Shot) => {
    const index = allShots.findIndex((s) => s.id === shot.id);
    if (index !== -1) {
      setCurrentShotIndex(index);
    }
  };

  const handleCameraAnnotationChange = (annotation: CameraAnnotationType) => {
    if (!currentShot) return;
    updateShot(currentShot.sceneId, currentShot.id, {
      cameraAnnotation: annotation,
    });
  };

  if (allShots.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <LayoutGrid className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Aucun plan à afficher.</p>
          <p className="text-sm mt-1">
            Créez d&apos;abord des plans dans l&apos;onglet Script.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-5 h-5" />
          <h2 className="text-xl font-semibold">Storyboard</h2>
        </div>

        <div className="flex items-center gap-4">
          <Select
            value={selectedSceneId}
            onValueChange={setSelectedSceneId}
          >
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Filtrer par scène" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les scènes</SelectItem>
              {scenes.map((scene) => (
                <SelectItem key={scene.id} value={scene.id}>
                  {scene.sceneNumber}. {scene.heading.intExt}. {scene.heading.location}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrevShot}
              disabled={currentShotIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground min-w-[80px] text-center">
              {currentShotIndex + 1} / {allShots.length}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={handleNextShot}
              disabled={currentShotIndex === allShots.length - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Thumbnail strip */}
      <Card>
        <ThumbnailStrip
          shots={allShots}
          currentShotId={currentShot?.id}
          onSelectShot={handleSelectShot}
        />
      </Card>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {currentShot && (
            <ShotViewer
              shot={currentShot}
              sceneName={currentShot.sceneName}
            />
          )}
        </div>

        <div>
          {currentShot && (
            <CameraAnnotation
              annotation={currentShot.cameraAnnotation}
              onChange={handleCameraAnnotationChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
