import { create } from 'zustand';
import type { ShotType, CameraAngle, CameraMovement } from '@/types/shot';

export interface Shot {
  id: string;
  scene_id: string;
  shot_number: number;
  description: string;
  shot_type: ShotType | null;
  camera_angle: CameraAngle | null;
  camera_movement: CameraMovement | null;
  camera_notes: string | null;
  storyboard_image_url: string | null;
  storyboard_prompt: string | null;
  generation_status: string;
  generation_error: string | null;
  start_time: number | null;
  end_time: number | null;
  has_vocals: boolean;
  lip_sync_enabled: boolean;
  singing_character_id: string | null;
  sort_order: number;
}

export interface Scene {
  id: string;
  project_id: string;
  scene_number: number;
  int_ext: string;
  location: string;
  time_of_day: string;
  description: string | null;
  sort_order: number;
}

interface ShotsState {
  // Data
  scenes: Scene[];
  shots: Shot[];
  isLoading: boolean;
  error: string | null;
  lastFetchedProjectId: string | null;

  // Actions
  fetchScenes: (projectId: string, forceRefresh?: boolean) => Promise<void>;

  // Scene mutations
  addScene: (projectId: string, scene: Partial<Scene>) => Promise<Scene | null>;
  updateScene: (projectId: string, sceneId: string, updates: Partial<Scene>) => Promise<void>;
  deleteScene: (projectId: string, sceneId: string) => Promise<void>;

  // Shot mutations
  addShot: (projectId: string, sceneId: string) => Promise<Shot | null>;
  updateShot: (projectId: string, shotId: string, updates: Partial<Shot>) => Promise<void>;
  deleteShot: (projectId: string, shotId: string) => Promise<void>;
  reorderShot: (projectId: string, shotId: string, direction: 'up' | 'down') => Promise<void>;

  // Helpers
  getShotsByScene: (sceneId: string) => Shot[];
  getSceneById: (sceneId: string) => Scene | undefined;
  getShotById: (shotId: string) => Shot | undefined;

  // Reset
  reset: () => void;
}

