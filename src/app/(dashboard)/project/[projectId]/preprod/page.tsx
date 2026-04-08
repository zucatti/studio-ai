'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  Frame,
  Check,
  AlertCircle,
  Loader2,
  Wand2,
  Clock,
  Video,
  ImagePlus,
  Play,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  X,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useJobsStore } from '@/store/jobs-store';

interface Scene {
  id: string;
  scene_number: number;
  int_ext: string;
  location: string;
  time_of_day: string;
}

interface Dialogue {
  id: string;
  character_name: string;
  content: string;
  parenthetical: string | null;
  sort_order: number;
}

interface Shot {
  id: string;
  scene_id: string;
  shot_number: number;
  description: string;
  shot_type: string;
  camera_angle: string;
  camera_movement: string;
  first_frame_url: string | null;
  last_frame_url: string | null;
  first_frame_prompt: string | null;
  last_frame_prompt: string | null;
  generated_video_url: string | null;
  generation_status: string;
  generation_error: string | null;
  suggested_duration: number | null;
  video_provider: string;
  video_duration: number | null;
  video_generation_id: string | null;
  video_generation_progress: { status: string; progress: number } | null;
  frame_generation_status?: 'idle' | 'queued' | 'generating' | 'completed' | 'error';
  frame_generation_progress?: { status: string; progress: number; frameType?: string };
  scene?: Scene;
  dialogues?: Dialogue[];
}

interface DurationSuggestion {
  shotId: string;
  duration: number;
  reasoning: string;
}

// Visual styles for frame generation
const VISUAL_STYLES = [
  { value: 'photorealistic', label: 'Photoréaliste', description: 'Cinématique haute qualité' },
  { value: 'cartoon', label: 'Cartoon', description: 'Style dessin animé coloré' },
  { value: 'anime', label: 'Anime', description: 'Style anime japonais' },
  { value: 'illustration', label: 'Illustration', description: 'Illustration artistique' },
  { value: 'pixar', label: 'Pixar 3D', description: 'Style Pixar/Disney 3D' },
  { value: 'watercolor', label: 'Aquarelle', description: 'Peinture aquarelle' },
  { value: 'oil_painting', label: 'Peinture à l\'huile', description: 'Style peinture classique' },
  { value: 'noir', label: 'Film Noir', description: 'Noir et blanc dramatique' },
] as const;

// Map legacy providers to new model names
const mapProvider = (provider: string | null | undefined): string => {
  const legacyMap: Record<string, string> = {
    'runway': 'kling-omni',
    'runwayml': 'kling-omni',
    'kling': 'kling-omni',
    'veo': 'veo-3',
    'sora': 'kling-omni', // Sora deprecated, fallback to Kling
  };
  const p = provider || 'kling-omni';
  return legacyMap[p] || p;
};

