import { create } from 'zustand';
import type { ShotType, CameraAngle, CameraMovement } from '@/types/database';
import type {
  CinematicHeaderConfig,
  GenerationMode,
  DialogueLanguage,
  Segment,
  PlanTranslation,
} from '@/types/cinematic';

// Plan (generation unit within a short, max 15s)
export interface Plan {
  id: string;
  short_id: string;
  shot_number: number;
  description: string;
  duration: number;
  sort_order: number;

  // Plan title (optional, fallback: "Plan 1", "Plan 2", etc.)
  title: string | null;

  // Cinematic style (belongs to plan, not short)
  cinematic_header: CinematicHeaderConfig | null;

  // Reference frames
  storyboard_image_url: string | null; // Frame In (first frame)
  first_frame_url: string | null; // Alias for storyboard_image_url
  last_frame_url: string | null; // Frame Out (last frame)

  // Segments (shots within this plan) - NEW
  segments: Segment[];

  // Translations (language versions) - NEW
  translations: PlanTranslation[];

  // Generation
  generated_video_url: string | null;
  generation_status: string;

  // Legacy fields (for compatibility during migration)
  shot_type: ShotType | null;
  camera_angle: CameraAngle | null;
  camera_movement: CameraMovement | null;
  frame_in: number;
  frame_out: number;
  animation_prompt: string | null;
  has_dialogue: boolean;
  dialogue_text: string | null;
  dialogue_character_id: string | null;
  dialogue_audio_url: string | null;
  audio_mode: 'mute' | 'dialogue' | 'audio' | 'instrumental' | 'vocal';
  audio_asset_id: string | null;
  audio_start: number;
  audio_end: number | null;
  shot_subject: string | null;
  framing: string | null;
  action: string | null;
  environment: string | null;
  dialogue_tone: string | null;
  start_time: number | null;
}

