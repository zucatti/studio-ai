'use client';

import { useParams } from 'next/navigation';
import { useSceneStore } from '@/store/scene-store';
import { Scene, SceneHeading } from '@/types/scene';
import { Shot } from '@/types/shot';

export function useScenes() {
  const params = useParams();
  const projectId = params.projectId as string | undefined;

  const {
    currentScene,
    currentShot,
    setCurrentScene,
    setCurrentShot,
    addScene,
    updateScene,
    deleteScene,
    addShot,
    updateShot,
    deleteShot,
    getScenesByProject,
  } = useSceneStore();

  const scenes = projectId ? getScenesByProject(projectId) : [];

  const createScene = (heading: SceneHeading, description?: string) => {
    if (!projectId) return;

    const newScene: Scene = {
      id: crypto.randomUUID(),
      projectId,
      sceneNumber: scenes.length + 1,
      heading,
      description,
      shots: [],
      order: scenes.length,
    };

    addScene(newScene);
    return newScene;
  };

  const createShot = (sceneId: string, description: string, data?: Partial<Shot>) => {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    const newShot: Shot = {
      id: crypto.randomUUID(),
      sceneId,
      shotNumber: scene.shots.length + 1,
      description,
      dialogues: [],
      actions: [],
      generationStatus: 'not_started',
      order: scene.shots.length,
      ...data,
    };

    addShot(sceneId, newShot);
    return newShot;
  };

  // Flatten all shots with scene info
  const allShots = scenes.flatMap((scene) =>
    scene.shots.map((shot) => ({
      ...shot,
      sceneName: `${scene.heading.intExt}. ${scene.heading.location}`,
      sceneId: scene.id,
    }))
  );

  return {
    scenes,
    currentScene,
    currentShot,
    allShots,
    setCurrentScene,
    setCurrentShot,
    createScene,
    updateScene,
    deleteScene,
    createShot,
    updateShot,
    deleteShot,
  };
}
