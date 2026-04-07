'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { useMontageStore } from '@/store/montage-store';
import { useShortsStore } from '@/store/shorts-store';
import { MontageSidebar } from './MontageSidebar';
import { MontagePreview } from './MontagePreview';
import { MontageTimeline } from './MontageTimeline';
import { MontageToolbar } from './MontageToolbar';
import { AudioPlayback } from './AudioPlayback';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Download } from 'lucide-react';

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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState<number | undefined>();
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const {
    setProject,
    addTrack,
    tracks,
    reset,
    exportToJSON,
    importFromJSON,
  } = useMontageStore();

  const { fetchShorts, setAssembledVideoUrl } = useShortsStore();

  // Load montage data from API
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    const loadMontage = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/projects/${projectId}/shorts/${shortId}/montage`);

        if (res.ok) {
          const data = await res.json();
          console.log('[TimelineEditor] Loaded montage data:', {
            hasMontageData: !!data.montageData,
            clipCount: data.montageData?.clips?.length || 0,
            trackCount: data.montageData?.tracks?.length || 0,
          });

          if (data.montageData) {
            // Import saved montage data
            importFromJSON(data.montageData);
            const storeState = useMontageStore.getState();
            console.log('[TimelineEditor] Imported to store:', {
              clips: Object.keys(storeState.clips).length,
              tracks: storeState.tracks.length,
              clipDetails: Object.values(storeState.clips).map(c => ({
                id: c.id,
                trackId: c.trackId,
                type: c.type,
                start: c.start,
                duration: c.duration,
                assetUrl: c.assetUrl?.substring(0, 80),
                thumbnailUrl: c.thumbnailUrl?.substring(0, 80),
              })),
              trackDetails: storeState.tracks.map(t => ({
                id: t.id,
                type: t.type,
                name: t.name,
              })),
            });
          } else {
            // No saved data - create default tracks
            setProject(projectId, shortId, aspectRatio);
            addTrack('video', 'Video 1');
            addTrack('video', 'Video 2');
            addTrack('audio', 'Audio 1');
          }
        } else {
          // API error - create default tracks
          setProject(projectId, shortId, aspectRatio);
          addTrack('video', 'Video 1');
          addTrack('video', 'Video 2');
          addTrack('audio', 'Audio 1');
        }
      } catch (error) {
        console.error('Failed to load montage:', error);
        // Create default tracks on error
        setProject(projectId, shortId, aspectRatio);
        addTrack('video', 'Video 1');
        addTrack('video', 'Video 2');
        addTrack('audio', 'Audio 1');
      } finally {
        setIsLoading(false);
      }
    };

    loadMontage();
  }, [projectId, shortId, aspectRatio, setProject, addTrack, importFromJSON]);

  // Save montage to API
  const handleSave = useCallback(async () => {
    try {
      setIsSaving(true);
      const montageData = exportToJSON();

      const res = await fetch(`/api/projects/${projectId}/shorts/${shortId}/montage`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ montageData }),
      });

      if (res.ok) {
        toast.success('Timeline sauvegardée');
      } else {
        const error = await res.json();
        toast.error(error.error || 'Erreur lors de la sauvegarde');
      }
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Erreur de connexion');
    } finally {
      setIsSaving(false);
    }
  }, [projectId, shortId, exportToJSON]);

  // Render montage to MP4
  const handleRender = useCallback(async () => {
    try {
      // First save the current state
      const montageData = exportToJSON();
      await fetch(`/api/projects/${projectId}/shorts/${shortId}/montage`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ montageData }),
      });

      // Start render job
      setIsRendering(true);
      setRenderProgress(0);
      setRenderedVideoUrl(null);

      const res = await fetch(`/api/projects/${projectId}/shorts/${shortId}/montage/render`, {
        method: 'POST',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to start render');
      }

      const data = await res.json();
      setRenderJobId(data.jobId);
      toast.success('Rendu démarré');

    } catch (error) {
      console.error('Render error:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur de rendu');
      setIsRendering(false);
    }
  }, [projectId, shortId, exportToJSON]);

  // Poll render job status
  useEffect(() => {
    if (!renderJobId || !isRendering) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${renderJobId}`);
        if (!res.ok) return;

        const data = await res.json();
        const job = data.job;
        if (!job) return;

        if (job.status === 'completed') {
          setIsRendering(false);
          setRenderProgress(100);
          const videoUrl = job.result_data?.outputUrl;
          if (videoUrl) {
            setRenderedVideoUrl(videoUrl);
            toast.success('Rendu terminé !', {
              action: {
                label: 'Télécharger',
                onClick: () => {
                  const link = document.createElement('a');
                  link.href = `/api/download?url=${encodeURIComponent(videoUrl)}&filename=montage.mp4`;
                  link.download = 'montage.mp4';
                  link.click();
                },
              },
            });
            // Update store immediately (optimistic) so the video appears in the gallery
            const duration = job.result_data?.duration as number | undefined;
            setAssembledVideoUrl(shortId, videoUrl, duration);
            // Also fetch to ensure full data consistency
            fetchShorts(projectId);
          }
          clearInterval(pollInterval);
        } else if (job.status === 'failed') {
          setIsRendering(false);
          setRenderProgress(undefined);
          toast.error(job.error_message || 'Erreur de rendu');
          clearInterval(pollInterval);
        } else {
          setRenderProgress(job.progress || 0);
        }
      } catch {
        // Silently continue polling
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [renderJobId, isRendering, fetchShorts, setAssembledVideoUrl, projectId, shortId]);

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
        case 's':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            handleSave();
          }
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
  }, [handleSave]);

  // Show loading state
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <div className="text-slate-400">Chargement de la timeline...</div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* Audio playback manager (invisible) */}
      <AudioPlayback />

      {/* Toolbar */}
      <MontageToolbar
        onSave={handleSave}
        onRender={handleRender}
        isRendering={isRendering}
        renderProgress={renderProgress}
      />

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar - Asset browser */}
        <MontageSidebar
          projectId={projectId}
          shortId={shortId}
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
