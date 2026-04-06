'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { MentionInput } from '@/components/ui/mention-input';
import { GeneratingPlaceholder } from '@/components/ui/generating-placeholder';
import {
  LayoutGrid,
  Loader2,
  Wand2,
  ImageIcon,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Trash2,
  Plus,
  Sparkles,
  X,
  GripVertical,
  Film,
} from 'lucide-react';
import { StorageImg } from '@/components/ui/storage-image';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useStoryboardStore } from '@/store/storyboard-store';
import { useJobsStore } from '@/store/jobs-store';
import { toast } from 'sonner';

export default function StoryboardPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const {
    frames,
    proposedFrames,
    isLoading,
    isAnalyzing,
    error,
    fetchFrames,
    createFrame,
    updateFrame,
    deleteFrame,
    deleteAllFrames,
    generateSketch,
    analyzeScript,
    acceptProposedFrames,
    clearProposedFrames,
  } = useStoryboardStore();

  const { jobs, fetchJobs, startPolling } = useJobsStore();

  const [editingFrameId, setEditingFrameId] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState('');

  // Track generation progress per frame
  const [frameProgress, setFrameProgress] = useState<Map<string, {
    progress: number;
    status: 'queued' | 'generating' | 'uploading';
    startedAt: string | number;
  }>>(new Map());

  // Fetch frames on mount
  useEffect(() => {
    fetchFrames(projectId);
  }, [projectId, fetchFrames]);

  // Sync progress from jobs-store for storyboard-frame jobs
  // Also clear progress for frames that failed or timed out
  useEffect(() => {
    // Clear progress for frames that are now failed, completed, or timed out (60s)
    const now = Date.now();

    setFrameProgress((prev) => {
      const newMap = new Map(prev);
      let changed = false;

      for (const [frameId, progress] of prev.entries()) {
        const frame = frames.find((f) => f.id === frameId);
        const elapsed = now - (typeof progress.startedAt === 'number' ? progress.startedAt : new Date(progress.startedAt).getTime());

        // Clear if: frame completed/failed, has sketch, or timed out (60s)
        if (
          !frame ||
          frame.generation_status === 'failed' ||
          frame.generation_status === 'completed' ||
          frame.sketch_url ||
          elapsed > 30000
        ) {
          newMap.delete(frameId);
          changed = true;
        }
      }

      return changed ? newMap : prev;
    });

    const frameIds = new Set(frames.map((f) => f.id));

    // Find active storyboard-frame jobs
    const activeFrameJobs = jobs.filter((job) => {
      if (job.asset_type !== 'storyboard-frame') return false;
      if (!['pending', 'queued', 'running'].includes(job.status)) return false;
      const jobFrameId = (job.input_data as { frameId?: string })?.frameId;
      return jobFrameId && frameIds.has(jobFrameId);
    });

    if (activeFrameJobs.length > 0) {
      setFrameProgress((prev) => {
        const newMap = new Map(prev);
        for (const job of activeFrameJobs) {
          const frameId = (job.input_data as { frameId?: string })?.frameId;
          if (frameId) {
            newMap.set(frameId, {
              progress: job.progress,
              status: job.status === 'running' ? 'generating' : 'queued',
              startedAt: job.started_at || job.created_at,
            });
          }
        }
        return newMap;
      });
    }
  }, [jobs, frames]);

  // Listen for job-completed events
  useEffect(() => {
    const handleJobCompleted = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.assetType === 'storyboard-frame') {
        console.log('[Storyboard] Frame generation completed, refetching frames...');
        fetchFrames(projectId);
        // Clear progress for this frame (frameId is in detail from input_data)
        const frameId = detail?.frameId || detail?.assetId;
        if (frameId) {
          setFrameProgress((prev) => {
            const newMap = new Map(prev);
            newMap.delete(frameId);
            return newMap;
          });
        }
      }
    };

    const handleJobFailed = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.assetType === 'storyboard-frame') {
        console.log('[Storyboard] Frame generation failed:', detail.errorMessage);
        fetchFrames(projectId);
        const frameId = detail?.frameId || detail?.assetId;
        if (frameId) {
          setFrameProgress((prev) => {
            const newMap = new Map(prev);
            newMap.delete(frameId);
            return newMap;
          });
        }
        toast.error(`Génération échouée: ${detail.errorMessage}`);
      }
    };

    window.addEventListener('job-completed', handleJobCompleted);
    window.addEventListener('job-failed', handleJobFailed);
    return () => {
      window.removeEventListener('job-completed', handleJobCompleted);
      window.removeEventListener('job-failed', handleJobFailed);
    };
  }, [projectId, fetchFrames]);

  // Poll for generating frames (fallback) + timeout check
  useEffect(() => {
    if (frameProgress.size === 0) return;

    const interval = setInterval(() => {
      fetchFrames(projectId);

      // Check for timed out progress (60s)
      const now = Date.now();
      setFrameProgress((prev) => {
        const newMap = new Map(prev);
        let changed = false;
        for (const [frameId, progress] of prev.entries()) {
          const elapsed = now - (typeof progress.startedAt === 'number' ? progress.startedAt : new Date(progress.startedAt).getTime());
          if (elapsed > 30000) {
            newMap.delete(frameId);
            changed = true;
          }
        }
        return changed ? newMap : prev;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [frames, projectId, fetchFrames, frameProgress.size]);

  const handleAnalyze = async () => {
    await analyzeScript(projectId);
  };

  const handleAcceptProposed = async () => {
    await acceptProposedFrames(projectId);
    toast.success(`${proposedFrames.length} frames créés`);
  };

  const handleCreateEmptyFrame = async () => {
    const frame = await createFrame(projectId, {
      description: '',
      sort_order: frames.length,
    });
    if (frame) {
      setEditingFrameId(frame.id);
      setEditingDescription('');
      toast.success('Frame ajouté');
    }
  };

  const handleStartEdit = (frameId: string, description: string) => {
    setEditingFrameId(frameId);
    setEditingDescription(description);
  };

  const handleSaveEdit = async () => {
    if (!editingFrameId) return;
    await updateFrame(projectId, editingFrameId, { description: editingDescription });
    setEditingFrameId(null);
    setEditingDescription('');
    toast.success('Description sauvegardée');
  };

  const handleCancelEdit = () => {
    setEditingFrameId(null);
    setEditingDescription('');
  };

  const handleGenerate = async (frameId: string) => {
    // Initialize progress with startedAt
    setFrameProgress((prev) => {
      const newMap = new Map(prev);
      newMap.set(frameId, {
        progress: 0,
        status: 'queued',
        startedAt: Date.now(),
      });
      return newMap;
    });

    try {
      await generateSketch(projectId, frameId);

      // Start polling for job updates
      await fetchJobs();
      startPolling();

      toast.info('Génération du croquis en cours...');
    } catch {
      // Clear progress on error
      setFrameProgress((prev) => {
        const newMap = new Map(prev);
        newMap.delete(frameId);
        return newMap;
      });
    }
  };

  const handleDelete = async (frameId: string) => {
    await deleteFrame(projectId, frameId);
    toast.success('Frame supprimé');
  };

  const handleDeleteAll = async () => {
    await deleteAllFrames(projectId);
    toast.success('Tous les frames ont été supprimés');
  };

  // Stats
  const framesWithSketch = frames.filter((f) => f.sketch_url);
  const generatingCount = frameProgress.size;
  const framesWithoutSketch = frames.filter((f) => !f.sketch_url && !frameProgress.has(f.id));

  if (isLoading && frames.length === 0) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <LayoutGrid className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Storyboard</h2>
            <p className="text-sm text-slate-400">Exploration visuelle du script</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Analyze script button */}
          <Button
            variant="outline"
            className="border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
            onClick={handleAnalyze}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyse en cours...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Analyser le script
              </>
            )}
          </Button>

          {/* Add empty frame */}
          <Button
            variant="outline"
            className="border-white/10 text-slate-300 hover:bg-white/10"
            onClick={handleCreateEmptyFrame}
          >
            <Plus className="w-4 h-4 mr-2" />
            Ajouter frame
          </Button>

          {/* Delete all */}
          {frames.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Tout supprimer
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-[#1a2433] border-white/10">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-white">Supprimer tous les frames ?</AlertDialogTitle>
                  <AlertDialogDescription className="text-slate-400">
                    Cette action supprimera {frames.length} frame{frames.length > 1 ? 's' : ''} et leurs croquis.
                    Cette action est irréversible.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
                    Annuler
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-500 hover:bg-red-600 text-white"
                    onClick={handleDeleteAll}
                  >
                    Supprimer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4 text-red-300">
          {error}
        </div>
      )}

      {/* Proposed frames from Claude analysis */}
      {proposedFrames.length > 0 && (
        <div className="rounded-xl bg-purple-500/10 border border-purple-500/30 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <span className="font-medium text-purple-300">
                {proposedFrames.length} frames proposés par Claude
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="text-slate-400 hover:text-slate-300"
                onClick={clearProposedFrames}
              >
                <X className="w-4 h-4 mr-1" />
                Annuler
              </Button>
              <Button
                size="sm"
                className="bg-purple-600 hover:bg-purple-700"
                onClick={handleAcceptProposed}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Accepter tous
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto">
            {proposedFrames.map((frame, index) => (
              <div
                key={index}
                className="bg-white/5 rounded-lg p-3 border border-white/10"
              >
                <div className="text-xs text-slate-500 mb-1">Frame {index + 1}</div>
                <p className="text-sm text-slate-300 line-clamp-3">{frame.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats bar */}
      {frames.length > 0 && (
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2 text-slate-400">
            <Film className="w-4 h-4" />
            <span>{frames.length} frame{frames.length > 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle className="w-4 h-4" />
            <span>{framesWithSketch.length} avec croquis</span>
          </div>
          {generatingCount > 0 && (
            <div className="flex items-center gap-2 text-blue-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{generatingCount} en cours</span>
            </div>
          )}
          {framesWithoutSketch.length > 0 && (
            <div className="flex items-center gap-2 text-slate-500">
              <ImageIcon className="w-4 h-4" />
              <span>{framesWithoutSketch.length} en attente</span>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {frames.length === 0 && proposedFrames.length === 0 && (
        <div className="rounded-xl bg-[#151d28] border border-white/5 py-16 text-center">
          <LayoutGrid className="w-16 h-16 mx-auto mb-4 text-slate-600" />
          <h3 className="text-lg font-medium text-white mb-2">Pas encore de storyboard</h3>
          <p className="text-slate-400 max-w-md mx-auto mb-6">
            Le storyboard permet d&apos;explorer visuellement votre script avant la préprod.
            Claude peut analyser votre script et proposer des frames automatiquement.
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              className="bg-purple-600 hover:bg-purple-700"
              onClick={handleAnalyze}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyse en cours...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Analyser le script
                </>
              )}
            </Button>
            <Button
              variant="outline"
              className="border-white/10 text-slate-300 hover:bg-white/10"
              onClick={handleCreateEmptyFrame}
            >
              <Plus className="w-4 h-4 mr-2" />
              Créer manuellement
            </Button>
          </div>
        </div>
      )}

      {/* Frames grid */}
      {frames.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {frames.map((frame, index) => (
            <div
              key={frame.id}
              className="rounded-xl overflow-hidden bg-[#151d28] border border-white/5 group"
            >
              {/* Frame header */}
              <div className="h-10 bg-slate-700/50 px-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GripVertical className="w-4 h-4 text-slate-500 cursor-grab" />
                  <span className="text-sm font-medium text-white">Frame {index + 1}</span>
                </div>
                {frame.scene && (
                  <span className="text-xs text-slate-400">
                    S{frame.scene.scene_number}
                  </span>
                )}
              </div>

              {/* Image area */}
              <div className="aspect-video bg-black/30 relative">
                {frame.sketch_url ? (
                  <StorageImg
                    src={frame.sketch_url}
                    alt={`Frame ${index + 1}`}
                    className="w-full h-full object-contain"
                  />
                ) : frameProgress.has(frame.id) ? (
                  <GeneratingPlaceholder
                    aspectRatio="16:9"
                    status={frameProgress.get(frame.id)?.status || 'generating'}
                    progress={frameProgress.get(frame.id)?.progress}
                    startedAt={frameProgress.get(frame.id)?.startedAt}
                    className="absolute inset-0"
                  />
                ) : frame.generation_status === 'failed' ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
                    <span className="text-xs text-red-400">Échec</span>
                    {frame.generation_error && (
                      <span className="text-[10px] text-slate-500 mt-1 px-2 text-center">
                        {frame.generation_error}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-slate-600 mb-2" />
                    <span className="text-xs text-slate-500">Pas de croquis</span>
                  </div>
                )}

                {/* Hover overlay with actions */}
                {!frameProgress.has(frame.id) && (
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    {frame.sketch_url ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="bg-white/10 hover:bg-white/20 text-white"
                        onClick={() => handleGenerate(frame.id)}
                      >
                        <RefreshCw className="w-4 h-4 mr-1" />
                        Régénérer
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700"
                        onClick={() => handleGenerate(frame.id)}
                        disabled={!frame.description}
                      >
                        <Wand2 className="w-4 h-4 mr-1" />
                        Générer
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Description area */}
              <div className="p-3 space-y-2">
                {editingFrameId === frame.id ? (
                  <div className="space-y-2">
                    <MentionInput
                      value={editingDescription}
                      onChange={setEditingDescription}
                      placeholder="Décrivez le frame... (@Personnage #Lieu)"
                      projectId={projectId}
                      minHeight="80px"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-slate-400 hover:text-slate-300"
                        onClick={handleCancelEdit}
                      >
                        Annuler
                      </Button>
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700"
                        onClick={handleSaveEdit}
                      >
                        Sauvegarder
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="min-h-[60px] text-sm text-slate-300 cursor-pointer hover:bg-white/5 rounded p-2 -m-2 transition-colors"
                    onClick={() => handleStartEdit(frame.id, frame.description)}
                  >
                    {frame.description || (
                      <span className="text-slate-500 italic">Cliquez pour ajouter une description...</span>
                    )}
                  </div>
                )}

                {/* Frame actions */}
                <div className="flex justify-between items-center pt-2 border-t border-white/5">
                  <div className="flex gap-1">
                    {!frame.sketch_url && !frameProgress.has(frame.id) && frame.description && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                        onClick={() => handleGenerate(frame.id)}
                      >
                        <Wand2 className="w-3 h-3 mr-1" />
                        Générer
                      </Button>
                    )}
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-[#1a2433] border-white/10">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">Supprimer ce frame ?</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400">
                          Le frame {index + 1} et son croquis seront supprimés.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
                          Annuler
                        </AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-500 hover:bg-red-600 text-white"
                          onClick={() => handleDelete(frame.id)}
                        >
                          Supprimer
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          ))}

          {/* Add frame card */}
          <button
            onClick={handleCreateEmptyFrame}
            className="rounded-xl border-2 border-dashed border-white/10 hover:border-white/30 min-h-[280px] flex flex-col items-center justify-center text-slate-500 hover:text-slate-300 transition-colors"
          >
            <Plus className="w-8 h-8 mb-2" />
            <span className="text-sm">Ajouter un frame</span>
          </button>
        </div>
      )}
    </div>
  );
}
