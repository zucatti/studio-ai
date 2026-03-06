import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface SidebarStore {
  isLocked: boolean;
  isVisible: boolean;
  toggleLock: () => void;
  show: () => void;
  hide: () => void;
  setHasHydrated: (state: boolean) => void;
  _hasHydrated: boolean;
}

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set) => ({
      isLocked: true,
      isVisible: false,
      _hasHydrated: false,
      toggleLock: () => set((state) => ({ isLocked: !state.isLocked })),
      show: () => set({ isVisible: true }),
      hide: () => set({ isVisible: false }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'sidebar-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ isLocked: state.isLocked }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
