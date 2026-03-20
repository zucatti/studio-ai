'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlanTimeline } from '@/components/shorts/PlanTimeline';
import { PlanEditorModal, type GenerationOptions, type VideoGenerationOptions } from '@/components/shorts/PlanEditorModal';
import { ProjectBibleButton } from '@/components/bible/ProjectBible';
import { formatDuration } from '@/components/shorts/DurationPicker';
import { useShortsStore, type Plan } from '@/store/shorts-store';
import type { AspectRatio } from '@/types/database';
import {
  ArrowLeft,
  Loader2,
  Clock,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

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
  } = useShortsStore();

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [isGeneratingFrames, setIsGeneratingFrames] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');

  // Fetch project to get aspect ratio
  useEffect(() => {
    const fetchProject = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (res.ok) {
          const data = await res.json();
          setAspectRatio(data.project?.aspect_ratio || '9:16');
        }
      } catch (error) {
        console.error('Error fetching project:', error);
      }
    };
    fetchProject();
  }, [projectId]);

  // Fetch shorts if not already loaded
  useEffect(() => {
    if (shorts.length === 0) {
      fetchShorts(projectId);
    }
  }, [projectId, shorts.length, fetchShorts]);

  const short = getShortById(shortId);

  // Set title value when short loads
  useEffect(() => {
    if (short) {
      setTitleValue(short.title);
    }
  }, [short]);

  const selectedPlan = short?.plans.find((p) => p.id === selectedPlanId) || null;

  const handleSaveTitle = async () => {
    if (!titleValue.trim()) return;
    await updateShort(projectId, shortId, { title: titleValue.trim() });
    setIsEditingTitle(false);
    toast.success('Titre mis à jour');
  };

  const handleAddPlan = async () => {
    const newPlan = await createPlan(projectId, shortId, '', 5);
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

  // Generate frames (first, last, or both)
  const handleGenerateFrames = async (
    planId: string,
    frameType: 'first' | 'last' | 'both',
    options: GenerationOptions
  ) => {
    setIsGeneratingFrames(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/shots/${planId}/generate-frames`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frameType,
          visualStyle: options.visualStyle,
          imageModel: options.imageModel,
          resolution: options.resolution,
        }),
      });

      if (res.ok) {
        const data = await res.json();

        // Update plan with generated frames
        const updates: Partial<Plan> = {
          generation_status: 'completed',
        };

        if (data.firstFrame) {
          updates.storyboard_image_url = data.firstFrame;
          updates.first_frame_url = data.firstFrame;
        }
        if (data.lastFrame) {
          updates.last_frame_url = data.lastFrame;
        }

        updatePlan(projectId, planId, updates);
      } else {
        const error = await res.json();
        toast.error(error.error || 'Erreur lors de la génération');
      }
    } catch (error) {
      console.error('Error generating frames:', error);
      toast.error('Erreur lors de la génération');
    } finally {
      setIsGeneratingFrames(false);
    }
  };

  // Generate video from frames (via PiAPI)
  const handleGenerateVideo = async (
    planId: string,
    options: VideoGenerationOptions
  ) => {
    setIsGeneratingVideo(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/shots/${planId}/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.videoModel, // kling-omni, seedance-2, sora-2, veo-3, etc.
          duration: options.duration,
        }),
      });

      if (res.ok) {
        const data = await res.json();

        // Update plan with generated video
        updatePlan(projectId, planId, {
          generated_video_url: data.videoUrl,
          generation_status: 'completed',
        });

        toast.success('Vidéo générée');
      } else {
        const error = await res.json();
        toast.error(error.error || 'Erreur lors de la génération');
      }
    } catch (error) {
      console.error('Error generating video:', error);
      toast.error('Erreur lors de la génération');
    } finally {
      setIsGeneratingVideo(false);
    }
  };

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
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/project/${projectId}/shorts`)}
            className="text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <div>
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <Input
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  className="bg-white/5 border-white/10 text-white text-xl font-bold h-10 w-64"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') {
                      setTitleValue(short.title);
                      setIsEditingTitle(false);
                    }
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleSaveTitle}
                  className="text-green-400 hover:text-green-300"
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setTitleValue(short.title);
                    setIsEditingTitle(false);
                  }}
                  className="text-slate-400 hover:text-slate-300"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-white">{short.title}</h1>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setIsEditingTitle(true)}
                  className="text-slate-400 hover:text-white h-8 w-8"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              </div>
            )}
            <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
              <span>{short.plans.length} plan{short.plans.length !== 1 ? 's' : ''}</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {formatDuration(short.totalDuration)}
              </span>
              <span className="px-2 py-0.5 rounded bg-white/5 text-xs">
                {aspectRatio}
              </span>
            </div>
          </div>
        </div>

        <ProjectBibleButton projectId={projectId} />
      </div>

      {/* Timeline - full width */}
      <div className="rounded-xl bg-[#151d28] border border-white/5 p-6">
        <h2 className="text-sm font-medium text-slate-400 mb-4 uppercase tracking-wider">
          Timeline
        </h2>
        <PlanTimeline
          plans={short.plans}
          selectedPlanId={selectedPlanId}
          onSelectPlan={(id) => {
            setSelectedPlanId(id);
            if (id) setIsModalOpen(true);
          }}
          onEditPlan={handleEditPlan}
          onDeletePlan={handleDeletePlan}
          onReorder={handleReorderPlans}
          onAddPlan={handleAddPlan}
        />
      </div>

      {/* Plan Editor Modal */}
      <PlanEditorModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        plan={selectedPlan}
        projectId={projectId}
        aspectRatio={aspectRatio}
        onUpdate={handleUpdatePlan}
        onGenerateFrames={handleGenerateFrames}
        onGenerateVideo={handleGenerateVideo}
        isGeneratingFrames={isGeneratingFrames}
        isGeneratingVideo={isGeneratingVideo}
      />
    </div>
  );
}
