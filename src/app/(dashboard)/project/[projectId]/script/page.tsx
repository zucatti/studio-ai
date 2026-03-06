'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useSceneStore } from '@/store/scene-store';
import { useProjectStore } from '@/store/project-store';
import { Scene, SceneHeading } from '@/types/scene';
import { Shot, Dialogue, Action, ShotType, CameraAngle, CameraMovement } from '@/types/shot';
import { SceneCard } from '@/components/script';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, FileText, Clapperboard } from 'lucide-react';
import { CAMERA_ANGLES, CAMERA_MOVEMENTS, SHOT_TYPES } from '@/types/shot';
import { DialogueEditor } from '@/components/script/dialogue-editor';

export default function ScriptPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { getScenesByProject, addScene, deleteScene, addShot, updateShot, deleteShot } =
    useSceneStore();
  const { updateProject } = useProjectStore();
  const scenes = getScenesByProject(projectId);

  const [sceneDialogOpen, setSceneDialogOpen] = useState(false);
  const [shotDialogOpen, setShotDialogOpen] = useState(false);
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);
  const [editingShot, setEditingShot] = useState<Shot | null>(null);

  // Scene form state
  const [sceneForm, setSceneForm] = useState<{
    intExt: SceneHeading['intExt'];
    location: string;
    timeOfDay: SceneHeading['timeOfDay'];
    description: string;
  }>({
    intExt: 'INT',
    location: '',
    timeOfDay: 'JOUR',
    description: '',
  });

  // Shot form state
  const [shotForm, setShotForm] = useState<{
    description: string;
    shotType: string;
    angle: string;
    movement: string;
    dialogues: Dialogue[];
    actions: Action[];
  }>({
    description: '',
    shotType: 'medium',
    angle: 'eye_level',
    movement: 'static',
    dialogues: [],
    actions: [],
  });

  const handleAddScene = () => {
    const newScene: Scene = {
      id: crypto.randomUUID(),
      projectId,
      sceneNumber: scenes.length + 1,
      heading: {
        intExt: sceneForm.intExt,
        location: sceneForm.location.toUpperCase(),
        timeOfDay: sceneForm.timeOfDay,
      },
      description: sceneForm.description,
      shots: [],
      order: scenes.length,
    };
    addScene(newScene);
    updateProject(projectId, { currentStep: 'script', status: 'in_progress' });
    setSceneDialogOpen(false);
    setSceneForm({ intExt: 'INT', location: '', timeOfDay: 'JOUR', description: '' });
  };

  const handleDeleteScene = (sceneId: string) => {
    if (confirm('Supprimer cette scène et tous ses plans ?')) {
      deleteScene(sceneId);
    }
  };

  const handleOpenShotDialog = (sceneId: string, shot?: Shot) => {
    setCurrentSceneId(sceneId);
    if (shot) {
      setEditingShot(shot);
      setShotForm({
        description: shot.description,
        shotType: shot.cameraAnnotation?.shotType || 'medium',
        angle: shot.cameraAnnotation?.angle || 'eye_level',
        movement: shot.cameraAnnotation?.movement || 'static',
        dialogues: shot.dialogues,
        actions: shot.actions,
      });
    } else {
      setEditingShot(null);
      setShotForm({
        description: '',
        shotType: 'medium',
        angle: 'eye_level',
        movement: 'static',
        dialogues: [],
        actions: [],
      });
    }
    setShotDialogOpen(true);
  };

  const handleSaveShot = () => {
    if (!currentSceneId) return;

    const scene = scenes.find((s) => s.id === currentSceneId);
    if (!scene) return;

    const shotData: Omit<Shot, 'id' | 'sceneId' | 'shotNumber' | 'order'> = {
      description: shotForm.description,
      dialogues: shotForm.dialogues,
      actions: shotForm.actions,
      cameraAnnotation: {
        shotType: shotForm.shotType as ShotType,
        angle: shotForm.angle as CameraAngle,
        movement: shotForm.movement as CameraMovement,
      },
      generationStatus: 'not_started',
    };

    if (editingShot) {
      updateShot(currentSceneId, editingShot.id, shotData);
    } else {
      const newShot: Shot = {
        ...shotData,
        id: crypto.randomUUID(),
        sceneId: currentSceneId,
        shotNumber: scene.shots.length + 1,
        order: scene.shots.length,
      };
      addShot(currentSceneId, newShot);
    }

    setShotDialogOpen(false);
    setEditingShot(null);
  };

  const handleDeleteShot = (sceneId: string, shotId: string) => {
    if (confirm('Supprimer ce plan ?')) {
      deleteShot(sceneId, shotId);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div className="lg:col-span-3 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clapperboard className="w-5 h-5" />
            <h2 className="text-xl font-semibold">Scénario</h2>
          </div>
          <Button onClick={() => setSceneDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nouvelle scène
          </Button>
        </div>

        {scenes.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Aucune scène dans ce projet.</p>
              <p className="text-sm mt-1">
                Commencez par créer votre première scène.
              </p>
              <Button
                className="mt-4"
                onClick={() => setSceneDialogOpen(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Créer une scène
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {scenes
              .sort((a, b) => a.order - b.order)
              .map((scene) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  onDelete={() => handleDeleteScene(scene.id)}
                  onAddShot={() => handleOpenShotDialog(scene.id)}
                  onEditShot={(shotId) => {
                    const shot = scene.shots.find((s) => s.id === shotId);
                    if (shot) handleOpenShotDialog(scene.id, shot);
                  }}
                  onDeleteShot={(shotId) => handleDeleteShot(scene.id, shotId)}
                />
              ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Résumé</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Scènes</span>
              <span className="font-medium">{scenes.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plans</span>
              <span className="font-medium">
                {scenes.reduce((acc, s) => acc + s.shots.length, 0)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Format</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong>INT./EXT.</strong> - Intérieur ou extérieur
            </p>
            <p>
              <strong>LIEU</strong> - Nom du lieu en majuscules
            </p>
            <p>
              <strong>MOMENT</strong> - JOUR, NUIT, AUBE, CRÉPUSCULE
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Scene Dialog */}
      <Dialog open={sceneDialogOpen} onOpenChange={setSceneDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle scène</DialogTitle>
            <DialogDescription>
              Créez un nouvel en-tête de scène au format standard.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>INT./EXT.</Label>
                <Select
                  value={sceneForm.intExt}
                  onValueChange={(v) =>
                    setSceneForm({ ...sceneForm, intExt: v as SceneHeading['intExt'] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INT">INT.</SelectItem>
                    <SelectItem value="EXT">EXT.</SelectItem>
                    <SelectItem value="INT/EXT">INT./EXT.</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Moment</Label>
                <Select
                  value={sceneForm.timeOfDay}
                  onValueChange={(v) =>
                    setSceneForm({
                      ...sceneForm,
                      timeOfDay: v as SceneHeading['timeOfDay'],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="JOUR">JOUR</SelectItem>
                    <SelectItem value="NUIT">NUIT</SelectItem>
                    <SelectItem value="AUBE">AUBE</SelectItem>
                    <SelectItem value="CREPUSCULE">CRÉPUSCULE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Lieu</Label>
              <Input
                value={sceneForm.location}
                onChange={(e) =>
                  setSceneForm({ ...sceneForm, location: e.target.value })
                }
                placeholder="APPARTEMENT - SALON"
                className="uppercase"
              />
            </div>

            <div>
              <Label>Description (optionnelle)</Label>
              <Textarea
                value={sceneForm.description}
                onChange={(e) =>
                  setSceneForm({ ...sceneForm, description: e.target.value })
                }
                placeholder="Brève description de l'action..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSceneDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleAddScene} disabled={!sceneForm.location.trim()}>
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shot Dialog */}
      <Dialog open={shotDialogOpen} onOpenChange={setShotDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingShot ? 'Modifier le plan' : 'Nouveau plan'}
            </DialogTitle>
            <DialogDescription>
              Définissez les détails du plan et ses paramètres de caméra.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Description du plan</Label>
              <Textarea
                value={shotForm.description}
                onChange={(e) =>
                  setShotForm({ ...shotForm, description: e.target.value })
                }
                placeholder="Décrivez ce qui se passe dans ce plan..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Type de plan</Label>
                <Select
                  value={shotForm.shotType}
                  onValueChange={(v) => setShotForm({ ...shotForm, shotType: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHOT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Angle</Label>
                <Select
                  value={shotForm.angle}
                  onValueChange={(v) => setShotForm({ ...shotForm, angle: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAMERA_ANGLES.map((angle) => (
                      <SelectItem key={angle.value} value={angle.value}>
                        {angle.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Mouvement</Label>
                <Select
                  value={shotForm.movement}
                  onValueChange={(v) => setShotForm({ ...shotForm, movement: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAMERA_MOVEMENTS.map((movement) => (
                      <SelectItem key={movement.value} value={movement.value}>
                        {movement.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogueEditor
              dialogues={shotForm.dialogues}
              onChange={(dialogues) => setShotForm({ ...shotForm, dialogues })}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShotDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleSaveShot}
              disabled={!shotForm.description.trim()}
            >
              {editingShot ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
