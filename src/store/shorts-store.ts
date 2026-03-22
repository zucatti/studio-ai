import { create } from 'zustand';
import type { ShotType, CameraAngle, CameraMovement } from '@/types/database';

// Plan (shot within a short)
export interface Plan {
  id: string;
  short_id: string;
  shot_number: number;
  description: string;
  duration: number;
  shot_type: ShotType | null;
  camera_angle: CameraAngle | null;
  camera_movement: CameraMovement | null;
  storyboard_image_url: string | null; // Frame In (first frame)
  first_frame_url: string | null; // Alias for storyboard_image_url
  last_frame_url: string | null; // Frame Out (last frame)
  generated_video_url: string | null;
  generation_status: string;
  sort_order: number;
  frame_in: number; // 0-100 percentage
  frame_out: number; // 0-100 percentage
  // Animation prompt for video generation (supports &in/&out)
  animation_prompt: string | null;
  // Dialogue (lip-sync)
  has_dialogue: boolean;
  dialogue_text: string | null;
  dialogue_character_id: string | null; // Global asset ID for voice
  dialogue_audio_url: string | null; // Generated ElevenLabs audio
  // Audio/Music
  audio_mode: 'mute' | 'dialogue' | 'audio' | 'instrumental' | 'vocal';
  audio_asset_id: string | null; // Global asset ID for music/audio
  audio_start: number; // Start time in seconds
  audio_end: number | null; // End time in seconds (null = use plan duration)
}

// Short (scene used as a short)
export interface Short {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  scene_number: number;
  sort_order: number;
  plans: Plan[];
  totalDuration: number;
  assembled_video_url: string | null; // Final assembled video
  assembled_video_duration: number | null; // Duration in seconds (from FFmpeg)
  created_at: string;
  updated_at: string;
}

interface ShortsStore {
  // Data
  shorts: Short[];
  isLoading: boolean;
  currentShortId: string | null;

  // Actions
  setCurrentShort: (shortId: string | null) => void;

  // Data fetching
  fetchShorts: (projectId: string) => Promise<void>;

  // Short CRUD
  createShort: (projectId: string, title: string) => Promise<Short | null>;
  updateShort: (projectId: string, shortId: string, updates: Partial<{ title: string; description: string }>) => Promise<void>;
  deleteShort: (projectId: string, shortId: string) => Promise<void>;
  reorderShorts: (projectId: string, orderedIds: string[]) => Promise<void>;

  // Plan CRUD
  createPlan: (projectId: string, shortId: string, description?: string, duration?: number) => Promise<Plan | null>;
  updatePlan: (projectId: string, planId: string, updates: Partial<Plan>) => Promise<void>;
  deletePlan: (projectId: string, planId: string) => Promise<void>;
  reorderPlans: (projectId: string, shortId: string, orderedIds: string[]) => Promise<void>;

  // Helpers
  getShortById: (shortId: string) => Short | undefined;
  getPlansByShort: (shortId: string) => Plan[];
}

