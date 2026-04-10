'use client';

/**
 * Timeline Editor
 *
 * Main container for the unified timeline editor.
 * Supports video, audio, image, and transition tracks.
 */

import { useEffect, useRef } from 'react';
import { useTimelineStore, selectSortedTracks } from '@/store/timeline-store';
import { useTimeline } from '@/hooks/use-timeline';
import { TimelineToolbar } from './TimelineToolbar';
import { TimelineTracks } from './TimelineTracks';
import { TimelineSidebar } from './TimelineSidebar';
import { TimelinePreview } from './TimelinePreview';
import { TimelineRuler } from './TimelineRuler';
import { Loader2 } from 'lucide-react';

export interface TimelineEditorProps {
  sceneId: string;
  projectId: string;
  mode?: 'short' | 'musicvideo' | 'film';
  masterAudioUrl?: string;
  sequences?: Array<{
    id: string;
    title: string;
    duration: number;
    thumbnailUrl?: string;
  }>;
  rushItems?: Array<{
    id: string;
    type: 'video' | 'image';
    url: string;
    duration?: number;
    thumbnailUrl?: string;
    label?: string;
  }>;
  audioAssets?: Array<{
    id: string;
    url: string;
    duration: number;
    label: string;
  }>;
  onRender?: () => void;
}

export function TimelineEditor({
  sceneId,
  projectId,
  mode = 'short',
  masterAudioUrl,
  sequences = [],
  rushItems = [],
  audioAssets = [],
  onRender,
}: TimelineEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Load/save via hook
  const {
    isLoading,
    isSaving,
    isDirty,
    error,
    save: handleSave,
  } = useTimeline({ sceneId, projectId });

  const {
    isPlaying,
    togglePlayback,
    seekTo,
    currentTime,
    duration,
    scale,
    setScale,
    zoomIn,
    zoomOut,
    fitToView,
    setMasterAudio,
    deleteSelectedClips,
    selectedClipIds,
  } = useTimelineStore();

  const tracks = useTimelineStore(selectSortedTracks);

  // Set master audio on mount
  useEffect(() => {
    if (masterAudioUrl) {
      setMasterAudio(masterAudioUrl);
    }
  }, [masterAudioUrl, setMasterAudio]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Space - Play/Pause
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayback();
      }

      // Delete/Backspace - Delete selected
      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selectedClipIds.length > 0) {
          e.preventDefault();
          deleteSelectedClips();
        }
      }

      // Cmd/Ctrl + S - Save
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyS') {
        e.preventDefault();
        handleSave();
      }

      // Cmd/Ctrl + Plus - Zoom in
      if ((e.metaKey || e.ctrlKey) && (e.code === 'Equal' || e.code === 'NumpadAdd')) {
        e.preventDefault();
        zoomIn();
      }

      // Cmd/Ctrl + Minus - Zoom out
      if ((e.metaKey || e.ctrlKey) && (e.code === 'Minus' || e.code === 'NumpadSubtract')) {
        e.preventDefault();
        zoomOut();
      }

      // Home - Go to start
      if (e.code === 'Home') {
        e.preventDefault();
        seekTo(0);
      }

      // End - Go to end
      if (e.code === 'End') {
        e.preventDefault();
        seekTo(duration);
      }

      // Arrow keys - Move playhead
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 1 / 30; // 1s or 1 frame
        seekTo(currentTime - step);
      }

      if (e.code === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 1 / 30;
        seekTo(currentTime + step);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    togglePlayback,
    deleteSelectedClips,
    handleSave,
    zoomIn,
    zoomOut,
    seekTo,
    duration,
    currentTime,
    selectedClipIds,
  ]);

  // Fit to view on mount
  useEffect(() => {
    if (containerRef.current && duration > 0) {
      const width = containerRef.current.offsetWidth - 200; // Sidebar width
      fitToView(width);
    }
  }, [duration, fitToView]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-zinc-950 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
        <p className="mt-2 text-sm text-zinc-500">Loading timeline...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col h-full bg-zinc-950 items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950" ref={containerRef}>
      {/* Toolbar */}
      <TimelineToolbar
        isPlaying={isPlaying}
        onPlayPause={togglePlayback}
        currentTime={currentTime}
        duration={duration}
        scale={scale}
        onScaleChange={setScale}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onSave={handleSave}
        onRender={onRender}
        isDirty={isDirty}
        isSaving={isSaving}
      />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <TimelineSidebar
          sequences={sequences}
          rushItems={rushItems}
          audioAssets={audioAssets}
        />

        {/* Timeline area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Ruler */}
          <TimelineRuler />

          {/* Tracks */}
          <TimelineTracks tracks={tracks} />
        </div>

        {/* Preview */}
        <TimelinePreview />
      </div>
    </div>
  );
}
