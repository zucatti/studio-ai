'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Clapperboard, Loader2, ChevronDown, ChevronRight, Wand2, Trash2 } from 'lucide-react';
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

interface Dialogue {
  id: string;
  character_name: string;
  content: string;
  parenthetical?: string | null;
}

interface Action {
  id: string;
  content: string;
}

interface Shot {
  id: string;
  scene_id: string;
  shot_number: number;
  description: string;
  shot_type: string | null;
  camera_angle: string | null;
  camera_movement: string | null;
  generation_status: string;
  dialogues: Dialogue[];
  actions: Action[];
}

interface Scene {
  id: string;
  project_id: string;
  scene_number: number;
  int_ext: 'INT' | 'EXT' | 'INT/EXT';
  location: string;
  time_of_day: 'JOUR' | 'NUIT' | 'AUBE' | 'CREPUSCULE';
  description: string | null;
  shots: Shot[];
}

const SHOT_TYPES = [
  { value: 'wide', label: 'Plan large' },
  { value: 'medium', label: 'Plan moyen' },
  { value: 'close_up', label: 'Gros plan' },
  { value: 'extreme_close_up', label: 'Très gros plan' },
  { value: 'over_shoulder', label: 'Par-dessus épaule' },
  { value: 'pov', label: 'Point de vue' },
];

const CAMERA_ANGLES = [
  { value: 'eye_level', label: 'Niveau des yeux' },
  { value: 'low_angle', label: 'Contre-plongée' },
  { value: 'high_angle', label: 'Plongée' },
  { value: 'dutch_angle', label: 'Angle hollandais' },
  { value: 'birds_eye', label: 'Vue aérienne' },
  { value: 'worms_eye', label: 'Vue en contre-plongée extrême' },
];

const CAMERA_MOVEMENTS = [
  { value: 'static', label: 'Statique' },
  { value: 'pan_left', label: 'Panoramique gauche' },
  { value: 'pan_right', label: 'Panoramique droite' },
  { value: 'tilt_up', label: 'Tilt haut' },
  { value: 'tilt_down', label: 'Tilt bas' },
  { value: 'dolly_in', label: 'Travelling avant' },
  { value: 'dolly_out', label: 'Travelling arrière' },
  { value: 'tracking', label: 'Travelling latéral' },
  { value: 'crane', label: 'Grue' },
  { value: 'handheld', label: 'Caméra portée' },
];

