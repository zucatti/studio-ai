'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PlanTimeline } from '@/components/shorts/PlanTimeline';
import { PlanEditor, type VideoGenerationOptions, type PlanData } from '@/components/plan-editor';
import { VideoGenerationCard, type VideoGenerationProgress } from '@/components/shorts/VideoGenerationCard';
import { VideoCard } from '@/components/shorts/VideoCard';
import { ProjectBibleButton } from '@/components/bible/ProjectBible';
import { formatDuration } from '@/components/shorts/DurationPicker';
import { useShortsStore, type Plan } from '@/store/shorts-store';
import { useJobsStore } from '@/store/jobs-store';
import type { AspectRatio } from '@/types/database';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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

  // Jobs store for QueuePanel integration
  const { jobs, fetchJobs, startPolling } = useJobsStore();

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [expandedVideo, setExpandedVideo] = useState<Plan | null>(null);
  const [generationProgress, setGenerationProgress] = useState<Map<string, VideoGenerationProgress>>(new Map());

  // Tab state: 'edition' or 'montage'
  const [activeTab, setActiveTab] = useState<'edition' | 'montage'>('edition');

  // Montage state
  const [isAssembling, setIsAssembling] = useState(false);
  const [assembledVideoUrl, setAssembledVideoUrl] = useState<string | null>(null);
  const [assemblyProgress, setAssemblyProgress] = useState(0);

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
      });
      return newMap;
    });

    try {
      // Use the queue endpoint instead of SSE
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

      // Update progress to show queued state
      setGenerationProgress(prev => {
        const newMap = new Map(prev);
        newMap.set(planId, {
          planId,
          progress: 5,
          step: 'queued',
          message: 'En file d\'attente...',
          status: 'generating',
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
        console.log('[Assembly] Job completed, refreshing shorts...');
        await fetchShorts(projectId);
        setIsAssembling(false);
        setAssemblyProgress(100);
        toast.success('Short assemblé');
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

    window.addEventListener('job-completed', handleJobCompleted);

    return () => {
      window.removeEventListener('job-completed', handleJobCompleted);
    };
  }, [projectId, fetchShorts]);

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
    <div className="h-full flex flex-col overflow-hidden -my-6 py-6">
      {/* Header */}
      <div className="flex-shrink-0 flex items-start justify-between pb-4">
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
              <input
                type="text"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                size={Math.max(titleValue.length, 10)}
                className="bg-transparent text-2xl font-bold text-white outline-none border-b-2 border-blue-500/50 focus:border-blue-500 transition-colors min-w-[200px]"
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
                className="text-2xl font-bold text-white cursor-text hover:text-blue-300 transition-colors"
                onClick={() => setIsEditingTitle(true)}
              >
                {short.title}
              </h1>
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

        <div className="flex items-center gap-3">
          <ProjectBibleButton projectId={projectId} />
        </div>
      </div>

      {/* Tab group button */}
      <div className="flex-shrink-0 pb-4">
        <div className="inline-flex rounded-lg bg-white/5 p-1">
          <button
            onClick={() => setActiveTab('edition')}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
              activeTab === 'edition'
                ? "bg-white/10 text-white"
                : "text-slate-400 hover:text-white"
            )}
          >
            <Pencil className="w-3.5 h-3.5" />
            Édition
          </button>
          <button
            onClick={() => setActiveTab('montage')}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
              activeTab === 'montage'
                ? "bg-white/10 text-white"
                : "text-slate-400 hover:text-white"
            )}
          >
            <Clapperboard className="w-3.5 h-3.5" />
            Montage
          </button>
        </div>
      </div>

      {/* Main content */}
      {activeTab === 'edition' ? (
      /* EDITION TAB - Two columns */
      <div className="flex-1 flex gap-6 min-h-0">
        {/* LEFT: Timeline - compact */}
        <div className="w-[320px] flex-shrink-0 rounded-xl bg-[#151d28] border border-white/5 p-4 flex flex-col overflow-hidden">
          <h2 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider flex items-center gap-2">
            <Film className="w-4 h-4" />
            Timeline
          </h2>
          <div className="flex-1 overflow-y-auto">
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
              compact
            />
          </div>
        </div>

        {/* RIGHT: Generated Videos */}
        <div className="flex-1 rounded-xl bg-[#151d28] border border-white/5 p-4 flex flex-col overflow-hidden">
          <h2 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider flex items-center gap-2">
            <Video className="w-4 h-4" />
            Vidéos générées
          </h2>

          {/* Video grid */}
          <div className="flex-1 overflow-y-auto">
            {short.plans.filter(p => p.generated_video_url).length === 0 && generationProgress.size === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <Video className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">Aucune vidéo générée</p>
                <p className="text-xs mt-1">Sélectionnez un plan et générez une vidéo</p>
              </div>
            ) : (
              <div className={cn(
                "grid gap-4",
                // Adapt grid based on aspect ratio
                aspectRatio === '9:16' || aspectRatio === '4:5' || aspectRatio === '2:3'
                  ? "grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" // Portrait: more columns
                  : "grid-cols-2 xl:grid-cols-3" // Landscape: fewer columns
              )}>
                {/* Plans currently being generated */}
                {short.plans
                  .filter(p => generationProgress.has(p.id))
                  .map((plan) => {
                    const progress = generationProgress.get(plan.id)!;
                    return (
                      <div key={`gen-${plan.id}`} className="relative">
                        <VideoGenerationCard
                          progress={progress}
                          aspectRatio={aspectRatio}
                        />
                        {/* Plan info overlay */}
                        <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-xs text-white font-medium">
                          Plan {plan.shot_number}
                        </div>
                      </div>
                    );
                  })}

                {/* Plans with generated videos (exclude those currently generating) */}
                {short.plans
                  .filter(p => p.generated_video_url && !generationProgress.has(p.id))
                  .map((plan) => (
                    <VideoCard
                      key={plan.id}
                      videoUrl={plan.generated_video_url!}
                      thumbnailUrl={plan.storyboard_image_url || undefined}
                      title={`Plan ${plan.shot_number}`}
                      subtitle={`${plan.duration}s`}
                      aspectRatio={aspectRatio}
                      onExpand={() => setExpandedVideo(plan)}
                      onDownload={() => {
                        const filename = `plan-${plan.shot_number}.mp4`;
                        const downloadUrl = `/api/download?url=${encodeURIComponent(plan.generated_video_url!)}&filename=${encodeURIComponent(filename)}`;
                        const iframe = document.createElement('iframe');
                        iframe.style.display = 'none';
                        iframe.src = downloadUrl;
                        document.body.appendChild(iframe);
                        setTimeout(() => document.body.removeChild(iframe), 5000);
                      }}
                    />
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
      ) : (
      /* MONTAGE TAB - Centered video frame */
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 py-8">
        {/* Video frame container */}
        <div
          className={cn(
            "relative rounded-xl overflow-hidden border-2 transition-all",
            isAssembling
              ? "border-blue-500/50"
              : assembledVideoUrl
                ? "border-white/10"
                : "border-dashed border-white/10"
          )}
          style={{
            width: aspectRatio === '9:16' ? '280px'
                 : aspectRatio === '1:1' ? '400px'
                 : '500px',
            aspectRatio: aspectRatio === '9:16' ? '9/16'
                       : aspectRatio === '1:1' ? '1/1'
                       : '16/9',
          }}
        >
          {assembledVideoUrl && !isAssembling ? (
            /* Show assembled video */
            <VideoCard
              videoUrl={assembledVideoUrl}
              aspectRatio={aspectRatio}
              autoPlay={false}
              onDownload={() => {
                const filename = `${short.title.replace(/\s+/g, '-').toLowerCase()}.mp4`;
                const downloadUrl = `/api/download?url=${encodeURIComponent(assembledVideoUrl)}&filename=${encodeURIComponent(filename)}`;
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.src = downloadUrl;
                document.body.appendChild(iframe);
                setTimeout(() => document.body.removeChild(iframe), 5000);
              }}
              className="w-full h-full"
            />
          ) : (
            /* Empty state with effect */
            <div className="absolute inset-0 bg-[#0a0f14]">
              {/* Noise/grain effect */}
              <div
                className="absolute inset-0 opacity-[0.03]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                }}
              />
              {/* Scanlines effect */}
              <div
                className="absolute inset-0 opacity-[0.02]"
                style={{
                  backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)',
                }}
              />
              {/* Center icon */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  {isAssembling ? (
                    <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                  ) : (
                    <Film className="w-10 h-10 text-white/10" />
                  )}
                </div>
              </div>
              {/* Corner marks */}
              <div className="absolute top-3 left-3 w-4 h-4 border-l-2 border-t-2 border-white/20" />
              <div className="absolute top-3 right-3 w-4 h-4 border-r-2 border-t-2 border-white/20" />
              <div className="absolute bottom-3 left-3 w-4 h-4 border-l-2 border-b-2 border-white/20" />
              <div className="absolute bottom-3 right-3 w-4 h-4 border-r-2 border-b-2 border-white/20" />
            </div>
          )}
        </div>

        {/* Progress bar when assembling */}
        {isAssembling && (
          <div className="w-[280px] mt-6">
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${assemblyProgress}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 text-center mt-2">
              Assemblage en cours... {Math.round(assemblyProgress)}%
            </p>
          </div>
        )}

        {/* Bottom controls */}
        {!isAssembling && (
          <div className="flex items-center gap-3 mt-6">
            {assembledVideoUrl && (
              <Button
                variant="outline"
                onClick={() => {
                  const filename = `${short.title.replace(/\s+/g, '-').toLowerCase()}.mp4`;
                  const downloadUrl = `/api/download?url=${encodeURIComponent(assembledVideoUrl)}&filename=${encodeURIComponent(filename)}`;
                  const iframe = document.createElement('iframe');
                  iframe.style.display = 'none';
                  iframe.src = downloadUrl;
                  document.body.appendChild(iframe);
                  setTimeout(() => document.body.removeChild(iframe), 5000);
                }}
                className="border-white/10 text-slate-300 hover:bg-white/5"
              >
                <Download className="w-4 h-4 mr-2" />
                Télécharger
              </Button>
            )}
            <Button
              disabled={short.plans.filter(p => p.generated_video_url).length === 0}
              onClick={async () => {
                setIsAssembling(true);
                setAssemblyProgress(0);

                try {
                  // Use queue-based assembly
                  const res = await fetch(`/api/projects/${projectId}/shorts/${shortId}/queue-assemble`, {
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

                  toast.success('Assemblage ajouté à la file d\'attente');

                  // Start polling for job status
                  await fetchJobs();
                  startPolling();

                } catch (error) {
                  console.error('Assembly error:', error);
                  toast.error(error instanceof Error ? error.message : 'Erreur lors de l\'assemblage');
                  setIsAssembling(false);
                }
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Play className="w-4 h-4 mr-2" />
              {assembledVideoUrl ? 'Réassembler' : 'Assembler'}
            </Button>
          </div>
        )}

        {/* Warning if no videos */}
        {!isAssembling && short.plans.filter(p => p.generated_video_url).length === 0 && (
          <p className="text-slate-600 text-xs mt-4">
            Générez au moins une vidéo pour assembler le short
          </p>
        )}
      </div>
      )}

      {/* Video Fullscreen Overlay */}
      {expandedVideo && expandedVideo.generated_video_url && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setExpandedVideo(null)}
        >
          {/* Close button */}
          <button
            onClick={() => setExpandedVideo(null)}
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>

          {/* Video container */}
          <div
            className="max-h-[90vh] flex items-center justify-center"
            style={{
              width: aspectRatio === '9:16' || aspectRatio === '4:5' || aspectRatio === '2:3'
                ? 'min(50vw, 500px)'
                : 'min(85vw, 1200px)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <VideoCard
              videoUrl={expandedVideo.generated_video_url}
              thumbnailUrl={expandedVideo.storyboard_image_url || undefined}
              title={`Plan ${expandedVideo.shot_number}`}
              subtitle={`${expandedVideo.duration}s`}
              aspectRatio={aspectRatio}
              autoPlay
              onDownload={() => {
                const filename = `plan-${expandedVideo.shot_number}.mp4`;
                const downloadUrl = `/api/download?url=${encodeURIComponent(expandedVideo.generated_video_url!)}&filename=${encodeURIComponent(filename)}`;
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.src = downloadUrl;
                document.body.appendChild(iframe);
                setTimeout(() => document.body.removeChild(iframe), 5000);
              }}
              className="w-full shadow-2xl"
            />
          </div>

          {/* Navigation hint */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-slate-500 text-sm">
            Cliquez en dehors pour fermer
          </div>
        </div>
      )}

      {/* Plan Editor Modal */}
      {selectedPlan && (
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
      )}
    </div>
  );
}
