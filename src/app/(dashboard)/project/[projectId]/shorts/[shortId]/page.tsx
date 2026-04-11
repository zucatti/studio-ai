'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PlanEditor, type VideoGenerationOptions, type PlanData } from '@/components/plan-editor';
import { type VideoGenerationProgress } from '@/components/shorts/VideoGenerationCard';
import { VideoCard } from '@/components/shorts/VideoCard';
import { MontageEditor } from '@/components/shorts/MontageEditor';
import { useSignedUrl, isB2Url } from '@/hooks/use-signed-url';
import { useSequenceAssembly } from '@/hooks/use-sequence-assembly';
// ProjectBibleButton removed - use sidebar Bible instead
import { formatDuration } from '@/components/shorts/DurationPicker';
import { CinematicHeaderWizard, type PromptCharacterData } from '@/components/shorts/CinematicHeaderWizard';
import { PlanCard } from '@/components/shorts/PlanCard';
import { SequenceCard } from '@/components/shorts/SequenceCard';
import { SequenceClip } from '@/components/shorts/SequenceClip';
import { MusicSelector } from '@/components/shorts/MusicSelector';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useShortsStore, type Plan } from '@/store/shorts-store';
import { useJobsStore } from '@/store/jobs-store';
import { useBibleStore } from '@/store/bible-store';
import { useProject } from '@/hooks/use-project';
import type { AspectRatio } from '@/types/database';
import type { CinematicHeaderConfig, Sequence, TransitionType } from '@/types/cinematic';
import {
  ArrowLeft,
  Loader2,
  Clock,
  X,
  Video,
  Film,
  Pencil,
  Play,
  Download,
  Clapperboard,
  Sparkles,
  Plus,
  Layers,
  Maximize2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// === EXTRACTED COMPONENTS (prevent flickering from inline definitions) ===

// Sortable plan item for rush list
const SortablePlanItem = ({
  plan,
  selectedPlanId,
  onSelect,
  onDelete,
}: {
  plan: Plan;
  selectedPlanId: string | null;
  onSelect: (planId: string) => void;
  onDelete: (planId: string) => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: plan.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <PlanCard
        plan={plan}
        isSelected={selectedPlanId === plan.id}
        onSelect={() => onSelect(plan.id)}
        onEdit={() => onSelect(plan.id)}
        onDelete={() => onDelete(plan.id)}
        dragHandleProps={listeners}
        compact
      />
    </div>
  );
};

// Droppable sequence zone
const DroppableSequence = ({
  sequence,
  children,
}: {
  sequence: Sequence;
  children: React.ReactNode;
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `sequence-${sequence.id}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-xl bg-[#0d1218] border overflow-hidden transition-colors',
        isOver ? 'border-purple-500 bg-purple-500/10' : 'border-white/5'
      )}
    >
      {children}
    </div>
  );
};

// Droppable rush zone
const DroppableRush = ({ children }: { children: React.ReactNode }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: 'rush-zone',
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-1 overflow-y-auto rounded-lg transition-colors p-2 -m-2',
        isOver && 'bg-blue-500/10'
      )}
    >
      {children}
    </div>
  );
};

// Storyboard plan card with hover video autoplay
const StoryboardPlanCard = ({
  plan,
  aspectRatio: ar,
  isSelected,
  isGenerating,
  isRush,
  onSelect,
  onExpand,
}: {
  plan: Plan;
  aspectRatio: string;
  isSelected: boolean;
  isGenerating: boolean;
  isRush?: boolean;
  onSelect: () => void;
  onExpand: () => void;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Sign B2 URLs
  const { signedUrl: signedVideoUrl } = useSignedUrl(plan.generated_video_url || null);
  const { signedUrl: signedImageUrl } = useSignedUrl(plan.storyboard_image_url || null);

  const finalVideoUrl =
    signedVideoUrl || (!isB2Url(plan.generated_video_url || '') ? plan.generated_video_url : null);
  const finalImageUrl =
    signedImageUrl || (!isB2Url(plan.storyboard_image_url || '') ? plan.storyboard_image_url : null);

  // Card width based on aspect ratio - larger sizes
  const cardWidth = ar === '9:16' ? 160 : ar === '1:1' ? 200 : 280;
  const aspectStyle = ar.replace(':', '/');

  // Handle hover autoplay for videos
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isHovered && finalVideoUrl) {
      video.play().catch(() => {});
    } else {
      video.pause();
      video.currentTime = 0;
      setVideoProgress(0);
    }
  }, [isHovered, finalVideoUrl]);

  // Track video progress
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (video.duration > 0) {
        setVideoProgress((video.currentTime / video.duration) * 100);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, []);

  return (
    <div
      className={cn(
        'relative flex-shrink-0 rounded-xl overflow-hidden border-2 cursor-pointer transition-all group',
        isSelected
          ? isRush
            ? 'border-blue-500 ring-2 ring-blue-500/30'
            : 'border-purple-500 ring-2 ring-purple-500/30'
          : isRush
            ? 'border-dashed border-white/20 hover:border-white/40'
            : 'border-white/10 hover:border-white/30'
      )}
      style={{ width: cardWidth }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onSelect}
    >
      {/* Content */}
      {isGenerating ? (
        <div className="bg-slate-800 flex items-center justify-center" style={{ aspectRatio: aspectStyle }}>
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
        </div>
      ) : finalVideoUrl ? (
        // Video with hover autoplay
        <div className="relative" style={{ aspectRatio: aspectStyle }}>
          <video
            ref={videoRef}
            src={finalVideoUrl}
            loop
            muted
            playsInline
            className="w-full h-full object-cover bg-black"
            poster={finalImageUrl || undefined}
          />
          {/* Play indicator when not hovered */}
          {!isHovered && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <Play className="w-4 h-4 text-white fill-white ml-0.5" />
              </div>
            </div>
          )}
          {/* Controls on hover */}
          {isHovered && (
            <>
              {/* Progress bar */}
              <div className="absolute bottom-8 left-0 right-0 h-1 bg-black/50">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${videoProgress}%` }} />
              </div>
              {/* Fullscreen button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onExpand();
                }}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 backdrop-blur flex items-center justify-center hover:bg-black/70 transition-colors"
                title="Plein écran"
              >
                <Maximize2 className="w-4 h-4 text-white" />
              </button>
            </>
          )}
        </div>
      ) : finalImageUrl ? (
        // Image only
        <div className="relative" style={{ aspectRatio: aspectStyle }}>
          <img src={finalImageUrl} alt={`Plan ${plan.shot_number}`} className="w-full h-full object-cover" />
          {isHovered && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExpand();
              }}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 backdrop-blur flex items-center justify-center hover:bg-black/70 transition-colors"
              title="Plein écran"
            >
              <Maximize2 className="w-4 h-4 text-white" />
            </button>
          )}
        </div>
      ) : (
        // Empty state
        <div
          className="bg-slate-800/50 flex flex-col items-center justify-center"
          style={{ aspectRatio: aspectStyle }}
        >
          <Video className="w-6 h-6 text-slate-600 mb-1" />
          <span className="text-xs text-slate-500">P{plan.shot_number}</span>
        </div>
      )}

      {/* Bottom label */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-white">Plan {plan.shot_number}</span>
          <span className="text-[10px] text-slate-400">{plan.duration}s</span>
        </div>
      </div>
    </div>
  );
};

