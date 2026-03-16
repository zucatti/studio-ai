'use client';

import { useBibleStore } from '@/store/bible-store';
import { BibleAssetCard } from './BibleAssetCard';
import { Package, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BiblePropsProps {
  projectId?: string;
  onInsertReference?: (reference: string) => void;
  showGlobalOnly?: boolean;
}

export function BibleProps({ projectId, onInsertReference, showGlobalOnly = false }: BiblePropsProps) {
  const {
    getAssetsByType,
    getProjectAssetsByType,
    isAssetInProject,
    importGlobalAsset,
    removeProjectAsset,
  } = useBibleStore();

  const globalProps = getAssetsByType('prop');
  const projectProps = projectId ? getProjectAssetsByType('prop') : [];

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

  const displayProps = showGlobalOnly
    ? globalProps
    : projectId
    ? [
        ...projectProps.map((pa) => ({ ...pa, isInProject: true, projectAssetId: pa.project_asset_id })),
        ...globalProps.filter((ga) => !isAssetInProject(ga.id)),
      ]
    : globalProps;

  if (displayProps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Package className="w-12 h-12 text-slate-500 mb-3" />
        <p className="text-slate-400 text-sm">Aucun accessoire</p>
        <p className="text-slate-500 text-xs mt-1">
          Creez des accessoires dans votre bibliotheque globale
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4 border-white/10 text-slate-300 hover:bg-white/5"
        >
          <Plus className="w-4 h-4 mr-2" />
          Creer un accessoire
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {displayProps.map((prop) => {
        const isInProject = 'isInProject' in prop ? Boolean(prop.isInProject) : isAssetInProject(prop.id);
        const projectAssetId = 'projectAssetId' in prop ? String(prop.projectAssetId) : undefined;

        return (
          <BibleAssetCard
            key={prop.id}
            asset={prop}
            isInProject={isInProject}
            onImport={projectId && !isInProject ? () => handleImport(prop.id) : undefined}
            onRemove={projectAssetId ? () => handleRemove(projectAssetId) : undefined}
            onInsertReference={onInsertReference}
          />
        );
      })}
    </div>
  );
}
