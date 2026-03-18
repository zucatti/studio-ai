'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { MentionInput } from '@/components/ui/mention-input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Loader2,
  Wand2,
  ImageIcon,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Trash2,
  Camera,
  Film,
  ChevronDown,
  ChevronUp,
  Music,
  Plus,
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
import { PromptEditor } from '@/components/storyboard/PromptEditor';
import { CameraSettings } from '@/components/decoupage/CameraSettings';
import { TimelineBinding } from '@/components/decoupage/TimelineBinding';
import { WaveformTimeline } from '@/components/audio/WaveformTimeline';
import { MentionText, type MentionEntity } from '@/components/ui/mention-text';
import { useShotsStore, type Shot } from '@/store/shots-store';
import { useBibleStore } from '@/store/bible-store';
import { toast } from 'sonner';
import type { ShotType, CameraAngle, CameraMovement } from '@/types/shot';
import { generateReferenceName, getReferencePrefix } from '@/lib/reference-name';

interface Character {
  id: string;
  name: string;
}

interface ProjectAudio {
  audio_url: string | null;
  audio_duration: number | null;
}

export default function StoryboardPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  // Use shared store
  const {
    scenes,
    shots,
    isLoading,
    fetchScenes,
    updateShot,
    deleteShot,
    addShot,
    getShotsByScene,
  } = useShotsStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | 'all'>('all');
  const [currentShotIndex, setCurrentShotIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'shot' | 'camera' | 'generation'>('shot');
  const [showTimeline, setShowTimeline] = useState(true);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState('');

  // Extra data
  const [characters, setCharacters] = useState<Character[]>([]);
  const [projectAudio, setProjectAudio] = useState<ProjectAudio | null>(null);
  const [currentAudioTime, setCurrentAudioTime] = useState(0);
  const [generatingScenes, setGeneratingScenes] = useState<Set<string>>(new Set());

  // Bible store for mention entities
  const { projectAssets, fetchProjectAssets } = useBibleStore();

  // Fetch scenes on mount
  useEffect(() => {
    fetchScenes(projectId);
    fetchProjectAssets(projectId);
  }, [projectId, fetchScenes, fetchProjectAssets]);

  // Build mention entities from project assets
  const mentionEntities = useMemo((): MentionEntity[] => {
    return projectAssets.map((asset) => {
      const assetType = asset.asset_type as 'character' | 'location' | 'prop';
      const prefix = getReferencePrefix(assetType);
      const reference = generateReferenceName(asset.name, prefix);
      const data = asset.data as Record<string, unknown> | null;

      return {
        reference,
        name: asset.name,
        type: assetType,
        visual_description: (data?.visual_description as string) || undefined,
        reference_images: asset.reference_images || undefined,
      };
    });
  }, [projectAssets]);

  // Fetch characters and audio
  useEffect(() => {
    const fetchExtraData = async () => {
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
      }
    };

    fetchExtraData();
  }, [projectId]);

  // Flatten all shots and sort them with global index
  const allShots = useMemo(() => {
    const filteredScenes = selectedSceneId === 'all'
      ? scenes
      : scenes.filter((s) => s.id === selectedSceneId);

    let globalIndex = 0;
    const result: Array<{
      id: string;
      scene_id: string;
      shot_number: number;
      description: string;
      shot_type: ShotType | null;
      camera_angle: CameraAngle | null;
      camera_movement: CameraMovement | null;
      camera_notes: string | null;
      storyboard_image_url: string | null;
      storyboard_prompt: string | null;
      generation_status: string;
      generation_error: string | null;
      start_time: number | null;
      end_time: number | null;
      has_vocals: boolean;
      lip_sync_enabled: boolean;
      singing_character_id: string | null;
      sceneName: string;
      sceneNumber: number;
      sceneId: string;
      globalIndex: number;
      isFirstInScene: boolean;
    }> = [];

    [...filteredScenes]
      .sort((a, b) => a.scene_number - b.scene_number)
      .forEach((scene) => {
        const sceneShots = getShotsByScene(scene.id);
        sceneShots.forEach((shot, idx) => {
          globalIndex++;
          result.push({
            id: shot.id,
            scene_id: shot.scene_id,
            shot_number: shot.shot_number,
            description: shot.description,
            shot_type: shot.shot_type,
            camera_angle: shot.camera_angle,
            camera_movement: shot.camera_movement,
            camera_notes: shot.camera_notes,
            storyboard_image_url: shot.storyboard_image_url,
            storyboard_prompt: shot.storyboard_prompt,
            generation_status: shot.generation_status,
            generation_error: shot.generation_error,
            start_time: shot.start_time,
            end_time: shot.end_time,
            has_vocals: shot.has_vocals,
            lip_sync_enabled: shot.lip_sync_enabled,
            singing_character_id: shot.singing_character_id,
            sceneName: `${scene.int_ext}. ${scene.location}`,
            sceneNumber: scene.scene_number,
            sceneId: scene.id,
            globalIndex,
            isFirstInScene: idx === 0,
          });
        });
      });

    return result;
  }, [scenes, shots, selectedSceneId, getShotsByScene]);

  const currentShot = allShots[currentShotIndex];

  // Sync description value when shot changes
  useEffect(() => {
    if (currentShot) {
      setDescriptionValue(currentShot.description || '');
      setEditingDescription(false);
    }
  }, [currentShot?.id]);

  const shotsWithoutStoryboard = allShots.filter((s) => !s.storyboard_image_url);
  const shotsWithStoryboard = allShots.filter((s) => s.storyboard_image_url);

  const handlePrevShot = () => {
    setCurrentShotIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNextShot = () => {
    setCurrentShotIndex((prev) => Math.min(allShots.length - 1, prev + 1));
  };

  const handleGenerateAll = async () => {
    setIsGenerating(true);
    setGenerationProgress('Démarrage de la génération...');

    let continueGenerating = true;

    while (continueGenerating) {
      try {
        const res = await fetch(`/api/projects/${projectId}/generate-storyboards`, {
          method: 'POST',
        });

        const data = await res.json();

        if (!res.ok) {
          setGenerationProgress(`Erreur: ${data.error}`);
          continueGenerating = false;
        } else if (data.done) {
          setGenerationProgress('Tous les storyboards sont générés !');
          continueGenerating = false;
          fetchScenes(projectId, true);
        } else {
          setGenerationProgress(`${data.completed}/${data.total} storyboards générés...`);
          fetchScenes(projectId, true);
        }
      } catch (error) {
        setGenerationProgress('Erreur lors de la génération');
        continueGenerating = false;
      }
    }

    setIsGenerating(false);
    setTimeout(() => setGenerationProgress(null), 3000);
  };

  const handleGenerateSingle = async (shotId: string, customPrompt?: string) => {
    setIsGenerating(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/shots/${shotId}/generate-storyboard`, {
        method: 'POST',
        headers: customPrompt ? { 'Content-Type': 'application/json' } : undefined,
        body: customPrompt ? JSON.stringify({ customPrompt }) : undefined,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.shot) {
          updateShot(projectId, shotId, {
            storyboard_image_url: data.shot.storyboard_image_url,
            storyboard_prompt: data.shot.storyboard_prompt,
            generation_status: data.shot.generation_status,
          });
        } else {
          fetchScenes(projectId, true);
        }
      }
    } catch (error) {
      console.error('Error generating storyboard:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteAllStoryboards = async () => {
    setIsGenerating(true);
    setGenerationProgress('Suppression des storyboards...');

    try {
      const res = await fetch(`/api/projects/${projectId}/storyboards`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchScenes(projectId, true);
        setGenerationProgress('Tous les storyboards ont été supprimés');
      } else {
        const data = await res.json();
        setGenerationProgress(`Erreur: ${data.error}`);
      }
    } catch (error) {
      console.error('Error deleting storyboards:', error);
      setGenerationProgress('Erreur lors de la suppression');
    } finally {
      setIsGenerating(false);
      setTimeout(() => setGenerationProgress(null), 3000);
    }
  };

  const handleDeleteShot = async (shotId: string) => {
    await deleteShot(projectId, shotId);
    if (currentShotIndex >= allShots.length - 1 && currentShotIndex > 0) {
      setCurrentShotIndex(currentShotIndex - 1);
    }
  };

  const handleUpdateShot = async (updates: Partial<Shot>) => {
    if (!currentShot) return;
    await updateShot(projectId, currentShot.id, updates);
  };

  const handleSaveDescription = async () => {
    if (!currentShot) return;
    await updateShot(projectId, currentShot.id, { description: descriptionValue });
    setEditingDescription(false);
    toast.success('Description sauvegardée');
  };

  const handleAddShot = async () => {
    if (!currentShot) return;
    const newShot = await addShot(projectId, currentShot.sceneId);
    if (newShot) {
      toast.success('Plan ajouté');
      fetchScenes(projectId, true);
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
        toast.success(`${data.count || 0} plans générés`);
        fetchScenes(projectId, true);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Erreur lors de la génération');
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

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Generate timeline markers from all shots
  const shotMarkers = useMemo(() => {
    return scenes.flatMap((scene) =>
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
  }, [scenes, getShotsByScene]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (allShots.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-white">
            <LayoutGrid className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-semibold">Storyboard</h2>
          </div>
        </div>
        <div className="rounded-xl bg-[#151d28] border border-white/5 py-12 text-center">
          <LayoutGrid className="w-12 h-12 mx-auto mb-4 text-slate-500" />
          <p className="text-slate-400">Aucun plan à afficher.</p>
          <p className="text-sm mt-1 text-slate-500">
            Créez d&apos;abord des plans dans l&apos;onglet Script.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-white">
          <LayoutGrid className="w-5 h-5 text-blue-400" />
          <h2 className="text-xl font-semibold">Storyboard</h2>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <Select
            value={selectedSceneId}
            onValueChange={(v) => {
              setSelectedSceneId(v);
              setCurrentShotIndex(0);
            }}
          >
            <SelectTrigger className="w-[250px] bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="Filtrer par scène" />
            </SelectTrigger>
            <SelectContent className="bg-[#1a2e44] border-white/10">
              <SelectItem value="all">Toutes les scènes</SelectItem>
              {scenes.map((scene) => (
                <SelectItem key={scene.id} value={scene.id}>
                  {scene.scene_number}. {scene.int_ext}. {scene.location}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrevShot}
              disabled={currentShotIndex === 0}
              className="border-white/10 text-white hover:bg-white/10"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-slate-400 min-w-[80px] text-center">
              {currentShotIndex + 1} / {allShots.length}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={handleNextShot}
              disabled={currentShotIndex === allShots.length - 1}
              className="border-white/10 text-white hover:bg-white/10"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Thumbnail strip with scene separators */}
      <div className="rounded-xl bg-[#151d28] border border-white/5">
        <div className="flex gap-2 p-3 overflow-x-auto items-center">
          {allShots.map((shot, index) => (
            <div key={shot.id} className="flex items-center gap-2">
              {/* Scene separator */}
              {shot.isFirstInScene && index > 0 && (
                <div className="flex flex-col items-center px-2">
                  <div className="w-px h-6 bg-white/20" />
                  <span className="text-[9px] text-slate-500 whitespace-nowrap">S{shot.sceneNumber}</span>
                  <div className="w-px h-6 bg-white/20" />
                </div>
              )}
              {/* Scene label for first shot */}
              {shot.isFirstInScene && (
                <div className="flex-shrink-0 px-2 py-1 bg-slate-700/50 rounded text-[10px] text-slate-300 whitespace-nowrap">
                  S{shot.sceneNumber}
                </div>
              )}
              <button
                onClick={() => setCurrentShotIndex(index)}
                className={`
                  relative flex-shrink-0 w-24 h-14 rounded-lg overflow-hidden border-2 transition-all
                  ${index === currentShotIndex
                    ? 'border-blue-500 ring-2 ring-blue-500/30'
                    : 'border-white/10 hover:border-white/30'
                  }
                `}
              >
                {shot.storyboard_image_url ? (
                  <StorageImg
                    src={shot.storyboard_image_url}
                    alt={`Shot ${shot.globalIndex}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-white/5 flex items-center justify-center">
                    {shot.generation_status === 'generating' ? (
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                    ) : shot.generation_status === 'failed' ? (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                )}
                <span className="absolute bottom-0.5 right-0.5 text-[10px] bg-black/60 px-1 rounded text-white">
                  {shot.globalIndex}
                </span>
              </button>
            </div>
          ))}
          {/* Add shot button */}
          {currentShot && (
            <button
              onClick={handleAddShot}
              className="flex-shrink-0 w-12 h-14 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-slate-500 hover:text-white hover:border-white/40 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Main content - 2 column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Main viewer */}
        <div className="lg:col-span-2">
          {currentShot && (
            <div className="rounded-xl overflow-hidden bg-[#151d28] border border-white/5">
              {/* Header bar */}
              <div className="h-12 bg-slate-700 px-4 flex items-center justify-between">
                <span className="font-bold text-white uppercase tracking-wide text-sm">
                  SCÈNE {currentShot.sceneNumber} - PLAN {currentShot.globalIndex}
                </span>
                <div className="flex items-center gap-2">
                  {currentShot.shot_type && (
                    <span className="text-xs text-white/80 bg-white/20 px-2 py-0.5 rounded">
                      {currentShot.shot_type}
                    </span>
                  )}
                  {currentShot.camera_angle && (
                    <span className="text-xs text-white/80 bg-white/20 px-2 py-0.5 rounded">
                      {currentShot.camera_angle}
                    </span>
                  )}
                  {currentShot.camera_movement && (
                    <span className="text-xs text-white/80 bg-purple-500/30 px-2 py-0.5 rounded">
                      {currentShot.camera_movement}
                    </span>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-[#1a2433] border-white/10">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">Supprimer ce plan ?</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400">
                          Le plan {currentShot.globalIndex} sera définitivement supprimé avec son storyboard.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
                          Annuler
                        </AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-500 hover:bg-red-600"
                          onClick={() => handleDeleteShot(currentShot.id)}
                        >
                          Supprimer
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              {/* Image viewer */}
              <div className="aspect-video bg-black/20 flex items-center justify-center relative">
                {currentShot.storyboard_image_url ? (
                  <StorageImg
                    src={currentShot.storyboard_image_url}
                    alt={`Storyboard shot ${currentShot.shot_number}`}
                    className="w-full h-full object-contain"
                  />
                ) : currentShot.generation_status === 'generating' ? (
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">Génération en cours...</p>
                  </div>
                ) : currentShot.generation_status === 'failed' ? (
                  <div className="text-center">
                    <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-2" />
                    <p className="text-red-400 text-sm">Échec de la génération</p>
                    {currentShot.generation_error && (
                      <p className="text-xs text-slate-500 mt-1">{currentShot.generation_error}</p>
                    )}
                    <Button
                      size="sm"
                      className="mt-3 bg-blue-500 hover:bg-blue-600"
                      onClick={() => handleGenerateSingle(currentShot.id)}
                      disabled={isGenerating}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Réessayer
                    </Button>
                  </div>
                ) : (
                  <div className="text-center">
                    <ImageIcon className="w-12 h-12 text-slate-500 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">Pas encore de storyboard</p>
                    <Button
                      size="sm"
                      className="mt-3 bg-blue-600 hover:bg-blue-700"
                      onClick={() => handleGenerateSingle(currentShot.id)}
                      disabled={isGenerating}
                    >
                      <Wand2 className="w-4 h-4 mr-2" />
                      Générer
                    </Button>
                  </div>
                )}
              </div>

              {/* Description and prompt info */}
              <div className="p-4 border-t border-white/5 space-y-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Description</p>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    <MentionText
                      text={currentShot.description}
                      entities={mentionEntities}
                      showTooltip
                    />
                  </p>
                </div>
                {currentShot.storyboard_prompt && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Prompt utilisé</p>
                    <p className="text-xs text-slate-400 bg-white/5 p-2 rounded leading-relaxed">
                      {currentShot.storyboard_prompt}
                    </p>
                  </div>
                )}
              </div>

              {/* Regenerate buttons */}
              {currentShot.storyboard_image_url && (
                <div className="px-4 pb-4 flex justify-end gap-2">
                  <PromptEditor
                    shotId={currentShot.id}
                    projectId={projectId}
                    currentPrompt={currentShot.storyboard_prompt}
                    onRegenerate={handleGenerateSingle}
                    isGenerating={isGenerating}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/10 text-slate-300 hover:bg-white/10"
                    onClick={() => handleGenerateSingle(currentShot.id)}
                    disabled={isGenerating}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Régénérer (auto)
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Side panel with tabs */}
        <div className="space-y-4">
          {currentShot && (
            <div className="rounded-xl overflow-hidden bg-[#151d28] border border-white/5">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
                <div className="bg-slate-700 px-2">
                  <TabsList className="bg-transparent h-12 w-full justify-start gap-1">
                    <TabsTrigger
                      value="shot"
                      className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-slate-400"
                    >
                      <Film className="w-4 h-4 mr-2" />
                      Plan
                    </TabsTrigger>
                    <TabsTrigger
                      value="camera"
                      className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-slate-400"
                    >
                      <Camera className="w-4 h-4 mr-2" />
                      Caméra
                    </TabsTrigger>
                    <TabsTrigger
                      value="generation"
                      className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-slate-400"
                    >
                      <Wand2 className="w-4 h-4 mr-2" />
                      IA
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Shot Tab */}
                <TabsContent value="shot" className="p-4 space-y-4 mt-0">
                  <div className="space-y-2">
                    <Label className="text-slate-300 text-sm">Description du plan</Label>
                    <MentionInput
                      value={descriptionValue}
                      onChange={(newValue) => {
                        setDescriptionValue(newValue);
                        // Auto-save on change (debounced via the input)
                        if (currentShot && newValue !== currentShot.description) {
                          updateShot(projectId, currentShot.id, { description: newValue });
                        }
                      }}
                      placeholder="Décrivez le plan... (@Personnage #Lieu !Référence)"
                      projectId={projectId}
                      minHeight="100px"
                    />
                  </div>

                  {/* Timeline binding if audio exists */}
                  {projectAudio?.audio_url && (
                    <div className="space-y-2">
                      <Label className="text-slate-300 text-sm">Synchronisation audio</Label>
                      <TimelineBinding
                        startTime={currentShot.start_time}
                        endTime={currentShot.end_time}
                        hasVocals={currentShot.has_vocals}
                        lipSyncEnabled={currentShot.lip_sync_enabled}
                        singingCharacterId={currentShot.singing_character_id}
                        characters={characters}
                        currentTime={currentAudioTime}
                        onSetStartTime={() => handleUpdateShot({ start_time: currentAudioTime })}
                        onSetEndTime={() => handleUpdateShot({ end_time: currentAudioTime })}
                        onToggleVocals={() => handleUpdateShot({ has_vocals: !currentShot.has_vocals })}
                        onSetSingingCharacter={(id) => handleUpdateShot({ singing_character_id: id })}
                      />
                    </div>
                  )}
                </TabsContent>

                {/* Camera Tab */}
                <TabsContent value="camera" className="p-4 mt-0">
                  <CameraSettings
                    shotType={currentShot.shot_type}
                    cameraAngle={currentShot.camera_angle}
                    cameraMovement={currentShot.camera_movement}
                    cameraNotes={currentShot.camera_notes}
                    onUpdate={(updates) => handleUpdateShot(updates)}
                  />
                </TabsContent>

                {/* Generation Tab */}
                <TabsContent value="generation" className="p-4 space-y-4 mt-0">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-slate-300">
                      <span>Plans avec storyboard</span>
                      <span className="flex items-center gap-1">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        {shotsWithStoryboard.length}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Plans sans storyboard</span>
                      <span>{shotsWithoutStoryboard.length}</span>
                    </div>
                  </div>

                  {generationProgress && (
                    <p className="text-sm text-blue-300 bg-blue-500/10 p-2 rounded">
                      {generationProgress}
                    </p>
                  )}

                  <Button
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    onClick={handleGenerateAll}
                    disabled={isGenerating || shotsWithoutStoryboard.length === 0}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Génération en cours...
                      </>
                    ) : shotsWithoutStoryboard.length === 0 ? (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Tous les storyboards générés
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4 mr-2" />
                        Générer {shotsWithoutStoryboard.length} storyboard{shotsWithoutStoryboard.length > 1 ? 's' : ''}
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-slate-400">
                    Style: croquis au crayon, noir et blanc, style storyboard professionnel
                  </p>

                  {/* Generate shots for current scene */}
                  {currentShot && (
                    <Button
                      variant="outline"
                      className="w-full border-white/10 text-slate-300 hover:bg-white/10"
                      onClick={() => handleGenerateShots(currentShot.sceneId)}
                      disabled={generatingScenes.has(currentShot.sceneId)}
                    >
                      {generatingScenes.has(currentShot.sceneId) ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Génération des plans...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-2" />
                          Générer plans (Scène {currentShot.sceneNumber})
                        </>
                      )}
                    </Button>
                  )}

                  {shotsWithStoryboard.length > 0 && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                          disabled={isGenerating}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Supprimer tous les storyboards
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-[#1a2433] border-white/10">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-white">
                            Supprimer tous les storyboards ?
                          </AlertDialogTitle>
                          <AlertDialogDescription className="text-slate-400">
                            Cette action supprimera les {shotsWithStoryboard.length} storyboard{shotsWithStoryboard.length > 1 ? 's' : ''} généré{shotsWithStoryboard.length > 1 ? 's' : ''}.
                            Les fichiers seront également supprimés du stockage.
                            Cette action est irréversible.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
                            Annuler
                          </AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-red-500 hover:bg-red-600 text-white"
                            onClick={handleDeleteAllStoryboards}
                          >
                            Supprimer
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* Stats card */}
          <div className="rounded-xl overflow-hidden bg-[#151d28] border border-white/5">
            <div className="h-12 bg-slate-700 px-4 flex items-center">
              <span className="font-bold text-white uppercase tracking-wide text-sm">Résumé</span>
            </div>
            <div className="p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Scènes</span>
                <span className="font-medium text-white">{scenes.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Plans total</span>
                <span className="font-medium text-white">{allShots.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Progression</span>
                <span className="font-medium text-white">
                  {allShots.length > 0 ? Math.round((shotsWithStoryboard.length / allShots.length) * 100) : 0}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Audio Timeline (collapsible) */}
      {projectAudio?.audio_url && (
        <Collapsible open={showTimeline} onOpenChange={setShowTimeline}>
          <div className="rounded-xl overflow-hidden bg-[#151d28] border border-white/5">
            <CollapsibleTrigger className="w-full h-12 bg-slate-700 px-4 flex items-center justify-between hover:bg-slate-600 transition-colors">
              <div className="flex items-center gap-2">
                <Music className="w-5 h-5 text-purple-400" />
                <span className="font-bold text-white uppercase tracking-wide text-sm">Timeline Audio</span>
                <span className="text-sm text-slate-400 ml-2">
                  ({formatTime(projectAudio.audio_duration)})
                </span>
                <span className="text-xs text-slate-500 ml-auto mr-4">
                  Position: {formatTime(currentAudioTime)}
                </span>
              </div>
              {showTimeline ? (
                <ChevronUp className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-4">
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
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}
    </div>
  );
}
