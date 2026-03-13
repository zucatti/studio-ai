'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  FileText,
  Loader2,
  Plus,
  Save,
  Trash2,
  Wand2,
  MapPin,
  Users,
  Package,
  ChevronRight,
  GripVertical,
  Music,
  Clock,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { WaveformTimeline } from '@/components/audio/WaveformTimeline';
import { AudioUploader } from '@/components/audio/AudioUploader';
import type { AudioAsset } from '@/types/audio';

interface SynopsisScene {
  id: string;
  scene_number: number;
  int_ext: 'INT' | 'EXT' | 'INT/EXT';
  location: string;
  time_of_day: 'JOUR' | 'NUIT' | 'AUBE' | 'CREPUSCULE';
  description: string | null;
  // Timeline binding
  start_time: number | null;
  end_time: number | null;
  // Extracted entities (computed from description)
  detected_characters?: string[];
  detected_locations?: string[];
  detected_props?: string[];
}

interface ProjectAudio {
  audio_url: string | null;
  audio_duration: number | null;
  audio_waveform_data: number[] | null;
}

const INT_EXT_OPTIONS = [
  { value: 'INT', label: 'INT.' },
  { value: 'EXT', label: 'EXT.' },
  { value: 'INT/EXT', label: 'INT./EXT.' },
];

const TIME_OPTIONS = [
  { value: 'JOUR', label: 'JOUR' },
  { value: 'NUIT', label: 'NUIT' },
  { value: 'AUBE', label: 'AUBE' },
  { value: 'CREPUSCULE', label: 'CRÉPUSCULE' },
];

