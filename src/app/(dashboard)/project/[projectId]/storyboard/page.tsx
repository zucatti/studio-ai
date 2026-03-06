'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
} from 'lucide-react';
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

interface Shot {
  id: string;
  scene_id: string;
  shot_number: number;
  description: string;
  shot_type: string | null;
  camera_angle: string | null;
  camera_movement: string | null;
  storyboard_image_url: string | null;
  generation_status: string;
  generation_error: string | null;
}

interface Scene {
  id: string;
  scene_number: number;
  int_ext: string;
  location: string;
  time_of_day: string;
  shots: Shot[];
}

export default function StoryboardPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [scenes, setScenes] = useState<Scene[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | 'all'>('all');
  const [currentShotIndex, setCurrentShotIndex] = useState(0);

  const fetchScenes = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/projects/${projectId}/scenes`);
      if (res.ok) {
        const data = await res.json();
        setScenes(data.scenes || []);
      }
    } catch (error) {
      console.error('Error fetching scenes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchScenes();
  }, [fetchScenes]);

  // Flatten all shots and sort them
  const allShots = useMemo(() => {
    const filteredScenes = selectedSceneId === 'all'
      ? scenes
      : scenes.filter((s) => s.id === selectedSceneId);

    // Sort scenes by scene_number, then flatten and sort shots by shot_number
    return filteredScenes
      .sort((a, b) => a.scene_number - b.scene_number)
      .flatMap((scene) =>
        (scene.shots || [])
          .sort((a, b) => a.shot_number - b.shot_number)
          .map((shot) => ({
            ...shot,
            sceneName: `${scene.int_ext}. ${scene.location}`,
            sceneNumber: scene.scene_number,
          }))
      );
  }, [scenes, selectedSceneId]);

  const currentShot = allShots[currentShotIndex];

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
          await fetchScenes();
        } else {
          setGenerationProgress(`${data.completed}/${data.total} storyboards générés...`);
          await fetchScenes(); // Refresh to show new image
        }
      } catch (error) {
        setGenerationProgress('Erreur lors de la génération');
        continueGenerating = false;
      }
    }

    setIsGenerating(false);
    setTimeout(() => setGenerationProgress(null), 3000);
  };

  const handleGenerateSingle = async (shotId: string) => {
    setIsGenerating(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/shots/${shotId}/generate-storyboard`, {
        method: 'POST',
      });

      if (res.ok) {
        await fetchScenes();
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
        await fetchScenes();
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (allShots.length === 0) {
    return (
      <div className="rounded-xl bg-[#151d28] border border-white/5 py-12 text-center">
        <LayoutGrid className="w-12 h-12 mx-auto mb-4 text-slate-500" />
        <p className="text-slate-400">Aucun plan à afficher.</p>
        <p className="text-sm mt-1 text-slate-500">
          Créez d&apos;abord des plans dans l&apos;onglet Script.
        </p>
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

      {/* Thumbnail strip */}
      <div className="rounded-xl bg-[#151d28] border border-white/5">
        <div className="flex gap-2 p-3 overflow-x-auto">
          {allShots.map((shot, index) => (
            <button
              key={shot.id}
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
                <img
                  src={shot.storyboard_image_url}
                  alt={`Shot ${shot.shot_number}`}
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
                {shot.shot_number}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {currentShot && (
            <div className="rounded-xl overflow-hidden bg-[#151d28] border border-white/5">
              <div className="h-12 bg-slate-700 px-4 flex items-center justify-between">
                <span className="font-bold text-white uppercase tracking-wide text-sm">
                  SCÈNE {currentShot.sceneNumber} - PLAN {currentShot.shot_number}
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
                </div>
              </div>
              <div>
                <div className="aspect-video bg-black/20 flex items-center justify-center relative">
                  {currentShot.storyboard_image_url ? (
                    <img
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
                <div className="p-4 border-t border-white/5">
                  <p className="text-sm text-slate-300">{currentShot.description}</p>
                </div>
                {currentShot.storyboard_image_url && (
                  <div className="px-4 pb-4 flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/10 text-slate-300 hover:bg-white/10"
                      onClick={() => handleGenerateSingle(currentShot.id)}
                      disabled={isGenerating}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Régénérer
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Generation card */}
          <div className="rounded-xl overflow-hidden bg-[#151d28] border border-white/5">
            <div className="h-12 bg-slate-700 px-4 flex items-center">
              <span className="font-bold text-white uppercase tracking-wide text-sm">Génération IA</span>
              <Wand2 className="w-5 h-5 text-white/80 ml-auto" />
            </div>
            <div className="p-4 space-y-4">
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
            </div>
          </div>

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
                  {Math.round((shotsWithStoryboard.length / allShots.length) * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
