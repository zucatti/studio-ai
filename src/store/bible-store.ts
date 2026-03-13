import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GlobalAsset, ProjectAssetFlat, GlobalAssetType } from '@/types/database';

export type BibleTab = 'characters' | 'locations' | 'props' | 'audio';

interface BibleStore {
  // UI State
  isOpen: boolean;
  activeTab: BibleTab;
  searchQuery: string;

  // Data
  globalAssets: GlobalAsset[];
  projectAssets: ProjectAssetFlat[];
  isLoading: boolean;

  // Actions
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setActiveTab: (tab: BibleTab) => void;
  setSearchQuery: (query: string) => void;

  // Data fetching
  fetchGlobalAssets: (userId: string) => Promise<void>;
  fetchProjectAssets: (projectId: string) => Promise<void>;

  // Asset operations
  importGlobalAsset: (projectId: string, globalAssetId: string) => Promise<ProjectAssetFlat | null>;
  removeProjectAsset: (projectAssetId: string) => Promise<boolean>;

  // Helpers
  getAssetsByType: (type: GlobalAssetType) => GlobalAsset[];
  getProjectAssetsByType: (type: GlobalAssetType) => ProjectAssetFlat[];
  isAssetInProject: (globalAssetId: string) => boolean;

  // Hydration state for SSR
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

export const useBibleStore = create<BibleStore>()(
  persist(
    (set, get) => ({
      // UI State
      isOpen: false,
      activeTab: 'characters',
      searchQuery: '',

      // Data
      globalAssets: [],
      projectAssets: [],
      isLoading: false,

      // Hydration
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),

      // Actions
      setOpen: (open) => set({ isOpen: open }),
      toggle: () => set((state) => ({ isOpen: !state.isOpen })),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      // Data fetching
      fetchGlobalAssets: async () => {
        set({ isLoading: true });
        try {
          const res = await fetch('/api/global-assets');
          if (res.ok) {
            const data = await res.json();
            set({ globalAssets: data.assets || [] });
          }
        } catch (error) {
          console.error('Error fetching global assets:', error);
        } finally {
          set({ isLoading: false });
        }
      },

      fetchProjectAssets: async (projectId: string) => {
        set({ isLoading: true });
        try {
          console.log('[BibleStore] Fetching project assets for:', projectId);
          const res = await fetch(`/api/projects/${projectId}/assets`);
          console.log('[BibleStore] Response status:', res.status);
          if (res.ok) {
            const data = await res.json();
            console.log('[BibleStore] Received assets:', data.assets?.length || 0, data.assets);
            // API returns flattened assets, store them directly
            set({ projectAssets: data.assets || [] });
          } else {
            const errorText = await res.text();
            console.error('[BibleStore] API error:', res.status, errorText);
          }
        } catch (error) {
          console.error('[BibleStore] Error fetching project assets:', error);
        } finally {
          set({ isLoading: false });
        }
      },

      // Asset operations
      importGlobalAsset: async (projectId: string, globalAssetId: string) => {
        try {
          const res = await fetch(`/api/projects/${projectId}/assets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ globalAssetId }),
          });

          if (res.ok) {
            // Refresh all project assets to get the flattened format
            await get().fetchProjectAssets(projectId);
            const newAsset = get().projectAssets.find((pa) => pa.id === globalAssetId);
            return newAsset || null;
          }
          return null;
        } catch (error) {
          console.error('Error importing asset:', error);
          return null;
        }
      },

      removeProjectAsset: async (projectAssetId: string) => {
        try {
          const res = await fetch(`/api/project-assets/${projectAssetId}`, {
            method: 'DELETE',
          });

          if (res.ok) {
            set((state) => ({
              projectAssets: state.projectAssets.filter((a) => a.project_asset_id !== projectAssetId),
            }));
            return true;
          }
          return false;
        } catch (error) {
          console.error('Error removing asset:', error);
          return false;
        }
      },

      // Helpers
      getAssetsByType: (type: GlobalAssetType) => {
        const { globalAssets, searchQuery } = get();
        return globalAssets
          .filter((a) => a.asset_type === type)
          .filter((a) =>
            searchQuery
              ? a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                a.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
              : true
          );
      },

      getProjectAssetsByType: (type: GlobalAssetType) => {
        const { projectAssets, searchQuery } = get();
        return projectAssets
          .filter((pa) => pa.asset_type === type)
          .filter((pa) =>
            searchQuery
              ? pa.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                pa.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
              : true
          );
      },

      isAssetInProject: (globalAssetId: string) => {
        return get().projectAssets.some((pa) => pa.id === globalAssetId);
      },
    }),
    {
      name: 'bible-storage',
      partialize: (state) => ({
        isOpen: state.isOpen,
        activeTab: state.activeTab,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
