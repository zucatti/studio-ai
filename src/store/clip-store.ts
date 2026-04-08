import { create } from 'zustand';
import type { Sequence, CinematicHeaderConfig, TransitionType } from '@/types/cinematic';
import type { MusicSection } from '@/types/database';
import type { Plan } from './shorts-store';

// Clip store manages sequences at the project level (for music video workflow)
// Unlike shorts-store which manages sequences per scene

interface ClipStore {
  // Project-level sequences
  sequences: Sequence[];
  isLoadingSequences: boolean;

  // Music sections (from audio analysis)
  musicSections: MusicSection[];
  isLoadingMusicSections: boolean;

  // Plans (shots) across all sequences
  plans: Plan[];
  isLoadingPlans: boolean;

  // Actions
  fetchSequences: (projectId: string) => Promise<void>;
  fetchMusicSections: (projectId: string) => Promise<void>;
  fetchPlansForSequence: (projectId: string, sequenceId: string) => Promise<void>;

  // Sequence CRUD
  createSequence: (projectId: string, data: {
    title?: string;
    startTime: number;
    endTime: number;
  }) => Promise<Sequence | null>;
  updateSequence: (projectId: string, sequenceId: string, updates: Partial<{
    title: string | null;
    cinematic_header: CinematicHeaderConfig | null;
    transition_in: TransitionType | null;
    transition_out: TransitionType | null;
    transition_duration: number;
  }>) => Promise<void>;
  deleteSequence: (projectId: string, sequenceId: string) => Promise<void>;

  // Plan CRUD (within sequences)
  createPlan: (projectId: string, sequenceId: string, description?: string, duration?: number) => Promise<Plan | null>;
  updatePlan: (projectId: string, planId: string, updates: Partial<Plan>) => Promise<void>;
  deletePlan: (projectId: string, planId: string) => Promise<void>;
  reorderPlans: (projectId: string, sequenceId: string, orderedIds: string[]) => Promise<void>;

  // Music section linking
  linkMusicSectionToSequence: (projectId: string, sectionId: string, sequenceId: string | null) => Promise<void>;

  // Helpers
  getSequenceById: (sequenceId: string) => Sequence | undefined;
  getPlansForSequence: (sequenceId: string) => Plan[];
  getUnassignedPlans: () => Plan[];
}

