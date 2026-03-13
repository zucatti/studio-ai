'use client';

import { useBibleStore } from '@/store/bible-store';
import { BibleAssetCard } from './BibleAssetCard';
import { Music, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  } = useBibleStore();

  const globalAudio = getAssetsByType('audio');
  const projectAudio = projectId ? getProjectAssetsByType('audio') : [];

  const handleImport = async (globalAssetId: string) => {
    if (projectId) {
      await importGlobalAsset(projectId, globalAssetId);
    }
  };

  const handleRemove = async (projectAssetId: string) => {
    await removeProjectAsset(projectAssetId);
  };

  const displayAudio = showGlobalOnly
    ? globalAudio
    : projectId
    ? [
        ...projectAudio.map((pa) => ({ ...pa, isInProject: true, projectAssetId: pa.project_asset_id })),
        ...globalAudio.filter((ga) => !isAssetInProject(ga.id)),
      ]
    : globalAudio;

  if (displayAudio.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Music className="w-12 h-12 text-slate-500 mb-3" />
        <p className="text-slate-400 text-sm">Aucun audio</p>
        <p className="text-slate-500 text-xs mt-1">
          Ajoutez des fichiers audio a votre bibliotheque
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4 border-white/10 text-slate-300 hover:bg-white/5"
        >
          <Plus className="w-4 h-4 mr-2" />
          Ajouter un audio
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {displayAudio.map((audio) => {
        const isInProject = 'isInProject' in audio ? Boolean(audio.isInProject) : isAssetInProject(audio.id);
        const projectAssetId = 'projectAssetId' in audio ? String(audio.projectAssetId) : undefined;

        return (
          <BibleAssetCard
            key={audio.id}
            asset={audio}
            isInProject={isInProject}
            onImport={projectId && !isInProject ? () => handleImport(audio.id) : undefined}
            onRemove={projectAssetId ? () => handleRemove(projectAssetId) : undefined}
            onInsertReference={onInsertReference}
          />
        );
      })}
    </div>
  );
}
