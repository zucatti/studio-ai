'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Loader2, Image as ImageIcon, Trash2, AlertCircle, Check, Import, RefreshCw, Library } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StorageImg } from '@/components/ui/storage-image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { generateReferenceName } from '@/lib/reference-name';
import { invalidateMentionCache } from '@/components/ui/mention-input';
import { cn } from '@/lib/utils';
import { PoseLibraryPicker } from './PoseLibraryPicker';
import type { PoseEntry } from '@/data/pose-library';
import type { GlobalReference, ReferenceType } from '@/types/database';

interface BibleReferencesProps {
  projectId?: string;
  showGlobalOnly?: boolean;
}

const REFERENCE_TYPES: { value: ReferenceType; label: string; icon: string; description: string }[] = [
  { value: 'pose', label: 'Pose', icon: '🕺', description: 'Position du corps, attitude' },
  { value: 'composition', label: 'Composition', icon: '📐', description: 'Cadrage, disposition' },
  { value: 'style', label: 'Style', icon: '🎨', description: 'Ambiance visuelle, couleurs' },
];

export function BibleReferences({ projectId, showGlobalOnly = false }: BibleReferencesProps) {
  const [references, setReferences] = useState<GlobalReference[]>([]);
  const [linkedRefIds, setLinkedRefIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [poseLibraryOpen, setPoseLibraryOpen] = useState(false);
  const [editingRef, setEditingRef] = useState<GlobalReference | null>(null);
  const [isCreatingPose, setIsCreatingPose] = useState(false);

  const fetchReferences = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch global references
      const res = await fetch('/api/references');
      if (res.ok) {
        const data = await res.json();
        setReferences(data.references || []);
      }

      // If we have a project, also fetch linked references
      if (projectId) {
        const linkRes = await fetch(`/api/projects/${projectId}/references`);
        if (linkRes.ok) {
          const linkData = await linkRes.json();
          const ids = new Set<string>((linkData.references || []).map((r: { id: string }) => r.id));
          setLinkedRefIds(ids);
        }
      }
    } catch (error) {
      console.error('Error fetching references:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchReferences();
  }, [fetchReferences]);

  const handleDelete = async (refId: string) => {
    try {
      const res = await fetch(`/api/references/${refId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setReferences(prev => prev.filter(r => r.id !== refId));
      }
    } catch (error) {
      console.error('Error deleting reference:', error);
    }
  };

  const handleImport = async (refId: string) => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/references`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference_id: refId }),
      });
      if (res.ok) {
        setLinkedRefIds(prev => new Set([...prev, refId]));
        // Invalidate mention cache so new reference appears in autocomplete
        invalidateMentionCache(projectId);
      }
    } catch (error) {
      console.error('Error importing reference:', error);
    }
  };

  const handleSave = async (ref: GlobalReference) => {
    setReferences(prev => {
      const existing = prev.find(r => r.id === ref.id);
      if (existing) {
        return prev.map(r => r.id === ref.id ? ref : r);
      }
      return [ref, ...prev];
    });
  };

  const handleEdit = (ref: GlobalReference) => {
    setEditingRef(ref);
    setDialogOpen(true);
  };

  const handleCreateCompositionOrStyle = () => {
    setEditingRef(null);
    setDialogOpen(true);
  };

  const handlePoseSelected = async (pose: PoseEntry) => {
    setIsCreatingPose(true);
    try {
      const res = await fetch('/api/references', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: pose.name,
          type: 'pose',
          description: pose.prompt,
          pose_library_id: pose.id,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setReferences(prev => [data.reference, ...prev]);
      }
    } catch (error) {
      console.error('Error creating pose reference:', error);
    } finally {
      setIsCreatingPose(false);
    }
  };

  // Group by type
  const poseRefs = references.filter(r => r.type === 'pose');
  const compositionRefs = references.filter(r => r.type === 'composition');
  const styleRefs = references.filter(r => r.type === 'style');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">Poses, compositions et styles pour vos générations</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPoseLibraryOpen(true)}
            disabled={isCreatingPose}
            className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
          >
            {isCreatingPose ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Library className="w-4 h-4 mr-1" />
            )}
            Poses
          </Button>
          <Button size="sm" onClick={() => { setEditingRef(null); setDialogOpen(true); }} className="bg-purple-500 hover:bg-purple-600">
            <Plus className="w-4 h-4 mr-1" />
            Nouvelle
          </Button>
        </div>
      </div>

      {references.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-white/10 rounded-lg">
          <ImageIcon className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Aucune référence</p>
          <p className="text-slate-500 text-xs mt-1">Créez des poses, compositions ou styles</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Poses */}
          {poseRefs.length > 0 && (
            <ReferenceSection
              title="🕺 Poses"
              references={poseRefs}
              linkedRefIds={linkedRefIds}
              projectId={projectId}
              onDelete={handleDelete}
              onEdit={handleEdit}
              onImport={handleImport}
            />
          )}

          {/* Compositions */}
          {compositionRefs.length > 0 && (
            <ReferenceSection
              title="📐 Compositions"
              references={compositionRefs}
              linkedRefIds={linkedRefIds}
              projectId={projectId}
              onDelete={handleDelete}
              onEdit={handleEdit}
              onImport={handleImport}
            />
          )}

          {/* Styles */}
          {styleRefs.length > 0 && (
            <ReferenceSection
              title="🎨 Styles"
              references={styleRefs}
              linkedRefIds={linkedRefIds}
              projectId={projectId}
              onDelete={handleDelete}
              onEdit={handleEdit}
              onImport={handleImport}
            />
          )}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <ReferenceFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        reference={editingRef}
        onSave={handleSave}
      />

      {/* Pose Library Picker */}
      <PoseLibraryPicker
        open={poseLibraryOpen}
        onOpenChange={setPoseLibraryOpen}
        onSelect={handlePoseSelected}
      />
    </div>
  );
}