export default function ScriptPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [scenes, setScenes] = useState<Scene[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());

  const fetchScenes = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/projects/${projectId}/scenes`);
      if (res.ok) {
        const data = await res.json();
        setScenes(data.scenes || []);
        // Expand all scenes by default
        setExpandedScenes(new Set((data.scenes || []).map((s: Scene) => s.id)));
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

  const totalShots = scenes.reduce((acc, s) => acc + (s.shots?.length || 0), 0);

  const handleDeleteScript = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/scenes`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setScenes([]);
        router.push(`/project/${projectId}/brainstorming`);
      }
    } catch (error) {
      console.error('Error deleting script:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div className="lg:col-span-3 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Clapperboard className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-semibold">Scénario</h2>
          </div>
        </div>

        {scenes.length === 0 ? (
          <Card className="bg-gradient-to-br from-[#1e3a52] to-[#1a3048] border-white/10">
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 mx-auto mb-4 text-slate-500" />
              <p className="text-slate-400">Aucune scène dans ce projet.</p>
              <p className="text-sm mt-1 text-slate-500">
                Retournez au brainstorming et utilisez la génération IA pour créer votre script.
              </p>
              <Button
                className="mt-4 bg-blue-600 hover:bg-blue-700"
                onClick={() => router.push(`/project/${projectId}/brainstorming`)}
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Générer avec l&apos;IA
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {scenes
              .sort((a, b) => a.scene_number - b.scene_number)
              .map((scene) => (
                <Card
                  key={scene.id}
                  className="bg-gradient-to-br from-[#1e3a52] to-[#1a3048] border-white/10 overflow-hidden"
                >
                  <CardHeader
                    className="cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => toggleScene(scene.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {expandedScenes.has(scene.id) ? (
                          <ChevronDown className="w-5 h-5 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-slate-400" />
                        )}
                        <div>
                          <CardTitle className="text-white font-mono text-sm">
                            SCÈNE {scene.scene_number} - {scene.int_ext}. {scene.location} - {scene.time_of_day}
                          </CardTitle>
                          {scene.description && (
                            <p className="text-sm text-slate-400 mt-1">{scene.description}</p>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-slate-500 bg-white/5 px-2 py-1 rounded">
                        {scene.shots?.length || 0} plan{(scene.shots?.length || 0) > 1 ? 's' : ''}
                      </span>
                    </div>
                  </CardHeader>

                  {expandedScenes.has(scene.id) && scene.shots && scene.shots.length > 0 && (
                    <CardContent className="pt-0 space-y-3">
                      {scene.shots
                        .sort((a, b) => a.shot_number - b.shot_number)
                        .map((shot) => (
                          <div
                            key={shot.id}
                            className="p-4 bg-white/5 rounded-lg border border-white/5"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                                  PLAN {shot.shot_number}
                                </span>
                                {shot.shot_type && (
                                  <span className="text-xs text-slate-400 bg-white/5 px-2 py-0.5 rounded">
                                    {SHOT_TYPES.find((t) => t.value === shot.shot_type)?.label || shot.shot_type}
                                  </span>
                                )}
                                {shot.camera_angle && (
                                  <span className="text-xs text-slate-400 bg-white/5 px-2 py-0.5 rounded">
                                    {CAMERA_ANGLES.find((a) => a.value === shot.camera_angle)?.label || shot.camera_angle}
                                  </span>
                                )}
                                {shot.camera_movement && shot.camera_movement !== 'static' && (
                                  <span className="text-xs text-slate-400 bg-white/5 px-2 py-0.5 rounded">
                                    {CAMERA_MOVEMENTS.find((m) => m.value === shot.camera_movement)?.label || shot.camera_movement}
                                  </span>
                                )}
                              </div>
                            </div>

                            <p className="text-sm text-slate-300 mb-3">{shot.description}</p>

                            {/* Actions */}
                            {shot.actions && shot.actions.length > 0 && (
                              <div className="mb-3 space-y-1">
                                {shot.actions.map((action) => (
                                  <p key={action.id} className="text-sm text-slate-400 italic">
                                    {action.content}
                                  </p>
                                ))}
                              </div>
                            )}

                            {/* Dialogues */}
                            {shot.dialogues && shot.dialogues.length > 0 && (
                              <div className="space-y-2 pl-4 border-l-2 border-blue-500/30">
                                {shot.dialogues.map((dialogue) => (
                                  <div key={dialogue.id}>
                                    <p className="text-xs font-semibold text-blue-400 uppercase">
                                      {dialogue.character_name}
                                      {dialogue.parenthetical && (
                                        <span className="font-normal text-slate-500 ml-2">
                                          {dialogue.parenthetical}
                                        </span>
                                      )}
                                    </p>
                                    <p className="text-sm text-white">{dialogue.content}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                    </CardContent>
                  )}
                </Card>
              ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <Card className="bg-gradient-to-br from-[#1e3a52] to-[#1a3048] border-white/10">
          <CardHeader>
            <CardTitle className="text-lg text-white">Résumé</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Scènes</span>
              <span className="font-medium text-white">{scenes.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Plans</span>
              <span className="font-medium text-white">{totalShots}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#151d28] border-white/5">
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-slate-400" />
              Régénérer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-400">
              Modifiez le brainstorming et régénérez le script avec l&apos;IA.
            </p>
            <Button
              variant="outline"
              className="w-full border-white/10 text-slate-300 hover:bg-white/5"
              onClick={() => router.push(`/project/${projectId}/brainstorming`)}
            >
              Retour au brainstorming
            </Button>
          </CardContent>
        </Card>

        {scenes.length > 0 && (
          <Card className="bg-gradient-to-br from-red-900/30 to-red-950/30 border-red-500/20">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-400" />
                Supprimer le script
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-300">
                Supprime toutes les scènes et plans générés.
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Suppression...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Supprimer
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-[#1a2e44] border-white/10">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-white">
                      Supprimer le script ?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-slate-400">
                      Cette action supprimera toutes les scènes ({scenes.length}) et tous les plans ({totalShots}) de ce projet. Cette action est irréversible.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
                      Annuler
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteScript}
                      className="bg-red-500 hover:bg-red-600 text-white"
                    >
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        )}

        <Card className="bg-gradient-to-br from-[#1e3a52] to-[#1a3048] border-white/10">
          <CardHeader>
            <CardTitle className="text-lg text-white">Format</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-400 space-y-2">
            <p>
              <strong className="text-slate-200">INT./EXT.</strong> - Intérieur ou extérieur
            </p>
            <p>
              <strong className="text-slate-200">LIEU</strong> - Nom du lieu en majuscules
            </p>
            <p>
              <strong className="text-slate-200">MOMENT</strong> - JOUR, NUIT, AUBE, CRÉPUSCULE
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