export const useShortsStore = create<ShortsStore>((set, get) => ({
  // Data
  shorts: [],
  isLoading: false,
  currentShortId: null,

  // Actions
  setCurrentShort: (shortId) => set({ currentShortId: shortId }),

  // Fetch all shorts for a project
  fetchShorts: async (projectId: string) => {
    set({ isLoading: true });
    try {
      const res = await fetch(`/api/projects/${projectId}/shorts`);
      if (res.ok) {
        const data = await res.json();
        set({ shorts: data.shorts || [] });
      }
    } catch (error) {
      console.error('Error fetching shorts:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  // Create a new short
  createShort: async (projectId: string, title: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/shorts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });

      if (res.ok) {
        const data = await res.json();
        const newShort: Short = {
          ...data.short,
          plans: [],
          totalDuration: 0,
          assembled_video_url: null,
          assembled_video_duration: null,
        };
        set((state) => ({
          shorts: [...state.shorts, newShort],
        }));
        return newShort;
      }
      return null;
    } catch (error) {
      console.error('Error creating short:', error);
      return null;
    }
  },

  // Update a short
  updateShort: async (projectId: string, shortId: string, updates: Partial<{ title: string; description: string }>) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/shorts/${shortId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        set((state) => ({
          shorts: state.shorts.map((s) =>
            s.id === shortId ? { ...s, ...updates } : s
          ),
        }));
      }
    } catch (error) {
      console.error('Error updating short:', error);
    }
  },

  // Delete a short
  deleteShort: async (projectId: string, shortId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/shorts/${shortId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        set((state) => ({
          shorts: state.shorts.filter((s) => s.id !== shortId),
          currentShortId: state.currentShortId === shortId ? null : state.currentShortId,
        }));
      }
    } catch (error) {
      console.error('Error deleting short:', error);
    }
  },

  // Reorder shorts
  reorderShorts: async (projectId: string, orderedIds: string[]) => {
    // Optimistically update
    set((state) => {
      const reordered = orderedIds.map((id, index) => {
        const short = state.shorts.find((s) => s.id === id);
        return short ? { ...short, sort_order: index } : null;
      }).filter(Boolean) as Short[];
      return { shorts: reordered };
    });

    try {
      await fetch(`/api/projects/${projectId}/shorts/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      });
    } catch (error) {
      console.error('Error reordering shorts:', error);
      // Refetch to restore correct order
      get().fetchShorts(projectId);
    }
  },

  // Create a new plan
  createPlan: async (projectId: string, shortId: string, description = '', duration = 5) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/shorts/${shortId}/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, duration }),
      });

      if (res.ok) {
        const data = await res.json();
        const newPlan: Plan = {
          id: data.plan.id,
          short_id: shortId,
          shot_number: data.plan.shot_number,
          description: data.plan.description || '',
          duration: data.plan.duration || 5,
          shot_type: data.plan.shot_type,
          camera_angle: data.plan.camera_angle,
          camera_movement: data.plan.camera_movement,
          storyboard_image_url: data.plan.storyboard_image_url || data.plan.first_frame_url,
          first_frame_url: data.plan.first_frame_url || data.plan.storyboard_image_url,
          last_frame_url: data.plan.last_frame_url,
          generated_video_url: data.plan.generated_video_url,
          generation_status: data.plan.generation_status || 'not_started',
          sort_order: data.plan.sort_order || 0,
          frame_in: data.plan.frame_in ?? 0,
          frame_out: data.plan.frame_out ?? 100,
          // Animation prompt
          animation_prompt: data.plan.animation_prompt ?? null,
          // Dialogue fields
          has_dialogue: data.plan.has_dialogue ?? false,
          dialogue_text: data.plan.dialogue_text ?? null,
          dialogue_character_id: data.plan.dialogue_character_id ?? null,
          dialogue_audio_url: data.plan.dialogue_audio_url ?? null,
          // Audio/Music
          audio_mode: data.plan.audio_mode || 'mute',
          audio_asset_id: data.plan.audio_asset_id ?? null,
          audio_start: data.plan.audio_start ?? 0,
          audio_end: data.plan.audio_end ?? null,
        };

        set((state) => ({
          shorts: state.shorts.map((s) =>
            s.id === shortId
              ? {
                  ...s,
                  plans: [...s.plans, newPlan],
                  totalDuration: s.totalDuration + newPlan.duration,
                }
              : s
          ),
        }));

        return newPlan;
      }
      return null;
    } catch (error) {
      console.error('Error creating plan:', error);
      return null;
    }
  },

  // Update a plan
  updatePlan: async (projectId: string, planId: string, updates: Partial<Plan>) => {
    // Find which short contains this plan
    const short = get().shorts.find((s) => s.plans.some((p) => p.id === planId));
    if (!short) return;

    const oldPlan = short.plans.find((p) => p.id === planId);
    const durationDiff = (updates.duration ?? oldPlan?.duration ?? 5) - (oldPlan?.duration ?? 5);

    // Optimistically update
    set((state) => ({
      shorts: state.shorts.map((s) =>
        s.id === short.id
          ? {
              ...s,
              plans: s.plans.map((p) => (p.id === planId ? { ...p, ...updates } : p)),
              totalDuration: s.totalDuration + durationDiff,
            }
          : s
      ),
    }));

    try {
      await fetch(`/api/projects/${projectId}/shots/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch (error) {
      console.error('Error updating plan:', error);
      // Refetch to restore correct state
      get().fetchShorts(projectId);
    }
  },

  // Delete a plan
  deletePlan: async (projectId: string, planId: string) => {
    // Find which short contains this plan
    const short = get().shorts.find((s) => s.plans.some((p) => p.id === planId));
    if (!short) return;

    const plan = short.plans.find((p) => p.id === planId);
    const duration = plan?.duration ?? 0;

    // Optimistically update
    set((state) => ({
      shorts: state.shorts.map((s) =>
        s.id === short.id
          ? {
              ...s,
              plans: s.plans.filter((p) => p.id !== planId),
              totalDuration: s.totalDuration - duration,
            }
          : s
      ),
    }));

    try {
      await fetch(`/api/projects/${projectId}/shots/${planId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('Error deleting plan:', error);
      get().fetchShorts(projectId);
    }
  },

  // Reorder plans within a short
  reorderPlans: async (projectId: string, shortId: string, orderedIds: string[]) => {
    // Optimistically update
    set((state) => ({
      shorts: state.shorts.map((s) => {
        if (s.id !== shortId) return s;
        const reordered = orderedIds.map((id, index) => {
          const plan = s.plans.find((p) => p.id === id);
          return plan ? { ...plan, sort_order: index } : null;
        }).filter(Boolean) as Plan[];
        return { ...s, plans: reordered };
      }),
    }));

    try {
      await fetch(`/api/projects/${projectId}/shorts/${shortId}/plans/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      });
    } catch (error) {
      console.error('Error reordering plans:', error);
      get().fetchShorts(projectId);
    }
  },

  // Helpers
  getShortById: (shortId: string) => {
    return get().shorts.find((s) => s.id === shortId);
  },

  getPlansByShort: (shortId: string) => {
    const short = get().shorts.find((s) => s.id === shortId);
    return short?.plans || [];
  },
}));