// Gallery slide component for sequences
const GallerySequenceSlide = ({
  sequence,
  isCurrent,
  sequenceAssemblyStates,
  getPlansForSequence,
  aspectRatio,
}: {
  sequence: Sequence;
  isCurrent: boolean;
  sequenceAssemblyStates: Map<string, { status: string; assembledVideoUrl?: string | null; progress?: number }>;
  getPlansForSequence: (sequenceId: string) => Plan[];
  aspectRatio: string;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Get the assembled video URL
  const assemblyState = sequenceAssemblyStates.get(sequence.id);
  const assembledUrl =
    assemblyState?.status === 'completed' ? assemblyState.assembledVideoUrl : sequence.assembled_video_url;

  const { signedUrl } = useSignedUrl(assembledUrl || null);
  const finalVideoUrl = signedUrl || (assembledUrl && !isB2Url(assembledUrl) ? assembledUrl : null);

  // Get sequence plans for info
  const sequencePlans = getPlansForSequence(sequence.id);
  const totalDuration = sequencePlans.reduce((sum, p) => sum + p.duration, 0);

  // Auto-play when current and video is ready
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !finalVideoUrl) return;

    const handleCanPlay = () => {
      if (isCurrent) {
        video.play().catch(() => {});
      }
    };

    if (isCurrent) {
      // Try to play immediately if already loaded
      if (video.readyState >= 3) {
        video.play().catch(() => {});
      } else {
        // Wait for video to be ready
        video.addEventListener('canplay', handleCanPlay);
      }
    } else {
      video.pause();
      video.currentTime = 0;
    }

    return () => {
      video.removeEventListener('canplay', handleCanPlay);
    };
  }, [isCurrent, finalVideoUrl]);

  return (
    <div
      className={cn(
        'flex-shrink-0 transition-all duration-300',
        isCurrent ? 'opacity-100 scale-100' : 'opacity-40 scale-95'
      )}
    >
      <div
        className={cn('relative rounded-xl overflow-hidden shadow-2xl', isCurrent && 'ring-2 ring-white/20')}
      >
        {finalVideoUrl ? (
          <video
            ref={videoRef}
            src={finalVideoUrl}
            loop
            muted={!isCurrent}
            playsInline
            controls={isCurrent}
            className="w-full object-cover bg-black"
            style={{ aspectRatio: aspectRatio.replace(':', '/') }}
          />
        ) : null}

        {/* Info overlay - top left */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-3 pb-10 pointer-events-none">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              {sequence.title || `Séquence ${sequence.sort_order + 1}`}
            </span>
            <span className="text-xs text-slate-300">
              {sequencePlans.length} plans • {totalDuration}s
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// === MAIN PAGE COMPONENT ===

export default function ShortDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const shortId = params.shortId as string;

  const {
    shorts,
    isLoading,
    fetchShorts,
    updateShort,
    createPlan,
    updatePlan,
    deletePlan,
    reorderPlans,
    getShortById,
    createSequence,
    updateSequence,
    deleteSequence,
    assignPlanToSequence,
    setMusicSettings,
    getSequencesByShort,
  } = useShortsStore();

  // Jobs store for QueuePanel integration
  const { jobs, fetchJobs, startPolling } = useJobsStore();

  // Bible store for locations and characters (including generic)
  const { projectAssets, projectGenericAssets, fetchProjectAssets, fetchProjectGenericAssets } = useBibleStore();

  // Project data (includes aspect_ratio)
  const { project } = useProject();
  const aspectRatio: AspectRatio = (project?.aspect_ratio as AspectRatio) || '16:9';

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<Map<string, VideoGenerationProgress>>(new Map());

  // Tab state: 'edition' or 'montage'
  const [activeTab, setActiveTab] = useState<'edition' | 'montage'>('edition');

  // Cinematic mode state
  const [showCinematicWizard, setShowCinematicWizard] = useState(false);
  const [isGeneratingCinematic, setIsGeneratingCinematic] = useState(false);

  // Montage state
  const [isAssembling, setIsAssembling] = useState(false);
  const [assembledVideoUrl, setAssembledVideoUrl] = useState<string | null>(null);
  const [assemblyProgress, setAssemblyProgress] = useState(0);

  // Sequences state (loaded in Edition tab)
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [isLoadingSequences, setIsLoadingSequences] = useState(false);
  // Track COLLAPSED sequences (empty = all expanded by default)
  const [collapsedSequences, setCollapsedSequences] = useState<Set<string>>(new Set());

  // Drag state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Gallery carousel state - use index instead of plan object for smooth sliding
  const [galleryIndex, setGalleryIndex] = useState<number>(-1);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // Fetch shorts if not already loaded
  useEffect(() => {
    if (shorts.length === 0) {
      fetchShorts(projectId);
    }
  }, [projectId, shorts.length, fetchShorts]);

  // Fetch project assets for Bible locations and characters
  useEffect(() => {
    fetchProjectAssets(projectId);
    fetchProjectGenericAssets(projectId);
  }, [projectId, fetchProjectAssets, fetchProjectGenericAssets]);

  // Fetch sequences when page loads
  useEffect(() => {
    if (shortId) {
      fetchSequences();
    }
  }, [shortId]);

  const fetchSequences = async () => {
    setIsLoadingSequences(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/shorts/${shortId}/sequences`);
      if (res.ok) {
        const data = await res.json();
        const seqs = data.sequences || [];
        setSequences(seqs);
        // Expand all sequences by default
        // collapsedSequences starts empty = all expanded by default (no action needed)
      }
    } catch (error) {
      console.error('Error fetching sequences:', error);
    } finally {
      setIsLoadingSequences(false);
    }
  };

  // Extract locations from project assets
  const locations = useMemo(() => {
    return projectAssets
      .filter((asset) => asset.asset_type === 'location')
      .map((asset) => ({
        id: asset.id,
        name: asset.name,
        description: (asset.data as { description?: string })?.description,
      }));
  }, [projectAssets]);

  // Extract characters from project assets AND generic assets (for SegmentEditor dropdown)
  const promptCharacters = useMemo((): PromptCharacterData[] => {
    // Global characters from project_assets
    const globalChars = projectAssets
      .filter((asset) => asset.asset_type === 'character')
      .map((asset) => {
        const data = asset.data as {
          visual_description?: string;
          description?: string;
          fal_voice_id?: string;
        } | null;
        // Fallback: visual_description → description → name
        const visualDescription = data?.visual_description || data?.description || asset.name;
        return {
          id: asset.id,
          name: asset.name,
          visualDescription,
          referenceImages: asset.reference_images || [],
          voiceId: data?.fal_voice_id,
        };
      });

    // Generic characters from project_generic_assets
    // Use project_generic_asset_id (UUID) for uniqueness - multiple FEMME variants can exist
    const genericChars = projectGenericAssets.map((ga) => ({
      id: ga.project_generic_asset_id,  // UUID - unique per imported character
      name: ga.name,  // This is name_override or original name
      // Fallback chain: visual_description > description (user's) > original description > name
      visualDescription: ga.local_overrides?.visual_description
        || ga.local_overrides?.description
        || ga.description
        || ga.name,
      referenceImages: ga.reference_images || [],
      voiceId: ga.local_overrides?.voice_id,
    }));

    return [...globalChars, ...genericChars];
  }, [projectAssets, projectGenericAssets]);

  const short = getShortById(shortId);
  const activeDragPlan = short?.plans.find(p => p.id === activeDragId) || null;

  // Sequence assembly hook (color matching + concatenation per sequence)
  const {
    assemblyStates: sequenceAssemblyStates,
    getSequenceState,
    assembleAll: assembleAllSequences,
    assembleSequence,
    isAssembling: isSequenceAssembling,
    overallProgress: sequenceOverallProgress,
  } = useSequenceAssembly({
    projectId,
    shortId,
    sequences,
    plans: short?.plans || [],
    enabled: false, // Don't auto-assemble, user triggers manually
  });

  // Set title value when short loads
  useEffect(() => {
    if (short) {
      setTitleValue(short.title);
    }
  }, [short]);

  // Load assembled video URL from database (sign b2:// URLs)
  useEffect(() => {
    if (!short?.assembled_video_url) {
      setAssembledVideoUrl(null);
      return;
    }

    const loadAssembledVideo = async () => {
      const url = short.assembled_video_url;

      // If it's a b2:// URL, we need to sign it
      if (url && url.startsWith('b2://')) {
        try {
          const res = await fetch('/api/storage/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: [url] }),
          });

          if (res.ok) {
            const data = await res.json();
            const signedUrl = data.signedUrls?.[url];
            if (signedUrl) {
              setAssembledVideoUrl(signedUrl);
              return;
            }
          }
        } catch (error) {
          console.error('Error signing assembled video URL:', error);
        }
      }

      // Use as-is if not b2:// or signing failed
      setAssembledVideoUrl(url);
    };

    loadAssembledVideo();
  }, [short?.assembled_video_url]);

  const selectedPlan = short?.plans.find((p) => p.id === selectedPlanId) || null;

  // Get the previous plan (for frame continuity feature)
  const previousPlan = useMemo(() => {
    if (!selectedPlan || !short?.plans) return null;
    // Sort plans by sort_order to find the previous one
    const sortedPlans = [...short.plans].sort((a, b) => a.sort_order - b.sort_order);
    const currentIndex = sortedPlans.findIndex((p) => p.id === selectedPlan.id);
    if (currentIndex <= 0) return null; // First plan has no previous
    return sortedPlans[currentIndex - 1];
  }, [selectedPlan, short?.plans]);

  const handleSaveTitle = async () => {
    if (!titleValue.trim()) return;
    await updateShort(projectId, shortId, { title: titleValue.trim() });
    setIsEditingTitle(false);
    toast.success('Titre mis à jour');
  };

  const handleAddPlan = async (sequenceId?: string | null) => {
    const newPlan = await createPlan(projectId, shortId, '', 5, sequenceId);
    if (newPlan) {
      setSelectedPlanId(newPlan.id);
      setIsModalOpen(true);
      toast.success('Plan ajouté');
    }
  };

  const handleEditPlan = (plan: Plan) => {
    setSelectedPlanId(plan.id);
    setIsModalOpen(true);
  };

  const handleUpdatePlan = useCallback(
    (updates: Partial<Plan>) => {
      if (!selectedPlanId) return;
      updatePlan(projectId, selectedPlanId, updates);
    },
    [projectId, selectedPlanId, updatePlan]
  );

  const handleDeletePlan = async (planId: string) => {
    await deletePlan(projectId, planId);
    if (selectedPlanId === planId) {
      setSelectedPlanId(null);
      setIsModalOpen(false);
    }
    toast.success('Plan supprimé');
  };

  const handleReorderPlans = async (orderedIds: string[]) => {
    await reorderPlans(projectId, shortId, orderedIds);
  };

  // Cinematic mode handlers (style is now per-plan, handled in plan editor)
  // Legacy handler for backwards compatibility - will be removed
  const handleCinematicHeaderChange = async (_config: CinematicHeaderConfig) => {
    // Style cinématique is now on each plan, not the short
    // This is kept for backwards compatibility during migration
    toast.info('Le style cinématique se configure maintenant dans chaque plan');
  };

  // Sequence handlers
  const handleCreateSequence = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/shorts/${shortId}/sequences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Séquence ${sequences.length + 1}`,
          sort_order: sequences.length,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSequences(prev => [...prev, data.sequence]);
        toast.success('Séquence créée');
      }
    } catch (error) {
      console.error('Error creating sequence:', error);
      toast.error('Erreur lors de la création');
    }
  };

  // State for sequence cinematic wizard
  const [editingSequenceCinematic, setEditingSequenceCinematic] = useState<string | null>(null);

  const handleUpdateSequence = async (sequenceId: string, updates: Partial<{
    title: string | null;
    cinematic_header: CinematicHeaderConfig | null;
    transition_in: TransitionType | null;
    transition_out: TransitionType | null;
    transition_duration: number;
  }>) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/shorts/${shortId}/sequences/${sequenceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setSequences(prev => prev.map(s => s.id === sequenceId ? { ...s, ...updates } : s));
      }
    } catch (error) {
      console.error('Error updating sequence:', error);
      toast.error('Erreur lors de la mise à jour');
    }
  };

  const handleDeleteSequence = async (sequenceId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/shorts/${shortId}/sequences/${sequenceId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSequences(prev => prev.filter(s => s.id !== sequenceId));
        toast.success('Séquence supprimée');
      }
    } catch (error) {
      console.error('Error deleting sequence:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  // Assign plan to sequence (optimistic update)
  const handleAssignPlanToSequence = async (planId: string, sequenceId: string | null) => {
    // Optimistic update via store
    const { shorts } = useShortsStore.getState();
    const updatedShorts = shorts.map(s => {
      if (s.id !== shortId) return s;
      return {
        ...s,
        plans: s.plans.map(p =>
          p.id === planId ? { ...p, sequence_id: sequenceId } : p
        ),
      };
    });
    useShortsStore.setState({ shorts: updatedShorts });

    try {
      const res = await fetch(`/api/projects/${projectId}/shots/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence_id: sequenceId }),
      });

      if (!res.ok) {
        // Revert on error
        useShortsStore.setState({ shorts });
        toast.error('Erreur lors de l\'assignation');
      }
    } catch (error) {
      // Revert on error
      useShortsStore.setState({ shorts });
      console.error('Error assigning plan to sequence:', error);
      toast.error('Erreur lors de l\'assignation');
    }
  };

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);

    if (!over || !short) return;

    const draggedPlanId = active.id as string;
    const overId = over.id as string;
    const draggedPlan = short.plans.find(p => p.id === draggedPlanId);

    if (!draggedPlan) return;

    // Check if dropped on a sequence container
    if (overId.startsWith('sequence-')) {
      const targetSequenceId = overId.replace('sequence-', '');
      if (draggedPlan.sequence_id !== targetSequenceId) {
        await handleAssignPlanToSequence(draggedPlanId, targetSequenceId);
      }
      return;
    }

    // Check if dropped on rush zone
    if (overId === 'rush-zone') {
      if (draggedPlan.sequence_id) {
        await handleAssignPlanToSequence(draggedPlanId, null);
      }
      return;
    }

    // Check if dropped on another plan - inherit that plan's sequence
    const targetPlan = short.plans.find(p => p.id === overId);
    if (targetPlan) {
      const targetSequenceId = targetPlan.sequence_id;

      // If dropped on a plan in a different sequence (or rush), move to that sequence
      if (draggedPlan.sequence_id !== targetSequenceId) {
        await handleAssignPlanToSequence(draggedPlanId, targetSequenceId);
        return;
      }

      // Same sequence - reorder within sequence
      if (targetSequenceId) {
        const sequencePlans = short.plans
          .filter(p => p.sequence_id === targetSequenceId)
          .sort((a, b) => a.sort_order - b.sort_order);
        const oldIndex = sequencePlans.findIndex(p => p.id === draggedPlanId);
        const newIndex = sequencePlans.findIndex(p => p.id === overId);

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const newOrder = arrayMove(sequencePlans, oldIndex, newIndex);
          await reorderPlans(projectId, shortId, newOrder.map(p => p.id));
        }
      } else {
        // Same in rush - reorder within rush
        const rushPlans = short.plans
          .filter(p => !p.sequence_id)
          .sort((a, b) => a.sort_order - b.sort_order);
        const oldIndex = rushPlans.findIndex(p => p.id === draggedPlanId);
        const newIndex = rushPlans.findIndex(p => p.id === overId);

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const newOrder = arrayMove(rushPlans, oldIndex, newIndex);
          await reorderPlans(projectId, shortId, newOrder.map(p => p.id));
        }
      }
    }
  };

  // Music handlers
  const handleMusicSelect = async (assetId: string | null) => {
    try {
      await updateShort(projectId, shortId, { music_asset_id: assetId });
      toast.success(assetId ? 'Musique sélectionnée' : 'Musique retirée');
    } catch (error) {
      console.error('Error updating music:', error);
      toast.error('Erreur lors de la mise à jour');
    }
  };

  const handleMusicVolumeChange = async (volume: number) => {
    await updateShort(projectId, shortId, { music_volume: volume });
  };

  const handleMusicFadeInChange = async (fadeIn: number) => {
    await updateShort(projectId, shortId, { music_fade_in: fadeIn });
  };

  const handleMusicFadeOutChange = async (fadeOut: number) => {
    await updateShort(projectId, shortId, { music_fade_out: fadeOut });
  };

  // Get plans grouped by sequence for display
  const getPlansForSequence = useCallback((sequenceId: string) => {
    if (!short?.plans) return [];
    return short.plans
      .filter(p => p.sequence_id === sequenceId)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [short?.plans]);

  // Get unassigned plans (not in any sequence)
  const unassignedPlans = useMemo(() => {
    if (!short?.plans) return [];
    return short.plans
      .filter(p => !p.sequence_id)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [short?.plans]);

  // Get all navigable sequences (with assembled video) in display order
  const navigableSequences = useMemo(() => {
    return sequences.filter(seq => {
      // Check if sequence has assembled video (from state or DB)
      const assemblyState = sequenceAssemblyStates.get(seq.id);
      const assembledUrl = assemblyState?.status === 'completed'
        ? assemblyState.assembledVideoUrl
        : seq.assembled_video_url;
      return !!assembledUrl;
    });
  }, [sequences, sequenceAssemblyStates]);

  // Open gallery at specific sequence
  const openGallery = useCallback((sequence: Sequence) => {
    const index = navigableSequences.findIndex(s => s.id === sequence.id);
    if (index !== -1) {
      setGalleryIndex(index);
    }
  }, [navigableSequences]);

  // Close gallery
  const closeGallery = useCallback(() => {
    setGalleryIndex(-1);
  }, []);

  // Navigate to previous/next sequence in fullscreen (no infinite loop)
  const navigateSequence = useCallback((direction: 'prev' | 'next') => {
    if (galleryIndex === -1 || navigableSequences.length <= 1) return;

    // Check bounds - no infinite loop
    if (direction === 'prev' && galleryIndex === 0) return;
    if (direction === 'next' && galleryIndex === navigableSequences.length - 1) return;

    const newIndex = direction === 'prev' ? galleryIndex - 1 : galleryIndex + 1;
    setGalleryIndex(newIndex);
  }, [galleryIndex, navigableSequences]);

  // Keyboard navigation for fullscreen
  useEffect(() => {
    if (galleryIndex === -1) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateSequence('prev');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateSequence('next');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeGallery();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [galleryIndex, navigateSequence, closeGallery]);

  // Check if at boundaries
  const isFirstSequence = galleryIndex === 0;
  const isLastSequence = galleryIndex === navigableSequences.length - 1;

  // Generate all plans (cinematic mega-prompt for each)
  const handleGenerateCinematic = async () => {
    if (!short) return;

    // Validation
    if (short.plans.length === 0) {
      toast.error('Ajoutez au moins un plan');
      return;
    }

    // Check if any plan has segments or content
    const plansWithContent = short.plans.filter(p =>
      (p.segments && p.segments.length > 0) || p.storyboard_image_url || p.animation_prompt
    );
    if (plansWithContent.length === 0) {
      toast.error('Configurez au moins un plan avec du contenu');
      return;
    }

    setIsGeneratingCinematic(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/shorts/${shortId}/generate-cinematic`, {
        method: 'POST',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Erreur lors de la génération');
      }

      toast.success('Génération cinématique démarrée');

      // Refresh jobs
      await fetchJobs();
      startPolling();

    } catch (error) {
      console.error('Cinematic generation error:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la génération');
    } finally {
      setIsGeneratingCinematic(false);
    }
  };

  // Generate video using BullMQ queue
  const handleGenerateVideo = async (
    planId: string,
    options: VideoGenerationOptions
  ) => {
    setIsGeneratingVideo(true);

    // Initialize generation progress for this plan
    setGenerationProgress(prev => {
      const newMap = new Map(prev);
      newMap.set(planId, {
        planId,
        progress: 0,
        step: 'queuing',
        message: 'Mise en file d\'attente...',
        status: 'generating',
        startedAt: Date.now(),
      });
      return newMap;
    });

    try {
      // Use the queue endpoint (supports both standard and cinematic modes)
      const res = await fetch(`/api/projects/${projectId}/shots/${planId}/queue-video`, {
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
        toast.error(errorMessage);
        setIsGeneratingVideo(false);
        setGenerationProgress(prev => {
          const newMap = new Map(prev);
          newMap.delete(planId);
          return newMap;
        });
        return;
      }

      const data = await res.json();
      const jobId = data.jobId;

      if (!jobId) {
        toast.error('Erreur: pas de job ID retourné');
        setIsGeneratingVideo(false);
        setGenerationProgress(prev => {
          const newMap = new Map(prev);
          newMap.delete(planId);
          return newMap;
        });
        return;
      }

      console.log('[Video Gen] Job queued:', jobId);

      // Fetch jobs and start polling
      await fetchJobs();
      startPolling();

      // Show success toast
      toast.success('Génération vidéo ajoutée à la file d\'attente', {
        description: 'Vous pouvez continuer à travailler pendant la génération.',
      });

      // Update progress to show queued state (preserve startedAt)
      setGenerationProgress(prev => {
        const newMap = new Map(prev);
        const existing = prev.get(planId);
        newMap.set(planId, {
          planId,
          progress: 5,
          step: 'queued',
          message: 'En file d\'attente...',
          status: 'generating',
          startedAt: existing?.startedAt || Date.now(),
        });
        return newMap;
      });

      setIsGeneratingVideo(false);

    } catch (error) {
      console.error('Error queuing video:', error);
      toast.error('Erreur lors de la mise en file d\'attente');
      setIsGeneratingVideo(false);
      setGenerationProgress(prev => {
        const newMap = new Map(prev);
        newMap.delete(planId);
        return newMap;
      });
    }
  };

  // Listen for job completion events to update plans and assembly
  useEffect(() => {
    const handleJobCompleted = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        jobId: string;
        assetId: string;
        assetType: string;
        jobType: string;
        jobSubtype: string;
        shotId?: string;
      }>;
      const { assetType, jobType, jobSubtype } = customEvent.detail;

      // Check if this is an assembly job for this short
      if (assetType === 'short' && jobSubtype === 'assembly') {
        console.log('[Assembly] Job completed, fetching result...');

        // Fetch job to get the output URL
        const { jobId } = customEvent.detail;
        try {
          const res = await fetch(`/api/jobs/${jobId}`);
          if (res.ok) {
            const data = await res.json();
            const videoUrl = data.job?.result_data?.outputUrl || data.job?.result_data?.videoUrl;
            if (videoUrl) {
              // Sign the URL if it's b2://
              if (videoUrl.startsWith('b2://')) {
                const signRes = await fetch('/api/storage/sign', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ urls: [videoUrl] }),
                });
                if (signRes.ok) {
                  const signData = await signRes.json();
                  const signedUrl = signData.signedUrls?.[videoUrl];
                  if (signedUrl) {
                    setAssembledVideoUrl(signedUrl);
                  }
                }
              } else {
                setAssembledVideoUrl(videoUrl);
              }
            }
          }
        } catch (error) {
          console.error('[Assembly] Error fetching job result:', error);
        }

        await fetchShorts(projectId);
        setIsAssembling(false);
        setAssemblyProgress(100);
        toast.success('Short assemblé');
        return;
      }

      // Check if this is a sequence assembly job
      if (assetType === 'sequence' && jobSubtype === 'sequence-assembly') {
        console.log('[Sequence Assembly] Job completed, refreshing sequences...');
        // Refetch sequences to get updated assembled_video_url
        try {
          const res = await fetch(`/api/projects/${projectId}/shorts/${shortId}/sequences`);
          if (res.ok) {
            const data = await res.json();
            setSequences(data.sequences || []);
          }
        } catch (error) {
          console.error('Error refetching sequences:', error);
        }
        return;
      }

      // Check if this is a video job for a shot
      if (assetType !== 'shot' || jobType !== 'video') return;

      console.log('[Video Gen] Job completed, refreshing plans...');

      // Refresh shorts data to get updated video URLs
      await fetchShorts(projectId);

      // Clear generation progress for all plans (the updated data will show the video)
      setGenerationProgress(new Map());
    };

    const handleJobFailed = (event: Event) => {
      const customEvent = event as CustomEvent<{
        jobId: string;
        assetId: string;
        assetType: string;
        jobType: string;
        jobSubtype: string;
        shotId?: string;
        assetName?: string;
        errorMessage: string;
      }>;
      const { assetType, jobType, jobSubtype, shotId, assetName, errorMessage } = customEvent.detail;

      // Check if this is a video job for a shot
      if (assetType === 'shot' && jobType === 'video' && shotId) {
        console.log('[Video Gen] Job failed for shot:', shotId, errorMessage);

        // Clear generation progress for this shot
        setGenerationProgress(prev => {
          const newMap = new Map(prev);
          newMap.delete(shotId);
          return newMap;
        });

        // Show error toast
        toast.error(`Échec de la génération vidéo`, {
          description: assetName ? `${assetName}: ${errorMessage}` : errorMessage,
        });
      }

      // Check if this is an assembly job
      if (assetType === 'short' && jobSubtype === 'assembly') {
        console.log('[Assembly] Job failed:', errorMessage);
        setIsAssembling(false);
        setAssemblyProgress(0);
        toast.error('Échec de l\'assemblage', { description: errorMessage });
      }
    };

    window.addEventListener('job-completed', handleJobCompleted);
    window.addEventListener('job-failed', handleJobFailed);

    return () => {
      window.removeEventListener('job-completed', handleJobCompleted);
      window.removeEventListener('job-failed', handleJobFailed);
    };
  }, [projectId, shortId, fetchShorts]);

  // Sync job progress from jobs store to generationProgress map
  useEffect(() => {
    if (!short?.plans) return;

    const planIds = new Set(short.plans.map(p => p.id));

    // Find active video jobs for plans in this short
    const activeVideoJobs = jobs.filter(job =>
      job.job_type === 'video' &&
      job.asset_type === 'shot' &&
      ['pending', 'queued', 'running'].includes(job.status) &&
      planIds.has((job.input_data as { shotId?: string })?.shotId || '')
    );

    if (activeVideoJobs.length === 0) return;

    // Update progress map with real job progress
    setGenerationProgress(prev => {
      const newMap = new Map(prev);

      for (const job of activeVideoJobs) {
        const shotId = (job.input_data as { shotId?: string })?.shotId;
        if (!shotId) continue;

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
  }, [jobs, short?.plans]);

  // Sync assembly job progress from jobs store
  useEffect(() => {
    if (!shortId) return;

    // Find active assembly job for this short
    const assemblyJob = jobs.find(job =>
      job.job_type === 'video' &&
      job.asset_type === 'short' &&
      job.job_subtype === 'assembly' &&
      ['pending', 'queued', 'running'].includes(job.status) &&
      (job.input_data as { shortId?: string })?.shortId === shortId
    );

    if (assemblyJob) {
      setIsAssembling(true);
      setAssemblyProgress(assemblyJob.progress);
    }
  }, [jobs, shortId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!short) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <p className="text-slate-400 mb-4">Short non trouvé</p>
        <Button
          variant="outline"
          onClick={() => router.push(`/project/${projectId}/shorts`)}
          className="border-white/10 text-white hover:bg-white/5"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour aux shorts
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Compact Header with integrated tabs - same as Timeline */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/project/${projectId}/shorts`)}
            className="text-slate-400 hover:text-white h-8 w-8"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          {/* Title - compact and editable */}
          {isEditingTitle ? (
            <input
              type="text"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              size={Math.max(titleValue.length, 10)}
              className="bg-transparent text-base font-medium text-white outline-none border-b border-blue-500/50 focus:border-blue-500 transition-colors"
              autoFocus
              onFocus={(e) => e.target.select()}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
                if (e.key === 'Escape') {
                  setTitleValue(short.title);
                  setIsEditingTitle(false);
                }
              }}
            />
          ) : (
            <h1
              className="text-base font-medium text-white cursor-text hover:text-blue-300 transition-colors"
              onClick={() => setIsEditingTitle(true)}
            >
              {short.title}
            </h1>
          )}

          {/* Compact info badges */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{short.plans.length} plans</span>
            <span>•</span>
            <span>{formatDuration(short.totalDuration)}</span>
            <span>•</span>
            <span>{aspectRatio}</span>
          </div>

          {/* Separator */}
          <div className="w-px h-5 bg-white/10 mx-2" />

          {/* Integrated Tab Switch */}
          <div className="inline-flex rounded-md bg-white/5 p-0.5">
            <button
              onClick={() => setActiveTab('edition')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all",
                activeTab === 'edition'
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:text-white"
              )}
            >
              <Pencil className="w-3 h-3" />
              Édition
            </button>
            <button
              onClick={() => router.push(`/project/${projectId}/shorts/${shortId}/timeline`)}
              className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all text-slate-400 hover:text-white"
            >
              <Layers className="w-3 h-3" />
              Timeline
            </button>
          </div>
        </div>

        {/* Right side - only cinematic badge */}
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 text-xs font-medium">
          <Sparkles className="w-3 h-3" />
          Cinématique
        </div>
      </div>

      {/* Main content */}
      {activeTab === 'edition' ? (
      /* EDITION TAB - Séquences/Plans left, Preview right */
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
      <div className="flex-1 flex flex-col gap-4 min-h-0 p-4">
        {/* Two columns layout */}
        <div className="flex-1 flex gap-4 min-h-0">

        {/* LEFT: Sequences + Plans hierarchical */}
        <div className="w-[340px] flex-shrink-0 rounded-xl bg-[#151d28] border border-white/5 p-4 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Plans
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateSequence}
              className="h-7 gap-1 text-xs bg-[#0d1218] border-white/10 hover:bg-[#1a2433] text-slate-300"
            >
              <Plus className="w-3 h-3" />
              Séq
            </Button>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-3">
            {/* Sequences with full SequenceCard (includes transition controls) */}
            {sequences.map((sequence) => {
              const sequencePlans = getPlansForSequence(sequence.id);
              // Expanded = NOT in the collapsed set
              const isExpanded = !collapsedSequences.has(sequence.id);
              return (
                <DroppableSequence key={sequence.id} sequence={sequence}>
                  <SequenceCard
                    sequence={sequence}
                    plans={sequencePlans}
                    isExpanded={isExpanded}
                    onToggleExpand={() => {
                      setCollapsedSequences(prev => {
                        const next = new Set(prev);
                        if (next.has(sequence.id)) {
                          // Was collapsed, now expand (remove from collapsed set)
                          next.delete(sequence.id);
                        } else {
                          // Was expanded, now collapse (add to collapsed set)
                          next.add(sequence.id);
                        }
                        return next;
                      });
                    }}
                    onUpdateSequence={(updates) => handleUpdateSequence(sequence.id, updates)}
                    onDeleteSequence={() => handleDeleteSequence(sequence.id)}
                    onSelectPlan={(planId) => {
                      setSelectedPlanId(planId);
                      setIsModalOpen(true);
                    }}
                    onEditPlan={(planId) => {
                      setSelectedPlanId(planId);
                      setIsModalOpen(true);
                    }}
                    onDeletePlan={handleDeletePlan}
                    onAddPlan={() => handleAddPlan(sequence.id)}
                    onOpenCinematicWizard={() => setEditingSequenceCinematic(sequence.id)}
                    selectedPlanId={selectedPlanId || undefined}
                    projectId={projectId}
                    shortId={shortId}
                  />
                </DroppableSequence>
              );
            })}

            {/* Rush - unassigned plans */}
            <DroppableRush>
              <div className="rounded-lg border border-dashed border-white/10 overflow-hidden">
                <div className="flex items-center gap-2 px-2 py-1.5 bg-[#0a0f14]/50">
                  <Film className="w-3 h-3 text-slate-500" />
                  <span className="text-xs font-medium text-slate-400">Rush</span>
                  <span className="text-[10px] text-slate-600">
                    ({unassignedPlans.length})
                  </span>
                  <div className="flex-1" />
                  {/* Add Plan to Rush button */}
                  <button
                    onClick={() => handleAddPlan(null)}
                    className="p-1 rounded transition-all text-slate-500 hover:text-blue-400 hover:bg-blue-500/10"
                    title="Ajouter un plan au rush"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <div className="p-1.5 space-y-1">
                  <SortableContext items={unassignedPlans.map(p => p.id)} strategy={verticalListSortingStrategy}>
                    {unassignedPlans.length === 0 ? (
                      <div className="text-center py-3 text-[10px] text-slate-600">
                        Glissez des plans ici
                      </div>
                    ) : (
                      unassignedPlans.map((plan) => (
                        <SortablePlanItem
                          key={plan.id}
                          plan={plan}
                          selectedPlanId={selectedPlanId}
                          onSelect={(planId) => {
                            setSelectedPlanId(planId);
                            setIsModalOpen(true);
                          }}
                          onDelete={handleDeletePlan}
                        />
                      ))
                    )}
                  </SortableContext>
                </div>
              </div>
            </DroppableRush>
          </div>
        </div>

        {/* RIGHT: Storyboard view - Horizontal layout */}
        <div className="flex-1 rounded-xl bg-[#151d28] border border-white/5 p-4 flex flex-col overflow-hidden">
          <h2 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider flex items-center gap-2">
            <Film className="w-4 h-4" />
            Storyboard
          </h2>

          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            {/* All sequences + rush in one horizontal row */}
            <div className="flex gap-6 h-full items-start pb-4">
              {/* Sequences - one card per sequence */}
              {sequences.map((sequence) => {
                const sequencePlans = getPlansForSequence(sequence.id);
                if (sequencePlans.length === 0) return null;

                const assemblyState = getSequenceState(sequence.id);
                const isCompiling = assemblyState?.status === 'checking' || assemblyState?.status === 'queued' || assemblyState?.status === 'assembling';
                const assembledUrl = assemblyState?.status === 'completed'
                  ? assemblyState.assembledVideoUrl
                  : sequence.assembled_video_url;
                const hasAllVideos = sequencePlans.every(p => p.generated_video_url);
                const videoCount = sequencePlans.filter(p => p.generated_video_url).length;

                return (
                  <div key={sequence.id} className="flex-shrink-0 relative">
                    <SequenceClip
                      sequence={sequence}
                      plans={sequencePlans}
                      aspectRatio={aspectRatio}
                      assembledVideoUrl={assembledUrl}
                      assemblyProgress={isCompiling ? assemblyState?.progress : undefined}
                      onOpenGallery={assembledUrl ? () => openGallery(sequence) : undefined}
                    />
                    {/* Compile overlay - show when not assembled and has videos */}
                    {!assembledUrl && !isCompiling && videoCount > 0 && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg">
                        <Button
                          size="sm"
                          onClick={() => assembleSequence(sequence.id)}
                          className="bg-purple-600 hover:bg-purple-700 text-white"
                        >
                          <Clapperboard className="w-4 h-4 mr-1.5" />
                          Compiler
                          <span className="ml-1.5 text-xs opacity-75">({videoCount})</span>
                        </Button>
                      </div>
                    )}
                    {/* No videos yet */}
                    {videoCount === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg">
                        <span className="text-xs text-slate-400">Générez des vidéos</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Rush section */}
              {unassignedPlans.length > 0 && (
                <div className="flex-shrink-0 flex flex-col gap-2 opacity-70">
                  {/* Rush header */}
                  <div className="flex items-center gap-2 px-1">
                    <Film className="w-3 h-3 text-slate-500" />
                    <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                      Rush ({unassignedPlans.length})
                    </span>
                  </div>
                  {/* Rush plans - horizontal */}
                  <div className="flex gap-3">
                    {unassignedPlans.map((plan) => (
                      <StoryboardPlanCard
                        key={plan.id}
                        plan={plan}
                        aspectRatio={aspectRatio}
                        isSelected={selectedPlanId === plan.id}
                        isGenerating={generationProgress.has(plan.id)}
                        isRush
                        onSelect={() => {
                          setSelectedPlanId(plan.id);
                          setIsModalOpen(true);
                        }}
                        onExpand={() => {
                          // Rush plans don't have sequences, just open editor
                          setSelectedPlanId(plan.id);
                          setIsModalOpen(true);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {short.plans.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-600 py-12 min-w-[300px]">
                  <Film className="w-12 h-12 opacity-20 mb-3" />
                  <p className="text-sm">Aucun plan</p>
                  <p className="text-xs mt-1">Ajoutez des plans pour créer votre storyboard</p>
                </div>
              )}
            </div>
          </div>
        </div>

        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeDragPlan && (
          <div className="opacity-90 pointer-events-none shadow-xl">
            <PlanCard
              plan={activeDragPlan}
              isSelected={false}
              onSelect={() => {}}
              onEdit={() => {}}
              onDelete={() => {}}
              compact
            />
          </div>
        )}
      </DragOverlay>
      </DndContext>
      ) : (
      /* MONTAGE TAB - Storyboard + Timeline + Preview */
      <MontageEditor
        short={short}
        sequences={sequences}
        aspectRatio={aspectRatio}
        assembledVideoUrl={assembledVideoUrl}
        isAssembling={isAssembling}
        assemblyProgress={assemblyProgress}
        sequenceAssemblyStates={sequenceAssemblyStates}
        isSequenceAssembling={isSequenceAssembling}
        sequenceOverallProgress={sequenceOverallProgress}
        onAssemble={async () => {
          setIsAssembling(true);
          setAssemblyProgress(0);

          try {
            const res = await fetch(`/api/projects/${projectId}/shorts/${shortId}/assemble-v2`, {
              method: 'POST',
            });

            if (!res.ok) {
              const error = await res.json();
              throw new Error(error.error || 'Failed to start assembly');
            }

            const data = await res.json();
            const jobId = data.jobId;

            if (!jobId) {
              throw new Error('No job ID returned');
            }

            toast.success('Assemblage Editly ajouté à la file d\'attente');
            await fetchJobs();
            startPolling();

          } catch (error) {
            console.error('Assembly error:', error);
            toast.error(error instanceof Error ? error.message : 'Erreur lors de l\'assemblage');
            setIsAssembling(false);
          }
        }}
        onDownload={() => {
          if (!assembledVideoUrl) return;
          const filename = `${short.title.replace(/\s+/g, '-').toLowerCase()}.mp4`;
          const downloadUrl = `/api/download?url=${encodeURIComponent(assembledVideoUrl)}&filename=${encodeURIComponent(filename)}`;
          const iframe = document.createElement('iframe');
          iframe.style.display = 'none';
          iframe.src = downloadUrl;
          document.body.appendChild(iframe);
          setTimeout(() => document.body.removeChild(iframe), 5000);
        }}
      />
      )}

      {/* Fullscreen Gallery Carousel - Sequences */}
      {galleryIndex !== -1 && navigableSequences.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/95 overflow-hidden"
          onClick={closeGallery}
        >
          {/* Close button */}
          <button
            onClick={closeGallery}
            className="absolute top-4 right-4 z-30 w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>

          {/* Download button for current sequence */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const currentSequence = navigableSequences[galleryIndex];
              if (!currentSequence) return;
              const assemblyState = sequenceAssemblyStates.get(currentSequence.id);
              const url = assemblyState?.status === 'completed'
                ? assemblyState.assembledVideoUrl
                : currentSequence.assembled_video_url;
              if (!url) return;
              const filename = `${currentSequence.title || `sequence-${currentSequence.sort_order + 1}`}.mp4`;
              const downloadUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
              const iframe = document.createElement('iframe');
              iframe.style.display = 'none';
              iframe.src = downloadUrl;
              document.body.appendChild(iframe);
              setTimeout(() => document.body.removeChild(iframe), 5000);
            }}
            className="absolute top-4 left-4 z-30 w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors"
            title="Télécharger"
          >
            <Download className="w-5 h-5 text-white" />
          </button>

          {/* Sliding carousel track */}
          <div className="absolute inset-0 flex items-center overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div
              className="flex items-center gap-10 transition-transform duration-300 ease-out"
              style={{
                // Each slide is slideWidth + gap, center the current slide
                transform: `translateX(calc(50vw - ${galleryIndex} * (${
                  aspectRatio === '9:16' || aspectRatio === '4:5' || aspectRatio === '2:3'
                    ? 'min(40vw, 400px) + 40px'
                    : 'min(55vw, 650px) + 40px'
                }) - ${
                  aspectRatio === '9:16' || aspectRatio === '4:5' || aspectRatio === '2:3'
                    ? 'min(20vw, 200px)'
                    : 'min(27.5vw, 325px)'
                }))`,
              }}
            >
              {navigableSequences.map((sequence, index) => (
                <div
                  key={sequence.id}
                  style={{
                    width: aspectRatio === '9:16' || aspectRatio === '4:5' || aspectRatio === '2:3'
                      ? 'min(40vw, 400px)'
                      : 'min(55vw, 650px)',
                  }}
                  onClick={() => {
                    if (index !== galleryIndex) {
                      setGalleryIndex(index);
                    }
                  }}
                  className={index !== galleryIndex ? 'cursor-pointer' : ''}
                >
                  <GallerySequenceSlide
                    sequence={sequence}
                    isCurrent={index === galleryIndex}
                    sequenceAssemblyStates={sequenceAssemblyStates}
                    getPlansForSequence={getPlansForSequence}
                    aspectRatio={aspectRatio}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Navigation arrows - hidden at boundaries */}
          {!isFirstSequence && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigateSequence('prev');
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors"
              title="Séquence précédente (←)"
            >
              <ChevronLeft className="w-6 h-6 text-white" />
            </button>
          )}
          {!isLastSequence && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigateSequence('next');
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors"
              title="Séquence suivante (→)"
            >
              <ChevronRight className="w-6 h-6 text-white" />
            </button>
          )}

          {/* Bottom bar: counter + navigation hint */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2">
            {/* Counter */}
            {navigableSequences.length > 1 && (
              <div className="px-3 py-1 rounded-full bg-white/10 backdrop-blur text-white text-sm">
                {galleryIndex + 1} / {navigableSequences.length}
              </div>
            )}
            {/* Hint */}
            <div className="text-slate-500 text-xs flex items-center gap-3">
              <span>← → Navigation</span>
              <span>•</span>
              <span>Échap pour fermer</span>
            </div>
          </div>
        </div>
      )}

      {/* Cinematic Header Wizard - Short level (legacy) */}
      {short && (
        <CinematicHeaderWizard
          open={showCinematicWizard}
          onOpenChange={setShowCinematicWizard}
          value={short.cinematic_header as CinematicHeaderConfig | null}
          onChange={handleCinematicHeaderChange}
          projectId={projectId}
          characters={promptCharacters}
          targetModel="kling-omni"
        />
      )}

      {/* Cinematic Header Wizard - Sequence level */}
      {editingSequenceCinematic && (() => {
        const editingSeq = sequences.find(s => s.id === editingSequenceCinematic);
        if (!editingSeq) return null;
        // Other sequences to copy from (excluding the one being edited)
        const otherSeqs = sequences.filter(s => s.id !== editingSequenceCinematic);
        // Get segments from all plans in this sequence
        const sequencePlans = short?.plans.filter(p => p.sequence_id === editingSequenceCinematic) || [];
        const sequenceSegments = sequencePlans.flatMap(p => p.segments || []);
        // Check if any plan has a start frame
        const hasStartFrame = sequencePlans.some(p => p.first_frame_url || p.storyboard_image_url);
        return (
          <CinematicHeaderWizard
            open={true}
            onOpenChange={(open) => {
              if (!open) setEditingSequenceCinematic(null);
            }}
            value={editingSeq.cinematic_header}
            onChange={(config) => {
              handleUpdateSequence(editingSequenceCinematic, { cinematic_header: config });
              setEditingSequenceCinematic(null);
            }}
            projectId={projectId}
            otherSequences={otherSeqs}
            characters={promptCharacters}
            segments={sequenceSegments}
            hasStartFrame={hasStartFrame}
            targetModel="kling-omni"
          />
        );
      })()}

      {/* Plan Editor Modal */}
      {selectedPlan && (() => {
        // Find the sequence this plan belongs to
        const planSequence = sequences.find(s => s.id === selectedPlan.sequence_id);
        return (
          <PlanEditor
            open={isModalOpen}
            onOpenChange={setIsModalOpen}
            mode="video-free"
            plan={{
              id: selectedPlan.id,
              number: selectedPlan.shot_number,
              duration: selectedPlan.duration,
              storyboard_image_url: selectedPlan.storyboard_image_url,
              first_frame_url: selectedPlan.first_frame_url,
              last_frame_url: selectedPlan.last_frame_url,
              animation_prompt: selectedPlan.animation_prompt,
              description: selectedPlan.description,
              shot_type: selectedPlan.shot_type,
              camera_angle: selectedPlan.camera_angle,
              camera_movement: selectedPlan.camera_movement,
              has_dialogue: selectedPlan.has_dialogue,
              dialogue_text: selectedPlan.dialogue_text,
              dialogue_character_id: selectedPlan.dialogue_character_id,
              audio_mode: selectedPlan.audio_mode,
              audio_asset_id: selectedPlan.audio_asset_id,
              audio_start: selectedPlan.audio_start,
              audio_end: selectedPlan.audio_end,
              generated_video_url: selectedPlan.generated_video_url,
              video_rushes: selectedPlan.video_rushes,
              // New segment-based fields
              title: selectedPlan.title,
              segments: selectedPlan.segments,
            }}
            previousPlan={previousPlan ? {
              id: previousPlan.id,
              duration: previousPlan.duration,
              storyboard_image_url: previousPlan.storyboard_image_url,
              first_frame_url: previousPlan.first_frame_url,
              last_frame_url: previousPlan.last_frame_url,
              generated_video_url: previousPlan.generated_video_url,
            } : null}
            projectId={projectId}
            aspectRatio={aspectRatio}
            locations={locations}
            sequenceCinematicHeader={planSequence?.cinematic_header}
            sequenceTitle={planSequence?.title || `Séquence ${(planSequence?.sort_order ?? 0) + 1}`}
            onUpdate={(updates: Partial<PlanData>) => {
              // Convert PlanData (null | undefined) to Plan (undefined only)
              const planUpdates: Partial<Plan> = {};
              for (const [key, value] of Object.entries(updates)) {
                (planUpdates as Record<string, unknown>)[key] = value === null ? undefined : value;
              }
              handleUpdatePlan(planUpdates);
            }}
            onGenerateVideo={handleGenerateVideo}
            isGeneratingVideo={isGeneratingVideo}
            videoGenerationProgress={selectedPlanId ? generationProgress.get(selectedPlanId) : undefined}
          />
        );
      })()}
    </div>
  );
}
