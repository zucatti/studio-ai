'use client';

import { useState, useEffect, useCallback } from 'react';
import { Grid3x3, Music, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SceneDecoupage } from './SceneDecoupage';
import { WaveformTimeline } from '@/components/audio/WaveformTimeline';
import { useShotsStore } from '@/store/shots-store';
import { toast } from 'sonner';

interface Character {
  id: string;
  name: string;
}

interface ProjectAudio {
  audio_url: string | null;
  audio_duration: number | null;
}

interface DecoupageViewProps {
  projectId: string;
}

export function DecoupageView({ projectId }: DecoupageViewProps) {
  // Global store for scenes/shots
  const {
    scenes,
    shots,
    isLoading,
    fetchScenes,
    addShot,
    updateShot,
    deleteShot,
    reorderShot,
    getShotsByScene,
  } = useShotsStore();

  // Local state for UI
  const [characters, setCharacters] = useState<Character[]>([]);
  const [projectAudio, setProjectAudio] = useState<ProjectAudio | null>(null);
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());
  const [currentAudioTime, setCurrentAudioTime] = useState(0);
  const [generatingScenes, setGeneratingScenes] = useState<Set<string>>(new Set());
  const [isLoadingExtra, setIsLoadingExtra] = useState(true);

  // Fetch scenes from store and extra data locally
  useEffect(() => {
    fetchScenes(projectId);
  }, [projectId, fetchScenes]);

  // Fetch characters and audio
  useEffect(() => {
    const fetchExtraData = async () => {
      setIsLoadingExtra(true);
      try {
        const [charsRes, audioRes] = await Promise.all([
          fetch(`/api/projects/${projectId}/characters`),
          fetch(`/api/projects/${projectId}/audio`),
        ]);

        if (charsRes.ok) {
          const data = await charsRes.json();
          setCharacters(data.characters || []);
        }

        if (audioRes.ok) {
          const data = await audioRes.json();
          setProjectAudio(data.project || null);
        }
      } catch (error) {
        console.error('Error fetching extra data:', error);
      } finally {
        setIsLoadingExtra(false);
      }
    };

    fetchExtraData();
  }, [projectId]);

  // Expand all scenes when they load
  useEffect(() => {
    if (scenes.length > 0) {
      setExpandedScenes(new Set(scenes.map((s) => s.id)));
    }
  }, [scenes]);

  const toggleScene = (sceneId: string) => {
    setExpandedScenes((prev) => {
      const next = new Set(prev);
      if (next.has(sceneId)) {
        next.delete(sceneId);
      } else {
        next.add(sceneId);
      }
      return next;
    });
  };

  const handleAddShot = async (sceneId: string) => {
    const newShot = await addShot(projectId, sceneId);
    if (newShot) {
      toast.success('Plan ajoute');
    } else {
      toast.error("Erreur lors de l'ajout");
    }
  };

  const handleGenerateShots = async (sceneId: string) => {
    setGeneratingScenes((prev) => new Set(prev).add(sceneId));
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-decoupage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneId }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(`${data.count || 0} plans generes`);
        // Refresh store
        fetchScenes(projectId, true);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Erreur lors de la generation');
      }
    } catch (error) {
      console.error('Error generating shots:', error);
      toast.error('Erreur de connexion');
    } finally {
      setGeneratingScenes((prev) => {
        const next = new Set(prev);
        next.delete(sceneId);
        return next;
      });
    }
  };

  const handleUpdateShot = async (shotId: string, updates: Record<string, unknown>) => {
    await updateShot(projectId, shotId, updates);
  };

  const handleDeleteShot = async (shotId: string) => {
    await deleteShot(projectId, shotId);
    toast.success('Plan supprime');
  };

  const handleReorderShot = async (shotId: string, direction: 'up' | 'down') => {
    await reorderShot(projectId, shotId, direction);
  };

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Generate timeline markers from all shots
  const shotMarkers = scenes.flatMap((scene) =>
    getShotsByScene(scene.id)
      .filter((shot) => shot.start_time !== null && shot.end_time !== null)
      .map((shot) => ({
        id: shot.id,
        start: shot.start_time!,
        end: shot.end_time!,
        color: shot.has_vocals ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)',
        label: `S${scene.scene_number}P${shot.shot_number}`,
        type: shot.has_vocals ? ('vocal' as const) : ('shot' as const),
      }))
  );

  const totalShots = shots.length;

  if (isLoading || isLoadingExtra) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <Grid3x3 className="w-5 h-5 text-blue-400" />
          <h2 className="text-xl font-semibold">Decoupage</h2>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-400">
          <span>
            {scenes.length} scene{scenes.length > 1 ? 's' : ''}
          </span>
          <span>
            {totalShots} plan{totalShots > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Audio Timeline */}
      {projectAudio?.audio_url && (
        <Card className="bg-gradient-to-br from-[#1e3a52] to-[#1a3048] border-white/10">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-white">
              <Music className="w-5 h-5 text-purple-400" />
              <h3 className="text-lg font-semibold">Timeline Audio</h3>
              <span className="text-sm text-slate-400 ml-2">
                ({formatTime(projectAudio.audio_duration)})
              </span>
              <span className="text-xs text-slate-500 ml-auto">
                Position: {formatTime(currentAudioTime)}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <WaveformTimeline
              audioUrl={projectAudio.audio_url}
              duration={projectAudio.audio_duration || undefined}
              markers={shotMarkers}
              onTimeUpdate={setCurrentAudioTime}
              showTimeline={true}
              showControls={true}
              height={80}
              waveColor="#8b5cf6"
              progressColor="#a78bfa"
            />
          </CardContent>
        </Card>
      )}

      {/* Scenes */}
      {scenes.length === 0 ? (
        <Card className="bg-gradient-to-br from-[#1e3a52] to-[#1a3048] border-white/10">
          <CardContent className="py-12 text-center">
            <Grid3x3 className="w-12 h-12 mx-auto mb-4 text-slate-500" />
            <p className="text-slate-400">Aucune scene dans ce projet.</p>
            <p className="text-sm mt-1 text-slate-500">
              Creez d&apos;abord des scenes dans le script.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {[...scenes]
            .sort((a, b) => a.scene_number - b.scene_number)
            .map((scene) => (
              <SceneDecoupage
                key={scene.id}
                scene={scene}
                shots={getShotsByScene(scene.id)}
                characters={characters}
                hasAudio={!!projectAudio?.audio_url}
                currentAudioTime={currentAudioTime}
                isExpanded={expandedScenes.has(scene.id)}
                onToggle={() => toggleScene(scene.id)}
                onAddShot={() => handleAddShot(scene.id)}
                onGenerateShots={() => handleGenerateShots(scene.id)}
                onUpdateShot={handleUpdateShot}
                onDeleteShot={handleDeleteShot}
                onReorderShot={handleReorderShot}
                isGenerating={generatingScenes.has(scene.id)}
              />
            ))}
        </div>
      )}
    </div>
  );
}