export const useShotsStore = create<ShotsState>((set, get) => ({
  scenes: [],
  shots: [],
  isLoading: false,
  error: null,
  lastFetchedProjectId: null,

  fetchScenes: async (projectId: string, forceRefresh = false) => {
    const state = get();

    // Avoid refetching if already loading
    if (state.isLoading) return;

    // Skip if already fetched for this project (unless force refresh)
    if (!forceRefresh && state.lastFetchedProjectId === projectId && state.scenes.length > 0) {
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const res = await fetch(`/api/projects/${projectId}/scenes`);
      if (!res.ok) throw new Error('Failed to fetch scenes');

      const data = await res.json();
      const rawScenes = data.scenes || [];

      // Extract scenes (without nested shots) and shots separately
      const scenes: Scene[] = [];
      const allShots: Shot[] = [];

      for (const rawScene of rawScenes) {
        // Extract shots from scene
        const { shots: sceneShots, ...sceneData } = rawScene;
        scenes.push(sceneData);

        if (sceneShots && Array.isArray(sceneShots)) {
          allShots.push(...sceneShots);
        }
      }

      set({
        scenes,
        shots: allShots,
        isLoading: false,
        lastFetchedProjectId: projectId,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false,
      });
    }
  },

  addScene: async (projectId, sceneData) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/scenes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sceneData),
      });

      if (!res.ok) return null;

      const data = await res.json();
      const newScene = data.scene;

      set((state) => ({
        scenes: [...state.scenes, newScene].sort((a, b) => a.scene_number - b.scene_number),
      }));

      return newScene;
    } catch {
      return null;
    }
  },

  updateScene: async (projectId, sceneId, updates) => {
    // Optimistic update
    set((state) => ({
      scenes: state.scenes.map((s) =>
        s.id === sceneId ? { ...s, ...updates } : s
      ),
    }));

    try {
      await fetch(`/api/projects/${projectId}/scenes/${sceneId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch {
      // Revert on error - refetch
      get().fetchScenes(projectId);
    }
  },

  deleteScene: async (projectId, sceneId) => {
    // Optimistic update
    const previousScenes = get().scenes;
    const previousShots = get().shots;

    set((state) => ({
      scenes: state.scenes.filter((s) => s.id !== sceneId),
      shots: state.shots.filter((s) => s.scene_id !== sceneId),
    }));

    try {
      const res = await fetch(`/api/projects/${projectId}/scenes/${sceneId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        // Revert
        set({ scenes: previousScenes, shots: previousShots });
      }
    } catch {
      set({ scenes: previousScenes, shots: previousShots });
    }
  },

  addShot: async (projectId, sceneId) => {
    try {
      const sceneShots = get().shots.filter((s) => s.scene_id === sceneId);
      const maxShotNumber = Math.max(0, ...sceneShots.map((s) => s.shot_number));

      const res = await fetch(`/api/projects/${projectId}/shots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene_id: sceneId,
          shot_number: maxShotNumber + 1,
          description: '',
        }),
      });

      if (!res.ok) return null;

      const data = await res.json();
      const newShot = data.shot;

      set((state) => ({
        shots: [...state.shots, newShot],
      }));

      return newShot;
    } catch {
      return null;
    }
  },

  updateShot: async (projectId, shotId, updates) => {
    // Optimistic update
    set((state) => ({
      shots: state.shots.map((s) =>
        s.id === shotId ? { ...s, ...updates } : s
      ),
    }));

    try {
      await fetch(`/api/projects/${projectId}/shots/${shotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch {
      // Revert on error - refetch
      get().fetchScenes(projectId);
    }
  },

  deleteShot: async (projectId, shotId) => {
    // Optimistic update
    const previousShots = get().shots;

    set((state) => ({
      shots: state.shots.filter((s) => s.id !== shotId),
    }));

    try {
      const res = await fetch(`/api/projects/${projectId}/shots/${shotId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        set({ shots: previousShots });
      }
    } catch {
      set({ shots: previousShots });
    }
  },

  reorderShot: async (projectId, shotId, direction) => {
    const state = get();
    const shot = state.shots.find((s) => s.id === shotId);
    if (!shot) return;

    const sceneShots = state.shots
      .filter((s) => s.scene_id === shot.scene_id)
      .sort((a, b) => a.shot_number - b.shot_number);

    const currentIndex = sceneShots.findIndex((s) => s.id === shotId);
    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (swapIndex < 0 || swapIndex >= sceneShots.length) return;

    const otherShot = sceneShots[swapIndex];

    // Swap shot numbers
    const updates = [
      { id: shot.id, shot_number: otherShot.shot_number },
      { id: otherShot.id, shot_number: shot.shot_number },
    ];

    // Optimistic update
    set((state) => ({
      shots: state.shots.map((s) => {
        const update = updates.find((u) => u.id === s.id);
        return update ? { ...s, shot_number: update.shot_number } : s;
      }),
    }));

    // API calls
    try {
      await Promise.all(
        updates.map((u) =>
          fetch(`/api/projects/${projectId}/shots/${u.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shot_number: u.shot_number }),
          })
        )
      );
    } catch {
      get().fetchScenes(projectId);
    }
  },

  getShotsByScene: (sceneId) => {
    return get()
      .shots.filter((s) => s.scene_id === sceneId)
      .sort((a, b) => a.shot_number - b.shot_number);
  },

  getSceneById: (sceneId) => {
    return get().scenes.find((s) => s.id === sceneId);
  },

  getShotById: (shotId) => {
    return get().shots.find((s) => s.id === shotId);
  },

  reset: () => {
    set({
      scenes: [],
      shots: [],
      isLoading: false,
      error: null,
      lastFetchedProjectId: null,
    });
  },
}));
