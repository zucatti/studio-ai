import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RushMedia, RushMediaStatus, RushMediaType, AspectRatio } from '@/types/database';

export type RushMode = 'photo' | 'video';

// Pending job with metadata for placeholder display
export interface PendingJob {
  jobId: string;
  prompt: string;
  aspectRatio: AspectRatio;
  mode: RushMode;
  model: string;
  startedAt: number;
  status: 'queued' | 'generating' | 'uploading';
  progress: number;
  message: string;
}

export interface RushCreatorStore {
  // UI State
  isOpen: boolean;
  mode: RushMode;
  currentProjectId: string | null;

  // Media data
  media: RushMedia[];
  isLoading: boolean;

  // Selection
  selectedIds: Set<string>;
  currentIndex: number;

  // Generation state - now with full job metadata
  pendingJobs: PendingJob[];

  // Generation settings
  prompt: string;
  aspectRatio: AspectRatio;
  model: string;
  resolution: '1K' | '2K' | '4K';

  // Actions - UI
  open: (projectId?: string) => void;
  close: () => void;
  setMode: (mode: RushMode) => void;
  setCurrentProjectId: (projectId: string | null) => void;

  // Actions - Navigation
  navigateTo: (index: number) => void;
  navigatePrev: () => void;
  navigateNext: () => void;

  // Actions - Selection
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // Actions - Data
  fetchMedia: (projectId: string, filters?: { status?: RushMediaStatus; mediaType?: RushMediaType }) => Promise<void>;
  addMedia: (media: RushMedia) => void;
  removeMedia: (id: string) => void;
  updateMediaStatus: (ids: string[], status: RushMediaStatus) => Promise<void>;

  // Actions - Status changes (Gallery/Rush workflow)
  moveToGallery: () => Promise<void>;
  moveToRush: () => Promise<void>;
  deleteSelected: () => Promise<void>;

  // Actions - Import
  importToBible: (type: 'location' | 'prop', name: string) => Promise<void>;

  // Actions - Generation
  setPrompt: (prompt: string) => void;
  setAspectRatio: (aspectRatio: AspectRatio) => void;
  setModel: (model: string) => void;
  setResolution: (resolution: '1K' | '2K' | '4K') => void;
  loadPromptFromMedia: (mediaId: string) => void;
  generate: () => Promise<string | null>;
  addPendingJob: (job: PendingJob) => void;
  updatePendingJob: (jobId: string, updates: Partial<PendingJob>) => void;
  removePendingJob: (jobId: string) => void;

  // Computed
  getTotalItems: () => number;
  isGenerating: () => boolean;