// Short (scene used as a short - simple container)
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
  // Short-level settings (cinematic style is now on each plan)
  dialogue_language: DialogueLanguage;
  // Legacy fields (kept for backwards compatibility)
  cinematic_header?: CinematicHeaderConfig | null;
  character_mappings?: unknown[] | null;
  generation_mode?: GenerationMode;
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
  updateShort: (projectId: string, shortId: string, updates: Partial<{
    title: string;
    description: string;
    dialogue_language: DialogueLanguage;
  }>) => Promise<void>;
  deleteShort: (projectId: string, shortId: string) => Promise<void>;
  reorderShorts: (projectId: string, orderedIds: string[]) => Promise<void>;

  // Plan CRUD
  createPlan: (projectId: string, shortId: string, description?: string, duration?: number) => Promise<Plan | null>;
  updatePlan: (projectId: string, planId: string, updates: Partial<Plan>) => Promise<void>;
  deletePlan: (projectId: string, planId: string) => Promise<void>;
  reorderPlans: (projectId: string, shortId: string, orderedIds: string[]) => Promise<void>;

  // Plan cinematic actions (style belongs to plan now)
  setPlanCinematicHeader: (projectId: string, planId: string, header: CinematicHeaderConfig | null) => Promise<void>;
  updatePlanSegments: (projectId: string, planId: string, segments: Segment[]) => Promise<void>;

  // Short-level settings
  setDialogueLanguage: (projectId: string, shortId: string, language: DialogueLanguage) => Promise<void>;

  // Helpers
  getShortById: (shortId: string) => Short | undefined;
  getPlansByShort: (shortId: string) => Plan[];
  getPlanById: (planId: string) => Plan | undefined;
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
          // Cinematic defaults
          cinematic_header: data.short.cinematic_header || null,
          character_mappings: data.short.character_mappings || null,
          generation_mode: data.short.generation_mode || 'standard',
          dialogue_language: data.short.dialogue_language || 'en',
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
  updateShort: async (projectId: string, shortId: string, updates: Partial<{
    title: string;
    description: string;
    dialogue_language: DialogueLanguage;
  }>) => {
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
          sort_order: data.plan.sort_order || 0,
          // Plan title (optional, fallback: "Plan 1", "Plan 2", etc.)
          title: data.plan.title ?? null,
          // Cinematic style (belongs to plan, not short)
          cinematic_header: data.plan.cinematic_header ?? null,
          // Reference frames
          storyboard_image_url: data.plan.storyboard_image_url || data.plan.first_frame_url,
          first_frame_url: data.plan.first_frame_url || data.plan.storyboard_image_url,
          last_frame_url: data.plan.last_frame_url,
          // Segments (shots within this plan)
          segments: data.plan.segments ?? [],
          // Translations (language versions)
          translations: data.plan.translations ?? [],
          // Generation
          generated_video_url: data.plan.generated_video_url,
          generation_status: data.plan.generation_status || 'not_started',
          // Legacy fields (for compatibility)
          shot_type: data.plan.shot_type,
          camera_angle: data.plan.camera_angle,
          camera_movement: data.plan.camera_movement,
          frame_in: data.plan.frame_in ?? 0,
          frame_out: data.plan.frame_out ?? 100,
          animation_prompt: data.plan.animation_prompt ?? null,
          has_dialogue: data.plan.has_dialogue ?? false,
          dialogue_text: data.plan.dialogue_text ?? null,
          dialogue_character_id: data.plan.dialogue_character_id ?? null,
          dialogue_audio_url: data.plan.dialogue_audio_url ?? null,
          audio_mode: data.plan.audio_mode || 'mute',
          audio_asset_id: data.plan.audio_asset_id ?? null,
          audio_start: data.plan.audio_start ?? 0,
          audio_end: data.plan.audio_end ?? null,
          shot_subject: data.plan.shot_subject ?? null,
          framing: data.plan.framing ?? null,
          action: data.plan.action ?? null,
          environment: data.plan.environment ?? null,
          dialogue_tone: data.plan.dialogue_tone ?? null,
          start_time: data.plan.start_time ?? null,
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

  // Plan cinematic actions (style belongs to plan now)
  setPlanCinematicHeader: async (projectId: string, planId: string, header: CinematicHeaderConfig | null) => {
    // Find the short containing this plan
    const short = get().shorts.find(s => s.plans.some(p => p.id === planId));
    if (!short) return;

    // Optimistic update
    set((state) => ({
      shorts: state.shorts.map((s) =>
        s.id === short.id
          ? {
              ...s,
              plans: s.plans.map((p) =>
                p.id === planId ? { ...p, cinematic_header: header } : p
              ),
            }
          : s
      ),
    }));

    try {
      await fetch(`/api/projects/${projectId}/shorts/${short.id}/plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cinematic_header: header }),
      });
    } catch (error) {
      console.error('Error updating plan cinematic header:', error);
      get().fetchShorts(projectId);
    }
  },

  updatePlanSegments: async (projectId: string, planId: string, segments: Segment[]) => {
    // Find the short containing this plan
    const short = get().shorts.find(s => s.plans.some(p => p.id === planId));
    if (!short) return;

    // Calculate new duration from segments
    const duration = segments.length > 0
      ? Math.max(...segments.map(s => s.end_time))
      : 5;

    // Optimistic update
    set((state) => ({
      shorts: state.shorts.map((s) =>
        s.id === short.id
          ? {
              ...s,
              plans: s.plans.map((p) =>
                p.id === planId ? { ...p, segments, duration } : p
              ),
              totalDuration: s.plans.reduce((sum, p) =>
                p.id === planId ? sum + duration : sum + p.duration, 0
              ),
            }
          : s
      ),
    }));

    try {
      await fetch(`/api/projects/${projectId}/shorts/${short.id}/plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments, duration }),
      });
    } catch (error) {
      console.error('Error updating plan segments:', error);
      get().fetchShorts(projectId);
    }
  },

  // Short-level settings
  setDialogueLanguage: async (projectId: string, shortId: string, language: DialogueLanguage) => {
    set((state) => ({
      shorts: state.shorts.map((s) =>
        s.id === shortId ? { ...s, dialogue_language: language } : s
      ),
    }));

    try {
      await fetch(`/api/projects/${projectId}/shorts/${shortId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dialogue_language: language }),
      });
    } catch (error) {
      console.error('Error updating dialogue language:', error);
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

  getPlanById: (planId: string) => {
    for (const short of get().shorts) {
      const plan = short.plans.find((p) => p.id === planId);
      if (plan) return plan;
    }
    return undefined;
  },
}));
