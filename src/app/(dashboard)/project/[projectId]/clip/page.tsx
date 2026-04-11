'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PlanEditor, type VideoGenerationOptions, type PlanData } from '@/components/plan-editor';
import { type VideoGenerationProgress } from '@/components/shorts/VideoGenerationCard';
import { VideoEditorLayout } from '@/components/video-editor';
import { WaveformHeader } from '@/components/clip/WaveformHeader';
import { TimelineEditor } from '@/components/montage/TimelineEditor';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CinematicHeaderWizard, type PromptCharacterData } from '@/components/shorts/CinematicHeaderWizard';
import { useJobsStore } from '@/store/jobs-store';
import { useBibleStore } from '@/store/bible-store';
import { useProject } from '@/hooks/use-project';
import { formatDuration } from '@/components/shorts/DurationPicker';
import { GENERIC_CHARACTERS } from '@/lib/generic-characters';
import type { AspectRatio } from '@/types/database';
import type { CinematicHeaderConfig, Sequence, TransitionType } from '@/types/cinematic';
import type { Plan } from '@/store/shorts-store';
import type { GlobalAsset } from '@/types/database';
import {
  ArrowLeft,
  Loader2,
  Music,
  Sparkles,
  Pencil,
  Layers,
  Film,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// === AUDIO DATA ===
interface AudioData {
  fileUrl: string;
  duration?: number;
  title?: string;
  artist?: string;
  workAreaStart?: number;
  workAreaEnd?: number;
}

interface WorkArea {
  start: number;
  end: number;
}

// === MAIN COMPONENT ===
export default function ClipPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  // Jobs store for video generation tracking
  const { jobs, fetchJobs, startPolling, stopPolling } = useJobsStore();

  // Bible store for characters and locations
  const { projectAssets, projectGenericAssets, fetchProjectAssets, fetchProjectGenericAssets } = useBibleStore();

  // Project data
  const { project, isLoading: projectLoading, refetch: refetchProject } = useProject();
  const aspectRatio: AspectRatio = (project?.aspect_ratio as AspectRatio) || '16:9';

  // Audio state
  const [masterAudio, setMasterAudio] = useState<{
    id: string;
    name: string;
    data: AudioData;
  } | null>(null);
  const [signedAudioUrl, setSignedAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(true);

  // Sequences and plans
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // UI state
  const [viewMode, setViewMode] = useState<'edition' | 'montage'>('edition');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isPlanEditorOpen, setIsPlanEditorOpen] = useState(false);
  const [collapsedSequences, setCollapsedSequences] = useState<Set<string>>(new Set());
  const [generationProgress, setGenerationProgress] = useState<Map<string, VideoGenerationProgress>>(new Map());

  // Cinematic wizard state
  const [wizardSequenceId, setWizardSequenceId] = useState<string | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  // Work area state (from audio asset)
  const [workArea, setWorkArea] = useState<WorkArea | null>(null);
  const workAreaRef = useRef<WorkArea | null>(null);

  // Keep ref in sync with state to avoid stale closures
  useEffect(() => {
    workAreaRef.current = workArea;
  }, [workArea]);

  // === FETCH DATA ===

  // Fetch project assets (bible)
  useEffect(() => {
    fetchProjectAssets(projectId);
    fetchProjectGenericAssets(projectId);
  }, [projectId, fetchProjectAssets, fetchProjectGenericAssets]);

  // Fetch master audio
  useEffect(() => {
    const fetchMasterAudio = async () => {
      if (!projectId) return;

      setAudioLoading(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/assets`);
        if (!res.ok) throw new Error('Failed to fetch assets');

        const data = await res.json();
        const assets = data.assets || [];

        let masterAsset = assets.find(
          (a: { asset_type: string; data?: { is_master_audio?: boolean } }) =>
            a.asset_type === 'audio' && a.data?.is_master_audio
        );

        if (!masterAsset) {
          masterAsset = assets.find(
            (a: { asset_type: string }) => a.asset_type === 'audio'
          );
        }

        if (masterAsset) {
          const audioData = masterAsset.data as AudioData;
          setMasterAudio({
            id: masterAsset.id,
            name: masterAsset.name,
            data: audioData,
          });
          // Load work area if saved
          if (audioData.workAreaStart !== undefined && audioData.workAreaEnd !== undefined) {
            setWorkArea({
              start: audioData.workAreaStart,
              end: audioData.workAreaEnd,
            });
          }
        }
      } catch (error) {
        console.error('Error fetching master audio:', error);
      } finally {
        setAudioLoading(false);
      }
    };

    fetchMasterAudio();
  }, [projectId]);

  // Sign audio URL
  useEffect(() => {
    if (!masterAudio?.data?.fileUrl) {
      setSignedAudioUrl(null);
      return;
    }

    const fileUrl = masterAudio.data.fileUrl;

    if (fileUrl.startsWith('b2://')) {
      const signUrl = async () => {
        try {
          const res = await fetch('/api/storage/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: [fileUrl] }),
          });
          if (!res.ok) throw new Error('Failed to sign URL');
          const { signedUrls } = await res.json();
          const signedUrl = signedUrls[fileUrl];
          if (!signedUrl) throw new Error('No signed URL returned');
          setSignedAudioUrl(`/api/storage/proxy?url=${encodeURIComponent(signedUrl)}`);
        } catch (error) {
          console.error('[Clip] Error signing audio URL:', error);
          setSignedAudioUrl(null);
        }
      };
      signUrl();
    } else {
      setSignedAudioUrl(fileUrl);
    }
  }, [masterAudio?.data?.fileUrl]);

  // Fetch sequences and plans
  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingData(true);
      try {
        // Fetch sequences
        const seqRes = await fetch(`/api/projects/${projectId}/clip/sequences`);
        if (seqRes.ok) {
          const seqData = await seqRes.json();
          setSequences(seqData.sequences || []);

          // Fetch plans for each sequence
          const allPlans: Plan[] = [];
          for (const seq of seqData.sequences || []) {
            const plansRes = await fetch(`/api/projects/${projectId}/sequences/${seq.id}/shots`);
            if (plansRes.ok) {
              const plansData = await plansRes.json();
              const sequencePlans = (plansData.shots || []).map((shot: Record<string, unknown>, index: number) => ({
                ...shot,
                sequence_id: seq.id,
                short_id: '',
                shot_number: (shot.sort_order as number) + 1 || index + 1,
                segments: (shot.segments as unknown[]) || [],
                translations: (shot.translations as unknown[]) || [],
                video_rushes: shot.video_rushes ?? null,
              } as Plan));
              allPlans.push(...sequencePlans);
            }
          }
          setPlans(allPlans);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchData();
  }, [projectId]);

  // Start job polling
  useEffect(() => {
    fetchJobs();
    startPolling();
    return () => stopPolling();
  }, [fetchJobs, startPolling, stopPolling]);

  // Sync generation progress from jobs
  useEffect(() => {
    setGenerationProgress(prev => {
      const newMap = new Map(prev);

      for (const job of jobs) {
        if (job.job_type !== 'video' || job.asset_type !== 'shot') continue;
        if (!['pending', 'queued', 'running'].includes(job.status)) continue;

        const shotId = (job.input_data as { shotId?: string })?.shotId;
        if (!shotId) continue;
        if (!plans.find(p => p.id === shotId)) continue;

        newMap.set(shotId, {
          planId: shotId,
          progress: job.progress,
          step: job.status,
          message: job.message || 'En cours...',
          status: 'generating',
          startedAt: job.started_at || job.created_at,
        });
      }

      return newMap;
    });
  }, [jobs, plans]);

  // === COMPUTED ===

  // Calculate dynamic sequence positions based on work area and plan durations
  // Sequences are chained: first starts at workArea.start, each follows the previous
  const computedSequences = useMemo(() => {
    if (!workArea) {
      // No work area - use original positions
      return sequences;
    }

    let currentPosition = workArea.start;

    return sequences
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(seq => {
        // Calculate sequence duration from its plans
        const sequencePlans = plans.filter(p => p.sequence_id === seq.id);
        const sequenceDuration = sequencePlans.reduce((sum, p) => sum + (p.duration || 0), 0);

        // Use minimum duration of 5s if no plans
        const effectiveDuration = sequenceDuration > 0 ? sequenceDuration : 5;

        const start = currentPosition;
        const end = Math.min(currentPosition + effectiveDuration, workArea.end);

        currentPosition = end;

        return {
          ...seq,
          start_time: start,
          end_time: end,
        };
      });
  }, [sequences, plans, workArea]);

  const selectedPlan = useMemo(() => {
    return plans.find(p => p.id === selectedPlanId) || null;
  }, [plans, selectedPlanId]);

  const selectedSequence = useMemo(() => {
    if (!selectedPlan) return null;
    return computedSequences.find(s => s.id === selectedPlan.sequence_id) || null;
  }, [selectedPlan, computedSequences]);

  const previousPlan = useMemo(() => {
    if (!selectedPlan) return null;
    const sequencePlans = plans
      .filter(p => p.sequence_id === selectedPlan.sequence_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const currentIndex = sequencePlans.findIndex(p => p.id === selectedPlan.id);
    if (currentIndex <= 0) return null;
    return sequencePlans[currentIndex - 1];
  }, [selectedPlan, plans]);

  const totalDuration = useMemo(() => {
    return plans.reduce((acc, p) => acc + (p.duration || 0), 0);
  }, [plans]);

  // Characters for prompts
  const promptCharacters = useMemo((): PromptCharacterData[] => {
    const globalChars: PromptCharacterData[] = (projectAssets || [])
      .filter((a) => a.asset_type === 'character')
      .map((a) => ({
        id: a.id,
        name: a.name,
        referenceImages: a.reference_images || [],
        visualDescription: (a.data as { visual_description?: string })?.visual_description,
      }));

    const genericChars: PromptCharacterData[] = [];
    for (const pga of projectGenericAssets || []) {
      const genericChar = GENERIC_CHARACTERS.find(g => g.id === pga.id);
      if (!genericChar) continue;
      const localOverrides = (pga.local_overrides || {}) as {
        reference_images_metadata?: { url: string }[];
        visual_description?: string;
      };
      const referenceImages = (localOverrides.reference_images_metadata || []).map(img => img.url);
      genericChars.push({
        id: pga.id,
        name: pga.name_override || genericChar.name,
        referenceImages,
        visualDescription: localOverrides.visual_description || genericChar.description,
      });
    }

    return [...globalChars, ...genericChars];
  }, [projectAssets, projectGenericAssets]);

  // Locations for SegmentEditor
  const locations = useMemo(() => {
    return (projectAssets || []).filter(a => a.asset_type === 'location');
  }, [projectAssets]);

  // === HANDLERS ===

  const handleCreateSequence = useCallback(async () => {
    // Positions are computed dynamically based on work area and plan durations
    // We just create a new sequence - it will be placed after existing ones
    const currentWorkArea = workAreaRef.current;

    // Calculate where the new sequence would start (after existing sequences)
    let nextStart = currentWorkArea?.start ?? 0;
    const sortedSeqs = [...sequences].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    for (const seq of sortedSeqs) {
      const seqPlans = plans.filter(p => p.sequence_id === seq.id);
      const seqDuration = seqPlans.reduce((sum, p) => sum + (p.duration || 0), 0) || 5;
      nextStart += seqDuration;
    }

    // Check if there's room for a new sequence
    const maxEnd = currentWorkArea?.end ?? Infinity;
    if (nextStart >= maxEnd) {
      toast.error('Plus de place dans la zone de travail');
      return;
    }

    // Default duration for new sequence (will be adjusted when plans are added)
    const defaultDuration = Math.min(10, maxEnd - nextStart);

    console.log('[ClipPage] Creating sequence:', {
      nextStart,
      defaultDuration,
      currentWorkArea,
    });

    try {
      const res = await fetch(`/api/projects/${projectId}/clip/sequences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: nextStart,
          endTime: nextStart + defaultDuration,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const newSeq: Sequence = {
          ...data.sequence,
          project_id: projectId,
          scene_id: null,
          start_time: nextStart,
          end_time: nextStart + defaultDuration,
        };
        setSequences(prev => [...prev, newSeq].sort((a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0)
        ));
        toast.success('Séquence créée');
      }
    } catch (error) {
      console.error('Error creating sequence:', error);
      toast.error('Erreur lors de la création');
    }
  }, [projectId, sequences, plans]);

  const handleAddPlan = useCallback(async (sequenceId?: string | null) => {
    try {
      // If sequenceId is provided, add to that sequence
      // If null/undefined, add to Rush (unassigned)
      const targetSequenceId = sequenceId || null;

      let res;
      if (targetSequenceId) {
        // Add to specific sequence
        res = await fetch(`/api/projects/${projectId}/sequences/${targetSequenceId}/shots`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: '', duration: 5 }),
        });
      } else {
        // Add to Rush (unassigned) - use generic shots endpoint
        res = await fetch(`/api/projects/${projectId}/shots`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: '', duration: 5, sequence_id: null }),
        });
      }

      if (res.ok) {
        const data = await res.json();
        const newPlan: Plan = {
          ...data.shot,
          sequence_id: targetSequenceId,
          short_id: '',
          shot_number: data.shot.sort_order + 1,
          segments: data.shot.segments || [],
          translations: data.shot.translations || [],
          video_rushes: data.shot.video_rushes || null,
        };
        setPlans(prev => [...prev, newPlan]);
        setSelectedPlanId(newPlan.id);
        setIsPlanEditorOpen(true);
        toast.success('Plan ajouté');
      }
    } catch (error) {
      console.error('Error adding plan:', error);
      toast.error('Erreur lors de l\'ajout');
    }
  }, [projectId]);

  const handleSelectPlan = useCallback((planId: string) => {
    setSelectedPlanId(planId);
    setIsPlanEditorOpen(true);
  }, []);

  const handleDeletePlan = useCallback(async (planId: string) => {
    try {
      await fetch(`/api/projects/${projectId}/shots/${planId}`, {
        method: 'DELETE',
      });
      setPlans(prev => prev.filter(p => p.id !== planId));
      if (selectedPlanId === planId) {
        setSelectedPlanId(null);
        setIsPlanEditorOpen(false);
      }
      toast.success('Plan supprimé');
    } catch (error) {
      console.error('Error deleting plan:', error);
      toast.error('Erreur lors de la suppression');
    }
  }, [projectId, selectedPlanId]);

  const handleUpdatePlan = useCallback(async (planId: string, updates: Partial<Plan>) => {
    // Optimistic update
    setPlans(prev => prev.map(p => p.id === planId ? { ...p, ...updates } : p));

    try {
      await fetch(`/api/projects/${projectId}/shots/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch (error) {
      console.error('Error updating plan:', error);
    }
  }, [projectId]);

  const handleUpdateSequence = useCallback(async (sequenceId: string, updates: Partial<Sequence>) => {
    // Optimistic update
    setSequences(prev => prev.map(s => s.id === sequenceId ? { ...s, ...updates } : s));

    try {
      await fetch(`/api/projects/${projectId}/clip/sequences/${sequenceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch (error) {
      console.error('Error updating sequence:', error);
    }
  }, [projectId]);

  const handleDeleteSequence = useCallback(async (sequenceId: string) => {
    try {
      await fetch(`/api/projects/${projectId}/clip/sequences/${sequenceId}`, {
        method: 'DELETE',
      });
      setSequences(prev => prev.filter(s => s.id !== sequenceId));
      setPlans(prev => prev.filter(p => p.sequence_id !== sequenceId));
      toast.success('Séquence supprimée');
    } catch (error) {
      console.error('Error deleting sequence:', error);
      toast.error('Erreur lors de la suppression');
    }
  }, [projectId]);

  const handleToggleSequenceCollapse = useCallback((sequenceId: string) => {
    setCollapsedSequences(prev => {
      const next = new Set(prev);
      if (next.has(sequenceId)) {
        next.delete(sequenceId);
      } else {
        next.add(sequenceId);
      }
      return next;
    });
  }, []);

  const handleOpenCinematicWizard = useCallback((sequenceId: string) => {
    setWizardSequenceId(sequenceId);
    setIsWizardOpen(true);
  }, []);

  const handleReorderPlans = useCallback(async (sequenceId: string | null, orderedIds: string[]) => {
    if (!sequenceId) return;

    // Optimistic update
    setPlans(prev => {
      const updated = [...prev];
      orderedIds.forEach((id, index) => {
        const plan = updated.find(p => p.id === id);
        if (plan) {
          plan.sort_order = index;
        }
      });
      return updated;
    });

    try {
      await fetch(`/api/projects/${projectId}/sequences/${sequenceId}/shots/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      });
    } catch (error) {
      console.error('Error reordering plans:', error);
    }
  }, [projectId]);

  const handleMovePlanToSequence = useCallback(async (planId: string, targetSequenceId: string | null) => {
    // Optimistic update
    setPlans(prev => prev.map(p =>
      p.id === planId ? { ...p, sequence_id: targetSequenceId || '' } : p
    ));

    try {
      await fetch(`/api/projects/${projectId}/shots/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence_id: targetSequenceId }),
      });
    } catch (error) {
      console.error('Error moving plan:', error);
    }
  }, [projectId]);

  // Update work area and persist to audio asset
  const handleWorkAreaChange = useCallback(async (newWorkArea: WorkArea) => {
    if (!masterAudio) return;

    // Optimistic update
    setWorkArea(newWorkArea);

    try {
      await fetch(`/api/projects/${projectId}/assets`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: masterAudio.id,
          data: {
            workAreaStart: newWorkArea.start,
            workAreaEnd: newWorkArea.end,
          },
        }),
      });
    } catch (error) {
      console.error('Error saving work area:', error);
      toast.error('Erreur lors de la sauvegarde de la zone de travail');
    }
  }, [projectId, masterAudio]);

  const handleGenerateVideo = useCallback(async (
    planId: string,
    options: VideoGenerationOptions
  ) => {
    setGenerationProgress(prev => {
      const newMap = new Map(prev);
      newMap.set(planId, {
        planId,
        progress: 0,
        step: 'init',
        message: 'Initialisation...',
        status: 'generating',
        startedAt: Date.now(),
      });
      return newMap;
    });

    try {
      const plan = plans.find(p => p.id === planId);
      const sequence = plan ? sequences.find(s => s.id === plan.sequence_id) : null;

      const res = await fetch(`/api/projects/${projectId}/shots/${planId}/queue-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...options,
          duration: plan?.duration || 5,
          sequenceId: sequence?.id,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to queue video');
      }

      const data = await res.json();
      await fetchJobs();
      startPolling();

      toast.success('Génération vidéo ajoutée à la file d\'attente');

      setGenerationProgress(prev => {
        const newMap = new Map(prev);
        newMap.set(planId, {
          planId,
          progress: 5,
          step: 'queued',
          message: 'En file d\'attente...',
          status: 'generating',
          startedAt: Date.now(),
        });
        return newMap;
      });

    } catch (error) {
      console.error('Error queuing video:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur');
      setGenerationProgress(prev => {
        const newMap = new Map(prev);
        newMap.delete(planId);
        return newMap;
      });
    }
  }, [projectId, plans, sequences, fetchJobs, startPolling]);

  // Listen for job completions
  useEffect(() => {
    const handleJobCompleted = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        assetType: string;
        jobType: string;
        shotId?: string;
      }>;
      const { assetType, jobType, shotId } = customEvent.detail;

      if (assetType === 'shot' && jobType === 'video' && shotId) {
        // Refetch the plan to get updated video URL
        const plan = plans.find(p => p.id === shotId);
        if (plan?.sequence_id) {
          const res = await fetch(`/api/projects/${projectId}/sequences/${plan.sequence_id}/shots`);
          if (res.ok) {
            const data = await res.json();
            const updatedPlans = (data.shots || []).map((shot: Record<string, unknown>, index: number) => ({
              ...shot,
              sequence_id: plan.sequence_id,
              short_id: '',
              shot_number: (shot.sort_order as number) + 1 || index + 1,
              segments: (shot.segments as unknown[]) || [],
              translations: (shot.translations as unknown[]) || [],
              video_rushes: shot.video_rushes ?? null,
            } as Plan));

            setPlans(prev => {
              const otherPlans = prev.filter(p => p.sequence_id !== plan.sequence_id);
              return [...otherPlans, ...updatedPlans];
            });
          }
        }

        setGenerationProgress(prev => {
          const newMap = new Map(prev);
          newMap.delete(shotId);
          return newMap;
        });
      }
    };

    window.addEventListener('job-completed', handleJobCompleted);
    return () => window.removeEventListener('job-completed', handleJobCompleted);
  }, [plans, projectId]);

  // Listen for job failures
  useEffect(() => {
    const handleJobFailed = (event: Event) => {
      const customEvent = event as CustomEvent<{
        assetType: string;
        jobType: string;
        shotId?: string;
        error?: string;
      }>;
      const { assetType, jobType, shotId, error } = customEvent.detail;

      if (assetType === 'shot' && jobType === 'video' && shotId) {
        // Clear generation progress for this plan
        setGenerationProgress(prev => {
          const newMap = new Map(prev);
          newMap.delete(shotId);
          return newMap;
        });

        // Show error toast
        toast.error(error || 'Échec de la génération vidéo');
      }
    };

    window.addEventListener('job-failed', handleJobFailed);
    return () => window.removeEventListener('job-failed', handleJobFailed);
  }, []);

  // Listen for timeline render completions to refresh project data
  useEffect(() => {
    const handleTimelineRenderComplete = (event: Event) => {
      const customEvent = event as CustomEvent<{
        assetType: string;
        jobType: string;
        jobSubtype?: string;
      }>;
      const { assetType, jobSubtype } = customEvent.detail;

      // Refetch project to get the new rendered_video_url
      if (assetType === 'project' && jobSubtype === 'timeline-render') {
        refetchProject();
      }
    };

    window.addEventListener('job-completed', handleTimelineRenderComplete);
    return () => window.removeEventListener('job-completed', handleTimelineRenderComplete);
  }, [refetchProject]);

  // === RENDER ===

  if (projectLoading || audioLoading || isLoadingData) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!masterAudio) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center p-6">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
          <Music className="w-8 h-8 text-blue-400" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">
          Aucune musique attachée
        </h3>
        <p className="text-slate-400 max-w-md mb-4">
          Ce projet n&apos;a pas encore de musique principale. Attachez un fichier audio
          depuis la Bible pour commencer.
        </p>
        <Button
          variant="outline"
          onClick={() => router.push(`/project/${projectId}/bible`)}
          className="border-blue-500/30 text-blue-300 hover:bg-blue-500/10"
        >
          Aller à la Bible
        </Button>
      </div>
    );
  }

  // Header content with waveform
  const headerContent = (
    <div className="flex-shrink-0 border-b border-white/10">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/project/${projectId}`)}
            className="text-slate-400 hover:text-white h-8 w-8"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-blue-400" />
            <h1 className="text-base font-medium text-white">
              {masterAudio.data.title || masterAudio.name}
            </h1>
            {masterAudio.data.artist && (
              <span className="text-sm text-slate-500">- {masterAudio.data.artist}</span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{plans.length} plans</span>
            <span>•</span>
            <span>{formatDuration(totalDuration)}</span>
            <span>•</span>
            <span>{aspectRatio}</span>
          </div>
        </div>

        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'edition' | 'montage')}>
          <TabsList className="bg-white/5 border border-white/10 h-8">
            <TabsTrigger
              value="edition"
              className="text-xs data-[state=active]:bg-blue-600 data-[state=active]:text-white"
            >
              <Pencil className="w-3 h-3 mr-1.5" />
              Édition
            </TabsTrigger>
            <TabsTrigger
              value="montage"
              className="text-xs data-[state=active]:bg-blue-600 data-[state=active]:text-white"
            >
              <Layers className="w-3 h-3 mr-1.5" />
              Montage
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Waveform */}
      {signedAudioUrl && (
        <WaveformHeader
          audioUrl={signedAudioUrl}
          sequences={computedSequences.map(s => ({
            id: s.id,
            title: s.title,
            start_time: s.start_time ?? null,
            end_time: s.end_time ?? null,
          }))}
          onSequenceSelect={(seq) => {
            if (!seq) return;
            // Expand the sequence
            setCollapsedSequences(prev => {
              const next = new Set(prev);
              next.delete(seq.id);
              return next;
            });
          }}
          onCreateSequence={() => handleCreateSequence()}
          workArea={workArea}
          onWorkAreaChange={handleWorkAreaChange}
        />
      )}
    </div>
  );

  return (
    <>
      {viewMode === 'edition' ? (
        <VideoEditorLayout
          sequences={computedSequences}
          plans={plans}
          aspectRatio={aspectRatio}
          projectId={projectId}
          entityId={projectId}
          entityType="clip"
          selectedPlanId={selectedPlanId}
          collapsedSequences={collapsedSequences}
          generationProgress={generationProgress}
          headerContent={headerContent}
          onCreateSequence={() => handleCreateSequence()}
          onAddPlan={handleAddPlan}
          onSelectPlan={handleSelectPlan}
          onDeletePlan={handleDeletePlan}
          onUpdateSequence={handleUpdateSequence}
          onDeleteSequence={handleDeleteSequence}
          onToggleSequenceCollapse={handleToggleSequenceCollapse}
          onOpenCinematicWizard={handleOpenCinematicWizard}
          onReorderPlans={handleReorderPlans}
          onMovePlanToSequence={handleMovePlanToSequence}
        />
      ) : (
        <div className="flex flex-col h-full">
          {/* Header for montage mode */}
          <div className="flex-shrink-0 border-b border-white/10">
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.push(`/project/${projectId}`)}
                  className="text-slate-400 hover:text-white h-8 w-8"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>

                <div className="flex items-center gap-2">
                  <Music className="w-4 h-4 text-blue-400" />
                  <h1 className="text-base font-medium text-white">
                    {masterAudio.data.title || masterAudio.name}
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Link to Production when rendered video exists */}
                {(project as { rendered_video_url?: string })?.rendered_video_url && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/project/${projectId}/production`)}
                    className="h-8 border-green-500/30 text-green-400 hover:bg-green-500/10"
                  >
                    <Film className="w-3.5 h-3.5 mr-1.5" />
                    Voir le rendu
                  </Button>
                )}

                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'edition' | 'montage')}>
                  <TabsList className="bg-white/5 border border-white/10 h-8">
                    <TabsTrigger
                      value="edition"
                      className="text-xs data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                    >
                      <Pencil className="w-3 h-3 mr-1.5" />
                      Édition
                    </TabsTrigger>
                    <TabsTrigger
                      value="montage"
                      className="text-xs data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                    >
                      <Layers className="w-3 h-3 mr-1.5" />
                      Montage
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </div>

          {/* Timeline Editor */}
          <TimelineEditor
            key={`montage-${projectId}`}
            projectId={projectId}
            aspectRatio={aspectRatio}
            className="flex-1"
            sequences={computedSequences.map(s => ({
              id: s.id,
              title: s.title,
              start_time: s.start_time,
              end_time: s.end_time,
              assembled_video_url: s.assembled_video_url,
            }))}
            plans={plans.map(p => ({
              id: p.id,
              sequence_id: p.sequence_id,
              sort_order: p.sort_order,
              duration: p.duration,
              generated_video_url: p.generated_video_url,
              storyboard_image_url: p.storyboard_image_url,
              description: p.description,
            }))}
          />
        </div>
      )}

      {/* Plan Editor Dialog */}
      {selectedPlan && (
        <PlanEditor
          open={isPlanEditorOpen}
          onOpenChange={(open) => {
            setIsPlanEditorOpen(open);
            if (!open) setSelectedPlanId(null);
          }}
          mode="video-free"
          projectId={projectId}
          plan={selectedPlan as unknown as PlanData}
          previousPlan={previousPlan ? {
            id: previousPlan.id,
            duration: previousPlan.duration,
            storyboard_image_url: previousPlan.storyboard_image_url,
            first_frame_url: previousPlan.first_frame_url,
            last_frame_url: previousPlan.last_frame_url,
            generated_video_url: previousPlan.generated_video_url,
          } : undefined}
          aspectRatio={aspectRatio}
          sequenceCinematicHeader={selectedSequence?.cinematic_header || null}
          sequenceTitle={selectedSequence?.title || undefined}
          locations={locations}
          sequencePlans={plans
            .filter(p => p.sequence_id === selectedPlan.sequence_id)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(p => ({
              id: p.id,
              number: p.shot_number,
              generated_video_url: p.generated_video_url,
              storyboard_image_url: p.storyboard_image_url,
              first_frame_url: p.first_frame_url,
              last_frame_url: p.last_frame_url,
            }))}
          onUpdate={(updates) => handleUpdatePlan(selectedPlan.id, updates as Partial<Plan>)}
          onGenerateVideo={handleGenerateVideo}
          isGeneratingVideo={generationProgress.has(selectedPlan.id) && generationProgress.get(selectedPlan.id)?.status === 'generating'}
          videoGenerationProgress={generationProgress.get(selectedPlan.id) || null}
        />
      )}

      {/* Cinematic Header Wizard Dialog */}
      {wizardSequenceId && (
        <CinematicHeaderWizard
          open={isWizardOpen}
          onOpenChange={(open) => {
            setIsWizardOpen(open);
            if (!open) setWizardSequenceId(null);
          }}
          value={computedSequences.find((s) => s.id === wizardSequenceId)?.cinematic_header || null}
          onChange={(config: CinematicHeaderConfig) => {
            handleUpdateSequence(wizardSequenceId, { cinematic_header: config });
            setIsWizardOpen(false);
            setWizardSequenceId(null);
            toast.success('Style sauvegardé');
          }}
          projectId={projectId}
          characters={promptCharacters}
          locations={locations}
        />
      )}
    </>
  );
}
