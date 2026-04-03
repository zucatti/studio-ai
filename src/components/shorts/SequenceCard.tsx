'use client';

import { useState, useEffect } from 'react';
import {
  GripVertical,
  MoreVertical,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Film,
  Loader2,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import type { Sequence, CinematicHeaderConfig } from '@/types/cinematic';
import type { Plan } from '@/store/shorts-store';
import { PlanCard } from './PlanCard';

type AssemblyStatus = 'idle' | 'checking' | 'queued' | 'processing' | 'completed' | 'failed';

interface AssemblyState {
  status: AssemblyStatus;
  progress?: number;
  message?: string;
  jobId?: string;
  videoUrl?: string;
  needsAssembly?: boolean;
}

interface SequenceCardProps {
  sequence: Sequence;
  plans: Plan[];
  isExpanded?: boolean;
  onToggleExpand: () => void;
  onUpdateSequence: (updates: Partial<{ title: string | null; cinematic_header: CinematicHeaderConfig | null }>) => void;
  onDeleteSequence: () => void;
  onSelectPlan: (planId: string) => void;
  onEditPlan: (planId: string) => void;
  onDeletePlan: (planId: string) => void;
  onOpenCinematicWizard: () => void;
  selectedPlanId?: string;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  projectId: string;
  shortId: string;
}

export function SequenceCard({
  sequence,
  plans,
  isExpanded = true,
  onToggleExpand,
  onUpdateSequence,
  onDeleteSequence,
  onSelectPlan,
  onEditPlan,
  onDeletePlan,
  onOpenCinematicWizard,
  selectedPlanId,
  dragHandleProps,
  projectId,
  shortId,
}: SequenceCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(sequence.title || '');
  const [assembly, setAssembly] = useState<AssemblyState>({ status: 'idle' });

  // Count plans with generated videos
  const plansWithVideos = plans.filter(p => p.generated_video_url);
  const hasVideosToAssemble = plansWithVideos.length >= 2;
  const allPlansHaveVideos = plans.length > 0 && plansWithVideos.length === plans.length;

  // Stable count of plans with videos (for dependency)
  const videoPlanCount = plansWithVideos.length;

  // Create a fingerprint of plan video URLs to detect changes
  const planVideosFingerprint = plansWithVideos
    .map(p => p.generated_video_url || '')
    .sort()
    .join('|');

  // Check assembly status when component mounts or plans change
  useEffect(() => {
    if (videoPlanCount < 2) return;

    const checkAssemblyStatus = async () => {
      try {
        setAssembly(prev => ({ ...prev, status: 'checking' }));
        const res = await fetch(
          `/api/projects/${projectId}/shorts/${shortId}/sequences/${sequence.id}/assemble`
        );
        if (!res.ok) throw new Error('Failed to check');
        const data = await res.json();

        if (data.assembledVideoUrl && !data.needsAssembly) {
          setAssembly({
            status: 'completed',
            videoUrl: data.assembledVideoUrl,
            needsAssembly: false,
          });
        } else {
          setAssembly({
            status: 'idle',
            needsAssembly: data.needsAssembly ?? true,
          });
        }
      } catch {
        setAssembly({ status: 'idle', needsAssembly: true });
      }
    };

    checkAssemblyStatus();
  }, [projectId, shortId, sequence.id, videoPlanCount, planVideosFingerprint]);

  // Poll job status when assembling
  useEffect(() => {
    if (!assembly.jobId || !['queued', 'processing'].includes(assembly.status)) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${assembly.jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        const job = data.job;
        if (!job) return;

        if (job.status === 'completed') {
          // Video URL is in result_data (BullMQ uses completeJob which writes to result_data)
          const videoUrl = job.result_data?.outputUrl || job.result_data?.videoUrl || job.output_data?.outputUrl;
          setAssembly({
            status: 'completed',
            videoUrl,
            needsAssembly: false,
          });
          // Don't auto-show video - user can click the play button if they want to see it here
        } else if (job.status === 'failed' || job.status === 'cancelled') {
          setAssembly({
            status: 'failed',
            message: job.error_message || 'Assemblage échoué',
          });
        } else {
          setAssembly(prev => ({
            ...prev,
            status: 'processing',
            progress: job.progress || 0,
            message: job.message || 'Assemblage en cours...',
          }));
        }
      } catch {
        // Silently continue polling
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [assembly.jobId, assembly.status]);

  // Listen for job-completed events to refresh assembly status
  useEffect(() => {
    const handleJobCompleted = (event: Event) => {
      const customEvent = event as CustomEvent<{
        assetType?: string;
        jobSubtype?: string;
        assetId?: string;
      }>;
      const { assetType, jobSubtype } = customEvent.detail;

      // If a sequence assembly job completed, re-check our status
      if (assetType === 'sequence' && jobSubtype === 'sequence-assembly') {
        // Re-check assembly status
        fetch(`/api/projects/${projectId}/shorts/${shortId}/sequences/${sequence.id}/assemble`)
          .then(res => res.json())
          .then(data => {
            if (data.assembledVideoUrl && !data.needsAssembly) {
              setAssembly({
                status: 'completed',
                videoUrl: data.assembledVideoUrl,
                needsAssembly: false,
              });
            }
          })
          .catch(() => {});
      }

      // If a video job completed for any shot, re-check if assembly is needed
      if (assetType === 'shot' && jobSubtype !== 'sequence-assembly') {
        // Small delay to let the data propagate
        setTimeout(() => {
          fetch(`/api/projects/${projectId}/shorts/${shortId}/sequences/${sequence.id}/assemble`)
            .then(res => res.json())
            .then(data => {
              if (data.needsAssembly) {
                setAssembly(prev => ({
                  ...prev,
                  status: prev.status === 'completed' ? 'idle' : prev.status,
                  needsAssembly: true,
                }));
              }
            })
            .catch(() => {});
        }, 500);
      }
    };

    window.addEventListener('job-completed', handleJobCompleted);
    return () => window.removeEventListener('job-completed', handleJobCompleted);
  }, [projectId, shortId, sequence.id]);

  // Start assembly
  const handleAssemble = async () => {
    try {
      // Always force if clicking from completed state (re-assemble)
      // or if needsAssembly is explicitly false (user wants to force)
      const shouldForce = assembly.status === 'completed' || assembly.needsAssembly === false;
      setAssembly({ status: 'queued', message: 'Mise en file...' });

      const res = await fetch(
        `/api/projects/${projectId}/shorts/${shortId}/sequences/${sequence.id}/assemble`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: shouldForce }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start assembly');
      }

      const data = await res.json();

      if (data.status === 'already_assembled') {
        // Re-check to get the video URL
        const checkRes = await fetch(
          `/api/projects/${projectId}/shorts/${shortId}/sequences/${sequence.id}/assemble`
        );
        const checkData = await checkRes.json();
        setAssembly({
          status: 'completed',
          videoUrl: checkData.assembledVideoUrl,
          needsAssembly: false,
        });
      } else {
        setAssembly({
          status: 'queued',
          jobId: data.jobId,
          message: 'En file d\'attente...',
        });
      }
    } catch (error) {
      setAssembly({
        status: 'failed',
        message: error instanceof Error ? error.message : 'Erreur',
      });
    }
  };

  // Get cinematic style summary for display
  const getCinematicSummary = () => {
    const header = sequence.cinematic_header;
    if (!header) return null;
    const parts: string[] = [];
    if (header.tone?.genre) parts.push(header.tone.genre);
    if (header.lighting?.style) parts.push(header.lighting.style);
    if (header.color_grade?.style) parts.push(header.color_grade.style);
    return parts.length > 0 ? parts.join(' • ') : null;
  };
  const cinematicSummary = getCinematicSummary();

  const totalDuration = plans.reduce((sum, p) => sum + p.duration, 0);
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}m${secs}s` : `${secs}s`;
  };

  const handleTitleSubmit = () => {
    onUpdateSequence({ title: editTitle.trim() || null });
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSubmit();
    } else if (e.key === 'Escape') {
      setEditTitle(sequence.title || '');
      setIsEditingTitle(false);
    }
  };

  return (
    <>
      <div className="rounded-lg bg-[#0d1218] border border-white/5 overflow-hidden">
        {/* Sequence Header - Compact single row */}
        <div
          className="flex items-center gap-1.5 px-2 py-1.5 bg-gradient-to-r from-purple-500/10 to-transparent cursor-pointer group"
          onClick={onToggleExpand}
        >
          {/* Drag handle */}
          <div
            {...dragHandleProps}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400 p-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>

          {/* Expand chevron */}
          <div className="text-slate-500 group-hover:text-slate-300 transition-colors">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </div>

          {/* Title */}
          {isEditingTitle ? (
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={handleTitleKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="h-5 text-xs bg-[#0d1218] border-white/10 text-white flex-1 px-1.5"
              autoFocus
            />
          ) : (
            <span
              className="text-xs font-medium text-slate-300 group-hover:text-white flex-1 truncate"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditingTitle(true);
              }}
            >
              {sequence.title || `Séq. ${sequence.sort_order + 1}`}
            </span>
          )}

          {/* Cinematic badge */}
          {cinematicSummary && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenCinematicWizard();
              }}
              className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] truncate max-w-24 hover:bg-amber-500/30 transition-colors"
              title={cinematicSummary}
            >
              {cinematicSummary.split(' • ')[0]}
            </button>
          )}

          {/* Stats badge */}
          <span className="text-[10px] text-slate-500 tabular-nums whitespace-nowrap">
            {plans.length}p · {formatDuration(totalDuration)}
          </span>

          {/* Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="p-0.5 text-slate-600 hover:text-white rounded transition-colors"
              >
                <MoreVertical className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#1a2433] border-white/10">
              <DropdownMenuItem
                onClick={() => onOpenCinematicWizard()}
                className="text-slate-300 focus:text-white focus:bg-white/10 text-xs"
              >
                <Sparkles className="w-3 h-3 mr-2" />
                Style cinématique
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setIsEditingTitle(true)}
                className="text-slate-300 focus:text-white focus:bg-white/10 text-xs"
              >
                <Pencil className="w-3 h-3 mr-2" />
                Renommer
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-red-400 focus:text-red-300 focus:bg-red-500/10 text-xs"
              >
                <Trash2 className="w-3 h-3 mr-2" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Plans List */}
        {isExpanded && (
          <div className="p-2 space-y-1">
            {plans.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-500">
                Aucun plan dans cette séquence
              </div>
            ) : (
              plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  isSelected={selectedPlanId === plan.id}
                  onSelect={() => onSelectPlan(plan.id)}
                  onEdit={() => onEditPlan(plan.id)}
                  onDelete={() => onDeletePlan(plan.id)}
                  compact
                />
              ))
            )}
          </div>
        )}

        {/* Assembly Footer - Compact */}
        {isExpanded && plans.length >= 2 && (
          <div className="flex items-center justify-end gap-1 px-2 py-1 border-t border-white/5 bg-[#080b0f]">
            {/* Status indicator - only when processing or failed */}
            {(assembly.status === 'queued' || assembly.status === 'processing') && (
              <span className="text-[10px] text-purple-400 mr-auto flex items-center gap-1">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                {assembly.progress !== undefined ? `${assembly.progress}%` : '...'}
              </span>
            )}
            {assembly.status === 'failed' && (
              <span className="text-[10px] text-red-400 mr-auto truncate max-w-32">
                {assembly.message || 'Erreur'}
              </span>
            )}

            {/* Assemble button - minimal */}
            <button
                onClick={handleAssemble}
                disabled={
                  !hasVideosToAssemble ||
                  assembly.status === 'checking' ||
                  assembly.status === 'queued' ||
                  assembly.status === 'processing'
                }
                className={cn(
                  "p-1 rounded transition-all",
                  assembly.status === 'queued' || assembly.status === 'processing'
                    ? "text-purple-400 cursor-wait"
                    : assembly.status === 'completed' && !assembly.needsAssembly
                      ? "text-green-500 hover:text-green-400 hover:bg-green-500/10"
                      : hasVideosToAssemble
                        ? "text-slate-400 hover:text-purple-400 hover:bg-purple-500/10"
                        : "text-slate-600 cursor-not-allowed"
                )}
                title={
                  assembly.status === 'completed' && !assembly.needsAssembly
                    ? 'Réassembler'
                    : `Assembler (${plansWithVideos.length}/${plans.length})`
                }
              >
                {assembly.status === 'queued' || assembly.status === 'processing' ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : assembly.status === 'completed' && !assembly.needsAssembly ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <Film className="w-3 h-3" />
                )}
            </button>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-[#1a2433] border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Supprimer cette séquence ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              La séquence sera supprimée mais les plans seront conservés (non assignés).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={onDeleteSequence}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