// Section component
function ReferenceSection({
  title,
  references,
  linkedRefIds,
  projectId,
  onDelete,
  onEdit,
  onImport,
}: {
  title: string;
  references: GlobalReference[];
  linkedRefIds: Set<string>;
  projectId?: string;
  onDelete: (id: string) => void;
  onEdit: (ref: GlobalReference) => void;
  onImport: (id: string) => void;
}) {
  return (
    <div>
      <h4 className="text-xs font-medium text-slate-400 mb-2">{title}</h4>
      <div className="grid grid-cols-4 gap-3">
        {references.map((ref) => (
          <ReferenceCard
            key={ref.id}
            reference={ref}
            isLinked={linkedRefIds.has(ref.id)}
            showImport={!!projectId}
            onDelete={() => onDelete(ref.id)}
            onEdit={() => onEdit(ref)}
            onImport={() => onImport(ref.id)}
          />
        ))}
      </div>
    </div>
  );
}

// Card component
function ReferenceCard({
  reference,
  isLinked,
  showImport,
  onDelete,
  onEdit,
  onImport,
}: {
  reference: GlobalReference;
  isLinked: boolean;
  showImport: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onImport: () => void;
}) {
  const refName = generateReferenceName(reference.name, '!');

  return (
    <div
      onClick={onEdit}
      className={cn(
        'relative group rounded-lg overflow-hidden border cursor-pointer transition-all',
        isLinked
          ? 'border-purple-500/50 ring-1 ring-purple-500/30'
          : 'border-white/10 hover:border-white/20'
      )}
    >
      {/* Image or Pose Icon */}
      <div className="aspect-square bg-slate-800">
        {reference.image_url ? (
          <StorageImg
            src={reference.image_url}
            alt={reference.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500/20 to-purple-900/20">
            <span className="text-4xl">🕺</span>
          </div>
        )}
      </div>

      {/* Info overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <p className="text-xs font-medium text-white truncate">{reference.name}</p>
        <p className="text-[10px] text-purple-400 font-mono">{refName}</p>
      </div>

      {/* Linked badge */}
      {isLinked && (
        <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Actions */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {showImport && !isLinked && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onImport();
                  }}
                  className="p-1.5 rounded bg-purple-500 text-white hover:bg-purple-600"
                >
                  <Import className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="bg-[#1a2433] border-white/10">
                <p className="text-xs">Importer dans le projet</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1.5 rounded bg-black/50 text-slate-400 hover:text-red-400"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// Form Dialog
function ReferenceFormDialog({
  open,
  onOpenChange,
  reference,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reference: GlobalReference | null;
  onSave: (ref: GlobalReference) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ReferenceType>('pose');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens/closes or reference changes
  useEffect(() => {
    if (open) {
      if (reference) {
        setName(reference.name);
        setType(reference.type);
        setDescription(reference.description || '');
        setImagePreview(reference.image_url || null);
        setImageFile(null);
      } else {
        setName('');
        setType('pose'); // Default to pose
        setDescription('');
        setImagePreview(null);
        setImageFile(null);
      }
      setError(null);
    }
  }, [open, reference]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleRegenerate = async () => {
    if (!reference) return;

    setIsRegenerating(true);
    setError(null);

    try {
      const res = await fetch(`/api/references/${reference.id}`, {
        method: 'PATCH',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur lors de la régénération');
      }

      const data = await res.json();
      setDescription(data.reference.description || '');
      onSave(data.reference);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Le nom est requis');
      return;
    }
    // Image required for all types (including pose for pose transfer)
    if (!imageFile && !reference?.image_url) {
      setError('Une image est requise');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('type', type);
      formData.append('description', description);
      if (imageFile) {
        formData.append('image', imageFile);
      }

      const url = reference
        ? `/api/references/${reference.id}`
        : '/api/references';

      const res = await fetch(url, {
        method: reference ? 'PUT' : 'POST',
        body: reference && !imageFile
          ? JSON.stringify({ name: name.trim(), type, description })
          : formData,
        headers: reference && !imageFile
          ? { 'Content-Type': 'application/json' }
          : undefined,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur lors de la sauvegarde');
      }

      const data = await res.json();
      onSave(data.reference);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d1520] border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>
            {reference ? 'Modifier la référence' : 'Nouvelle référence'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type selector */}
          <div className="space-y-2">
            <Label className="text-slate-300">Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {REFERENCE_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={cn(
                    'p-3 rounded-lg border text-center transition-all',
                    type === t.value
                      ? 'bg-purple-500/20 border-purple-500 text-white'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                  )}
                >
                  <span className="text-xl">{t.icon}</span>
                  <p className="text-xs font-medium mt-1">{t.label}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label className="text-slate-300">Nom</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jump Pose, Golden Hour..."
              className="bg-white/5 border-white/10 text-white"
            />
            {name && (
              <p className="text-xs text-purple-400 font-mono">
                {generateReferenceName(name, '!')}
              </p>
            )}
          </div>

          {/* Image */}
          <div className="space-y-2">
            <Label className="text-slate-300">Image {type === 'pose' && <span className="text-purple-400">(pour le transfert de pose)</span>}</Label>
              <div className="flex gap-3">
                {imagePreview ? (
                  <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-white/10">
                    {imagePreview.startsWith('data:') ? (
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <StorageImg src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setImageFile(null);
                        setImagePreview(reference?.image_url || null);
                      }}
                      className="absolute top-1 right-1 p-1 rounded bg-black/50 text-slate-400 hover:text-white"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <label className="w-24 h-24 rounded-lg border-2 border-dashed border-white/20 hover:border-purple-500/50 flex flex-col items-center justify-center cursor-pointer transition-colors">
                    <ImageIcon className="w-6 h-6 text-slate-500" />
                    <span className="text-[10px] text-slate-500 mt-1">Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                  </label>
                )}
                <div className="flex-1">
                  <p className="text-xs text-slate-400">
                    Uploadez une image de référence pour {REFERENCE_TYPES.find(t => t.value === type)?.description.toLowerCase()}.
                  </p>
                </div>
              </div>
            </div>

          {/* Description */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-slate-300">
                Description (prompt généré)
              </Label>
              {/* Regenerate button when editing with existing image */}
              {reference && reference.image_url && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRegenerate}
                  disabled={isRegenerating}
                  className="h-7 px-2 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                >
                  {isRegenerating ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Génération...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Régénérer
                    </>
                  )}
                </Button>
              )}
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={reference ? "Cliquez sur 'Régénérer' pour créer un prompt à partir de l'image..." : "Le prompt sera généré automatiquement à partir de l'image..."}
              className="bg-white/5 border-white/10 text-white min-h-[80px] text-sm"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-slate-400"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              className="bg-purple-500 hover:bg-purple-600"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sauvegarde...
                </>
              ) : (
                reference ? 'Modifier' : 'Créer'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
