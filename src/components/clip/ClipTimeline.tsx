'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Plus,
  Trash2,
  Music,
  Loader2,
  Volume2,
  VolumeX,
  Clock,
  Film,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Clapperboard,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MusicSection, MusicSectionType, AspectRatio, TransitionType } from '@/types/database';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { toast } from 'sonner';
import { StorageImg, StorageMedia } from '@/components/ui/storage-image';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.js';
import { PlanEditor, type PlanData, type VideoGenerationOptions, type VideoGenerationProgress } from '@/components/plan-editor';
import type { ShotType, CameraAngle, CameraMovement } from '@/types/database';
import { useJobsStore } from '@/store/jobs-store';

interface Shot {
  id: string;
  section_id: string;
  relative_start: number;
  duration: number;
  description?: string;
  storyboard_image_url?: string;
  first_frame_url?: string;
  last_frame_url?: string;
  animation_prompt?: string;
  generated_video_url?: string;
  generation_status?: string;
  shot_type?: ShotType;
  camera_angle?: CameraAngle;
  camera_movement?: CameraMovement;
  // Prompt fields for traceability
  storyboard_prompt?: string;
  first_frame_prompt?: string;
  last_frame_prompt?: string;
  video_prompt?: string;
  // Dialogue fields
  has_dialogue?: boolean;
  dialogue_text?: string;
  dialogue_character_id?: string;
  dialogue_audio_url?: string;
  // Audio fields
  audio_mode?: string;
  audio_asset_id?: string;
  audio_start?: number;
  audio_end?: number;
  // Transition fields
  transition_type?: TransitionType;
  transition_duration?: number;
}

// Shot duration constraints (matching AI video generators like Kling, Runway, etc.)
const MIN_SHOT_DURATION = 3; // Minimum 3 seconds
const MAX_SHOT_DURATION = 15; // Maximum 15 seconds

interface ClipTimelineProps {
  projectId: string;
  audioUrl: string;
  audioDuration?: number;
  sections: MusicSection[];
  onSectionsChange: (sections: MusicSection[]) => void;
  onSectionSelect?: (section: MusicSection | null) => void;
  selectedSectionId?: string | null;
  aspectRatio?: AspectRatio;
  className?: string;
}

const SECTION_TYPES: { value: MusicSectionType; label: string; color: string }[] = [
  { value: 'intro', label: 'Intro', color: '#6366f1' },
  { value: 'verse', label: 'Couplet', color: '#8b5cf6' },
  { value: 'chorus', label: 'Refrain', color: '#ec4899' },
  { value: 'bridge', label: 'Pont', color: '#f59e0b' },
  { value: 'outro', label: 'Outro', color: '#6366f1' },
  { value: 'instrumental', label: 'Instrumental', color: '#10b981' },
  { value: 'custom', label: 'Autre', color: '#64748b' },
];