  // Hydration
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

export const useRushCreatorStore = create<RushCreatorStore>()(
  persist(
    (set, get) => ({
      // UI State
      isOpen: false,
      mode: 'photo',
      currentProjectId: null,

      // Media data
      media: [],
      isLoading: false,

      // Selection
      selectedIds: new Set<string>(),
      currentIndex: 0,

      // Generation state
      pendingJobs: [],

      // Generation settings
      prompt: '',
      aspectRatio: '9:16',
      model: 'fal-ai/nano-banana-2',
      resolution: '2K',

      // Hydration
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),

      // Computed
      getTotalItems: () => {
        const { media, pendingJobs } = get();
        return pendingJobs.length + media.length;
      },

      isGenerating: () => {
        const { pendingJobs } = get();
        return pendingJobs.length > 0;
      },

      // Actions - UI
      open: (projectId) => {
        set({ isOpen: true });
        if (projectId) {
          set({ currentProjectId: projectId });
          get().fetchMedia(projectId);
        }
      },

      close: () => set({
        isOpen: false,
        selectedIds: new Set(),
        currentIndex: 0,
      }),

      setMode: (mode) => set({ mode }),

      setCurrentProjectId: (projectId) => {
        set({ currentProjectId: projectId, media: [], currentIndex: 0, pendingJobs: [] });
        if (projectId) {
          get().fetchMedia(projectId);
        }
      },

      // Actions - Navigation
      navigateTo: (index) => {
        const total = get().getTotalItems();
        if (index >= 0 && index < total) {
          set({ currentIndex: index });
        }
      },

      navigatePrev: () => {
        const { currentIndex } = get();
        if (currentIndex > 0) {
          set({ currentIndex: currentIndex - 1 });
        }
      },

      navigateNext: () => {
        const { currentIndex } = get();
        const total = get().getTotalItems();
        if (currentIndex < total - 1) {
          set({ currentIndex: currentIndex + 1 });
        }
      },

      // Actions - Selection
      toggleSelect: (id) => {
        const { selectedIds } = get();
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
          newSelected.delete(id);
        } else {
          newSelected.add(id);
        }
        set({ selectedIds: newSelected });
      },

      selectAll: () => {
        const { media } = get();
        set({ selectedIds: new Set(media.map(m => m.id)) });
      },

      clearSelection: () => set({ selectedIds: new Set() }),

      // Actions - Data
      fetchMedia: async (projectId, filters) => {
        set({ isLoading: true });
        try {
          const params = new URLSearchParams();
          if (filters?.status) params.set('status', filters.status);
          if (filters?.mediaType) params.set('mediaType', filters.mediaType);

          const res = await fetch(`/api/rush-creator/media?projectId=${projectId}&${params.toString()}`);
          if (res.ok) {
            const data = await res.json();
            set({ media: data.media || [] });
          }
        } catch (error) {
          console.error('[RushCreatorStore] Error fetching media:', error);
        } finally {
          set({ isLoading: false });
        }
      },

      addMedia: (media) => {
        set((state) => ({
          media: [media, ...state.media],
        }));
      },

      removeMedia: (id) => {
        set((state) => {
          const newMedia = state.media.filter(m => m.id !== id);
          const newSelected = new Set(state.selectedIds);
          newSelected.delete(id);
          const total = state.pendingJobs.length + newMedia.length;
          return {
            media: newMedia,
            selectedIds: newSelected,
            currentIndex: Math.min(state.currentIndex, Math.max(0, total - 1)),
          };
        });
      },

      updateMediaStatus: async (ids, status) => {
        const { currentProjectId } = get();
        if (!currentProjectId) return;

        try {
          const res = await fetch('/api/rush-creator/media/status', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, status }),
          });

          if (res.ok) {
            set((state) => ({
              media: state.media.map(m =>
                ids.includes(m.id) ? { ...m, status } : m
              ),
            }));
          }
        } catch (error) {
          console.error('[RushCreatorStore] Error updating status:', error);
        }
      },

      // Actions - Status changes
      moveToGallery: async () => {
        const { selectedIds } = get();
        if (selectedIds.size === 0) return;
        await get().updateMediaStatus(Array.from(selectedIds), 'selected');
        set({ selectedIds: new Set() });
      },

      moveToRush: async () => {
        const { selectedIds } = get();
        if (selectedIds.size === 0) return;
        await get().updateMediaStatus(Array.from(selectedIds), 'pending');
        set({ selectedIds: new Set() });
      },

      deleteSelected: async () => {
        const { selectedIds, currentProjectId } = get();
        if (selectedIds.size === 0 || !currentProjectId) return;

        try {
          for (const id of selectedIds) {
            const res = await fetch(`/api/rush-creator/media/${id}`, {
              method: 'DELETE',
            });
            if (res.ok) {
              get().removeMedia(id);
            }
          }
          set({ selectedIds: new Set() });
        } catch (error) {
          console.error('[RushCreatorStore] Error deleting media:', error);
        }
      },

      // Actions - Import
      importToBible: async (type, name) => {
        const { selectedIds, currentProjectId, media } = get();
        if (selectedIds.size === 0 || !currentProjectId) return;

        const selectedMedia = media.find(m => selectedIds.has(m.id));
        if (!selectedMedia) return;

        try {
          const res = await fetch('/api/rush-creator/import-to-bible', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: currentProjectId,
              mediaUrl: selectedMedia.url,
              type,
              name,
            }),
          });

          if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Import failed');
          }
        } catch (error) {
          console.error('[RushCreatorStore] Error importing to Bible:', error);
          throw error;
        }
      },

      // Actions - Generation
      setPrompt: (prompt) => set({ prompt }),
      setAspectRatio: (aspectRatio) => set({ aspectRatio }),
      setModel: (model) => set({ model }),
      setResolution: (resolution) => set({ resolution }),

      loadPromptFromMedia: (mediaId) => {
        const { media } = get();
        const item = media.find(m => m.id === mediaId);
        if (item) {
          set({
            prompt: item.prompt || '',
            aspectRatio: (item.aspect_ratio as AspectRatio) || '9:16',
            model: item.model || 'fal-ai/nano-banana-2',
            mode: item.media_type === 'video' ? 'video' : 'photo',
          });
        }
      },

      generate: async () => {
        const { currentProjectId, mode, prompt, aspectRatio, model, resolution } = get();
        if (!currentProjectId || !prompt.trim()) return null;

        try {
          const endpoint = mode === 'photo'
            ? '/api/rush-creator/generate-image'
            : '/api/rush-creator/generate-video';

          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: currentProjectId,
              prompt: prompt.trim(),
              aspectRatio,
              model,
              resolution,
            }),
          });

          if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Generation failed');
          }

          const data = await res.json();
          const jobId = data.jobId;

          if (jobId) {
            // Add pending job with full metadata
            get().addPendingJob({
              jobId,
              prompt: prompt.trim(),
              aspectRatio,
              mode,
              model,
              startedAt: Date.now(),
              status: 'queued',
              progress: 0,
              message: 'En file d\'attente...',
            });

            // Navigate to show the new pending card (index 0)
            set({ currentIndex: 0 });

            // Start polling for this job
            startJobPolling(jobId);
          }

          return jobId;
        } catch (error) {
          console.error('[RushCreatorStore] Error generating:', error);
          throw error;
        }
      },

      addPendingJob: (job) => {
        set((state) => ({
          pendingJobs: [job, ...state.pendingJobs],
        }));
      },

      updatePendingJob: (jobId, updates) => {
        set((state) => ({
          pendingJobs: state.pendingJobs.map(job =>
            job.jobId === jobId ? { ...job, ...updates } : job
          ),
        }));
      },

      removePendingJob: (jobId) => {
        set((state) => {
          const newPendingJobs = state.pendingJobs.filter(j => j.jobId !== jobId);
          // Adjust currentIndex if needed
          const oldTotal = state.pendingJobs.length + state.media.length;
          const newTotal = newPendingJobs.length + state.media.length;
          return {
            pendingJobs: newPendingJobs,
            currentIndex: Math.min(state.currentIndex, Math.max(0, newTotal - 1)),
          };
        });
      },
    }),
    {
      name: 'rush-creator-storage',
      partialize: (state) => ({
        mode: state.mode,
        aspectRatio: state.aspectRatio,
        model: state.model,
        resolution: state.resolution,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

// Job polling - check status every 2 seconds
const pollingIntervals = new Map<string, NodeJS.Timeout>();

function startJobPolling(jobId: string) {
  if (pollingIntervals.has(jobId)) return;

  const poll = async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) {
        console.log(`[RushCreator] Poll failed for job ${jobId}: ${res.status}`);
        return;
      }

      const data = await res.json();
      const job = data.job; // API returns { job: {...} }
      if (!job) {
        console.log(`[RushCreator] No job data in response for ${jobId}`);
        return;
      }

      const store = useRushCreatorStore.getState();

      // Update job progress
      if (store.pendingJobs.some(j => j.jobId === jobId)) {
        const status = job.status === 'running' ? 'generating' :
                      job.status === 'queued' ? 'queued' : 'generating';

        store.updatePendingJob(jobId, {
          status,
          progress: job.progress || 0,
          message: job.message || '',
        });

        console.log(`[RushCreator] Job ${jobId} status: ${job.status}, progress: ${job.progress}`);

        // Job completed or failed - stop polling
        if (job.status === 'completed' || job.status === 'failed') {
          console.log(`[RushCreator] Job ${jobId} finished with status: ${job.status}`);
          stopJobPolling(jobId);
          store.removePendingJob(jobId);

          // Refresh media to get the new item
          if (job.status === 'completed' && store.currentProjectId && store.isOpen) {
            console.log(`[RushCreator] Fetching media for project ${store.currentProjectId}`);
            await store.fetchMedia(store.currentProjectId);
            // Navigate to the first item to show the newly completed media
            useRushCreatorStore.setState({ currentIndex: 0 });
            console.log(`[RushCreator] Media refreshed, navigated to index 0`);
          }
        }
      } else {
        // Job no longer tracked, stop polling
        stopJobPolling(jobId);
      }
    } catch (error) {
      console.error(`[RushCreator] Poll error for job ${jobId}:`, error);
    }
  };

  // Poll immediately then every 2 seconds
  poll();
  const interval = setInterval(poll, 2000);
  pollingIntervals.set(jobId, interval);
}

function stopJobPolling(jobId: string) {
  const interval = pollingIntervals.get(jobId);
  if (interval) {
    clearInterval(interval);
    pollingIntervals.delete(jobId);
  }
}

// Clean up polling when window closes
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    pollingIntervals.forEach((interval) => clearInterval(interval));
    pollingIntervals.clear();
  });
}
