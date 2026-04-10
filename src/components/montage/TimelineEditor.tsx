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

// Sequence/Plan data from Edition mode
interface SequenceData {
  id: string;
  title: string | null;
  start_time?: number | null;
  end_time?: number | null;
  assembled_video_url?: string | null;
}

interface PlanData {
  id: string;
  sequence_id: string | null;
  sort_order: number;
  duration: number;
  generated_video_url?: string | null;
  storyboard_image_url?: string | null;
  description?: string;
}

interface TimelineEditorProps {
  projectId: string;
  shortId?: string;  // Optional - if not provided, uses project-level timeline
  aspectRatio?: string;
  className?: string;
  // Edition mode data to auto-import
  sequences?: SequenceData[];
  plans?: PlanData[];
}

export function TimelineEditor({
  projectId,
  shortId,
  aspectRatio = '9:16',
  className,
  sequences = [],
  plans = [],
}: TimelineEditorProps) {
  // Debug: log props on mount/update
  console.log('[TimelineEditor] Render with props:', {
    projectId,
    shortId,
    sequenceCount: sequences.length,
    planCount: plans.length,
    planIds: plans.map(p => p.id).slice(0, 3),
  });

  // API endpoints based on whether we're in short mode or project mode
  const apiBase = shortId
    ? `/api/projects/${projectId}/shorts/${shortId}/montage`
    : `/api/projects/${projectId}/timeline`;
  const entityId = shortId || projectId;
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState<number | undefined>();
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(null);

  const {
    setProject,
    addTrack,
    addClip,
    tracks,
    reset,
    exportToJSON,
    importFromJSON,
  } = useMontageStore();

  const { fetchShorts, setAssembledVideoUrl } = useShortsStore();

  // Auto-import sequences/plans from Edition mode
  const importFromEdition = useCallback(() => {
    if (plans.length === 0) return;

    console.log('[TimelineEditor] Auto-importing from Edition mode:', {
      sequenceCount: sequences.length,
      planCount: plans.length,
      plans: plans.map(p => ({ id: p.id, duration: p.duration, video: !!p.generated_video_url })),
    });

    // Reset store first to clear existing clips
    reset();

    // Create default tracks
    setProject(projectId, entityId, aspectRatio);
    const videoTrackId = addTrack('video', 'Video 1');
    addTrack('video', 'Video 2');
    addTrack('audio', 'Audio 1');

    // Sort plans by sequence order and then by sort_order within sequence
    const sequenceOrder = new Map(sequences.map((s, i) => [s.id, i]));
    const sortedPlans = [...plans].sort((a, b) => {
      const seqOrderA = a.sequence_id ? (sequenceOrder.get(a.sequence_id) ?? 999) : 999;
      const seqOrderB = b.sequence_id ? (sequenceOrder.get(b.sequence_id) ?? 999) : 999;
      if (seqOrderA !== seqOrderB) return seqOrderA - seqOrderB;
      return a.sort_order - b.sort_order;
    });

    // Add plans as clips on the video track
    let currentTime = 0;
    for (const plan of sortedPlans) {
      const assetUrl = plan.generated_video_url || undefined;
      const thumbnailUrl = plan.storyboard_image_url || undefined;
      const clipType = assetUrl ? 'video' : (thumbnailUrl ? 'image' : 'video');

      addClip({
        type: clipType,
        trackId: videoTrackId,
        start: currentTime,
        duration: plan.duration || 5,
        assetUrl,
        thumbnailUrl,
        name: plan.description || `Plan ${plan.sort_order + 1}`,
        sourceStart: 0,
        sourceEnd: plan.duration || 5,
        sourceDuration: plan.duration || 5,
      });

      currentTime += plan.duration || 5;
    }

    console.log('[TimelineEditor] Imported plans as clips:', {
      clipCount: sortedPlans.length,
      totalDuration: currentTime,
    });

    toast.success(`${sortedPlans.length} plans importés`);
  }, [projectId, entityId, aspectRatio, sequences, plans, reset, setProject, addTrack, addClip]);

  // Track if we've fetched from API
  const hasFetchedRef = useRef(false);
  // Track if we've imported from edition
  const hasImportedFromEditionRef = useRef(false);

  // Load montage data from API (runs once)
  useEffect(() => {
    if (hasFetchedRef.current) {
      console.log('[TimelineEditor] Skipping fetch - already fetched');
      return;
    }
    hasFetchedRef.current = true;

    console.log('[TimelineEditor] Fetching from API...');

    const loadMontage = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(apiBase);

        if (res.ok) {
          const data = await res.json();
          console.log('[TimelineEditor] API response:', {
            hasMontageData: !!data.montageData,
            clipCount: data.montageData?.clips?.length || 0,
            trackCount: data.montageData?.tracks?.length || 0,
          });

          if (data.montageData && (data.montageData.clips?.length > 0 || Object.keys(data.montageData.clips || {}).length > 0)) {
            // Import saved montage data
            importFromJSON(data.montageData);
            hasImportedFromEditionRef.current = true; // Mark as done so we don't re-import
            const storeState = useMontageStore.getState();
            console.log('[TimelineEditor] Imported saved data to store:', {
              clips: Object.keys(storeState.clips).length,
              tracks: storeState.tracks.length,
            });
          } else {
            // No saved data - we'll import from Edition in the next effect
            console.log('[TimelineEditor] No saved data, will check for Edition plans');
          }
        }
      } catch (error) {
        console.error('[TimelineEditor] Failed to load montage:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMontage();
  }, [apiBase, importFromJSON]);

  // Auto-import from Edition when plans are available and no saved data
  useEffect(() => {
    // Wait for API fetch to complete
    if (isLoading) {
      console.log('[TimelineEditor] Waiting for API fetch...');
      return;
    }

    // Don't re-import if already done
    if (hasImportedFromEditionRef.current) {
      console.log('[TimelineEditor] Already imported, skipping');
      return;
    }

    // Check if store already has clips (from saved data)
    const storeState = useMontageStore.getState();
    if (Object.keys(storeState.clips).length > 0) {
      console.log('[TimelineEditor] Store already has clips, skipping Edition import');
      hasImportedFromEditionRef.current = true;
      return;
    }

    // Import from Edition if we have plans
    if (plans.length > 0) {
      console.log('[TimelineEditor] Importing from Edition:', { planCount: plans.length });
      hasImportedFromEditionRef.current = true;
      importFromEdition();
    } else {
      // No plans either - create default tracks
      console.log('[TimelineEditor] No saved data and no plans, creating default tracks');
      hasImportedFromEditionRef.current = true;
      setProject(projectId, entityId, aspectRatio);
      addTrack('video', 'Video 1');
      addTrack('video', 'Video 2');
      addTrack('audio', 'Audio 1');
    }
  }, [isLoading, plans, importFromEdition, setProject, projectId, entityId, aspectRatio, addTrack]);

  // Save montage to API
  const handleSave = useCallback(async () => {
    try {
      setIsSaving(true);
      const montageData = exportToJSON();

      const res = await fetch(apiBase, {
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
  }, [apiBase, exportToJSON]);

  // Render montage to MP4
  const handleRender = useCallback(async () => {
    try {
      // First save the current state
      const montageData = exportToJSON();
      await fetch(apiBase, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ montageData }),
      });

      // Start render job
      setIsRendering(true);
      setRenderProgress(0);
      setRenderedVideoUrl(null);

      const res = await fetch(`${apiBase}/render`, {
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
  }, [apiBase, exportToJSON]);

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
            // Only update shorts store if we're in short mode
            if (shortId) {
              const duration = job.result_data?.duration as number | undefined;
              setAssembledVideoUrl(shortId, videoUrl, duration);
              // Also fetch to ensure full data consistency
              fetchShorts(projectId);
            }
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
          shortId={shortId || ''}
          className="w-64 flex-shrink-0 border-r border-white/10"
          editionSequences={sequences}
          editionPlans={plans}
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
