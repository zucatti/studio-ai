'use client';

import { useState } from 'react';
import { FileText, Plus, Loader2 } from 'lucide-react';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { NotionSceneBlock } from './NotionSceneBlock';
import { LocationPicker } from './LocationPicker';
import type { ScriptElement, ScriptElementType } from '@/types/script';
import { toast } from 'sonner';

interface Scene {
  id: string;
  scene_number: number;
  int_ext: string;
  location: string;
  location_id?: string | null;
  time_of_day: string;
  description?: string | null;
}

interface ScriptStructuredViewProps {
  projectId: string;
  scenes: Scene[];
  elementsByScene: Record<string, ScriptElement[]>;
  sceneFilter: string;
  onAddElement: (sceneId: string, type: ScriptElementType, content?: string) => void;
  onUpdateElement: (elementId: string, updates: Partial<ScriptElement>) => void;
  onDeleteElement: (elementId: string) => void;
  onReorderElement: (elementId: string, direction: 'up' | 'down') => void;
  onRefresh: () => void;
}

type IntExt = 'INT' | 'EXT' | 'INT/EXT';
type TimeOfDay = 'JOUR' | 'NUIT' | 'AUBE' | 'CREPUSCULE';

export function ScriptStructuredView({
  projectId,
  scenes,
  elementsByScene,
  sceneFilter,
  onAddElement,
  onUpdateElement,
  onDeleteElement,
  onReorderElement,
  onRefresh,
}: ScriptStructuredViewProps) {
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(
    new Set(scenes.map((s) => s.id))
  );

  // Scene editing state
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [sceneToDelete, setSceneToDelete] = useState<Scene | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    scene_number: 1,
    int_ext: 'INT' as IntExt,
    location: '',
    location_id: null as string | null,
    time_of_day: 'JOUR' as TimeOfDay,
    description: '',
  });

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

  const handleOpenEdit = (scene: Scene) => {
    setEditingScene(scene);
    setFormData({
      scene_number: scene.scene_number,
      int_ext: scene.int_ext as IntExt,
      location: scene.location,
      location_id: scene.location_id || null,
      time_of_day: scene.time_of_day as TimeOfDay,
      description: scene.description || '',
    });
  };

  const handleLocationChange = (data: {
    location_id: string;
    location: string;
    int_ext: string;
    time_of_day: string;
  }) => {
    setFormData((prev) => ({
      ...prev,
      location_id: data.location_id,
      location: data.location,
      int_ext: data.int_ext as IntExt,
      time_of_day: data.time_of_day as TimeOfDay,
    }));
  };

  const handleSaveScene = async () => {
    if (!editingScene || !formData.location.trim()) {
      toast.error('Le lieu est requis');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/scenes/${editingScene.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        toast.success('Scene mise a jour');
        setEditingScene(null);
        onRefresh();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Erreur lors de la mise a jour');
      }
    } catch (error) {
      console.error('Error saving scene:', error);
      toast.error('Erreur de connexion');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteScene = async () => {
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

  const filteredScenes =
    sceneFilter === 'all' ? scenes : scenes.filter((s) => s.id === sceneFilter);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Scene list */}
      <div className="divide-y divide-slate-800/30">
        {filteredScenes
          .sort((a, b) => a.scene_number - b.scene_number)
          .map((scene) => {
            const elements = elementsByScene[scene.id] || [];
            const isExpanded = expandedScenes.has(scene.id);

            return (
              <NotionSceneBlock
                key={scene.id}
                projectId={projectId}
                scene={scene}
                elements={elements}
                isExpanded={isExpanded}
                onToggle={() => toggleScene(scene.id)}
                onAddElement={onAddElement}
                onUpdateElement={onUpdateElement}
                onDeleteElement={onDeleteElement}
                onEditScene={() => handleOpenEdit(scene)}
                onDeleteScene={() => setSceneToDelete(scene)}
              />
            );
          })}
      </div>

      {filteredScenes.length === 0 && (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 mx-auto mb-4 text-slate-700" />
          <p className="text-slate-500 mb-2">Aucune scene</p>
          <p className="text-sm text-slate-600">
            Creez votre premiere scene pour commencer
          </p>
        </div>
      )}

      {/* Edit Scene Dialog */}
      <Dialog open={!!editingScene} onOpenChange={() => setEditingScene(null)}>
        <DialogContent className="bg-[#1a2433] border-white/10 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">Modifier la scene</DialogTitle>
            <DialogDescription className="text-slate-400">
              Modifiez les informations de la scene.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Numero de scene</Label>
              <Input
                type="number"
                min={1}
                value={formData.scene_number}
                onChange={(e) =>
                  setFormData({ ...formData, scene_number: parseInt(e.target.value) || 1 })
                }
                className="w-24 bg-white/5 border-white/10 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Lieu (depuis la Bible)</Label>
              <LocationPicker
                projectId={projectId}
                locationId={formData.location_id}
                locationName={formData.location}
                intExt={formData.int_ext}
                timeOfDay={formData.time_of_day}
                onChange={handleLocationChange}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Description visuelle (pour la génération IA)</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Décrivez l'ambiance, l'éclairage, l'atmosphère de la scène... Ex: Lumière tamisée, tons chauds, ambiance intimiste avec des ombres projetées sur les murs."
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 min-h-[100px] resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingScene(null)}
              className="border-white/10 text-slate-300 hover:bg-white/10"
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            <Button
              onClick={handleSaveScene}
              className="bg-blue-600 hover:bg-blue-700"
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Scene Confirmation */}
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
              onClick={handleDeleteScene}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
