'use client';

import { useBibleStore } from '@/store/bible-store';
import { BibleAssetCard } from './BibleAssetCard';
import { User, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BibleCharactersProps {
  projectId?: string;
  onInsertReference?: (reference: string) => void;
  showGlobalOnly?: boolean;
}

export function BibleCharacters({ projectId, onInsertReference, showGlobalOnly = false }: BibleCharactersProps) {
  const {
    getAssetsByType,
    getProjectAssetsByType,
    isAssetInProject,
    importGlobalAsset,
    removeProjectAsset,
  } = useBibleStore();

  const globalCharacters = getAssetsByType('character');
  const projectCharacters = projectId ? getProjectAssetsByType('character') : [];

  const handleImport = async (globalAssetId: string) => {
    if (projectId) {
      await importGlobalAsset(projectId, globalAssetId);
    }
  };

  const handleRemove = async (projectAssetId: string) => {
    await removeProjectAsset(projectAssetId);
  };

  // Show project characters first if in project context
  const displayCharacters = showGlobalOnly
    ? globalCharacters
    : projectId
    ? [
        ...projectCharacters.map((pa) => ({ ...pa, isInProject: true, projectAssetId: pa.project_asset_id })),
        ...globalCharacters.filter((ga) => !isAssetInProject(ga.id)),
      ]
    : globalCharacters;

  if (displayCharacters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <User className="w-12 h-12 text-slate-500 mb-3" />
        <p className="text-slate-400 text-sm">Aucun personnage</p>
        <p className="text-slate-500 text-xs mt-1">
          Creez des personnages dans votre bibliotheque globale
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4 border-white/10 text-slate-300 hover:bg-white/5"
        >
          <Plus className="w-4 h-4 mr-2" />
          Creer un personnage
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {displayCharacters.map((character) => {
        const isInProject = 'isInProject' in character ? Boolean(character.isInProject) : isAssetInProject(character.id);
        const projectAssetId = 'projectAssetId' in character ? String(character.projectAssetId) : undefined;

        return (
          <BibleAssetCard
            key={character.id}
            asset={character}
            isInProject={isInProject}
            onImport={projectId && !isInProject ? () => handleImport(character.id) : undefined}
            onRemove={projectAssetId ? () => handleRemove(projectAssetId) : undefined}
            onInsertReference={onInsertReference}
          />
        );
      })}
    </div>
  );
}