export default function PreprodPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  // Jobs store for queue management
  const { fetchJobs, startPolling } = useJobsStore();

  const [shots, setShots] = useState<Shot[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingFrames, setGeneratingFrames] = useState<Record<string, string>>({});
  const [frameProgress, setFrameProgress] = useState<Record<string, { status: string; frameType: string }>>({});
  const [generatingVideo, setGeneratingVideo] = useState<Record<string, boolean>>({});
  const [suggestingDurations, setSuggestingDurations] = useState(false);
  const [expandedShots, setExpandedShots] = useState<Set<string>>(new Set());
  const [videoModal, setVideoModal] = useState<{ url: string; shotNumber: number } | null>(null);
  const [visualStyle, setVisualStyle] = useState<string>('photorealistic');

  const fetchShots = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/shots`);
      if (!res.ok) throw new Error('Failed to fetch shots');
      const data = await res.json();
      setShots(data.shots || []);
      // Expand all shots by default
      setExpandedShots(new Set((data.shots || []).map((s: Shot) => s.id)));
    } catch (error) {
      console.error('Error fetching shots:', error);
      toast.error('Erreur lors du chargement des plans');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchShots();
  }, [fetchShots]);

  // Start polling if there are queued/generating shots
  useEffect(() => {
    const activeShots = shots.filter(s =>
      ['queued', 'generating', 'running'].includes(s.generation_status || '')
    );
    if (activeShots.length > 0) {
      startPolling();
    }
  }, [shots, startPolling]);

  const stats = {
    total: shots.length,
    withFirstFrame: shots.filter(s => s.first_frame_url).length,
    withLastFrame: shots.filter(s => s.last_frame_url).length,
    withBothFrames: shots.filter(s => s.first_frame_url && s.last_frame_url).length,
    withVideo: shots.filter(s => s.generated_video_url).length,
    progress: shots.length > 0
      ? Math.round((shots.filter(s => s.generated_video_url).length / shots.length) * 100)
      : 0,
  };

  const handleGenerateFrames = async (shotId: string, frameType: 'first' | 'last' | 'both') => {
    setGeneratingFrames(prev => ({ ...prev, [shotId]: frameType }));
    setFrameProgress(prev => ({ ...prev, [shotId]: { status: 'queued', frameType } }));

    // Start polling for real progress
    const pollInterval = setInterval(async () => {
      try {
        const statusRes = await fetch(`/api/projects/${projectId}/shots/${shotId}/frame-status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData.status) {
            setFrameProgress(prev => ({
              ...prev,
              [shotId]: { status: statusData.status, frameType }
            }));
          }
        }
      } catch (e) {
        // Ignore polling errors
      }
    }, 1000);

    try {
      const res = await fetch(`/api/projects/${projectId}/shots/${shotId}/generate-frames`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frameType, visualStyle }),
      });

      clearInterval(pollInterval);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate frames');
      }

      const data = await res.json();

      setShots(prev => prev.map(s =>
        s.id === shotId
          ? {
              ...s,
              first_frame_url: data.firstFrame || s.first_frame_url,
              last_frame_url: data.lastFrame || s.last_frame_url,
            }
          : s
      ));

      toast.success('Frames générées avec succès');
    } catch (error) {
      clearInterval(pollInterval);
      console.error('Error generating frames:', error);
      toast.error(String(error));
    } finally {
      setGeneratingFrames(prev => {
        const next = { ...prev };
        delete next[shotId];
        return next;
      });
      setFrameProgress(prev => {
        const next = { ...prev };
        delete next[shotId];
        return next;
      });
    }
  };

  const handleSuggestDurations = async () => {
    setSuggestingDurations(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/suggest-durations`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to suggest durations');
      }

      const data = await res.json();
      const suggestions: DurationSuggestion[] = data.suggestions;

      setShots(prev => prev.map(s => {
        const suggestion = suggestions.find(sug => sug.shotId === s.id);
        return suggestion ? { ...s, suggested_duration: suggestion.duration } : s;
      }));

      toast.success('Durées suggérées par Claude');
    } catch (error) {
      console.error('Error suggesting durations:', error);
      toast.error(String(error));
    } finally {
      setSuggestingDurations(false);
    }
  };

  const handleGenerateVideo = async (shotId: string, provider: string, duration?: number) => {
    setGeneratingVideo(prev => ({ ...prev, [shotId]: true }));

    // Update local state to show generating
    setShots(prev => prev.map(s =>
      s.id === shotId
        ? { ...s, generation_status: 'queued', video_provider: provider }
        : s
    ));

    try {
      // Use the queue endpoint instead of synchronous
      const res = await fetch(`/api/projects/${projectId}/shots/${shotId}/queue-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, duration }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to queue video generation');
      }

      const data = await res.json();
      console.log('[Preprod] Video queued:', data.jobId);

      // Start polling for job updates
      await fetchJobs();
      startPolling();

      toast.success('Génération vidéo ajoutée à la file d\'attente', {
        description: 'Vous pouvez continuer à travailler pendant la génération.',
      });

    } catch (error) {
      console.error('Error queuing video:', error);
      toast.error(String(error));

      setShots(prev => prev.map(s =>
        s.id === shotId
          ? { ...s, generation_status: 'failed', generation_error: String(error) }
          : s
      ));
    } finally {
      setGeneratingVideo(prev => {
        const next = { ...prev };
        delete next[shotId];
        return next;
      });
    }
  };

  // Listen for job completion to refresh shots
  useEffect(() => {
    const handleJobCompleted = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        jobId: string;
        assetId: string;
        assetType: string;
        jobType: string;
        jobSubtype: string;
      }>;
      const { assetType, jobType } = customEvent.detail;

      // Check if this is a video job for a shot
      if (assetType !== 'shot' || jobType !== 'video') return;

      console.log('[Preprod] Video job completed, refreshing shots...');
      await fetchShots();
    };

    window.addEventListener('job-completed', handleJobCompleted);

    return () => {
      window.removeEventListener('job-completed', handleJobCompleted);
    };
  }, [fetchShots]);

  const handleProviderChange = async (shotId: string, provider: string) => {
    setShots(prev => prev.map(s =>
      s.id === shotId ? { ...s, video_provider: provider } : s
    ));

    // Persist to database
    try {
      await fetch(`/api/projects/${projectId}/shots/${shotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_provider: provider }),
      });
    } catch (e) {
      console.error('Error updating provider:', e);
    }
  };

  const toggleExpanded = (shotId: string) => {
    setExpandedShots(prev => {
      const next = new Set(prev);
      if (next.has(shotId)) {
        next.delete(shotId);
      } else {
        next.add(shotId);
      }
      return next;
    });
  };

  const handleDeleteVideo = async (shotId: string) => {
    try {
      await fetch(`/api/projects/${projectId}/shots/${shotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generated_video_url: null,
          generation_status: 'not_started',
          video_generation_progress: null,
        }),
      });

      setShots(prev => prev.map(s =>
        s.id === shotId
          ? { ...s, generated_video_url: null, generation_status: 'not_started' }
          : s
      ));

      toast.success('Vidéo supprimée');
    } catch (error) {
      console.error('Error deleting video:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (shots.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Frame className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Aucun plan à préparer.</p>
          <p className="text-sm mt-1">
            Créez d&apos;abord des plans dans l&apos;onglet Script.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Frame className="w-5 h-5" />
          <h2 className="text-xl font-semibold">Préproduction</h2>
        </div>
        <div className="flex items-center gap-3">
          {/* Visual Style Selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Style :</span>
            <Select value={visualStyle} onValueChange={setVisualStyle}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISUAL_STYLES.map((style) => (
                  <SelectItem key={style.value} value={style.value}>
                    <div className="flex flex-col">
                      <span>{style.label}</span>
                      <span className="text-xs text-muted-foreground">{style.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={handleSuggestDurations}
            disabled={suggestingDurations}
          >
            {suggestingDurations ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Clock className="w-4 h-4 mr-2" />
            )}
            Suggérer les durées
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Plans</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">First Frames</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.withFirstFrame}/{stats.total}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Last Frames</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.withLastFrame}/{stats.total}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Prêts</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-500">{stats.withBothFrames}/{stats.total}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Video className="w-4 h-4 text-green-500" />
              Vidéos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-500">{stats.withVideo}/{stats.total}</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Progression vidéo</span>
            <span className="text-sm text-muted-foreground">{stats.progress}%</span>
          </div>
          <Progress value={stats.progress} className="h-2" />
        </CardContent>
      </Card>

      {/* Info */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="py-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-blue-500">Workflow de génération</p>
            <p className="text-muted-foreground mt-1">
              1. Générez les frames de début/fin pour chaque plan<br />
              2. Choisissez la qualité Kling (Pro, Master, Standard)<br />
              3. Lancez la génération vidéo (interpolation entre les 2 frames)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Shots list */}
      <div className="space-y-4">
        {shots.map((shot) => (
          <ShotCard
            key={shot.id}
            shot={shot}
            expanded={expandedShots.has(shot.id)}
            onToggleExpanded={() => toggleExpanded(shot.id)}
            generatingFrame={generatingFrames[shot.id]}
            frameProgress={frameProgress[shot.id]}
            generatingVideo={generatingVideo[shot.id]}
            onGenerateFrames={(type) => handleGenerateFrames(shot.id, type)}
            onGenerateVideo={(provider, duration) => handleGenerateVideo(shot.id, provider, duration)}
            onProviderChange={(provider) => handleProviderChange(shot.id, provider)}
            onDeleteVideo={() => handleDeleteVideo(shot.id)}
            onOpenVideo={() => setVideoModal({ url: shot.generated_video_url!, shotNumber: shot.shot_number })}
          />
        ))}
      </div>

      {/* Video Modal */}
      <Dialog open={!!videoModal} onOpenChange={() => setVideoModal(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          {videoModal && (
            <div className="relative">
              <div className="absolute top-2 right-2 z-10">
                <Button
                  variant="ghost"
                  size="icon"
                  className="bg-black/50 hover:bg-black/70 text-white"
                  onClick={() => setVideoModal(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <video
                src={videoModal.url}
                controls
                autoPlay
                className="w-full"
              />
              <div className="p-4 bg-muted">
                <p className="text-sm font-medium">Plan {videoModal.shotNumber}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Aurora Borealis Animation Component
function AuroraOverlay({ status }: { status: string }) {
  const isQueued = status === 'queued';

  return (
    <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-lg overflow-hidden">
      {/* Aurora Animation */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="aurora-wave aurora-wave-1" />
        <div className="aurora-wave aurora-wave-2" />
        <div className="aurora-wave aurora-wave-3" />
      </div>

      {/* Status Text */}
      <div className="relative z-10 text-center">
        <div className="mb-2">
          {isQueued ? (
            <div className="w-8 h-8 mx-auto border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
          ) : (
            <div className="w-8 h-8 mx-auto border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          )}
        </div>
        <p className="text-sm font-medium text-white/90">
          {isQueued ? "File d'attente..." : 'Génération en cours...'}
        </p>
        {!isQueued && (
          <p className="text-xs text-white/60 mt-1">InstantID</p>
        )}
      </div>

      {/* CSS for Aurora */}
      <style jsx>{`
        .aurora-wave {
          position: absolute;
          width: 200%;
          height: 200%;
          background: linear-gradient(
            180deg,
            transparent 0%,
            rgba(139, 92, 246, 0.1) 20%,
            rgba(6, 182, 212, 0.15) 40%,
            rgba(139, 92, 246, 0.1) 60%,
            transparent 100%
          );
          animation: aurora 8s ease-in-out infinite;
          transform-origin: center center;
        }
        .aurora-wave-1 {
          top: -50%;
          left: -50%;
          animation-delay: 0s;
        }
        .aurora-wave-2 {
          top: -60%;
          left: -40%;
          animation-delay: -2s;
          opacity: 0.7;
        }
        .aurora-wave-3 {
          top: -40%;
          left: -60%;
          animation-delay: -4s;
          opacity: 0.5;
        }
        @keyframes aurora {
          0%, 100% {
            transform: rotate(0deg) scale(1);
          }
          25% {
            transform: rotate(5deg) scale(1.05);
          }
          50% {
            transform: rotate(0deg) scale(1.1);
          }
          75% {
            transform: rotate(-5deg) scale(1.05);
          }
        }
      `}</style>
    </div>
  );
}

interface ShotCardProps {
  shot: Shot;
  expanded: boolean;
  onToggleExpanded: () => void;
  generatingFrame?: string;
  frameProgress?: { status: string; frameType: string };
  generatingVideo?: boolean;
  onGenerateFrames: (type: 'first' | 'last' | 'both') => void;
  onGenerateVideo: (provider: string, duration?: number) => void;
  onProviderChange: (provider: string) => void;
  onDeleteVideo: () => void;
  onOpenVideo: () => void;
}

function ShotCard({
  shot,
  expanded,
  onToggleExpanded,
  generatingFrame,
  frameProgress,
  generatingVideo,
  onGenerateFrames,
  onGenerateVideo,
  onProviderChange,
  onDeleteVideo,
  onOpenVideo,
}: ShotCardProps) {
  const sceneName = shot.scene
    ? `${shot.scene.int_ext}. ${shot.scene.location}`
    : '';

  const hasFrames = shot.first_frame_url && shot.last_frame_url;
  const isGenerating = shot.generation_status === 'generating';
  const isCompleted = shot.generation_status === 'completed';
  const isFailed = shot.generation_status === 'failed';

  const progress = shot.video_generation_progress?.progress || 0;

  return (
    <Card className={cn(
      isCompleted && 'border-green-500/50',
      isFailed && 'border-red-500/50'
    )}>
      <CardHeader
        className="cursor-pointer flex flex-row items-center justify-between py-3"
        onClick={onToggleExpanded}
      >
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="font-mono">
            Plan {shot.shot_number}
          </Badge>
          {sceneName && (
            <span className="text-sm text-muted-foreground">{sceneName}</span>
          )}
          {isCompleted && (
            <Badge className="bg-green-500">
              <Check className="w-3 h-3 mr-1" />
              Vidéo prête
            </Badge>
          )}
          {isGenerating && (
            <Badge variant="secondary">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Génération...
            </Badge>
          )}
          {isFailed && (
            <Badge variant="destructive">
              <X className="w-3 h-3 mr-1" />
              Échec
            </Badge>
          )}
          {shot.suggested_duration && !isCompleted && (
            <Badge variant="outline" className="text-blue-500 border-blue-500/50">
              <Clock className="w-3 h-3 mr-1" />
              {shot.suggested_duration}s suggéré
            </Badge>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-4">
          <p className="text-sm text-muted-foreground line-clamp-2">
            {shot.description}
          </p>

          {/* Dialogues */}
          {shot.dialogues && shot.dialogues.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Dialogues
              </span>
              {shot.dialogues.map((dialogue) => (
                <div key={dialogue.id} className="text-sm">
                  <span className="font-semibold text-foreground">
                    {dialogue.character_name}
                  </span>
                  {dialogue.parenthetical && (
                    <span className="text-muted-foreground italic ml-1">
                      ({dialogue.parenthetical})
                    </span>
                  )}
                  <p className="text-muted-foreground pl-4 border-l-2 border-muted-foreground/30 mt-1">
                    &ldquo;{dialogue.content}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Frames */}
          <div className="grid grid-cols-2 gap-4">
            {/* First Frame */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">First Frame</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    onGenerateFrames('first');
                  }}
                  disabled={!!generatingFrame}
                >
                  {generatingFrame === 'first' || generatingFrame === 'both' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : shot.first_frame_url ? (
                    <RefreshCw className="w-4 h-4" />
                  ) : (
                    <Wand2 className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <div className="aspect-video rounded-lg bg-muted flex items-center justify-center overflow-hidden border relative">
                {/* Aurora Overlay for First Frame */}
                {frameProgress && (frameProgress.frameType === 'first' || frameProgress.frameType === 'both') && frameProgress.status !== 'completed' && (
                  <AuroraOverlay status={frameProgress.status} />
                )}
                {shot.first_frame_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shot.first_frame_url}
                    alt="First frame"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ImagePlus className="w-8 h-8" />
                    <span className="text-xs">Non généré</span>
                  </div>
                )}
              </div>
            </div>

            {/* Last Frame */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Last Frame</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    onGenerateFrames('last');
                  }}
                  disabled={!!generatingFrame}
                >
                  {generatingFrame === 'last' || generatingFrame === 'both' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : shot.last_frame_url ? (
                    <RefreshCw className="w-4 h-4" />
                  ) : (
                    <Wand2 className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <div className="aspect-video rounded-lg bg-muted flex items-center justify-center overflow-hidden border relative">
                {/* Aurora Overlay for Last Frame */}
                {frameProgress && (frameProgress.frameType === 'last' || frameProgress.frameType === 'both') && frameProgress.status !== 'completed' && (
                  <AuroraOverlay status={frameProgress.status} />
                )}
                {shot.last_frame_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shot.last_frame_url}
                    alt="Last frame"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ImagePlus className="w-8 h-8" />
                    <span className="text-xs">Non généré</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Generate/Regenerate both frames button */}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onGenerateFrames('both')}
            disabled={!!generatingFrame}
          >
            {generatingFrame === 'both' ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : shot.first_frame_url && shot.last_frame_url ? (
              <RefreshCw className="w-4 h-4 mr-2" />
            ) : (
              <Wand2 className="w-4 h-4 mr-2" />
            )}
            {shot.first_frame_url && shot.last_frame_url ? 'Regénérer les deux frames' : 'Générer les deux frames'}
          </Button>

          {/* Video section */}
          {hasFrames && (
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2">
                  <Video className="w-4 h-4" />
                  Génération vidéo
                </span>
                <Select
                  value={mapProvider(shot.video_provider)}
                  onValueChange={onProviderChange}
                  disabled={isGenerating}
                >
                  <SelectTrigger className="w-32 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kling-omni">Kling Omni</SelectItem>
                    <SelectItem value="veo-3">Veo 3.1</SelectItem>
                    <SelectItem value="seedance-2">Seedance 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Video preview or generation button */}
              {shot.generated_video_url ? (
                <div className="space-y-2">
                  {/* Video thumbnail */}
                  <div
                    className="relative w-48 aspect-video rounded-lg overflow-hidden cursor-pointer group bg-black"
                    onClick={onOpenVideo}
                  >
                    <video
                      src={shot.generated_video_url}
                      className="w-full h-full object-cover"
                      muted
                    />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
                        <Play className="w-5 h-5 text-black ml-0.5" />
                      </div>
                    </div>
                  </div>
                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onGenerateVideo(mapProvider(shot.video_provider), shot.suggested_duration || undefined)}
                      disabled={isGenerating || generatingVideo}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Regénérer
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onDeleteVideo}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : isGenerating ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {shot.video_generation_progress?.status || 'En cours...'}
                    </span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              ) : (
                <Button
                  className="w-full"
                  onClick={() => onGenerateVideo(mapProvider(shot.video_provider), shot.suggested_duration || undefined)}
                  disabled={generatingVideo}
                >
                  {generatingVideo ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  Générer la vidéo ({shot.suggested_duration || 5}s)
                </Button>
              )}

              {isFailed && shot.generation_error && (
                <p className="text-sm text-red-500">{shot.generation_error}</p>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
