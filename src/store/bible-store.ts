import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GlobalAsset, ProjectAssetFlat, GlobalAssetType } from '@/types/database';
import type { GenericCharacter } from '@/lib/generic-characters';

export type BibleTab = 'characters' | 'locations' | 'props' | 'audio' | 'references';

// Imported generic character (with project link ID)
export interface ImportedGenericCharacter extends GenericCharacter {
  project_generic_asset_id: string;
  created_at: string;
}

// Reference image types for characters
export type CharacterImageType = 'front' | 'profile' | 'back' | 'three_quarter' | 'custom';

export interface ReferenceImage {
  url: string;
  type: CharacterImageType;
  label: string;
}

export interface LookVariation {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
}

export interface CharacterData {
  description?: string;
  visual_description?: string;
  age?: string;
  gender?: string;
  reference_images_metadata?: ReferenceImage[];
  looks?: LookVariation[];
  voice_id?: string;
  voice_name?: string;
}

export interface CreateCharacterInput {
  name: string;
  data: CharacterData;
  tags?: string[];
  reference_images?: string[];
}

export interface GenerateImagesInput {
  mode: 'generate_all' | 'generate_variations' | 'generate_single';
  sourceImageUrl?: string;
  style?: string;
  viewType?: CharacterImageType;
  model?: string;
}

interface BibleStore {
  // UI State
  isOpen: boolean;
  activeTab: BibleTab;
  searchQuery: string;

  // Data
  globalAssets: GlobalAsset[];
  projectAssets: ProjectAssetFlat[];
  projectGenericAssets: ImportedGenericCharacter[];
  isLoading: boolean;
  isGenerating: boolean;

  // Actions
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setActiveTab: (tab: BibleTab) => void;
  setSearchQuery: (query: string) => void;

  // Data fetching
  fetchGlobalAssets: (userId: string) => Promise<void>;
  fetchProjectAssets: (projectId: string) => Promise<void>;
  fetchProjectGenericAssets: (projectId: string) => Promise<void>;
  clearProjectAssets: () => void;

  // Asset operations
  importGlobalAsset: (projectId: string, globalAssetId: string) => Promise<ProjectAssetFlat | null>;
  removeProjectAsset: (projectId: string, projectAssetId: string) => Promise<boolean>;

  // Generic character operations
  importGenericAsset: (projectId: string, genericAssetId: string) => Promise<ImportedGenericCharacter | null>;
  removeGenericAsset: (projectId: string, projectGenericAssetId: string) => Promise<boolean>;
  isGenericAssetInProject: (genericAssetId: string) => boolean;

  // Character CRUD
  createCharacter: (input: CreateCharacterInput) => Promise<GlobalAsset | null>;
  updateCharacter: (assetId: string, input: Partial<CreateCharacterInput>) => Promise<GlobalAsset | null>;
  deleteCharacter: (assetId: string) => Promise<boolean>;

  // Character image generation
  generateCharacterImages: (assetId: string, input: GenerateImagesInput) => Promise<ReferenceImage[] | null>;
  uploadCharacterImage: (assetId: string, file: File, imageType: CharacterImageType) => Promise<string | null>;

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
      projectGenericAssets: [],
      isLoading: false,
      isGenerating: false,

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

      fetchProjectGenericAssets: async (projectId: string) => {
        try {
          const res = await fetch(`/api/projects/${projectId}/generic-assets`);
          if (res.ok) {
            const data = await res.json();
            set({ projectGenericAssets: data.assets || [] });
          }
        } catch (error) {
          console.error('[BibleStore] Error fetching project generic assets:', error);
        }
      },

