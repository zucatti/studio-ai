'use client';

import { useBibleStore } from '@/store/bible-store';
import { BibleAssetCard } from './BibleAssetCard';
import { MapPin, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BibleLocationsProps {
  projectId?: string;
  onInsertReference?: (reference: string) => void;
  showGlobalOnly?: boolean;
}

export function BibleLocations({ projectId, onInsertReference, showGlobalOnly = false }: BibleLocationsProps) {
  const {
    getAssetsByType,
    getProjectAssetsByType,
    isAssetInProject,
    importGlobalAsset,
    removeProjectAsset,
  } = useBibleStore();

  const globalLocations = getAssetsByType('location');
  const projectLocations = projectId ? getProjectAssetsByType('location') : [];

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

  const displayLocations = showGlobalOnly
    ? globalLocations
    : projectId
    ? [
        ...projectLocations.map((pa) => ({ ...pa, isInProject: true, projectAssetId: pa.project_asset_id })),
        ...globalLocations.filter((ga) => !isAssetInProject(ga.id)),
      ]
    : globalLocations;

  if (displayLocations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <MapPin className="w-12 h-12 text-slate-500 mb-3" />
        <p className="text-slate-400 text-sm">Aucun lieu</p>
        <p className="text-slate-500 text-xs mt-1">
          Creez des lieux dans votre bibliotheque globale
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4 border-white/10 text-slate-300 hover:bg-white/5"
        >
          <Plus className="w-4 h-4 mr-2" />
          Creer un lieu
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {displayLocations.map((location) => {
        const isInProject = 'isInProject' in location ? Boolean(location.isInProject) : isAssetInProject(location.id);
        const projectAssetId = 'projectAssetId' in location ? String(location.projectAssetId) : undefined;

        return (
          <BibleAssetCard
            key={location.id}
            asset={location}
            isInProject={isInProject}
            onImport={projectId && !isInProject ? () => handleImport(location.id) : undefined}
            onRemove={projectAssetId ? () => handleRemove(projectAssetId) : undefined}
            onInsertReference={onInsertReference}
          />
        );
      })}
    </div>
  );
}
