'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import type { Project, Scene, Character, Prop, Location, PipelineStep } from '@/types/database';

interface SceneWithShots extends Scene {
  shots: Array<{
    id: string;
    scene_id: string;
    shot_number: number;
    description: string;
    shot_type: string | null;
    camera_angle: string | null;
    camera_movement: string | null;
    generation_status: string;
    dialogues: Array<{ id: string; character_name: string; content: string }>;
    actions: Array<{ id: string; content: string }>;
  }>;
}

interface UseProjectReturn {
  projectId: string | undefined;
  project: Project | null;
  currentStep: PipelineStep;
  scenes: SceneWithShots[];
  brainstorming: string;
  characters: Character[];
  props: Prop[];
  locations: Location[];
  totalShots: number;
  completedShots: number;
  isLoading: boolean;
  error: string | null;
  setCurrentStep: (step: PipelineStep) => Promise<void>;
  updateProject: (data: Partial<Project>) => Promise<Project | null>;
  setBrainstorming: (content: string) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useProject(): UseProjectReturn {
  const params = useParams();
  const projectId = params.projectId as string | undefined;

  const [project, setProject] = useState<Project | null>(null);
  const [scenes, setScenes] = useState<SceneWithShots[]>([]);
  const [brainstorming, setBrainstormingState] = useState<string>('');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [props, setProps] = useState<Prop[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProject = useCallback(async () => {
    if (!projectId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const [projectRes, scenesRes, brainstormingRes, charactersRes, propsRes, locationsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/scenes`),
        fetch(`/api/projects/${projectId}/brainstorming`),
        fetch(`/api/projects/${projectId}/characters`),
        fetch(`/api/projects/${projectId}/props`),
        fetch(`/api/projects/${projectId}/locations`),
      ]);

      if (!projectRes.ok) throw new Error('Project not found');

      const [projectData, scenesData, brainstormingData, charactersData, propsData, locationsData] = await Promise.all([
        projectRes.json(),
        scenesRes.ok ? scenesRes.json() : { scenes: [] },
        brainstormingRes.ok ? brainstormingRes.json() : { brainstorming: null },
        charactersRes.ok ? charactersRes.json() : { characters: [] },
        propsRes.ok ? propsRes.json() : { props: [] },
        locationsRes.ok ? locationsRes.json() : { locations: [] },
      ]);

      setProject(projectData.project);
      setScenes(scenesData.scenes || []);
      setBrainstormingState(brainstormingData.brainstorming?.content || '');
      setCharacters(charactersData.characters || []);
      setProps(propsData.props || []);
      setLocations(locationsData.locations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const updateProject = async (data: Partial<Project>): Promise<Project | null> => {
    if (!projectId) return null;

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update project');
      const result = await res.json();
      setProject(result.project);
      return result.project;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  };

  const setCurrentStep = async (step: PipelineStep): Promise<void> => {
    await updateProject({ current_step: step });
  };

  const setBrainstorming = async (content: string): Promise<void> => {
    if (!projectId) return;

    try {
      const res = await fetch(`/api/projects/${projectId}/brainstorming`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error('Failed to update brainstorming');
      setBrainstormingState(content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  // Calculate stats
  const totalShots = scenes.reduce((acc, scene) => acc + (scene.shots?.length || 0), 0);
  const completedShots = scenes.reduce(
    (acc, scene) =>
      acc + (scene.shots?.filter((shot) => shot.generation_status === 'completed').length || 0),
    0
  );

  return {
    projectId,
    project,
    currentStep: project?.current_step || 'brainstorming',
    scenes,
    brainstorming,
    characters,
    props,
    locations,
    totalShots,
    completedShots,
    isLoading,
    error,
    setCurrentStep,
    updateProject,
    setBrainstorming,
    refetch: fetchProject,
  };
}
