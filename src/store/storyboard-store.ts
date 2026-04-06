/**
 * Storyboard Store
 *
 * Manages storyboard frames - visual exploration of the script.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  StoryboardFrame,
  StoryboardFrameWithContext,
  StoryboardFrameInsert,
  StoryboardFrameUpdate,
} from '@/types/storyboard';

interface ProposedFrame {
  scene_id: string | null;
  script_element_id: string | null;
  description: string;
  sort_order: number;
}

interface StoryboardState {
  // Data
  frames: StoryboardFrameWithContext[];
  proposedFrames: ProposedFrame[];

  // UI State
  isLoading: boolean;
  isAnalyzing: boolean;
  selectedFrameId: string | null;
  error: string | null;

  // Actions
  fetchFrames: (projectId: string) => Promise<void>;
  createFrame: (projectId: string, frame: Omit<StoryboardFrameInsert, 'project_id'>) => Promise<StoryboardFrame | null>;
  updateFrame: (projectId: string, frameId: string, updates: StoryboardFrameUpdate) => Promise<void>;
  deleteFrame: (projectId: string, frameId: string) => Promise<void>;
  deleteAllFrames: (projectId: string) => Promise<void>;
  generateSketch: (projectId: string, frameId: string, customPrompt?: string) => Promise<void>;
  analyzeScript: (projectId: string) => Promise<void>;
  acceptProposedFrames: (projectId: string) => Promise<void>;
  clearProposedFrames: () => void;
  selectFrame: (frameId: string | null) => void;
  reorderFrames: (projectId: string, frameIds: string[]) => Promise<void>;
  setError: (error: string | null) => void;
}

export const useStoryboardStore = create<StoryboardState>()(
  immer((set, get) => ({
    // Initial state
    frames: [],
    proposedFrames: [],
    isLoading: false,
    isAnalyzing: false,
    selectedFrameId: null,
    error: null,

    fetchFrames: async (projectId: string) => {
      set((state) => {
        state.isLoading = true;
        state.error = null;
      });

      try {
        const res = await fetch(`/api/projects/${projectId}/storyboard-frames`);
        if (!res.ok) {
          throw new Error('Failed to fetch frames');
        }
        const data = await res.json();

        set((state) => {
          state.frames = data.frames || [];
          state.isLoading = false;
        });
      } catch (error) {
        set((state) => {
          state.error = error instanceof Error ? error.message : 'Unknown error';
          state.isLoading = false;
        });
      }
    },

    createFrame: async (projectId: string, frame: Omit<StoryboardFrameInsert, 'project_id'>) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/storyboard-frames`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(frame),
        });

        if (!res.ok) {
          throw new Error('Failed to create frame');
        }

        const data = await res.json();
        const newFrame = data.frame as StoryboardFrameWithContext;

        set((state) => {
          state.frames.push(newFrame);
          state.frames.sort((a, b) => a.sort_order - b.sort_order);
        });

        return newFrame;
      } catch (error) {
        set((state) => {
          state.error = error instanceof Error ? error.message : 'Unknown error';
        });
        return null;
      }
    },

    updateFrame: async (projectId: string, frameId: string, updates: StoryboardFrameUpdate) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/storyboard-frames/${frameId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });

        if (!res.ok) {
          throw new Error('Failed to update frame');
        }

        const data = await res.json();
        const updatedFrame = data.frame as StoryboardFrame;

        set((state) => {
          const index = state.frames.findIndex((f) => f.id === frameId);
          if (index !== -1) {
            state.frames[index] = { ...state.frames[index], ...updatedFrame };
          }
        });
      } catch (error) {
        set((state) => {
          state.error = error instanceof Error ? error.message : 'Unknown error';
        });
      }
    },

    deleteFrame: async (projectId: string, frameId: string) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/storyboard-frames/${frameId}`, {
          method: 'DELETE',
        });

        if (!res.ok) {
          throw new Error('Failed to delete frame');
        }

        set((state) => {
          state.frames = state.frames.filter((f) => f.id !== frameId);
          if (state.selectedFrameId === frameId) {
            state.selectedFrameId = null;
          }
        });
      } catch (error) {
        set((state) => {
          state.error = error instanceof Error ? error.message : 'Unknown error';
        });
      }
    },

    deleteAllFrames: async (projectId: string) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/storyboard-frames`, {
          method: 'DELETE',
        });

        if (!res.ok) {
          throw new Error('Failed to delete all frames');
        }

        set((state) => {
          state.frames = [];
          state.selectedFrameId = null;
        });
      } catch (error) {
        set((state) => {
          state.error = error instanceof Error ? error.message : 'Unknown error';
        });
      }
    },

    generateSketch: async (projectId: string, frameId: string, customPrompt?: string) => {
      // Update local state to generating
      set((state) => {
        const frame = state.frames.find((f) => f.id === frameId);
        if (frame) {
          frame.generation_status = 'generating';
          frame.generation_error = null;
        }
      });

      try {
        const res = await fetch(`/api/projects/${projectId}/storyboard-frames/${frameId}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customPrompt }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to start generation');
        }

        const data = await res.json();
        console.log(`[StoryboardStore] Generation queued, job ${data.jobId} for frame ${frameId}`);

        // The actual image will be updated when job completes (via polling + refetch in page)
      } catch (error) {
        set((state) => {
          const frame = state.frames.find((f) => f.id === frameId);
          if (frame) {
            frame.generation_status = 'failed';
            frame.generation_error = error instanceof Error ? error.message : 'Unknown error';
          }
        });
      }
    },

    analyzeScript: async (projectId: string) => {
      set((state) => {
        state.isAnalyzing = true;
        state.error = null;
      });

      try {
        const res = await fetch(`/api/projects/${projectId}/storyboard-frames/analyze`, {
          method: 'POST',
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to analyze script');
        }

        const data = await res.json();

        set((state) => {
          state.proposedFrames = data.frames || [];
          state.isAnalyzing = false;
        });
      } catch (error) {
        set((state) => {
          state.error = error instanceof Error ? error.message : 'Unknown error';
          state.isAnalyzing = false;
        });
      }
    },

    acceptProposedFrames: async (projectId: string) => {
      const { proposedFrames } = get();
      if (proposedFrames.length === 0) return;

      set((state) => {
        state.isLoading = true;
      });

      try {
        // Create frames one by one
        for (const proposed of proposedFrames) {
          await get().createFrame(projectId, {
            scene_id: proposed.scene_id,
            script_element_id: proposed.script_element_id,
            description: proposed.description,
            sort_order: proposed.sort_order,
          });
        }

        set((state) => {
          state.proposedFrames = [];
          state.isLoading = false;
        });
      } catch (error) {
        set((state) => {
          state.error = error instanceof Error ? error.message : 'Unknown error';
          state.isLoading = false;
        });
      }
    },

    clearProposedFrames: () => {
      set((state) => {
        state.proposedFrames = [];
      });
    },

    selectFrame: (frameId: string | null) => {
      set((state) => {
        state.selectedFrameId = frameId;
      });
    },

    reorderFrames: async (projectId: string, frameIds: string[]) => {
      // Optimistic update
      set((state) => {
        const frameMap = new Map(state.frames.map((f) => [f.id, f]));
        state.frames = frameIds
          .map((id, index) => {
            const frame = frameMap.get(id);
            if (frame) {
              frame.sort_order = index;
            }
            return frame;
          })
          .filter(Boolean) as StoryboardFrameWithContext[];
      });

      // TODO: API call to persist order
      // For now, we update each frame individually
      try {
        for (let i = 0; i < frameIds.length; i++) {
          await fetch(`/api/projects/${projectId}/storyboard-frames/${frameIds[i]}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sort_order: i }),
          });
        }
      } catch {
        // Refetch on error
        get().fetchFrames(projectId);
      }
    },

    setError: (error: string | null) => {
      set((state) => {
        state.error = error;
      });
    },
  }))
);
