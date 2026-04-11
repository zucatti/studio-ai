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
    if (plans.length === 0 && sequences.length === 0) return;

    console.log('[TimelineEditor] Auto-importing from Edition mode:', {
      sequenceCount: sequences.length,
      planCount: plans.length,
      sequences: sequences.map(s => ({ id: s.id, title: s.title, assembled: !!s.assembled_video_url })),
      plans: plans.map(p => ({ id: p.id, seq: p.sequence_id, duration: p.duration, video: !!p.generated_video_url })),
    });

    // Reset store first to clear existing clips
    reset();

    // Create default tracks
    setProject(projectId, entityId, aspectRatio);
    const videoTrackId = addTrack('video', 'Video 1');
    addTrack('video', 'Video 2');
    addTrack('audio', 'Audio 1');

    // Sort sequences by their order
    const sortedSequences = [...sequences].sort((a, b) => {
      // Use start_time if available, otherwise maintain original order
      const timeA = a.start_time ?? 0;
      const timeB = b.start_time ?? 0;
      return timeA - timeB;
    });

    // Group plans by sequence
    const plansBySequence = new Map<string, PlanData[]>();
    for (const plan of plans) {
      if (plan.sequence_id) {
        const existing = plansBySequence.get(plan.sequence_id) || [];
        existing.push(plan);
        plansBySequence.set(plan.sequence_id, existing);
      }
    }

    // Sort plans within each sequence
    for (const [seqId, seqPlans] of plansBySequence) {
      seqPlans.sort((a, b) => a.sort_order - b.sort_order);
      plansBySequence.set(seqId, seqPlans);
    }

    // Add clips: either assembled sequence video OR individual plans
    let currentTime = 0;
    let clipCount = 0;

    for (const sequence of sortedSequences) {
      const seqPlans = plansBySequence.get(sequence.id) || [];

      // If sequence has assembled video, use that as ONE clip
      if (sequence.assembled_video_url) {
        // Calculate total duration from plans or use sequence times
        let sequenceDuration = 0;
        if (sequence.start_time != null && sequence.end_time != null) {
          sequenceDuration = sequence.end_time - sequence.start_time;
        } else {
          sequenceDuration = seqPlans.reduce((sum, p) => sum + (p.duration || 5), 0);
        }

        // Get thumbnail from first plan
        const firstPlan = seqPlans[0];
        const thumbnailUrl = firstPlan?.storyboard_image_url || undefined;

        console.log('[TimelineEditor] Adding assembled sequence clip:', {
          sequenceId: sequence.id,
          title: sequence.title,
          url: sequence.assembled_video_url?.substring(0, 60) + '...',
          duration: sequenceDuration,
          startTime: currentTime,
        });

        addClip({
          type: 'video',
          trackId: videoTrackId,
          start: currentTime,
          duration: sequenceDuration || 5,
          assetUrl: sequence.assembled_video_url,
          thumbnailUrl,
          name: sequence.title || `Sequence ${clipCount + 1}`,
          sourceStart: 0,
          sourceEnd: sequenceDuration || 5,
          sourceDuration: sequenceDuration || 5,
        });

        currentTime += sequenceDuration || 5;
        clipCount++;
      } else {
        // No assembled video - add individual plans
        for (const plan of seqPlans) {
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
          clipCount++;
        }
      }
    }

    // Handle orphan plans (not in any sequence)
    const orphanPlans = plans.filter(p => !p.sequence_id);
    for (const plan of orphanPlans) {
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
      clipCount++;
    }

    console.log('[TimelineEditor] Import complete:', {
      clipCount,
      totalDuration: currentTime,
    });

    toast.success(`${clipCount} clips importés`);
  }, [projectId, entityId, aspectRatio, sequences, plans, reset, setProject, addTrack, addClip]);

  // Track if we've fetched from API
  const hasFetchedRef = useRef(false);
  // Track if we've imported from edition
  const hasImportedFromEditionRef = useRef(false);

  // Update existing clips with new assembled video URLs (preserves other clips like audio)
  const updateClipsWithAssembledVideos = useCallback(() => {
    const store = useMontageStore.getState();
    const clips = store.clips;
    const updateClip = store.updateClip;

    // Find sequences that have assembled videos
    const assembledSequences = sequences.filter(s => s.assembled_video_url);
    if (assembledSequences.length === 0) return 0;

    let updatedCount = 0;

    for (const sequence of assembledSequences) {
      // Find clips that match this sequence (by name or by checking if they're individual plans from this sequence)
      const seqPlans = plans.filter(p => p.sequence_id === sequence.id);
      const planDescriptions = seqPlans.map(p => p.description || `Plan ${p.sort_order + 1}`);

      // Look for clips that are individual plans from this sequence
      const clipsToUpdate = Object.values(clips).filter(clip => {
        // Check if clip name matches sequence title or any plan description
        if (clip.name === sequence.title) return true;
        if (planDescriptions.includes(clip.name || '')) return true;
        return false;
      });

      if (clipsToUpdate.length > 0) {
        // Calculate total duration
        let sequenceDuration = 0;
        if (sequence.start_time != null && sequence.end_time != null) {
          sequenceDuration = sequence.end_time - sequence.start_time;
        } else {
          sequenceDuration = seqPlans.reduce((sum, p) => sum + (p.duration || 5), 0);
        }

        // Update the first clip with assembled video, remove others
        const sortedClips = clipsToUpdate.sort((a, b) => a.start - b.start);
        const firstClip = sortedClips[0];

        console.log('[TimelineEditor] Updating clip with assembled video:', {
          clipId: firstClip.id,
          sequenceTitle: sequence.title,
          newUrl: sequence.assembled_video_url?.substring(0, 60) + '...',
        });

        updateClip(firstClip.id, {
          assetUrl: sequence.assembled_video_url!,
          name: sequence.title || firstClip.name,
          duration: sequenceDuration || firstClip.duration,
          sourceEnd: sequenceDuration || firstClip.duration,
          sourceDuration: sequenceDuration || firstClip.duration,
        });

        // Remove other clips from this sequence (they're now merged into the assembled video)
        for (let i = 1; i < sortedClips.length; i++) {
          store.removeClip(sortedClips[i].id);
        }

        updatedCount++;
      }
    }

    return updatedCount;
  }, [sequences, plans]);

  // Check if sequences have assembled videos that aren't in the saved montage
  const countNewAssembledVideos = useCallback((savedClips: Record<string, { assetUrl?: string }>) => {
    const assembledUrls = sequences
      .filter(s => s.assembled_video_url)
      .map(s => s.assembled_video_url!);

    if (assembledUrls.length === 0) return 0;

    // Check if any assembled URL is NOT in the saved clips
    const savedUrls = Object.values(savedClips).map(c => c.assetUrl).filter(Boolean);
    const missingUrls = assembledUrls.filter(url => !savedUrls.includes(url));

    return missingUrls.length;
  }, [sequences]);

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

          const savedClips = data.montageData?.clips || {};
          const hasClips = Object.keys(savedClips).length > 0 || (Array.isArray(savedClips) && savedClips.length > 0);

          if (hasClips) {
            // Always import saved montage data first (preserves user's work)
            importFromJSON(data.montageData);
            hasImportedFromEditionRef.current = true;

            const storeState = useMontageStore.getState();
            console.log('[TimelineEditor] Imported saved data to store:', {
              clips: Object.keys(storeState.clips).length,
              tracks: storeState.tracks.length,
            });

            // Check if there are new assembled videos to update
            const newAssembledCount = countNewAssembledVideos(savedClips);
            if (newAssembledCount > 0) {
              console.log('[TimelineEditor] Found new assembled videos, updating clips in place...');
              // Use setTimeout to ensure the import is complete
              setTimeout(() => {
                const updated = updateClipsWithAssembledVideos();
                if (updated > 0) {
                  toast.success(`${updated} séquence(s) mise(s) à jour avec vidéo assemblée`);
                }
              }, 100);
            }
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
  }, [apiBase, importFromJSON, countNewAssembledVideos, updateClipsWithAssembledVideos]);

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
