'use client';

import { useState } from 'react';
import { useBibleStore, type AudioType } from '@/store/bible-store';
import { BibleAssetCard } from './BibleAssetCard';
import { AudioFormDialog } from './AudioFormDialog';
import { Music, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { GlobalAsset } from '@/types/database';

// Filter options for audio types
const AUDIO_FILTERS: { value: AudioType | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'music', label: 'Musique' },
  { value: 'sfx', label: 'SFX' },
  { value: 'ambiance', label: 'Ambiance' },
  { value: 'foley', label: 'Foley' },
  { value: 'dialogue', label: 'Dialogue' },
  { value: 'voiceover', label: 'Voix-off' },
];

interface BibleAudioProps {
  projectId?: string;
  onInsertReference?: (reference: string) => void;
  showGlobalOnly?: boolean;
}

export function BibleAudio({ projectId, onInsertReference, showGlobalOnly = false }: BibleAudioProps) {
  const {
    getAssetsByType,
    getProjectAssetsByType,
    isAssetInProject,
    importGlobalAsset,
    removeProjectAsset,
    fetchGlobalAssets,
    deleteAudio,
  } = useBibleStore();

  const [showFormDialog, setShowFormDialog] = useState(false);
  const [editingAudio, setEditingAudio] = useState<GlobalAsset | null>(null);
  const [typeFilter, setTypeFilter] = useState<AudioType | 'all'>('all');

  const globalAudio = getAssetsByType('audio');
  const projectAudio = projectId ? getProjectAssetsByType('audio') : [];

  // Filter audio by type (generic to work with different array types)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filterByType = <T extends { data: any }>(audioList: T[]): T[] => {
    if (typeFilter === 'all') return audioList;
    return audioList.filter(a => {
      const data = a.data as { audioType?: AudioType } | undefined;
      return data?.audioType === typeFilter;
    });
  };

  const handleImport = async (globalAssetId: string) => {
    if (projectId) {
      await importGlobalAsset(projectId, globalAssetId);
    }
  };

  const handleRemove = async (projectAssetId: string) => {
    if (projectId) {
      await removeProjectAsset(projectId, projectAssetId);
    }
  };

  const handleEdit = (asset: GlobalAsset | { id: string; name: string; data: Record<string, unknown>; tags?: string[] }) => {
    // Find the full global asset if we have a project asset
    const globalAsset = globalAudio.find(ga => ga.id === asset.id);
    setEditingAudio(globalAsset || asset as GlobalAsset);
    setShowFormDialog(true);
  };

  const handleDelete = async (assetId: string) => {
    await deleteAudio(assetId);
  };

  const handleCreate = () => {
    setEditingAudio(null);
    setShowFormDialog(true);
  };

  const handleSuccess = async () => {
    // Refresh global assets to get the updated list
    await fetchGlobalAssets('');
  };

  // Combine project and global audio for display
  const displayAudio = showGlobalOnly
    ? filterByType(globalAudio)
    : projectId
    ? [
        ...filterByType(projectAudio.map((pa) => ({ ...pa, isInProject: true, projectAssetId: pa.project_asset_id }))),
        ...filterByType(globalAudio.filter((ga) => !isAssetInProject(ga.id))),
      ]
    : filterByType(globalAudio);

  // Separate in-project and library audio
  const inProjectAudio = displayAudio.filter((a) => 'isInProject' in a && a.isInProject);
  const libraryAudio = displayAudio.filter((a) => !('isInProject' in a && a.isInProject));

  // Count total unfiltered for empty state
  const totalAudio = showGlobalOnly ? globalAudio.length : (projectAudio.length + globalAudio.length);

  return (
    <div className="space-y-6">
      {/* Header with create button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music className="w-5 h-5 text-blue-400" />
          <span className="text-sm font-medium text-slate-300">
            Bibliothèque Audio
          </span>
        </div>
        <Button
          size="sm"
          onClick={handleCreate}
          className="bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border-0"
        >
          <Plus className="w-4 h-4 mr-1" />
          Ajouter
        </Button>
      </div>

      {/* Type filter group buttons */}
      <div className="inline-flex rounded-lg bg-slate-800/50 p-0.5">
        {AUDIO_FILTERS.map((filter, index) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setTypeFilter(filter.value)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-all',
              index === 0 && 'rounded-l-md',
              index === AUDIO_FILTERS.length - 1 && 'rounded-r-md',
              typeFilter === filter.value
                ? 'bg-slate-700 text-blue-300 rounded-md shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {totalAudio === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-700/30 flex items-center justify-center mb-4">
            <Music className="w-8 h-8 text-blue-400/50" />
          </div>
          <p className="text-slate-400 text-sm">Aucun audio</p>
          <p className="text-slate-500 text-xs mt-1 max-w-[200px]">
            Ajoutez des fichiers audio à votre bibliothèque (musiques, effets sonores, ambiances...)
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCreate}
            className="mt-4 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
          >
            <Plus className="w-4 h-4 mr-2" />
            Ajouter un audio
          </Button>
        </div>
      ) : displayAudio.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-slate-400 text-sm">Aucun audio de type "{AUDIO_FILTERS.find(f => f.value === typeFilter)?.label}"</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* In Project Section */}
          {projectId && inProjectAudio.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Dans le projet ({inProjectAudio.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {inProjectAudio.map((audio) => {
                  const projectAssetId = 'projectAssetId' in audio ? String(audio.projectAssetId) : undefined;
                  return (
                    <BibleAssetCard
                      key={audio.id}
                      asset={audio}
                      isInProject={true}
                      onRemove={projectAssetId ? () => handleRemove(projectAssetId) : undefined}
                      onEdit={() => handleEdit(audio)}
                      onDelete={() => handleDelete(audio.id)}
                      onInsertReference={onInsertReference}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Library Section */}
          {libraryAudio.length > 0 && (
            <div className="space-y-3">
              {projectId && inProjectAudio.length > 0 && (
                <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Bibliothèque ({libraryAudio.length})
                </h3>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {libraryAudio.map((audio) => {
                  const isInProject = isAssetInProject(audio.id);
                  return (
                    <BibleAssetCard
                      key={audio.id}
                      asset={audio}
                      isInProject={isInProject}
                      onImport={projectId && !isInProject ? () => handleImport(audio.id) : undefined}
                      onEdit={() => handleEdit(audio)}
                      onDelete={() => handleDelete(audio.id)}
                      onInsertReference={onInsertReference}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Audio Form Dialog */}
      <AudioFormDialog
        open={showFormDialog}
        onOpenChange={setShowFormDialog}
        audio={editingAudio}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