export default function SynopsisPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [scenes, setScenes] = useState<SynopsisScene[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Audio timeline state
  const [projectAudio, setProjectAudio] = useState<ProjectAudio | null>(null);
  const [audioAssets, setAudioAssets] = useState<AudioAsset[]>([]);
  const [showAudioUploader, setShowAudioUploader] = useState(false);
  const [currentAudioTime, setCurrentAudioTime] = useState(0);
  const [editingSceneTime, setEditingSceneTime] = useState<string | null>(null);

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

  const fetchAudio = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/audio`);
      if (res.ok) {
        const data = await res.json();
        setProjectAudio(data.project || null);
        setAudioAssets(data.audioAssets || []);
      }
    } catch (error) {
      console.error('Error fetching audio:', error);
    }
  }, [projectId]);

  useEffect(() => {
    fetchScenes();
    fetchAudio();
  }, [fetchScenes, fetchAudio]);

  const addScene = () => {
    const newScene: SynopsisScene = {
      id: `temp-${Date.now()}`,
      scene_number: scenes.length + 1,
      int_ext: 'INT',
      location: '',
      time_of_day: 'JOUR',
      description: '',
      start_time: null,
      end_time: null,
    };
    setScenes([...scenes, newScene]);
  };

  const handleAudioUploadComplete = async (audioAsset: AudioAsset) => {
    setShowAudioUploader(false);
    await fetchAudio();
    toast.success('Audio ajouté au projet');
  };

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const setSceneTimeFromCurrent = (sceneId: string, field: 'start_time' | 'end_time') => {
    const index = scenes.findIndex(s => s.id === sceneId);
    if (index !== -1) {
      updateScene(index, { [field]: currentAudioTime });
    }
  };

  // Generate timeline markers from scenes
  const sceneMarkers = scenes
    .filter(s => s.start_time !== null && s.end_time !== null)
    .map(s => ({
      id: s.id,
      start: s.start_time!,
      end: s.end_time!,
      color: 'rgba(59, 130, 246, 0.3)',
      label: `Scène ${s.scene_number}`,
      type: 'scene' as const,
    }));

  const updateScene = (index: number, updates: Partial<SynopsisScene>) => {
    const updated = [...scenes];
    updated[index] = { ...updated[index], ...updates };
    setScenes(updated);
  };

  const deleteScene = (index: number) => {
    setScenes(scenes.filter((_, i) => i !== index));
  };

  const saveScenes = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/synopsis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes }),
      });

      if (res.ok) {
        const data = await res.json();
        setScenes(data.scenes || []);
        toast.success('Synopsis sauvegardé');
      } else {
        const error = await res.json();
        toast.error(error.error || 'Erreur lors de la sauvegarde');
      }
    } catch (error) {
      toast.error('Erreur de connexion');
    } finally {
      setIsSaving(false);
    }
  };

  const generateFromBrainstorming = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-synopsis`, {
        method: 'POST',
      });

      if (res.ok) {
        const data = await res.json();
        setScenes(data.scenes || []);
        toast.success('Synopsis généré avec succès');
      } else {
        const error = await res.json();
        toast.error(error.error || 'Erreur lors de la génération');
      }
    } catch (error) {
      toast.error('Erreur de connexion');
    } finally {
      setIsGenerating(false);
    }
  };

  const generateScript = async () => {
    if (scenes.length === 0) {
      toast.error('Ajoutez des scènes au synopsis avant de générer le script');
      return;
    }

    // Save first
    await saveScenes();

    setIsGenerating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-script-from-synopsis`, {
        method: 'POST',
      });

      if (res.ok) {
        toast.success('Script généré');
        router.push(`/project/${projectId}/script`);
      } else {
        const error = await res.json();
        toast.error(error.error || 'Erreur lors de la génération');
      }
    } catch (error) {
      toast.error('Erreur de connexion');
    } finally {
      setIsGenerating(false);
    }
  };

  // Extract entities from description text
  const extractEntities = (text: string | null) => {
    if (!text) return { characters: [], locations: [], props: [] };

    // Simple extraction: look for capitalized words or @mentions
    const words = text.split(/\s+/);
    const characters: string[] = [];
    const props: string[] = [];

    words.forEach(word => {
      // @Mentions
      if (word.startsWith('@')) {
        const name = word.replace(/[.,!?;:'"]/g, '');
        if (!characters.includes(name)) {
          characters.push(name);
        }
      }
      // Capitalized words that could be character names (2+ chars, not at start of sentence)
      else if (/^[A-Z][a-z]{2,}$/.test(word)) {
        // This is a simple heuristic - could be improved
      }
    });

    return { characters, locations: [], props };
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
        {/* Audio Timeline Section */}
        <Card className="bg-gradient-to-br from-[#1e3a52] to-[#1a3048] border-white/10">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <Music className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg font-semibold">Timeline Audio</h3>
                {projectAudio?.audio_duration && (
                  <span className="text-sm text-slate-400 ml-2">
                    ({formatTime(projectAudio.audio_duration)})
                  </span>
                )}
              </div>
              {!projectAudio?.audio_url && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAudioUploader(true)}
                  className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Importer audio
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {projectAudio?.audio_url ? (
              <WaveformTimeline
                audioUrl={projectAudio.audio_url}
                duration={projectAudio.audio_duration || undefined}
                markers={sceneMarkers}
                onTimeUpdate={setCurrentAudioTime}
                showTimeline={true}
                showControls={true}
                height={80}
                waveColor="#8b5cf6"
                progressColor="#a78bfa"
              />
            ) : (
              <div
                onClick={() => setShowAudioUploader(true)}
                className="border-2 border-dashed border-white/20 rounded-lg p-6 text-center cursor-pointer hover:border-purple-500/50 hover:bg-purple-500/5 transition-colors"
              >
                <Music className="w-10 h-10 mx-auto mb-3 text-slate-500" />
                <p className="text-sm text-slate-400">
                  Importez un fichier audio pour créer la timeline du projet
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Musique, dialogue, ou piste mixée
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Audio Upload Dialog */}
        <Dialog open={showAudioUploader} onOpenChange={setShowAudioUploader}>
          <DialogContent className="sm:max-w-[500px] bg-[#1a2433] border-white/10">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <Music className="w-5 h-5 text-purple-400" />
                Importer Audio Principal
              </DialogTitle>
            </DialogHeader>
            <AudioUploader
              projectId={projectId}
              onUploadComplete={handleAudioUploadComplete}
              onCancel={() => setShowAudioUploader(false)}
              isMaster={true}
            />
          </DialogContent>
        </Dialog>

        {/* Synopsis Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <FileText className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-semibold">Synopsis</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={addScene}
              className="border-white/10 text-slate-300 hover:bg-white/5"
            >
              <Plus className="w-4 h-4 mr-2" />
              Ajouter scène
            </Button>
            <Button
              size="sm"
              onClick={saveScenes}
              disabled={isSaving}
              className="bg-blue-500 hover:bg-blue-600"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
            </Button>
          </div>
        </div>

        {scenes.length === 0 ? (
          <Card className="bg-gradient-to-br from-[#1e3a52] to-[#1a3048] border-white/10">
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 mx-auto mb-4 text-slate-500" />
              <p className="text-slate-400">Aucune scène dans le synopsis.</p>
              <p className="text-sm mt-1 text-slate-500">
                Générez depuis le brainstorming ou ajoutez des scènes manuellement.
              </p>
              <div className="flex items-center justify-center gap-3 mt-4">
                <Button
                  variant="outline"
                  onClick={addScene}
                  className="border-white/10 text-slate-300 hover:bg-white/5"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter manuellement
                </Button>
                <Button
                  onClick={generateFromBrainstorming}
                  disabled={isGenerating}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Wand2 className="w-4 h-4 mr-2" />
                  )}
                  Générer depuis brainstorming
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {scenes
              .sort((a, b) => a.scene_number - b.scene_number)
              .map((scene, index) => {
                const entities = extractEntities(scene.description);
                return (
                  <Card
                    key={scene.id}
                    className="bg-gradient-to-br from-[#1e3a52] to-[#1a3048] border-white/10"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <GripVertical className="w-4 h-4 text-slate-500 cursor-grab" />
                        <span className="text-sm font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                          SCÈNE {scene.scene_number}
                        </span>
                        <div className="flex-1 flex items-center gap-2">
                          <Select
                            value={scene.int_ext}
                            onValueChange={(v) => updateScene(index, { int_ext: v as any })}
                          >
                            <SelectTrigger className="w-28 h-8 bg-white/5 border-white/10 text-white text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1a2433] border-white/10">
                              {INT_EXT_OPTIONS.map((opt) => (
                                <SelectItem
                                  key={opt.value}
                                  value={opt.value}
                                  className="text-white focus:bg-white/10"
                                >
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={scene.location}
                            onChange={(e) => updateScene(index, { location: e.target.value.toUpperCase() })}
                            placeholder="LIEU"
                            className="flex-1 h-8 bg-white/5 border-white/10 text-white text-sm uppercase placeholder:normal-case"
                          />
                          <span className="text-slate-500">-</span>
                          <Select
                            value={scene.time_of_day}
                            onValueChange={(v) => updateScene(index, { time_of_day: v as any })}
                          >
                            <SelectTrigger className="w-32 h-8 bg-white/5 border-white/10 text-white text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1a2433] border-white/10">
                              {TIME_OPTIONS.map((opt) => (
                                <SelectItem
                                  key={opt.value}
                                  value={opt.value}
                                  className="text-white focus:bg-white/10"
                                >
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteScene(index)}
                          className="h-8 w-8 text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      <Textarea
                        value={scene.description || ''}
                        onChange={(e) => updateScene(index, { description: e.target.value })}
                        placeholder="Description narrative de la scène...

Décrivez ce qui se passe dans cette scène. Mentionnez les personnages avec @NomDuPersonnage pour les référencer dans le repérage.

Exemple: @Marie entre dans la pièce et découvre @Pierre assis près de la fenêtre."
                        className="min-h-[120px] resize-none bg-white/5 border-white/10 text-white text-sm placeholder:text-slate-500"
                      />

                      {/* Time binding controls */}
                      {projectAudio?.audio_url && (
                        <div className="flex items-center gap-4 pt-3 border-t border-white/5">
                          <Clock className="w-4 h-4 text-purple-400 flex-shrink-0" />
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">Début:</span>
                            <button
                              onClick={() => setSceneTimeFromCurrent(scene.id, 'start_time')}
                              className="text-xs font-mono bg-purple-500/20 text-purple-300 px-2 py-1 rounded hover:bg-purple-500/30 transition-colors"
                              title="Définir au temps actuel"
                            >
                              {formatTime(scene.start_time)}
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">Fin:</span>
                            <button
                              onClick={() => setSceneTimeFromCurrent(scene.id, 'end_time')}
                              className="text-xs font-mono bg-purple-500/20 text-purple-300 px-2 py-1 rounded hover:bg-purple-500/30 transition-colors"
                              title="Définir au temps actuel"
                            >
                              {formatTime(scene.end_time)}
                            </button>
                          </div>
                          {scene.start_time !== null && scene.end_time !== null && (
                            <span className="text-xs text-slate-500">
                              (Durée: {formatTime(scene.end_time - scene.start_time)})
                            </span>
                          )}
                        </div>
                      )}

                      {/* Detected entities */}
                      {(entities.characters.length > 0 || entities.props.length > 0) && (
                        <div className="flex items-center gap-4 pt-2 border-t border-white/5">
                          {entities.characters.length > 0 && (
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4 text-blue-400" />
                              <div className="flex gap-1">
                                {entities.characters.map((char) => (
                                  <span
                                    key={char}
                                    className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded"
                                  >
                                    {char}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
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
            {projectAudio?.audio_url && (
              <>
                <div className="flex justify-between">
                  <span className="text-slate-400">Durée audio</span>
                  <span className="font-medium text-white font-mono">
                    {formatTime(projectAudio.audio_duration)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Scènes liées</span>
                  <span className="font-medium text-white">
                    {scenes.filter(s => s.start_time !== null && s.end_time !== null).length} / {scenes.length}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#151d28] border-white/5">
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-blue-400" />
              Génération IA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-400">
              Générez le synopsis depuis le brainstorming ou créez le script détaillé.
            </p>
            <Button
              variant="outline"
              onClick={generateFromBrainstorming}
              disabled={isGenerating}
              className="w-full border-white/10 text-slate-300 hover:bg-white/5"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4 mr-2" />
              )}
              Depuis brainstorming
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-900/30 to-green-950/30 border-green-500/20">
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <ChevronRight className="w-5 h-5 text-green-400" />
              Étape suivante
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-300">
              Une fois le synopsis validé, passez au <strong>Repérage</strong> pour créer les visuels des personnages et décors, puis générez le script complet.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={() => router.push(`/project/${projectId}/reperage`)}
                className="w-full border-green-500/30 text-green-400 hover:bg-green-500/10"
              >
                <MapPin className="w-4 h-4 mr-2" />
                Aller au Repérage
              </Button>
              <Button
                onClick={generateScript}
                disabled={isGenerating || scenes.length === 0}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4 mr-2" />
                )}
                Générer le Script
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-[#1e3a52] to-[#1a3048] border-white/10">
          <CardHeader>
            <CardTitle className="text-lg text-white">Guide</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-400 space-y-3">
            <div className="flex items-start gap-2">
              <Music className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
              <p>
                <strong className="text-slate-200">Audio Timeline</strong> - Importez l&apos;audio pour synchroniser les scènes
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
              <p>
                <strong className="text-slate-200">Temps</strong> - Cliquez sur Début/Fin pour lier au temps de lecture
              </p>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <p>
                <strong className="text-slate-200">Lieu</strong> - Nom du lieu en majuscules (CAFÉ, FORÊT, APPARTEMENT)
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Users className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <p>
                <strong className="text-slate-200">@Personnages</strong> - Utilisez @NomDuPersonnage pour référencer
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Package className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <p>
                <strong className="text-slate-200">Description</strong> - Décrivez l&apos;action narrative, pas les détails techniques
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
