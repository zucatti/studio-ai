'use client';

import { useEffect, useCallback } from 'react';
import { useMontageStore } from '@/store/montage-store';
import { MontageSidebar } from './MontageSidebar';
import { MontagePreview } from './MontagePreview';
import { MontageTimeline } from './MontageTimeline';
import { MontageToolbar } from './MontageToolbar';
import { cn } from '@/lib/utils';

interface TimelineEditorProps {
  projectId: string;
  shortId: string;
  aspectRatio?: string;
  className?: string;
}

export function TimelineEditor({
  projectId,
  shortId,
  aspectRatio = '9:16',
  className,
}: TimelineEditorProps) {
  const {
    setProject,
    addTrack,
    tracks,
    reset,
  } = useMontageStore();

  // Initialize project
  useEffect(() => {
    setProject(projectId, shortId, aspectRatio);

    // Create default tracks if none exist
    if (tracks.length === 0) {
      addTrack('video', 'Video 1');
      addTrack('video', 'Video 2');
      addTrack('audio', 'Audio 1');
    }

    return () => {
      // Don't reset on unmount - keep state for re-mounting
    };
  }, [projectId, shortId, aspectRatio, setProject, addTrack, tracks.length]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const store = useMontageStore.getState();

      switch (e.key) {
        case ' ':
          e.preventDefault();
          store.togglePlayback();
          break;
        case 'Delete':
        case 'Backspace':
          if (store.selectedClipIds.length > 0) {
            e.preventDefault();
            store.selectedClipIds.forEach((id) => store.removeClip(id));
          }
          break;
        case 'Escape':
          store.clearSelection();
          break;
        case 'd':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            // Duplicate selected clips
            store.selectedClipIds.forEach((id) => store.duplicateClip(id));
          }
          break;
        case '=':
        case '+':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            store.zoomIn();
          }
          break;
        case '-':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            store.zoomOut();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* Toolbar */}
      <MontageToolbar />

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar - Asset browser */}
        <MontageSidebar
          projectId={projectId}
          className="w-64 flex-shrink-0 border-r border-white/10"
        />

        {/* Preview area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Video preview */}
          <MontagePreview
            aspectRatio={aspectRatio}
            className="flex-1 min-h-0"
          />

          {/* Timeline */}
          <MontageTimeline className="h-[280px] flex-shrink-0" />
        </div>
      </div>
    </div>
  );
}