      clearProjectAssets: () => {
        set({ projectAssets: [], projectGenericAssets: [] });
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

      removeProjectAsset: async (projectId: string, projectAssetId: string) => {
        try {
          const res = await fetch(`/api/projects/${projectId}/assets?id=${projectAssetId}`, {
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

      // Generic character operations
      importGenericAsset: async (projectId: string, genericAssetId: string) => {
        console.log('[BibleStore] importGenericAsset called:', { projectId, genericAssetId });
        try {
          const res = await fetch(`/api/projects/${projectId}/generic-assets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ genericAssetId }),
          });

          console.log('[BibleStore] importGenericAsset response:', res.status);

          if (res.ok) {
            const data = await res.json();
            console.log('[BibleStore] importGenericAsset data:', data);
            const newAsset = data.projectAsset as ImportedGenericCharacter;
            set((state) => ({
              projectGenericAssets: [...state.projectGenericAssets, newAsset],
            }));
            return newAsset;
          } else {
            const errorData = await res.text();
            console.error('[BibleStore] importGenericAsset error response:', res.status, errorData);
          }
          return null;
        } catch (error) {
          console.error('[BibleStore] Error importing generic asset:', error);
          return null;
        }
      },

      removeGenericAsset: async (projectId: string, projectGenericAssetId: string) => {
        try {
          const res = await fetch(`/api/projects/${projectId}/generic-assets?id=${projectGenericAssetId}`, {
            method: 'DELETE',
          });

          if (res.ok) {
            set((state) => ({
              projectGenericAssets: state.projectGenericAssets.filter(
                (a) => a.project_generic_asset_id !== projectGenericAssetId
              ),
            }));
            return true;
          }
          return false;
        } catch (error) {
          console.error('Error removing generic asset:', error);
          return false;
        }
      },

      isGenericAssetInProject: (genericAssetId: string) => {
        return get().projectGenericAssets.some((pa) => pa.id === genericAssetId);
      },

      // Character CRUD
      createCharacter: async (input: CreateCharacterInput) => {
        try {
          const res = await fetch('/api/global-assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              asset_type: 'character',
              name: input.name,
              data: input.data,
              tags: input.tags || [],
              reference_images: input.reference_images || [],
            }),
          });

          if (res.ok) {
            const { asset } = await res.json();
            set((state) => ({
              globalAssets: [asset, ...state.globalAssets],
            }));
            return asset;
          }
          return null;
        } catch (error) {
          console.error('Error creating character:', error);
          return null;
        }
      },

      updateCharacter: async (assetId: string, input: Partial<CreateCharacterInput>) => {
        try {
          const res = await fetch(`/api/global-assets/${assetId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: input.name,
              data: input.data,
              tags: input.tags,
              reference_images: input.reference_images,
            }),
          });

          if (res.ok) {
            const { asset } = await res.json();
            set((state) => ({
              globalAssets: state.globalAssets.map((a) => (a.id === assetId ? asset : a)),
            }));
            return asset;
          }
          return null;
        } catch (error) {
          console.error('Error updating character:', error);
          return null;
        }
      },

      deleteCharacter: async (assetId: string) => {
        try {
          const res = await fetch(`/api/global-assets/${assetId}`, {
            method: 'DELETE',
          });

          if (res.ok) {
            set((state) => ({
              globalAssets: state.globalAssets.filter((a) => a.id !== assetId),
            }));
            return true;
          }
          return false;
        } catch (error) {
          console.error('Error deleting character:', error);
          return false;
        }
      },

      // Character image generation
      generateCharacterImages: async (assetId: string, input: GenerateImagesInput) => {
        set({ isGenerating: true });
        try {
          const res = await fetch(`/api/global-assets/${assetId}/generate-images`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
          });

          if (res.ok) {
            const data = await res.json();
            // Update the asset in place without full refetch to avoid closing modal
            const { globalAssets } = get();
            const updatedAssets = globalAssets.map((asset) => {
              if (asset.id === assetId) {
                return {
                  ...asset,
                  reference_images: data.imageUrls,
                  data: {
                    ...(asset.data as Record<string, unknown>),
                    reference_images_metadata: data.allImages,
                  },
                };
              }
              return asset;
            });
            set({ globalAssets: updatedAssets });
            return data.allImages as ReferenceImage[];
          }
          const error = await res.json();
          console.error('Generation error:', error);
          return null;
        } catch (error) {
          console.error('Error generating images:', error);
          return null;
        } finally {
          set({ isGenerating: false });
        }
      },

      uploadCharacterImage: async (assetId: string, file: File, imageType: CharacterImageType) => {
        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('bucket', 'project-assets');

          const uploadRes = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          if (!uploadRes.ok) {
            console.error('Upload failed');
            return null;
          }

          const { url } = await uploadRes.json();

          // Get current asset
          const asset = get().globalAssets.find((a) => a.id === assetId);
          if (!asset) return null;

          const characterData = asset.data as Record<string, unknown>;
          const existingMetadata = (characterData.reference_images_metadata as ReferenceImage[]) || [];

          // Create or update the reference image metadata
          const imageLabels: Record<CharacterImageType, string> = {
            front: 'Face (Vue de face)',
            profile: 'Profil (Vue de cote)',
            back: 'Dos (Vue arriere)',
            three_quarter: 'Vue 3/4',
            custom: 'Image personnalisee',
          };

          const newImage: ReferenceImage = {
            url,
            type: imageType,
            label: imageLabels[imageType],
          };

          // Replace existing image of same type or add new
          const updatedMetadata = existingMetadata.filter((img) => img.type !== imageType);
          updatedMetadata.push(newImage);

          // Sort by type order
          const typeOrder: CharacterImageType[] = ['front', 'profile', 'back', 'three_quarter', 'custom'];
          updatedMetadata.sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));

          // Update asset
          const updatedData = {
            ...characterData,
            reference_images_metadata: updatedMetadata,
          };

          await get().updateCharacter(assetId, {
            data: updatedData as CharacterData,
            reference_images: updatedMetadata.map((img) => img.url),
          });

          return url;
        } catch (error) {
          console.error('Error uploading image:', error);
          return null;
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
