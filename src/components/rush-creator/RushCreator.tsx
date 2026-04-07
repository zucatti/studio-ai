'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRushCreatorStore } from '@/store/rush-creator-store';
import { RushCarousel } from './RushCarousel';
import { RushGeneratorPanel } from './RushGeneratorPanel';
import { RushActionBar } from './RushActionBar';
import { RushProjectSelector } from './RushProjectSelector';

interface RushCreatorProps {
  projectId?: string;
}

export function RushCreator({ projectId }: RushCreatorProps) {
  const {
    isOpen,
    close,
    currentProjectId,
    setCurrentProjectId,
    media,
    pendingJobs,
    currentIndex,
    navigatePrev,
    navigateNext,
    getTotalItems,
    isLoading,
  } = useRushCreatorStore();

  const totalItems = getTotalItems();

  // Set project ID when provided
  useEffect(() => {
    if (projectId && projectId !== currentProjectId) {
      setCurrentProjectId(projectId);
    }
  }, [projectId, currentProjectId, setCurrentProjectId]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if focused on input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          navigatePrev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          navigateNext();
          break;
        case 'Escape':
          e.preventDefault();
          close();
          break;
        case ' ':
          // Space to toggle selection of current item (only for completed media, not pending)
          e.preventDefault();
          const mediaIndex = currentIndex - pendingJobs.length;
          if (mediaIndex >= 0 && media[mediaIndex]) {
            useRushCreatorStore.getState().toggleSelect(media[mediaIndex].id);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, navigatePrev, navigateNext, close, media, currentIndex]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-[#0a0f1a] flex flex-col"
      style={{ isolation: 'isolate' }}
    >
      {/* Header */}
      <header className="flex items-center justify-between h-14 px-4 border-b border-white/5">
        {/* Close button */}
        <button
          onClick={close}
          className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
          title="Fermer (Escape)"
        >
          <X className="w-5 h-5 text-white" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-white">Rush Creator</h1>
        </div>

        {/* Project selector */}
        <RushProjectSelector />
      </header>

      {/* Main content - Carousel */}
      <main className="flex-1 relative overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-slate-400 text-sm">Chargement...</span>
            </div>
          </div>
        ) : totalItems === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-slate-400 text-lg mb-2">Aucun rush</p>
              <p className="text-slate-500 text-sm">Utilisez le panneau ci-dessous pour générer des images ou vidéos</p>
            </div>
          </div>
        ) : (
          <RushCarousel />
        )}
      </main>

      {/* Action bar */}
      <RushActionBar />

      {/* Generator panel */}
      <RushGeneratorPanel />

      {/* Keyboard hints - positioned in the main content area */}
      <div className="absolute bottom-[220px] right-6 text-slate-600 text-xs flex items-center gap-3 pointer-events-none">
        <span>← → Navigation</span>
        <span>•</span>
        <span>Espace Selection</span>
        <span>•</span>
        <span>Echap Fermer</span>
      </div>
    </div>,
    document.body
  );
}

// Export the toggle button for external use
export function RushCreatorToggleButton({ projectId }: { projectId?: string }) {
  const { open, isOpen } = useRushCreatorStore();

  return (
    <>
      <button
        onClick={() => open(projectId)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
          isOpen
            ? 'bg-blue-500/20 text-blue-400'
            : 'text-slate-400 hover:text-white hover:bg-white/5'
        )}
        title="Ouvrir Rush Creator"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span>Rush</span>
      </button>
      <RushCreator projectId={projectId} />
    </>
  );
}