export const useClipStore = create<ClipStore>((set, get) => ({
  // Initial state
  sequences: [],
  isLoadingSequences: false,
  musicSections: [],
  isLoadingMusicSections: false,
  plans: [],
  isLoadingPlans: false,

  // Fetch project-level sequences
  fetchSequences: async (projectId: string) => {
    set({ isLoadingSequences: true });
    try {
      const res = await fetch(`/api/projects/${projectId}/clip/sequences`);
      if (res.ok) {
        const data = await res.json();
        set({ sequences: data.sequences || [] });
      }
    } catch (error) {
      console.error('Error fetching clip sequences:', error);
    } finally {
      set({ isLoadingSequences: false });
    }
  },

  // Fetch music sections
  fetchMusicSections: async (projectId: string) => {
    set({ isLoadingMusicSections: true });
    try {
      const res = await fetch(`/api/projects/${projectId}/sections`);
      if (res.ok) {
        const data = await res.json();
        set({ musicSections: data.sections || [] });
      }
    } catch (error) {
      console.error('Error fetching music sections:', error);
    } finally {
      set({ isLoadingMusicSections: false });
    }
  },

  // Fetch plans for a sequence
  fetchPlansForSequence: async (projectId: string, sequenceId: string) => {
    set({ isLoadingPlans: true });
    try {
      const res = await fetch(`/api/projects/${projectId}/sequences/${sequenceId}/shots`);
      if (res.ok) {
        const data = await res.json();
        const newPlans = data.shots || [];

        // Merge with existing plans (replace those from this sequence)
        set((state) => ({
          plans: [
            ...state.plans.filter(p => p.sequence_id !== sequenceId),
            ...newPlans.map((shot: Record<string, unknown>, index: number) => ({
              ...shot,
              sequence_id: sequenceId,
              short_id: '',  // Not part of a short
              shot_number: (shot.sort_order as number) + 1 || index + 1,
              segments: (shot.segments as unknown[]) || [],
              translations: (shot.translations as unknown[]) || [],
              video_rushes: shot.video_rushes ?? null,
            } as Plan)),
          ],
        }));
      }
    } catch (error) {
      console.error('Error fetching plans:', error);
    } finally {
      set({ isLoadingPlans: false });
    }
  },

  // Create sequence from waveform selection
  createSequence: async (projectId: string, data: {
    title?: string;
    startTime: number;
    endTime: number;
  }) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/clip/sequences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        const response = await res.json();
        const newSequence: Sequence = {
          id: response.sequence.id,
          scene_id: null,
          project_id: projectId,
          title: response.sequence.title ?? null,
          sort_order: response.sequence.sort_order ?? 0,
          cinematic_header: response.sequence.cinematic_header ?? null,
          transition_in: response.sequence.transition_in ?? null,
          transition_out: response.sequence.transition_out ?? null,
          transition_duration: response.sequence.transition_duration ?? 0.5,
          assembled_video_url: response.sequence.assembled_video_url ?? null,
          assembled_plan_hash: response.sequence.assembled_plan_hash ?? null,
          assembled_at: response.sequence.assembled_at ?? null,
          created_at: response.sequence.created_at,
          updated_at: response.sequence.updated_at,
          // Store timing for waveform display
          start_time: data.startTime,
          end_time: data.endTime,
        };

        set((state) => ({
          sequences: [...state.sequences, newSequence].sort((a, b) =>
            (a.start_time || 0) - (b.start_time || 0)
          ),
        }));

        return newSequence;
      }
      return null;
    } catch (error) {
      console.error('Error creating sequence:', error);
      return null;
    }
  },

  // Update sequence
  updateSequence: async (
    projectId: string,
    sequenceId: string,
    updates: Partial<{
      title: string | null;
      cinematic_header: CinematicHeaderConfig | null;
      transition_in: TransitionType | null;
      transition_out: TransitionType | null;
      transition_duration: number;
    }>
  ) => {
    // Optimistic update
    set((state) => ({
      sequences: state.sequences.map((s) =>
        s.id === sequenceId ? { ...s, ...updates } : s
      ),
    }));

    try {
      await fetch(`/api/projects/${projectId}/clip/sequences/${sequenceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch (error) {
      console.error('Error updating sequence:', error);
      get().fetchSequences(projectId);
    }
  },

  // Delete sequence
  deleteSequence: async (projectId: string, sequenceId: string) => {
    // Optimistic update
    set((state) => ({
      sequences: state.sequences.filter((s) => s.id !== sequenceId),
      plans: state.plans.filter((p) => p.sequence_id !== sequenceId),
    }));

    try {
      await fetch(`/api/projects/${projectId}/clip/sequences/${sequenceId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('Error deleting sequence:', error);
      get().fetchSequences(projectId);
    }
  },

  // Create plan in sequence
  createPlan: async (projectId: string, sequenceId: string, description = '', duration = 5) => {
    console.log('[clip-store] createPlan called:', { projectId, sequenceId, description, duration });
    try {
      const res = await fetch(`/api/projects/${projectId}/sequences/${sequenceId}/shots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, duration }),
      });
      console.log('[clip-store] createPlan response status:', res.status);

      if (!res.ok) {
        const errorData = await res.json();
        console.error('[clip-store] createPlan error:', errorData);
        return null;
      }

      if (res.ok) {
        const data = await res.json();
        console.log('[clip-store] createPlan success:', data);
        const newPlan: Plan = {
          ...data.shot,
          sequence_id: sequenceId,
          short_id: '',  // Not part of a short
          shot_number: data.shot.sort_order + 1,  // Map sort_order to shot_number
          segments: data.shot.segments || [],
          translations: data.shot.translations || [],
          video_rushes: data.shot.video_rushes || null,
        };

        set((state) => ({
          plans: [...state.plans, newPlan],
        }));

        return newPlan;
      }
      return null;
    } catch (error) {
      console.error('Error creating plan:', error);
      return null;
    }
  },

  // Update plan
  updatePlan: async (projectId: string, planId: string, updates: Partial<Plan>) => {
    // Optimistic update
    set((state) => ({
      plans: state.plans.map((p) =>
        p.id === planId ? { ...p, ...updates } : p
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
    }
  },

  // Delete plan
  deletePlan: async (projectId: string, planId: string) => {
    // Optimistic update
    set((state) => ({
      plans: state.plans.filter((p) => p.id !== planId),
    }));

    try {
      await fetch(`/api/projects/${projectId}/shots/${planId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('Error deleting plan:', error);
    }
  },

  // Reorder plans within sequence
  reorderPlans: async (projectId: string, sequenceId: string, orderedIds: string[]) => {
    // Optimistic update
    set((state) => {
      const sequencePlans = state.plans.filter(p => p.sequence_id === sequenceId);
      const reorderedPlans = orderedIds.map((id, index) => {
        const plan = sequencePlans.find(p => p.id === id);
        return plan ? { ...plan, sort_order: index } : null;
      }).filter(Boolean) as Plan[];

      const otherPlans = state.plans.filter(p => p.sequence_id !== sequenceId);
      return { plans: [...otherPlans, ...reorderedPlans] };
    });

    try {
      await fetch(`/api/projects/${projectId}/sequences/${sequenceId}/shots/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      });
    } catch (error) {
      console.error('Error reordering plans:', error);
    }
  },

  // Link music section to sequence
  linkMusicSectionToSequence: async (projectId: string, sectionId: string, sequenceId: string | null) => {
    // Optimistic update
    set((state) => ({
      musicSections: state.musicSections.map((s) =>
        s.id === sectionId ? { ...s, sequence_id: sequenceId } : s
      ),
    }));

    try {
      await fetch(`/api/projects/${projectId}/sections/${sectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence_id: sequenceId }),
      });
    } catch (error) {
      console.error('Error linking music section:', error);
      get().fetchMusicSections(projectId);
    }
  },

  // Helpers
  getSequenceById: (sequenceId: string) => {
    return get().sequences.find((s) => s.id === sequenceId);
  },

  getPlansForSequence: (sequenceId: string) => {
    return get().plans
      .filter((p) => p.sequence_id === sequenceId)
      .sort((a, b) => a.sort_order - b.sort_order);
  },

  getUnassignedPlans: () => {
    return get().plans
      .filter((p) => !p.sequence_id)
      .sort((a, b) => a.sort_order - b.sort_order);
  },
}));
