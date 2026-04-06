'use client';

import { useState, useCallback } from 'react';
import { ShortCard } from './ShortCard';
import { ShortsGallery } from './ShortsGallery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Play, Loader2 } from 'lucide-react';
import type { Short } from '@/store/shorts-store';
import type { AspectRatio } from '@/types/database';

interface ShortsListProps {
  shorts: Short[];
  projectId: string;
  aspectRatio: AspectRatio;
  isLoading: boolean;
  onCreateShort: (title: string) => Promise<void>;
  onDeleteShort: (shortId: string) => Promise<void>;
  onUpdateShort: (shortId: string, updates: { title?: string; description?: string }) => Promise<void>;
}

export function ShortsList({
  shorts,
  projectId,
  aspectRatio,
  isLoading,
  onCreateShort,
  onDeleteShort,
  onUpdateShort,
}: ShortsListProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingShort, setEditingShort] = useState<Short | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Gallery state
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);

  // Get shorts with assembled videos for gallery navigation
  const shortsWithVideo = shorts.filter(s => s.assembled_video_url);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setIsCreating(true);
    try {
      await onCreateShort(newTitle.trim());
      setNewTitle('');
      setShowCreateDialog(false);
    } finally {
      setIsCreating(false);
    }
  };

  const handleEdit = (short: Short) => {
    setEditingShort(short);
    setNewTitle(short.title);
    setShowEditDialog(true);
  };

  const handleUpdate = async () => {
    if (!editingShort || !newTitle.trim()) return;
    setIsUpdating(true);
    try {
      await onUpdateShort(editingShort.id, { title: newTitle.trim() });
      setShowEditDialog(false);
      setEditingShort(null);
      setNewTitle('');
    } finally {
      setIsUpdating(false);
    }
  };

  // Gallery handler
  const openGallery = useCallback((short: Short) => {
    const index = shortsWithVideo.findIndex(s => s.id === short.id);
    if (index === -1) return;
    setGalleryInitialIndex(index);
    setGalleryOpen(true);
  }, [shortsWithVideo]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Play className="w-5 h-5 text-blue-400" />
          <h2 className="text-xl font-semibold text-white">Mes Shorts</h2>
          {shorts.length > 0 && (
            <span className="text-sm text-slate-400">({shorts.length})</span>
          )}
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nouveau Short
        </Button>
      </div>

      {/* Grid */}
      {shorts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-slate-700/30 flex items-center justify-center mb-4">
            <Play className="w-10 h-10 text-blue-400/50" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">Aucun short</h3>
          <p className="text-slate-400 text-sm max-w-md mb-6">
            Créez votre premier short pour commencer. Chaque short peut contenir plusieurs plans avec différentes durées.
          </p>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Créer mon premier Short
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {shorts.map((short) => (
            <ShortCard
              key={short.id}
              short={short}
              projectId={projectId}
              aspectRatio={aspectRatio}
              onDelete={onDeleteShort}
              onEdit={handleEdit}
              onGallery={openGallery}
            />
          ))}

          {/* Create new card */}
          <button
            onClick={() => setShowCreateDialog(true)}
            className="rounded-xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center text-slate-400 hover:text-white hover:border-white/40 transition-all"
            style={{ aspectRatio: aspectRatio.replace(':', '/') }}
          >
            <Plus className="w-8 h-8 mb-2" />
            <span className="text-sm">Nouveau Short</span>
          </button>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-[#1a2433] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Nouveau Short</DialogTitle>
            <DialogDescription className="text-slate-400">
              Donnez un titre à votre short. Vous pourrez ajouter des plans ensuite.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Ex: Présentation du produit"
              className="bg-white/5 border-white/10 text-white"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              className="border-white/10 text-white hover:bg-white/5"
            >
              Annuler
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newTitle.trim() || isCreating}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Création...
                </>
              ) : (
                'Créer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-[#1a2433] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Renommer le Short</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Nouveau titre"
              className="bg-white/5 border-white/10 text-white"
              onKeyDown={(e) => e.key === 'Enter' && handleUpdate()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
              className="border-white/10 text-white hover:bg-white/5"
            >
              Annuler
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={!newTitle.trim() || isUpdating}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isUpdating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Mise à jour...
                </>
              ) : (
                'Enregistrer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gallery Modal */}
      <ShortsGallery
        shorts={shorts}
        initialIndex={galleryInitialIndex}
        isOpen={galleryOpen}
        onClose={() => setGalleryOpen(false)}
      />
    </div>
  );
}