export function ClipTimeline({
  projectId,
  audioUrl,
  audioDuration,
  sections,
  onSectionsChange,
  onSectionSelect,
  selectedSectionId,
  aspectRatio = '16:9',
  className,
}: ClipTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
  const isResizingSectionRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(audioDuration || 0);
  const [isLoading, setIsLoading] = useState(true);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // New section dialog
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [isSelectionComplete, setIsSelectionComplete] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionType, setNewSectionType] = useState<MusicSectionType>('verse');
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);

  // Section resize state
  const [resizingSection, setResizingSection] = useState<{
    sectionId: string;
    edge: 'left' | 'right';
    initialX: number;
    initialStart: number;
    initialEnd: number;
  } | null>(null);

  // Calculate minimum start time for new section (end of last section)
  const minNewSectionStart = useMemo(() => {
    if (sections.length === 0) return 0;
    const sortedSections = [...sections].sort((a, b) => a.end_time - b.end_time);
    return sortedSections[sortedSections.length - 1].end_time;
  }, [sections]);

  // Shots per section
  const [sectionShots, setSectionShots] = useState<Record<string, Shot[]>>({});
  const [loadingShots, setLoadingShots] = useState<Record<string, boolean>>({});
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Shot resize state
  const [resizingShot, setResizingShot] = useState<{
    sectionId: string;
    shotId: string;
    edge: 'left' | 'right';
    initialX: number;
    initialStart: number;
    initialDuration: number;
    sectionDuration: number;
  } | null>(null);

  // Shot editor modal state
  const [editingShot, setEditingShot] = useState<{
    shot: Shot;
    sectionId: string;
    shotIndex: number;
  } | null>(null);

  // Video generation state
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<Map<string, VideoGenerationProgress>>(new Map());

  // Assembly state
  const [assemblingSection, setAssemblingSection] = useState<string | null>(null);
  const [assembledVideos, setAssembledVideos] = useState<Record<string, { url: string; signedUrl: string; duration: number }>>({});
  const [playingAssembledVideo, setPlayingAssembledVideo] = useState<{ sectionId: string; signedUrl: string } | null>(null);

  // Transition editing state
  const [editingTransition, setEditingTransition] = useState<{
    sectionId: string;
    shotId: string;  // The shot BEFORE the transition
    shotIndex: number;
  } | null>(null);

  // Transition drag state
  const [draggingTransition, setDraggingTransition] = useState<{
    sectionId: string;
    shotId: string;
    handle: 'left' | 'right';
    initialX: number;
    initialDuration: number;
    sectionDuration: number;
    trackWidth: number;
  } | null>(null);

  // Format time helper
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Fetch shots for a section (with force option to bypass cache)
  const fetchSectionShots = useCallback(async (sectionId: string, section: MusicSection, force = false) => {
    if (!force && (loadingShots[sectionId] || sectionShots[sectionId])) return;

    setLoadingShots(prev => ({ ...prev, [sectionId]: true }));

    try {
      const res = await fetch(`/api/projects/${projectId}/sections/${sectionId}/shots`);
      if (res.ok) {
        const data = await res.json();
        const sectionDuration = section.end_time - section.start_time;

        // Calculate duration for each shot based on next shot's start or section end
        const shots = (data.shots || []).map((shot: Shot, index: number, arr: Shot[]) => {
          const nextShot = arr[index + 1];
          const duration = nextShot
            ? nextShot.relative_start - shot.relative_start
            : sectionDuration - shot.relative_start;
          return { ...shot, duration: Math.min(duration, MAX_SHOT_DURATION) };
        });

        setSectionShots(prev => ({ ...prev, [sectionId]: shots }));
      }
    } catch (error) {
      console.error('Error fetching shots:', error);
    } finally {
      setLoadingShots(prev => ({ ...prev, [sectionId]: false }));
    }
  }, [projectId, loadingShots, sectionShots]);

  // Refresh a single shot after video generation completes
  const refreshShot = useCallback(async (shotId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/shots/${shotId}`);
      if (res.ok) {
        const updatedShot = await res.json();
        console.log('[ClipTimeline] Refreshed shot:', shotId, 'video_url:', updatedShot.generated_video_url);

        // Update the shot in sectionShots
        setSectionShots(prev => {
          const newState = { ...prev };
          for (const sectionId of Object.keys(newState)) {
            const shots = newState[sectionId];
            const shotIndex = shots.findIndex(s => s.id === shotId);
            if (shotIndex !== -1) {
              newState[sectionId] = shots.map((s, i) =>
                i === shotIndex ? { ...s, ...updatedShot } : s
              );
              break;
            }
          }
          return newState;
        });

        // Also update editingShot if we're editing this shot
        setEditingShot(prev => {
          if (prev && prev.shot.id === shotId) {
            return { ...prev, shot: { ...prev.shot, ...updatedShot } };
          }
          return prev;
        });
      }
    } catch (error) {
      console.error('[ClipTimeline] Error refreshing shot:', error);
    }
  }, [projectId]);

  // Open shot editor with fresh data
  const openShotEditor = useCallback(async (shot: Shot, sectionId: string, shotIndex: number) => {
    try {
      // Fetch fresh shot data to avoid showing stale video
      console.log('[ClipTimeline] Opening shot editor, fetching fresh data for:', shot.id);
      console.log('[ClipTimeline] Cached video URL:', shot.generated_video_url);
      console.log('[ClipTimeline] Local duration:', shot.duration);

      const res = await fetch(`/api/projects/${projectId}/shots/${shot.id}`);
      if (res.ok) {
        const freshShot = await res.json();
        console.log('[ClipTimeline] Fresh video URL:', freshShot.generated_video_url);
        console.log('[ClipTimeline] Fresh duration from DB:', freshShot.duration);
        // IMPORTANT: Preserve local duration (calculated from relative_start) over DB duration
        // DB duration might be stale if shots were resized before this fix
        setEditingShot({
          shot: { ...shot, ...freshShot, duration: shot.duration },
          sectionId,
          shotIndex,
        });
      } else {
        console.warn('[ClipTimeline] Failed to fetch fresh shot data, status:', res.status);
        // Fallback to cached data if fetch fails
        setEditingShot({ shot, sectionId, shotIndex });
      }
    } catch (error) {
      console.error('[ClipTimeline] Error fetching fresh shot data:', error);
      // Fallback to cached data
      setEditingShot({ shot, sectionId, shotIndex });
    }
  }, [projectId]);

  // Listen for job-completed events to refresh shot data
  useEffect(() => {
    const handleJobCompleted = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      console.log('[ClipTimeline] Job completed event:', detail);

      // Refresh the shot if this is a video job
      if (detail.jobType === 'video' && detail.shotId) {
        console.log('[ClipTimeline] Refreshing shot after video generation:', detail.shotId);
        refreshShot(detail.shotId);

        // Update generation progress to completed
        setGenerationProgress(prev => {
          const newMap = new Map(prev);
          newMap.set(detail.shotId, {
            planId: detail.shotId,
            progress: 100,
            step: 'completed',
            message: 'Terminé!',
            status: 'completed',
          });
          return newMap;
        });
      }
    };

    window.addEventListener('job-completed', handleJobCompleted);
    return () => window.removeEventListener('job-completed', handleJobCompleted);
  }, [refreshShot]);

  // Listen for job-failed events to show toast
  useEffect(() => {
    const handleJobFailed = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      console.log('[ClipTimeline] Job failed event:', detail);

      // Show error toast
      toast.error(`Échec: ${detail.assetName || 'Génération'}`, {
        description: detail.errorMessage || 'Une erreur est survenue',
        duration: 8000,
      });

      // Update generation progress to failed
      if (detail.jobType === 'video' && detail.shotId) {
        setGenerationProgress(prev => {
          const newMap = new Map(prev);
          newMap.set(detail.shotId, {
            planId: detail.shotId,
            progress: 0,
            step: 'failed',
            message: detail.errorMessage || 'Échec',
            status: 'failed',
          });
          return newMap;
        });
      }
    };

    window.addEventListener('job-failed', handleJobFailed);
    return () => window.removeEventListener('job-failed', handleJobFailed);
  }, []);

  // Subscribe to jobs store to update generation progress from polling
  useEffect(() => {
    const unsubscribe = useJobsStore.subscribe((state) => {
      const jobs = state.jobs;

      // Find video jobs and update progress
      setGenerationProgress(prev => {
        const newMap = new Map(prev);
        let hasChanges = false;

        for (const job of jobs) {
          if (job.job_type === 'video' && job.asset_type === 'shot') {
            const shotId = (job.input_data as { shotId?: string })?.shotId;
            if (!shotId) continue;

            const currentProgress = prev.get(shotId);
            const newProgress = {
              planId: shotId,
              progress: job.progress || 0,
              step: job.status,
              message: job.message || getStatusMessage(job.status),
              status: job.status === 'completed' ? 'completed' as const :
                      job.status === 'failed' ? 'failed' as const : 'generating' as const,
            };

            // Only update if something changed
            if (!currentProgress ||
                currentProgress.progress !== newProgress.progress ||
                currentProgress.step !== newProgress.step) {
              newMap.set(shotId, newProgress);
              hasChanges = true;
            }
          }
        }

        return hasChanges ? newMap : prev;
      });
    });

    return () => unsubscribe();
  }, []);

  // Helper for status messages
  const getStatusMessage = (status: string) => {
    switch (status) {
      case 'pending': return 'En attente...';
      case 'queued': return 'Dans la file d\'attente...';
      case 'running': return 'Génération en cours...';
      case 'completed': return 'Terminé!';
      case 'failed': return 'Erreur';
      default: return status;
    }
  };

  // Toggle section expansion
  const toggleSectionExpand = useCallback((sectionId: string, section: MusicSection) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
        // Fetch shots when expanding
        fetchSectionShots(sectionId, section);
      }
      return next;
    });
  }, [fetchSectionShots]);

  // Create a new shot in a section
  const createShot = useCallback(async (sectionId: string, section: MusicSection, relativeStart: number) => {
    const sectionDuration = section.end_time - section.start_time;
    const existingShots = (sectionShots[sectionId] || []).sort((a, b) => a.relative_start - b.relative_start);

    // Helper to create shot via API
    const createShotAPI = async (start: number, duration: number, name: string) => {
      const res = await fetch(`/api/projects/${projectId}/sections/${sectionId}/shots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relative_start: start,
          duration: duration,
          description: name,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Erreur');
      }
      return res.json();
    };

    // Check if clicked on an existing shot - if so, do nothing
    const clickedShot = existingShots.find(
      s => relativeStart >= s.relative_start && relativeStart < s.relative_start + s.duration
    );
    if (clickedShot) {
      return; // Don't split, just ignore click on existing shot
    }

    // Clicked in empty space → find the gap and create a shot there
    // Find gap boundaries
    let gapStart = 0;
    let gapEnd = sectionDuration;

    // Find which gap we clicked in
    for (let i = 0; i <= existingShots.length; i++) {
      const prevEnd = i === 0 ? 0 : existingShots[i - 1].relative_start + existingShots[i - 1].duration;
      const nextStart = i === existingShots.length ? sectionDuration : existingShots[i].relative_start;

      if (relativeStart >= prevEnd && relativeStart < nextStart) {
        gapStart = prevEnd;
        gapEnd = nextStart;
        break;
      }
    }

    const gapDuration = gapEnd - gapStart;

    if (gapDuration < MIN_SHOT_DURATION) {
      return; // Space too small, silently ignore
    }

    // Create shot: fill the gap up to MAX_SHOT_DURATION
    const shotDuration = Math.min(gapDuration, MAX_SHOT_DURATION);

    try {
      const { shot } = await createShotAPI(gapStart, shotDuration, `Plan ${existingShots.length + 1}`);
      const newShots = [...existingShots, { ...shot, duration: shotDuration }]
        .sort((a, b) => a.relative_start - b.relative_start);
      setSectionShots(prev => ({ ...prev, [sectionId]: newShots }));
      toast.success('Plan créé');
    } catch (error) {
      console.error('Error creating shot:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur');
    }
  }, [projectId, sectionShots]);

  // Delete a shot (snapped mode: expand adjacent shot to fill gap)
  const deleteShotFromSection = useCallback(async (sectionId: string, shotId: string, section: MusicSection) => {
    const sectionDuration = section.end_time - section.start_time;
    const existingShots = [...(sectionShots[sectionId] || [])].sort((a, b) => a.relative_start - b.relative_start);
    const shotIndex = existingShots.findIndex(s => s.id === shotId);

    if (shotIndex === -1) return;

    const deletedShot = existingShots[shotIndex];
    const prevShot = existingShots[shotIndex - 1];
    const nextShot = existingShots[shotIndex + 1];

    try {
      const res = await fetch(`/api/projects/${projectId}/sections/${sectionId}/shots/${shotId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        // Remove the deleted shot
        let newShots = existingShots.filter(s => s.id !== shotId);

        // Expand adjacent shot to fill the gap
        if (prevShot) {
          // Extend previous shot to cover the deleted shot's space
          const newPrevDuration = prevShot.duration + deletedShot.duration;
          newShots = newShots.map(s =>
            s.id === prevShot.id ? { ...s, duration: newPrevDuration } : s
          );
        } else if (nextShot) {
          // Extend next shot backwards to cover the deleted shot's space
          const newNextStart = deletedShot.relative_start;
          const newNextDuration = nextShot.duration + deletedShot.duration;
          newShots = newShots.map(s =>
            s.id === nextShot.id
              ? { ...s, relative_start: newNextStart, duration: newNextDuration }
              : s
          );

          // Update next shot on server
          await fetch(`/api/projects/${projectId}/sections/${sectionId}/shots/${nextShot.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ relative_start: newNextStart }),
          });
        }

        setSectionShots(prev => ({ ...prev, [sectionId]: newShots }));
        toast.success('Plan supprimé');
      }
    } catch (error) {
      console.error('Error deleting shot:', error);
      toast.error('Erreur lors de la suppression');
    }
  }, [projectId, sectionShots]);

  // Update shot transition
  const updateShotTransition = useCallback(async (
    sectionId: string,
    shotId: string,
    transitionType: TransitionType,
    transitionDuration: number
  ) => {
    // Update local state immediately
    setSectionShots(prev => ({
      ...prev,
      [sectionId]: (prev[sectionId] || []).map(s =>
        s.id === shotId
          ? { ...s, transition_type: transitionType, transition_duration: transitionDuration }
          : s
      ),
    }));

    // Save to server
    try {
      const res = await fetch(`/api/projects/${projectId}/sections/${sectionId}/shots/${shotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transition_type: transitionType,
          transition_duration: transitionDuration,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        console.error('Error updating transition:', error);
        toast.error('Erreur lors de la mise à jour de la transition');
      } else {
        console.log('[Transition] Saved:', { transitionType, transitionDuration });
      }
    } catch (error) {
      console.error('Error updating transition:', error);
      toast.error('Erreur lors de la mise à jour de la transition');
    }
  }, [projectId]);

  // Assemble section video
  const assembleSection = useCallback(async (sectionId: string) => {
    setAssemblingSection(sectionId);

    try {
      // Extract original B2 URL from proxy URL if needed
      let originalAudioUrl = audioUrl;
      if (audioUrl.startsWith('/api/storage/proxy?url=')) {
        const urlParam = new URLSearchParams(audioUrl.split('?')[1]).get('url');
        if (urlParam) {
          originalAudioUrl = urlParam;
        }
      }

      const res = await fetch(`/api/projects/${projectId}/sections/${sectionId}/assemble`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl: originalAudioUrl }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Erreur lors du montage');
      }

      const data = await res.json();
      setAssembledVideos(prev => ({
        ...prev,
        [sectionId]: {
          url: data.assembledVideoUrl,
          signedUrl: data.signedUrl,
          duration: data.duration,
        },
      }));

      toast.success('Montage terminé !', {
        description: `Durée: ${data.duration.toFixed(1)}s`,
      });
    } catch (error) {
      console.error('Error assembling section:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors du montage');
    } finally {
      setAssemblingSection(null);
    }
  }, [projectId, audioUrl]);

  // Check if section can be assembled (all shots have videos)
  const canAssembleSection = useCallback((sectionId: string) => {
    const shots = sectionShots[sectionId] || [];
    if (shots.length === 0) return false;
    return shots.every(s => s.generated_video_url);
  }, [sectionShots]);

  // Start dragging a transition handle
  const startTransitionDrag = useCallback((
    e: React.PointerEvent,
    sectionId: string,
    shotId: string,
    handle: 'left' | 'right',
    currentDuration: number,
    sectionDuration: number,
    trackElement: HTMLElement
  ) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    setDraggingTransition({
      sectionId,
      shotId,
      handle,
      initialX: e.clientX,
      initialDuration: currentDuration,
      sectionDuration,
      trackWidth: trackElement.getBoundingClientRect().width,
    });
  }, []);

  // Handle transition drag move
  useEffect(() => {
    if (!draggingTransition) return;

    const handleMove = (e: PointerEvent) => {
      const deltaX = e.clientX - draggingTransition.initialX;
      // Convert pixel delta to duration delta
      const durationDelta = (Math.abs(deltaX) / draggingTransition.trackWidth) * draggingTransition.sectionDuration;

      // Calculate new duration based on drag direction
      let newDuration: number;
      if (draggingTransition.handle === 'left') {
        // Dragging left handle: left = expand, right = contract
        newDuration = draggingTransition.initialDuration + (deltaX < 0 ? durationDelta : -durationDelta);
      } else {
        // Dragging right handle: right = expand, left = contract
        newDuration = draggingTransition.initialDuration + (deltaX > 0 ? durationDelta : -durationDelta);
      }

      // Best practice: transitions should be 0.3s to 2s max
      // Below 0.2s threshold = delete transition (back to cut)
      const DELETE_THRESHOLD = 0.2;
      const MIN_TRANSITION = 0.3;
      const MAX_TRANSITION = 2.0;

      // Check if user is collapsing the transition completely
      const shouldDelete = newDuration < DELETE_THRESHOLD;

      if (shouldDelete) {
        // Reset to cut (no transition)
        setSectionShots(prev => ({
          ...prev,
          [draggingTransition.sectionId]: (prev[draggingTransition.sectionId] || []).map(s =>
            s.id === draggingTransition.shotId
              ? { ...s, transition_duration: 0, transition_type: 'cut' as TransitionType }
              : s
          ),
        }));
      } else {
        // Clamp and round
        newDuration = Math.max(MIN_TRANSITION, Math.min(MAX_TRANSITION, newDuration));
        newDuration = Math.round(newDuration * 10) / 10;

        // Update local state immediately
        setSectionShots(prev => ({
          ...prev,
          [draggingTransition.sectionId]: (prev[draggingTransition.sectionId] || []).map(s =>
            s.id === draggingTransition.shotId
              ? {
                  ...s,
                  transition_duration: newDuration,
                  // Set a default transition type if none exists
                  transition_type: s.transition_type === 'cut' || !s.transition_type ? 'dissolve' : s.transition_type,
                }
              : s
          ),
        }));
      }
    };

    const handleUp = async () => {
      if (!draggingTransition) return;

      // Get the final state from local state
      const shots = sectionShots[draggingTransition.sectionId] || [];
      const shot = shots.find(s => s.id === draggingTransition.shotId);
      if (shot) {
        // Save to server
        try {
          await fetch(`/api/projects/${projectId}/sections/${draggingTransition.sectionId}/shots/${draggingTransition.shotId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transition_type: shot.transition_type || 'cut',
              transition_duration: shot.transition_duration || 0,
            }),
          });
        } catch (error) {
          console.error('Error saving transition:', error);
        }
      }

      setDraggingTransition(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [draggingTransition, projectId, sectionShots]);

  // Start resizing a shot
  const startResize = useCallback((
    e: React.PointerEvent,
    sectionId: string,
    shot: Shot,
    edge: 'left' | 'right',
    sectionDuration: number
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setResizingShot({
      sectionId,
      shotId: shot.id,
      edge,
      initialX: e.clientX,
      initialStart: shot.relative_start,
      initialDuration: shot.duration,
      sectionDuration,
    });
  }, []);

  // Handle resize mouse move (snapped mode - push/pull neighbors)
  useEffect(() => {
    if (!resizingShot) return;

    const handleMouseMove = (e: PointerEvent) => {
      // Cancel if no button is pressed (mouse was released outside)
      if (e.buttons === 0) {
        setResizingShot(null);
        return;
      }

      const filmstrip = document.querySelector(`[data-filmstrip="${resizingShot.sectionId}"]`);
      if (!filmstrip) {
        setResizingShot(null);
        return;
      }

      const rect = filmstrip.getBoundingClientRect();

      // Cancel resize if pointer is too far from filmstrip (with some vertical tolerance)
      const verticalTolerance = 50;
      if (
        e.clientY < rect.top - verticalTolerance ||
        e.clientY > rect.bottom + verticalTolerance
      ) {
        setResizingShot(null);
        return;
      }

      const deltaX = e.clientX - resizingShot.initialX;
      const deltaPercent = deltaX / rect.width;
      const deltaTime = deltaPercent * resizingShot.sectionDuration;

      const shots = [...(sectionShots[resizingShot.sectionId] || [])].sort((a, b) => a.relative_start - b.relative_start);
      const shotIndex = shots.findIndex(s => s.id === resizingShot.shotId);
      if (shotIndex === -1) return;

      const shot = shots[shotIndex];
      const prevShot = shots[shotIndex - 1];
      const nextShot = shots[shotIndex + 1];

      if (resizingShot.edge === 'left') {
        // Moving left edge: changes this shot's start and previous shot's duration
        let newStart = resizingShot.initialStart + deltaTime;

        // Snap to whole seconds for cleaner values
        newStart = Math.round(newStart);

        // Constraints:
        // - This shot: MIN <= duration <= MAX
        // - Previous shot (if any): MIN <= duration <= MAX
        const minStart = prevShot ? prevShot.relative_start + MIN_SHOT_DURATION : 0;
        const maxStartForMin = resizingShot.initialStart + resizingShot.initialDuration - MIN_SHOT_DURATION;
        const minStartForMax = resizingShot.initialStart + resizingShot.initialDuration - MAX_SHOT_DURATION;
        const maxStartForPrevMax = prevShot ? prevShot.relative_start + MAX_SHOT_DURATION : Infinity;

        newStart = Math.max(minStart, minStartForMax, Math.min(maxStartForMin, maxStartForPrevMax, newStart));
        const newDuration = (resizingShot.initialStart + resizingShot.initialDuration) - newStart;

        const updatedShots = shots.map((s) => {
          if (s.id === resizingShot.shotId) {
            return { ...s, relative_start: newStart, duration: newDuration };
          }
          if (prevShot && s.id === prevShot.id) {
            // Previous shot's duration extends/shrinks to meet new start
            return { ...s, duration: newStart - s.relative_start };
          }
          return s;
        });

        setSectionShots(prev => ({ ...prev, [resizingShot.sectionId]: updatedShots }));
      } else {
        // Moving right edge: changes this shot's duration and next shot's start
        let newEnd = resizingShot.initialStart + resizingShot.initialDuration + deltaTime;

        // Snap to whole seconds for cleaner values
        newEnd = Math.round(newEnd);

        // Constraints:
        // - This shot: MIN <= duration <= MAX
        // - Next shot (if any): MIN <= duration <= MAX
        const minEnd = resizingShot.initialStart + MIN_SHOT_DURATION;
        const maxEndForMax = resizingShot.initialStart + MAX_SHOT_DURATION;
        const maxEndForNextMin = nextShot
          ? nextShot.relative_start + nextShot.duration - MIN_SHOT_DURATION
          : resizingShot.sectionDuration;
        const minEndForNextMax = nextShot
          ? nextShot.relative_start + nextShot.duration - MAX_SHOT_DURATION
          : 0;

        newEnd = Math.max(minEnd, minEndForNextMax, Math.min(maxEndForMax, maxEndForNextMin, newEnd));
        const newDuration = newEnd - shot.relative_start;

        const updatedShots = shots.map((s) => {
          if (s.id === resizingShot.shotId) {
            return { ...s, duration: newDuration };
          }
          if (nextShot && s.id === nextShot.id) {
            // Next shot's start moves and duration shrinks
            const nextNewStart = newEnd;
            const nextNewDuration = (nextShot.relative_start + nextShot.duration) - nextNewStart;
            return { ...s, relative_start: nextNewStart, duration: nextNewDuration };
          }
          return s;
        });

        setSectionShots(prev => ({ ...prev, [resizingShot.sectionId]: updatedShots }));
      }
    };

    const handleMouseUp = async () => {
      if (!resizingShot) return;

      const shots = [...(sectionShots[resizingShot.sectionId] || [])].sort((a, b) => a.relative_start - b.relative_start);
      const shotIndex = shots.findIndex(s => s.id === resizingShot.shotId);
      const shot = shots[shotIndex];
      const prevShot = shots[shotIndex - 1];
      const nextShot = shots[shotIndex + 1];

      // Save changes to server
      const updates: Promise<Response>[] = [];

      if (shot) {
        updates.push(
          fetch(`/api/projects/${projectId}/sections/${resizingShot.sectionId}/shots/${shot.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              relative_start: shot.relative_start,
              duration: shot.duration, // Also save duration!
            }),
          })
        );
      }

      // Save neighbor if affected
      if (resizingShot.edge === 'left' && prevShot) {
        updates.push(
          fetch(`/api/projects/${projectId}/sections/${resizingShot.sectionId}/shots/${prevShot.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              relative_start: prevShot.relative_start,
              duration: prevShot.duration, // Also save duration!
            }),
          })
        );
      } else if (resizingShot.edge === 'right' && nextShot) {
        updates.push(
          fetch(`/api/projects/${projectId}/sections/${resizingShot.sectionId}/shots/${nextShot.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              relative_start: nextShot.relative_start,
              duration: nextShot.duration, // Also save duration!
            }),
          })
        );
      }

      try {
        await Promise.all(updates);
      } catch (error) {
        console.error('Error updating shots:', error);
      }

      setResizingShot(null);
    };

    // Cancel resize immediately
    const cancelResize = () => {
      setResizingShot(null);
    };

    // Use pointer events for better reliability
    document.addEventListener('pointermove', handleMouseMove);
    document.addEventListener('pointerup', handleMouseUp);
    document.addEventListener('pointercancel', cancelResize);
    document.addEventListener('mouseleave', cancelResize);
    window.addEventListener('blur', cancelResize);

    return () => {
      document.removeEventListener('pointermove', handleMouseMove);
      document.removeEventListener('pointerup', handleMouseUp);
      document.removeEventListener('pointercancel', cancelResize);
      document.removeEventListener('mouseleave', cancelResize);
      window.removeEventListener('blur', cancelResize);
    };
  }, [resizingShot, sectionShots, projectId]);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current || !audioUrl) return;

    console.log('[ClipTimeline] Loading audio URL:', audioUrl);

    let isMounted = true;
    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      height: 100,
      waveColor: '#4f46e5',
      progressColor: '#818cf8',
      cursorColor: '#ef4444',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      plugins: [
        regions,
        TimelinePlugin.create({
          height: 20,
          timeInterval: 15,
          primaryLabelInterval: 1,
          secondaryLabelInterval: 0,
          style: {
            fontSize: '10px',
            color: '#64748b',
          },
        }),
      ],
    });

    wavesurferRef.current = wavesurfer;

    // Load with error handling for aborts
    wavesurfer.load(audioUrl).catch(() => {
      // Ignore load errors (e.g., abort during unmount)
    });

    wavesurfer.on('ready', () => {
      if (!isMounted) return;
      const dur = wavesurfer.getDuration();
      setDuration(dur);
      setIsLoading(false);
    });

    wavesurfer.on('play', () => isMounted && setIsPlaying(true));
    wavesurfer.on('pause', () => isMounted && setIsPlaying(false));
    wavesurfer.on('finish', () => isMounted && setIsPlaying(false));
    wavesurfer.on('timeupdate', (time) => isMounted && setCurrentTime(time));

    // Handle click to select time for splitting
    wavesurfer.on('click', () => {
      if (!isMounted) return;
      const time = wavesurfer.getCurrentTime();
      if (!selectionRange) {
        setSelectionRange({ start: time, end: time + 15 });
      }
    });

    return () => {
      isMounted = false;
      wavesurfer.destroy();
    };
  }, [audioUrl]);

  // Update regions when sections change
  useEffect(() => {
    if (!regionsRef.current || isLoading) return;

    // Don't recreate regions while resizing
    if (isResizingSectionRef.current) return;

    // Clear existing regions
    regionsRef.current.clearRegions();

    // Add section regions with integrated labels
    sections.forEach((section) => {
      // Create label element for perfect alignment
      const labelEl = document.createElement('div');
      labelEl.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        background-color: ${section.color};
        color: white;
        font-size: 12px;
        font-weight: 500;
        padding: 0 8px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        cursor: pointer;
        border-radius: 0;
      `;
      labelEl.textContent = section.name;
      labelEl.title = `${section.name} (${formatTime(section.start_time)} - ${formatTime(section.end_time)})`;

      const region = regionsRef.current!.addRegion({
        id: section.id,
        start: section.start_time,
        end: section.end_time,
        color: `${section.color}50`,
        content: labelEl,
        drag: true,
        resize: true,
      });

      // Track resize and constrain to adjacent sections
      region.on('update', () => {
        isResizingSectionRef.current = true;

        // Find adjacent sections to constrain resize
        const sortedSections = [...sections].sort((a, b) => a.start_time - b.start_time);
        const currentIndex = sortedSections.findIndex((s) => s.id === section.id);
        const prevSection = sortedSections[currentIndex - 1];
        const nextSection = sortedSections[currentIndex + 1];

        // Calculate bounds
        const minStart = prevSection ? prevSection.end_time : 0;
        const maxEnd = nextSection ? nextSection.start_time : duration;

        // Constrain region
        let constrainedStart = Math.max(region.start, minStart);
        let constrainedEnd = Math.min(region.end, maxEnd);

        // Apply constraints if needed
        if (region.start !== constrainedStart || region.end !== constrainedEnd) {
          region.setOptions({ start: constrainedStart, end: constrainedEnd });
        }

        const updatedSections = sections.map((s) =>
          s.id === section.id
            ? { ...s, start_time: constrainedStart, end_time: constrainedEnd }
            : s
        );
        onSectionsChange(updatedSections);
      });

      // Save to server when resize ends
      region.on('update-end', () => {
        isResizingSectionRef.current = false;
        updateSectionOnServer(section.id, {
          start_time: region.start,
          end_time: region.end,
        });
      });

      // Handle click to select
      region.on('click', () => {
        onSectionSelect?.(section);
      });
    });

    // Add selection region if active
    if (selectionRange && isAddingSection) {
      const selectionRegion = regionsRef.current.addRegion({
        id: 'selection',
        start: selectionRange.start,
        end: selectionRange.end,
        color: 'rgba(34, 197, 94, 0.3)',
        drag: true,
        resize: true,
        minLength: 5, // Minimum 5 seconds
      });

      // Handle region updates with constraints
      selectionRegion.on('update-end', () => {
        let newStart = selectionRegion.start;
        let newEnd = selectionRegion.end;

        // Constrain start to not go before minNewSectionStart
        if (newStart < minNewSectionStart) {
          newStart = minNewSectionStart;
        }

        // Constrain end to not exceed duration
        if (newEnd > duration) {
          newEnd = duration;
        }

        // Ensure minimum duration
        if (newEnd - newStart < 5) {
          newEnd = Math.min(newStart + 5, duration);
        }

        setSelectionRange({ start: newStart, end: newEnd });
        setIsSelectionComplete(true);
      });
    }
  }, [sections, isLoading, selectionRange, isAddingSection, duration, formatTime, minNewSectionStart]);

  // Update section on server
  const updateSectionOnServer = async (sectionId: string, data: Partial<MusicSection>) => {
    try {
      await fetch(`/api/projects/${projectId}/sections/${sectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (error) {
      console.error('Error updating section:', error);
    }
  };

  // Create new section
  const createSection = async () => {
    if (!selectionRange || !newSectionName.trim()) {
      toast.error('Sélectionnez une zone et donnez un nom');
      return;
    }

    // Check for overlap with existing sections
    const hasOverlap = sections.some((s) => {
      const newStart = selectionRange.start;
      const newEnd = selectionRange.end;
      return (newStart < s.end_time && newEnd > s.start_time);
    });

    if (hasOverlap) {
      toast.error('La section chevauche une section existante');
      return;
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSectionName.trim(),
          section_type: newSectionType,
          start_time: selectionRange.start,
          end_time: selectionRange.end,
        }),
      });

      if (res.ok) {
        const { section } = await res.json();
        onSectionsChange([...sections, section]);
        setIsAddingSection(false);
        setIsSelectionComplete(false);
        setNewSectionName('');
        setSelectionRange(null);
        toast.success('Section créée');
      } else {
        const error = await res.json();
        toast.error(error.error || 'Erreur lors de la création');
      }
    } catch (error) {
      console.error('Error creating section:', error);
      toast.error('Erreur lors de la création');
    }
  };

  // Delete section
  const deleteSection = async (sectionId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/sections/${sectionId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        onSectionsChange(sections.filter((s) => s.id !== sectionId));
        if (selectedSectionId === sectionId) {
          onSectionSelect?.(null);
        }
        toast.success('Section supprimée');
      }
    } catch (error) {
      console.error('Error deleting section:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  // Playback controls
  const togglePlayPause = useCallback(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;

    if (ws.isPlaying()) {
      ws.pause();
    } else {
      // Wrap in try-catch to handle AbortError when play is interrupted
      ws.play().catch((err: Error) => {
        if (err.name !== 'AbortError') {
          console.error('Playback error:', err);
        }
      });
    }
  }, []);

  const skipBackward = useCallback(() => {
    const ws = wavesurferRef.current;
    if (ws) {
      const newTime = Math.max(0, ws.getCurrentTime() - 5);
      ws.seekTo(newTime / ws.getDuration());
    }
  }, []);

  const skipForward = useCallback(() => {
    const ws = wavesurferRef.current;
    if (ws) {
      const newTime = Math.min(ws.getDuration(), ws.getCurrentTime() + 5);
      ws.seekTo(newTime / ws.getDuration());
    }
  }, []);

  const toggleMute = useCallback(() => {
    const ws = wavesurferRef.current;
    if (ws) {
      if (isMuted) {
        ws.setVolume(volume);
        setIsMuted(false);
      } else {
        ws.setVolume(0);
        setIsMuted(true);
      }
    }
  }, [isMuted, volume]);

  // Handle video generation for a shot
  const handleGenerateVideo = useCallback(async (
    shotId: string,
    options: VideoGenerationOptions
  ) => {
    if (!editingShot) return;

    // Prevent double-click - check if already generating for this shot
    const existingProgress = generationProgress.get(shotId);
    if (existingProgress?.status === 'generating' || isGeneratingVideo) {
      console.log('[ClipTimeline] Ignoring duplicate generate request for shot:', shotId);
      return;
    }

    setIsGeneratingVideo(true);

    // Initialize generation progress
    setGenerationProgress(prev => {
      const newMap = new Map(prev);
      newMap.set(shotId, {
        planId: shotId,
        progress: 0,
        step: 'queuing',
        message: 'Mise en file d\'attente...',
        status: 'generating',
      });
      return newMap;
    });

    try {
      const res = await fetch(`/api/projects/${projectId}/shots/${shotId}/queue-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.videoModel,
          duration: options.duration,
          provider: options.videoProvider,
        }),
      });

      if (!res.ok) {
        let errorMessage = 'Erreur lors de la mise en file d\'attente';
        try {
          const errorData = await res.json();
          errorMessage = typeof errorData.error === 'string'
            ? errorData.error
            : JSON.stringify(errorData.error) || errorMessage;
        } catch {
          errorMessage = `Erreur HTTP ${res.status}`;
        }
        throw new Error(errorMessage);
      }

      const data = await res.json();
      toast.success('Vidéo en file d\'attente', {
        description: `Job #${data.jobId} créé`,
      });

      // Notify jobs store and start polling
      useJobsStore.getState().fetchJobs();
      useJobsStore.getState().startPolling();

      // Update progress to show it's queued
      setGenerationProgress(prev => {
        const newMap = new Map(prev);
        newMap.set(shotId, {
          planId: shotId,
          progress: 5,
          step: 'queued',
          message: 'En attente de traitement...',
          status: 'generating',
        });
        return newMap;
      });

    } catch (error) {
      console.error('Video generation error:', error);
      toast.error('Erreur de génération', {
        description: error instanceof Error ? error.message : 'Erreur inconnue',
      });

      // Update progress to show error
      setGenerationProgress(prev => {
        const newMap = new Map(prev);
        newMap.set(shotId, {
          planId: shotId,
          progress: 0,
          step: 'error',
          message: error instanceof Error ? error.message : 'Erreur',
          status: 'error',
        });
        return newMap;
      });
    } finally {
      setIsGeneratingVideo(false);
    }
  }, [projectId, editingShot, generationProgress, isGeneratingVideo]);

  // Calculate total sections duration
  const totalSectionsDuration = useMemo(() => {
    return sections.reduce((acc, s) => acc + (s.end_time - s.start_time), 0);
  }, [sections]);

  const uncoveredDuration = duration - totalSectionsDuration;

  return (
    <div className={cn('rounded-xl border border-white/10 bg-slate-900/50 overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-slate-800/50">
        <div className="flex items-center gap-3">
          <Music className="w-5 h-5 text-purple-400" />
          <span className="font-medium text-white">Timeline Audio</span>
          <span className="text-sm text-slate-400">
            {formatTime(duration)} • {sections.length} section{sections.length > 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {uncoveredDuration > 0 && (
            <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
              {formatTime(uncoveredDuration)} non couvert
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              // Start from end of last section (or 0 if no sections)
              const startTime = minNewSectionStart;
              const defaultDuration = Math.min(15, duration - startTime);
              if (defaultDuration <= 0) {
                toast.error('Pas assez de place pour une nouvelle section');
                return;
              }
              setIsAddingSection(true);
              setIsSelectionComplete(false);
              setSelectionRange({ start: startTime, end: startTime + defaultDuration });
              setNewSectionName(`Section ${sections.length + 1}`);
            }}
            className="border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
          >
            <Plus className="w-4 h-4 mr-1" />
            Ajouter section
          </Button>
        </div>
      </div>

      {/* Waveform + Section labels (same container for alignment) */}
      <div className="relative">
        <div
          ref={containerRef}
          className={cn(
            'w-full',
            isLoading && 'animate-pulse'
          )}
        />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
        {/* Playback controls */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={skipBackward}>
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={togglePlayPause}>
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={skipForward}>
            <SkipForward className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleMute}>
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
        </div>

        {/* Time display */}
        <div className="font-mono text-sm text-slate-300">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>

        {/* Selected section info */}
        {selectedSectionId && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">
              {sections.find((s) => s.id === selectedSectionId)?.name}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={() => deleteSection(selectedSectionId)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Add section dialog */}
      {isAddingSection && (
        <div className="px-4 py-4 border-t border-white/10 bg-slate-800/50">
          {!isSelectionComplete ? (
            // Step 1: Drag to select zone or validate default
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-green-400">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-sm font-medium">
                    Ajustez la zone ou validez
                  </span>
                </div>
                {selectionRange && (
                  <span className="text-sm text-slate-400">
                    {formatTime(selectionRange.start)} - {formatTime(selectionRange.end)} ({(selectionRange.end - selectionRange.start).toFixed(1)}s)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => setIsSelectionComplete(true)}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  Valider zone
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsAddingSection(false);
                    setSelectionRange(null);
                    setIsSelectionComplete(false);
                  }}
                >
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            // Step 2: Enter section details
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Input
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  placeholder="Nom de la section (ex: Couplet 1)"
                  className="bg-white/5 border-white/10"
                  autoFocus
                />
              </div>
              <Select
                value={newSectionType}
                onValueChange={(v) => setNewSectionType(v as MusicSectionType)}
              >
                <SelectTrigger className="w-40 bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: type.color }}
                        />
                        {type.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-slate-400">
                {selectionRange && `${formatTime(selectionRange.start)} - ${formatTime(selectionRange.end)}`}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsSelectionComplete(false)}
                className="border-white/10"
              >
                Modifier zone
              </Button>
              <Button size="sm" onClick={createSection} className="bg-purple-500 hover:bg-purple-600">
                Créer
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsAddingSection(false);
                  setSelectionRange(null);
                  setIsSelectionComplete(false);
                }}
              >
                Annuler
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Sections list */}
      {sections.length > 0 && (
        <div className="border-t border-white/10">
          <div className="px-4 py-2 bg-slate-800/30 border-b border-white/5">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Sections ({sections.length})
            </span>
          </div>
          <div className="divide-y divide-white/5">
            {sections
              .sort((a, b) => a.start_time - b.start_time)
              .map((section) => {
                const sectionDuration = section.end_time - section.start_time;
                const isSelected = section.id === selectedSectionId;
                const isExpanded = expandedSections.has(section.id);
                const typeConfig = SECTION_TYPES.find((t) => t.value === section.section_type);
                const shots = sectionShots[section.id] || [];
                const isLoadingShots = loadingShots[section.id];

                return (
                  <div key={section.id}>
                    {/* Section header row */}
                    <div
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer',
                        isSelected ? 'bg-white/5' : 'hover:bg-white/[0.02]'
                      )}
                      onClick={() => onSectionSelect?.(section)}
                    >
                      {/* Expand toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSectionExpand(section.id, section);
                        }}
                        className="text-slate-400 hover:text-white transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>

                      {/* Color indicator */}
                      <div
                        className="w-1 h-10 rounded-full flex-shrink-0"
                        style={{ backgroundColor: section.color }}
                      />

                      {/* Section info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white truncate">
                            {section.name}
                          </span>
                          <span
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: `${section.color}20`,
                              color: section.color,
                            }}
                          >
                            {typeConfig?.label || section.section_type}
                          </span>
                          {shots.length > 0 && (
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <Film className="w-3 h-3" />
                              {shots.length} plan{shots.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTime(section.start_time)} - {formatTime(section.end_time)}
                          </span>
                          <span>({formatTime(sectionDuration)})</span>
                          {section.mood && (
                            <span className="text-slate-500">• {section.mood}</span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Play button: plays assembled video if exists, otherwise plays audio */}
                        {(() => {
                          const localAssembly = assembledVideos[section.id];
                          const dbAssemblyUrl = (section as MusicSection & { assembled_video_url?: string }).assembled_video_url;
                          const hasAssembly = !!(localAssembly || dbAssemblyUrl);
                          const isSectionPlaying = isPlaying && currentTime >= section.start_time && currentTime < section.end_time;

                          if (hasAssembly) {
                            // Play assembled video
                            return (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                                onClick={async (e) => {
                                  e.stopPropagation();

                                  if (localAssembly) {
                                    setPlayingAssembledVideo({
                                      sectionId: section.id,
                                      signedUrl: localAssembly.signedUrl,
                                    });
                                  } else if (dbAssemblyUrl) {
                                    try {
                                      const res = await fetch('/api/storage/sign', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ urls: [dbAssemblyUrl] }),
                                      });
                                      if (res.ok) {
                                        const { signedUrls } = await res.json();
                                        const signedUrl = signedUrls[dbAssemblyUrl];
                                        setPlayingAssembledVideo({
                                          sectionId: section.id,
                                          signedUrl,
                                        });
                                      } else {
                                        toast.error('Erreur lors du chargement du montage');
                                      }
                                    } catch (error) {
                                      console.error('Error getting signed URL:', error);
                                      toast.error('Erreur lors du chargement du montage');
                                    }
                                  }
                                }}
                                title="Voir le montage"
                              >
                                <Play className="h-3.5 w-3.5" />
                              </Button>
                            );
                          }

                          // Play audio section
                          return (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-400 hover:text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                const ws = wavesurferRef.current;
                                if (!ws || duration <= 0) return;

                                if (isSectionPlaying) {
                                  ws.pause();
                                } else {
                                  ws.play(section.start_time, section.end_time).catch((err: Error) => {
                                    if (err.name !== 'AbortError') {
                                      console.error('Playback error:', err);
                                    }
                                  });
                                }
                              }}
                              title={isSectionPlaying ? "Pause" : "Écouter la section"}
                            >
                              {isSectionPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                            </Button>
                          );
                        })()}
                        {/* Assembly button - create/re-create montage */}
                        {(() => {
                          const localAssembly = assembledVideos[section.id];
                          const dbAssemblyUrl = (section as MusicSection & { assembled_video_url?: string }).assembled_video_url;
                          const hasAssembly = !!(localAssembly || dbAssemblyUrl);
                          const isAssembling = assemblingSection === section.id;

                          return (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "h-8 w-8",
                                isAssembling
                                  ? "text-orange-400"
                                  : hasAssembly
                                  ? "text-green-400 hover:text-green-300 hover:bg-green-500/10"
                                  : canAssembleSection(section.id)
                                  ? "text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                                  : "text-slate-500 cursor-not-allowed"
                              )}
                              disabled={!canAssembleSection(section.id) || isAssembling}
                              onClick={(e) => {
                                e.stopPropagation();
                                assembleSection(section.id);
                              }}
                              title={
                                isAssembling
                                  ? "Montage en cours..."
                                  : !canAssembleSection(section.id)
                                  ? "Générez d'abord les vidéos de tous les plans"
                                  : hasAssembly
                                  ? "Ré-assembler le montage"
                                  : "Assembler le montage"
                              }
                            >
                              {isAssembling ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Clapperboard className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          );
                        })()}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSection(section.id);
                          }}
                          title="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Expanded content: Filmstrip and shots */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 bg-slate-800/30 border-t border-white/5">
                        {/* Filmstrip timeline */}
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                              Plans ({shots.length})
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                // Find first available gap
                                const sortedShots = [...shots].sort((a, b) => a.relative_start - b.relative_start);

                                // Check gap at start
                                if (sortedShots.length === 0 || sortedShots[0].relative_start >= MIN_SHOT_DURATION) {
                                  createShot(section.id, section, 0);
                                  return;
                                }

                                // Check gaps between shots
                                for (let i = 0; i < sortedShots.length - 1; i++) {
                                  const gapStart = sortedShots[i].relative_start + sortedShots[i].duration;
                                  const gapEnd = sortedShots[i + 1].relative_start;
                                  if (gapEnd - gapStart >= MIN_SHOT_DURATION) {
                                    createShot(section.id, section, gapStart);
                                    return;
                                  }
                                }

                                // Check gap at end
                                const lastShot = sortedShots[sortedShots.length - 1];
                                const lastEnd = lastShot.relative_start + lastShot.duration;
                                if (sectionDuration - lastEnd >= MIN_SHOT_DURATION) {
                                  createShot(section.id, section, lastEnd);
                                  return;
                                }

                                toast.info('Pas d\'espace disponible. Divisez un plan existant (≥6s)');
                              }}
                              className="h-6 text-xs text-purple-300 hover:text-purple-200"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Ajouter plan
                            </Button>
                          </div>

                          {/* Transition track - above filmstrip */}
                          {shots.length > 1 && (
                            <div
                              className="relative h-8 mb-1"
                              data-transition-track={section.id}
                            >
                              {/* Transition zones between shots */}
                              {shots.slice(0, -1).map((shot, idx) => {
                                // Position = end of current shot = junction point
                                const transitionPos = ((shot.relative_start + shot.duration) / sectionDuration) * 100;

                                // When type is 'cut' or missing, treat duration as 0 (no transition)
                                const isCut = !shot.transition_type || shot.transition_type === 'cut';
                                const transitionDuration = isCut ? 0 : (shot.transition_duration ?? 0);

                                // A transition exists only if type is NOT cut AND duration > 0
                                const hasTransition = !isCut && transitionDuration > 0;

                                const isEditing = editingTransition?.shotId === shot.id && editingTransition?.sectionId === section.id;
                                const isDragging = draggingTransition?.shotId === shot.id && draggingTransition?.sectionId === section.id;

                                // Calculate zone width as percentage of section duration
                                const zoneWidthPercent = (transitionDuration / sectionDuration) * 100;

                                // Show expanded zone ONLY if has real transition OR currently dragging
                                const showExpandedZone = hasTransition || isDragging;

                                return (
                                  <div key={`trans-${shot.id}`}>
                                    {/* Collapsed state: just <> marker */}
                                    {!showExpandedZone && (
                                      <div
                                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center z-10"
                                        style={{ left: `${transitionPos}%` }}
                                      >
                                        {/* Left handle < */}
                                        <button
                                          className="w-4 h-6 flex items-center justify-center bg-slate-700/80 hover:bg-slate-600 rounded-l text-slate-400 hover:text-white cursor-ew-resize transition-colors"
                                          onPointerDown={(e) => {
                                            const track = e.currentTarget.closest('[data-transition-track]') as HTMLElement;
                                            if (track) {
                                              // Start from 0 so first drag creates 0.3s minimum
                                              startTransitionDrag(e, section.id, shot.id, 'left', 0, sectionDuration, track);
                                            }
                                          }}
                                          title="Glisser pour créer une transition"
                                        >
                                          <ChevronLeft className="w-3 h-3" />
                                        </button>
                                        {/* Right handle > */}
                                        <button
                                          className="w-4 h-6 flex items-center justify-center bg-slate-700/80 hover:bg-slate-600 rounded-r text-slate-400 hover:text-white cursor-ew-resize transition-colors"
                                          onPointerDown={(e) => {
                                            const track = e.currentTarget.closest('[data-transition-track]') as HTMLElement;
                                            if (track) {
                                              // Start from 0 so first drag creates 0.3s minimum
                                              startTransitionDrag(e, section.id, shot.id, 'right', 0, sectionDuration, track);
                                            }
                                          }}
                                          title="Glisser pour créer une transition"
                                        >
                                          <ChevronRight className="w-3 h-3" />
                                        </button>
                                      </div>
                                    )}

                                    {/* Expanded state: zone that extends across both shots */}
                                    {showExpandedZone && (
                                      <div
                                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-6 flex items-stretch z-10"
                                        style={{
                                          // Center on the junction point
                                          left: `${transitionPos}%`,
                                          // Width based on duration, with min width for usability
                                          width: `max(${zoneWidthPercent}%, 48px)`,
                                        }}
                                      >
                                        {/* Left handle < */}
                                        <button
                                          className={cn(
                                            "w-4 flex-shrink-0 flex items-center justify-center rounded-l cursor-ew-resize transition-colors",
                                            isDragging && draggingTransition.handle === 'left'
                                              ? "bg-orange-500 text-white"
                                              : "bg-purple-600/90 hover:bg-purple-500 text-white"
                                          )}
                                          onPointerDown={(e) => {
                                            const track = e.currentTarget.closest('[data-transition-track]') as HTMLElement;
                                            if (track) {
                                              startTransitionDrag(e, section.id, shot.id, 'left', transitionDuration, sectionDuration, track);
                                            }
                                          }}
                                          title="Glisser pour ajuster la durée"
                                        >
                                          <ChevronLeft className="w-3 h-3" />
                                        </button>

                                        {/* Transition zone (clickable to select type) - gradient showing overlap */}
                                        <button
                                          className={cn(
                                            "flex-1 flex items-center justify-center transition-all min-w-[32px]",
                                            isEditing
                                              ? "bg-gradient-to-r from-orange-500/90 via-orange-400/80 to-orange-500/90"
                                              : "bg-gradient-to-r from-purple-500/90 via-purple-400/70 to-blue-500/90 hover:from-purple-400 hover:to-blue-400",
                                            "text-white text-[10px] font-medium"
                                          )}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (isEditing) {
                                              setEditingTransition(null);
                                            } else {
                                              setEditingTransition({
                                                sectionId: section.id,
                                                shotId: shot.id,
                                                shotIndex: idx,
                                              });
                                            }
                                          }}
                                          title="Cliquer pour choisir la transition"
                                        >
                                          {transitionDuration.toFixed(1)}s
                                        </button>

                                        {/* Right handle > */}
                                        <button
                                          className={cn(
                                            "w-4 flex-shrink-0 flex items-center justify-center rounded-r cursor-ew-resize transition-colors",
                                            isDragging && draggingTransition.handle === 'right'
                                              ? "bg-orange-500 text-white"
                                              : "bg-blue-600/90 hover:bg-blue-500 text-white"
                                          )}
                                          onPointerDown={(e) => {
                                            const track = e.currentTarget.closest('[data-transition-track]') as HTMLElement;
                                            if (track) {
                                              startTransitionDrag(e, section.id, shot.id, 'right', transitionDuration, sectionDuration, track);
                                            }
                                          }}
                                          title="Glisser pour ajuster la durée"
                                        >
                                          <ChevronRight className="w-3 h-3" />
                                        </button>
                                      </div>
                                    )}

                                    {/* Transition type picker dropdown */}
                                    {isEditing && (
                                      <div
                                        className="absolute top-10 -translate-x-1/2 z-30 bg-slate-900 border border-white/10 rounded-lg p-2 shadow-xl"
                                        style={{ left: `${transitionPos}%` }}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <div className="grid grid-cols-2 gap-1 min-w-[160px]">
                                          {[
                                            { type: 'dissolve' as TransitionType, label: 'Dissolve' },
                                            { type: 'fadeblack' as TransitionType, label: 'Fondu noir' },
                                            { type: 'fadewhite' as TransitionType, label: 'Fondu blanc' },
                                            { type: 'cut' as TransitionType, label: 'Supprimer' },
                                          ].map((t) => (
                                            <button
                                              key={t.type}
                                              onClick={() => {
                                                if (t.type === 'cut') {
                                                  updateShotTransition(section.id, shot.id, 'cut', 0);
                                                } else {
                                                  updateShotTransition(section.id, shot.id, t.type, shot.transition_duration || 0.5);
                                                }
                                                setEditingTransition(null);
                                              }}
                                              className={cn(
                                                "px-2 py-1.5 rounded text-xs font-medium transition-colors text-left",
                                                shot.transition_type === t.type
                                                  ? "bg-purple-500/40 text-purple-200"
                                                  : t.type === 'cut'
                                                  ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                                                  : "bg-white/5 text-slate-300 hover:bg-white/10"
                                              )}
                                            >
                                              {t.label}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Filmstrip visual */}
                          <div
                            data-filmstrip={section.id}
                            className={cn(
                              "relative h-10 bg-slate-800/50 rounded-lg border border-white/10 overflow-hidden",
                              resizingShot ? 'cursor-ew-resize' : 'cursor-pointer'
                            )}
                            onClick={(e) => {
                              if (resizingShot) return;
                              // Close any open transition editor
                              if (editingTransition) {
                                setEditingTransition(null);
                                return;
                              }
                              // Calculate click position as relative_start
                              const rect = e.currentTarget.getBoundingClientRect();
                              const relativeX = (e.clientX - rect.left) / rect.width;
                              const relativeStart = relativeX * sectionDuration;
                              // In snapped mode, clicking anywhere creates/splits
                              createShot(section.id, section, relativeStart);
                            }}
                          >

                            {/* Shot blocks */}
                            {shots.map((shot, idx) => {
                              const left = (shot.relative_start / sectionDuration) * 100;
                              const width = (shot.duration / sectionDuration) * 100;
                              const isResizing = resizingShot?.shotId === shot.id;
                              const isOtherResizing = resizingShot && resizingShot.shotId !== shot.id;
                              return (
                                <div
                                  key={shot.id}
                                  className={cn(
                                    "absolute inset-y-0 flex items-center justify-center text-xs font-medium transition-colors",
                                    // Disable hover on other shots while resizing
                                    isOtherResizing
                                      ? 'bg-purple-500/60 pointer-events-none'
                                      : 'group/shot',
                                    isResizing
                                      ? 'bg-orange-500/70 z-20'
                                      : !isOtherResizing && 'bg-purple-500/60 hover:bg-orange-500/70'
                                  )}
                                  style={{
                                    left: `${left}%`,
                                    width: `${width}%`,
                                    minWidth: '24px',
                                  }}
                                  title={`Plan ${idx + 1}: ${formatTime(shot.relative_start)} (${shot.duration.toFixed(1)}s)`}
                                >
                                  {/* Left resize handle */}
                                  <div
                                    className={cn(
                                      "absolute left-0 inset-y-0 cursor-ew-resize transition-all z-10 flex items-center justify-center",
                                      isResizing
                                        ? 'w-3 bg-orange-400/90'
                                        : 'w-1 bg-purple-300/50 group-hover/shot:w-3 group-hover/shot:bg-orange-400/90'
                                    )}
                                    onPointerDown={(e) => { e.preventDefault(); startResize(e, section.id, shot, 'left', sectionDuration); }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {/* Gripper dots */}
                                    <div className={cn(
                                      "flex flex-col gap-0.5 transition-opacity",
                                      isResizing ? 'opacity-100' : 'opacity-0 group-hover/shot:opacity-100'
                                    )}>
                                      <div className="w-0.5 h-0.5 rounded-full bg-white/80" />
                                      <div className="w-0.5 h-0.5 rounded-full bg-white/80" />
                                      <div className="w-0.5 h-0.5 rounded-full bg-white/80" />
                                    </div>
                                  </div>

                                  {/* Shot duration */}
                                  <span className="text-white/90 text-[11px] font-medium select-none pointer-events-none">
                                    {shot.duration.toFixed(1)}s
                                  </span>

                                  {/* Right resize handle */}
                                  <div
                                    className={cn(
                                      "absolute right-0 inset-y-0 cursor-ew-resize transition-all z-10 flex items-center justify-center",
                                      isResizing
                                        ? 'w-3 bg-orange-400/90'
                                        : 'w-1 bg-purple-300/50 group-hover/shot:w-3 group-hover/shot:bg-orange-400/90'
                                    )}
                                    onPointerDown={(e) => { e.preventDefault(); startResize(e, section.id, shot, 'right', sectionDuration); }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {/* Gripper dots */}
                                    <div className={cn(
                                      "flex flex-col gap-0.5 transition-opacity",
                                      isResizing ? 'opacity-100' : 'opacity-0 group-hover/shot:opacity-100'
                                    )}>
                                      <div className="w-0.5 h-0.5 rounded-full bg-white/80" />
                                      <div className="w-0.5 h-0.5 rounded-full bg-white/80" />
                                      <div className="w-0.5 h-0.5 rounded-full bg-white/80" />
                                    </div>
                                  </div>

                                </div>
                              );
                            })}

                            {/* Loading indicator */}
                            {isLoadingShots && (
                              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                                <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                              </div>
                            )}

                            {/* Empty state */}
                            {!isLoadingShots && shots.length === 0 && (
                              <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs">
                                Cliquez pour créer le premier plan
                              </div>
                            )}
                          </div>

                          {/* Time markers */}
                          <div className="flex justify-between mt-1 text-[10px] text-slate-500">
                            <span>0:00</span>
                            <span>{formatTime(sectionDuration / 2)}</span>
                            <span>{formatTime(sectionDuration)}</span>
                          </div>
                        </div>

                        {/* Shot cards */}
                        {shots.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                            {shots.map((shot, idx) => (
                              <div
                                key={shot.id}
                                className="group relative bg-slate-800 rounded-lg border border-white/10 overflow-hidden hover:border-purple-500/30 transition-colors cursor-pointer"
                                onClick={() => openShotEditor(shot, section.id, idx)}
                              >
                                {/* Shot thumbnail - video if generated, otherwise image */}
                                <div className="aspect-video bg-slate-700 flex items-center justify-center relative group/thumb">
                                  {shot.generated_video_url ? (
                                    <>
                                      <StorageMedia
                                        src={shot.generated_video_url}
                                        className="w-full h-full object-cover"
                                        muted
                                        loop
                                        autoPlay={false}
                                        onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play?.()}
                                        onMouseLeave={(e) => {
                                          const video = e.currentTarget as HTMLVideoElement;
                                          video.pause?.();
                                          if (video.currentTime !== undefined) video.currentTime = 0;
                                        }}
                                      />
                                      {/* Video indicator */}
                                      <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-blue-500/80 text-[10px] font-medium text-white flex items-center gap-1">
                                        <Play className="w-2.5 h-2.5 fill-current" />
                                        Vidéo
                                      </div>
                                    </>
                                  ) : shot.storyboard_image_url || shot.first_frame_url ? (
                                    <StorageImg
                                      src={shot.storyboard_image_url || shot.first_frame_url}
                                      alt={`Plan ${idx + 1}`}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <Film className="w-6 h-6 text-slate-500" />
                                  )}
                                </div>

                                {/* Shot info */}
                                <div className="p-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-white">
                                      Plan {idx + 1}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                      {shot.duration.toFixed(1)}s
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-500 truncate mt-0.5">
                                    {shot.description || 'Sans description'}
                                  </p>
                                </div>

                                {/* Delete button */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteShotFromSection(section.id, shot.id, section);
                                  }}
                                  className="absolute top-1 right-1 p-1 bg-red-500/80 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                                  title="Supprimer"
                                >
                                  <Trash2 className="w-3 h-3 text-white" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Shot Editor Modal - using generic PlanEditor */}
      {editingShot?.shot && (
        <PlanEditor
          open={!!editingShot}
          onOpenChange={(open) => !open && setEditingShot(null)}
          mode="video-fixed"
          plan={{
            id: editingShot.shot.id,
            number: editingShot.shotIndex + 1,
            duration: editingShot.shot.duration,
            storyboard_image_url: editingShot.shot.storyboard_image_url,
            first_frame_url: editingShot.shot.first_frame_url,
            last_frame_url: editingShot.shot.last_frame_url,
            animation_prompt: editingShot.shot.animation_prompt,
            description: editingShot.shot.description,
            shot_type: editingShot.shot.shot_type,
            camera_angle: editingShot.shot.camera_angle,
            camera_movement: editingShot.shot.camera_movement,
            generated_video_url: editingShot.shot.generated_video_url,
            // Prompt fields for traceability
            storyboard_prompt: editingShot.shot.storyboard_prompt,
            first_frame_prompt: editingShot.shot.first_frame_prompt,
            last_frame_prompt: editingShot.shot.last_frame_prompt,
            video_prompt: editingShot.shot.video_prompt,
          }}
          previousPlan={(() => {
            // Find previous shot in this section
            const shots = sectionShots[editingShot.sectionId] || [];
            const sortedShots = [...shots].sort((a, b) => a.relative_start - b.relative_start);
            const currentIndex = sortedShots.findIndex(s => s.id === editingShot.shot.id);
            const prevShot = currentIndex > 0 ? sortedShots[currentIndex - 1] : null;
            if (!prevShot) return null;
            return {
              id: prevShot.id,
              duration: prevShot.duration,
              storyboard_image_url: prevShot.storyboard_image_url,
              first_frame_url: prevShot.first_frame_url,
              last_frame_url: prevShot.last_frame_url,
              generated_video_url: prevShot.generated_video_url,
            };
          })()}
          projectId={projectId}
          aspectRatio={aspectRatio}
          onUpdate={async (updates) => {
            // Convert PlanData updates to Shot format (null -> undefined)
            const shotUpdates: Partial<Shot> = {};
            if (updates.animation_prompt !== undefined) {
              shotUpdates.animation_prompt = updates.animation_prompt ?? undefined;
            }
            if (updates.storyboard_image_url !== undefined) {
              shotUpdates.storyboard_image_url = updates.storyboard_image_url ?? undefined;
            }
            if (updates.first_frame_url !== undefined) {
              shotUpdates.first_frame_url = updates.first_frame_url ?? undefined;
            }
            if (updates.last_frame_url !== undefined) {
              shotUpdates.last_frame_url = updates.last_frame_url ?? undefined;
            }
            if (updates.description !== undefined) {
              shotUpdates.description = updates.description ?? undefined;
            }
            if (updates.shot_type !== undefined) {
              shotUpdates.shot_type = updates.shot_type ?? undefined;
            }
            if (updates.camera_angle !== undefined) {
              shotUpdates.camera_angle = updates.camera_angle ?? undefined;
            }
            if (updates.camera_movement !== undefined) {
              shotUpdates.camera_movement = updates.camera_movement ?? undefined;
            }
            if (updates.generated_video_url !== undefined) {
              shotUpdates.generated_video_url = updates.generated_video_url ?? undefined;
            }

            // Update editingShot immediately for UI responsiveness
            setEditingShot((prev) => prev ? {
              ...prev,
              shot: { ...prev.shot, ...shotUpdates },
            } : null);

            // Update sectionShots state
            setSectionShots((prev) => ({
              ...prev,
              [editingShot.sectionId]: (prev[editingShot.sectionId] || []).map((s) =>
                s.id === editingShot.shot.id ? { ...s, ...shotUpdates } : s
              ),
            }));

            // Save to API
            try {
              await fetch(
                `/api/projects/${projectId}/sections/${editingShot.sectionId}/shots/${editingShot.shot.id}`,
                {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(updates),
                }
              );
            } catch (error) {
              console.error('Error updating shot:', error);
            }
          }}
          onGenerateVideo={handleGenerateVideo}
          isGeneratingVideo={(() => {
            // Use progress status as primary source of truth
            // isGeneratingVideo is only true during API call (prevents double-click)
            const progress = editingShot?.shot.id ? generationProgress.get(editingShot.shot.id) : undefined;
            // Show generating UI if: API call in progress OR job is actively generating
            if (isGeneratingVideo) return true;
            if (progress?.status === 'generating') return true;
            // Also check if we just queued (progress exists but not completed/failed)
            if (progress && progress.status !== 'completed' && progress.status !== 'error' && progress.status !== 'failed') {
              return true;
            }
            return false;
          })()}
          videoGenerationProgress={editingShot?.shot.id ? generationProgress.get(editingShot.shot.id) : undefined}
        />
      )}

      {/* Assembled video player dialog */}
      <Dialog
        open={!!playingAssembledVideo}
        onOpenChange={(open) => !open && setPlayingAssembledVideo(null)}
      >
        <DialogContent className="max-w-4xl p-0 bg-black border-white/10 overflow-hidden">
          <VisuallyHidden>
            <DialogTitle>Lecteur vidéo du montage</DialogTitle>
            <DialogDescription>Lecture du montage de la section</DialogDescription>
          </VisuallyHidden>
          <div className="relative">
            {/* Close button */}
            <button
              onClick={() => setPlayingAssembledVideo(null)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Video player */}
            {playingAssembledVideo && (
              <video
                src={playingAssembledVideo.signedUrl}
                controls
                autoPlay
                className="w-full aspect-video"
              />
            )}

            {/* Video info */}
            {playingAssembledVideo && assembledVideos[playingAssembledVideo.sectionId] && (
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center justify-between">
                  <div className="text-white text-sm">
                    <span className="font-medium">Montage de section</span>
                    <span className="text-white/60 ml-2">
                      {assembledVideos[playingAssembledVideo.sectionId].duration.toFixed(1)}s
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/30 text-white hover:bg-white/10"
                    onClick={() => {
                      // Re-assemble to regenerate
                      setPlayingAssembledVideo(null);
                      assembleSection(playingAssembledVideo.sectionId);
                    }}
                  >
                    <Clapperboard className="w-4 h-4 mr-2" />
                    Ré-assembler
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ClipTimeline;
