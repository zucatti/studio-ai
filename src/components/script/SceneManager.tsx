'use client';

import { useState } from 'react';
import { Plus, Edit2, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { toast } from 'sonner';

interface Scene {
  id: string;
  scene_number: number;
  int_ext: string;
  location: string;
  time_of_day: string;
  description?: string | null;
}

interface SceneManagerProps {
  projectId: string;
  scenes: Scene[];
  onRefresh: () => void;
}

type IntExt = 'INT' | 'EXT' | 'INT/EXT';
type TimeOfDay = 'JOUR' | 'NUIT' | 'AUBE' | 'CREPUSCULE';

const INT_EXT_OPTIONS: IntExt[] = ['INT', 'EXT', 'INT/EXT'];
const TIME_OF_DAY_OPTIONS: TimeOfDay[] = ['JOUR', 'NUIT', 'AUBE', 'CREPUSCULE'];

interface SceneFormData {
  scene_number: number;
  int_ext: IntExt;
  location: string;
  time_of_day: TimeOfDay;
  description: string;
}

export function SceneManager({ projectId, scenes, onRefresh }: SceneManagerProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [sceneToDelete, setSceneToDelete] = useState<Scene | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<SceneFormData>({
    scene_number: scenes.length + 1,
    int_ext: 'INT',
    location: '',
    time_of_day: 'JOUR',
    description: '',
  });

  const handleOpenCreate = () => {
    setEditingScene(null);
    setFormData({
      scene_number: scenes.length + 1,
      int_ext: 'INT',
      location: '',
      time_of_day: 'JOUR',
      description: '',
    });
    setShowDialog(true);
  };

  const handleOpenEdit = (scene: Scene) => {
    setEditingScene(scene);
    setFormData({
      scene_number: scene.scene_number,
      int_ext: scene.int_ext as IntExt,
      location: scene.location,
      time_of_day: scene.time_of_day as TimeOfDay,
      description: scene.description || '',
    });
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!formData.location.trim()) {
      toast.error('Le lieu est requis');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingScene) {
        // Update existing scene
        const res = await fetch(`/api/projects/${projectId}/scenes/${editingScene.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });

        if (res.ok) {
          toast.success('Scene mise a jour');
          setShowDialog(false);
          onRefresh();
        } else {
          const data = await res.json();
          toast.error(data.error || 'Erreur lors de la mise a jour');
        }
      } else {
        // Create new scene
        const res = await fetch(`/api/projects/${projectId}/scenes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });

        if (res.ok) {
          toast.success('Scene creee');
          setShowDialog(false);
          onRefresh();
        } else {
          const data = await res.json();
          toast.error(data.error || 'Erreur lors de la creation');
        }
      }
    } catch (error) {
      console.error('Error saving scene:', error);
      toast.error('Erreur de connexion');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!sceneToDelete) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/scenes/${sceneToDelete.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast.success('Scene supprimee');
        setSceneToDelete(null);
        onRefresh();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Error deleting scene:', error);
      toast.error('Erreur de connexion');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Add Scene Button */}
      <Button
        onClick={handleOpenCreate}
        className="bg-blue-600 hover:bg-blue-700"
      >
        <Plus className="w-4 h-4 mr-2" />
        Nouvelle scene
      </Button>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-[#1a2433] border-white/10 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingScene ? 'Modifier la scene' : 'Nouvelle scene'}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {editingScene
                ? 'Modifiez les informations de la scene.'
                : 'Creez une nouvelle scene pour votre script.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Numero</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.scene_number}
                  onChange={(e) =>
                    setFormData({ ...formData, scene_number: parseInt(e.target.value) || 1 })
                  }
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">INT/EXT</Label>
                <Select
                  value={formData.int_ext}
                  onValueChange={(v) => setFormData({ ...formData, int_ext: v as IntExt })}
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a2433] border-white/10">
                    {INT_EXT_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Lieu</Label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="ex: CAFE DE MINUIT"
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 uppercase"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Moment</Label>
              <Select
                value={formData.time_of_day}
                onValueChange={(v) => setFormData({ ...formData, time_of_day: v as TimeOfDay })}
              >
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a2433] border-white/10">
                  {TIME_OF_DAY_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Description (optionnel)</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Description de la scene..."
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 min-h-[80px] resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              className="border-white/10 text-slate-300 hover:bg-white/10"
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              className="bg-blue-600 hover:bg-blue-700"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              {editingScene ? 'Enregistrer' : 'Creer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!sceneToDelete} onOpenChange={() => setSceneToDelete(null)}>
        <AlertDialogContent className="bg-[#1a2433] border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Supprimer la scene {sceneToDelete?.scene_number} ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Cette action supprimera la scene "{sceneToDelete?.int_ext}. {sceneToDelete?.location}"
              ainsi que tous ses elements de script et plans associes.
              Cette action est irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={handleDelete}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Export edit/delete buttons for use in ScriptStructuredView
export function SceneActions({
  scene,
  onEdit,
  onDelete,
}: {
  scene: Scene;
  onEdit: (scene: Scene) => void;
  onDelete: (scene: Scene) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation();
          onEdit(scene);
        }}
        className="h-7 w-7 text-slate-400 hover:text-white hover:bg-white/10"
      >
        <Edit2 className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(scene);
        }}
        className="h-7 w-7 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
