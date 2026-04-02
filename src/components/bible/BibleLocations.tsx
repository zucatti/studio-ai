'use client';

import { useState } from 'react';
import { useBibleStore } from '@/store/bible-store';
import { LocationCard } from './LocationCard';
import { LocationFormDialog } from './LocationFormDialog';
import { MapPin, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { GlobalAsset } from '@/types/database';

interface BibleLocationsProps {
  projectId?: string;
  onInsertReference?: (reference: string) => void;
  showGlobalOnly?: boolean;
}

export function BibleLocations({ projectId, onInsertReference, showGlobalOnly = false }: BibleLocationsProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState<GlobalAsset | null>(null);

  const {
    globalAssets,
    getAssetsByType,
    getProjectAssetsByType,
    isAssetInProject,
    importGlobalAsset,
    removeProjectAsset,
    fetchGlobalAssets,
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

  const handleCreate = () => {
    setEditingLocation(null);
    setShowForm(true);
  };

  const handleEdit = (location: GlobalAsset) => {
    setEditingLocation(location);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    fetchGlobalAssets('');
  };

  const handleDelete = async (locationId: string, locationName: string) => {
    if (!confirm(`Supprimer le lieu "${locationName}" ?`)) return;

    try {
      const res = await fetch(`/api/global-assets/${locationId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast.success('Lieu supprimé');
        fetchGlobalAssets('');
      } else {
        const error = await res.json();
        toast.error(error.error || 'Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Error deleting location:', error);
      toast.error('Erreur de connexion');
    }
  };

  // Sort helper
  const sortByName = <T extends { name: string }>(arr: T[]): T[] =>
    [...arr].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  const displayLocations = sortByName(
    showGlobalOnly
      ? globalLocations
      : projectId
      ? [
          ...projectLocations.map((pa) => ({ ...pa, isInProject: true, projectAssetId: pa.project_asset_id })),
          ...globalLocations.filter((ga) => !isAssetInProject(ga.id)),
        ]
      : globalLocations
  );

  if (displayLocations.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <MapPin className="w-12 h-12 text-slate-500 mb-3" />
          <p className="text-slate-400 text-sm">Aucun lieu</p>
          <p className="text-slate-500 text-xs mt-1">
            Créez des lieux dans votre bibliothèque globale
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCreate}
            className="mt-4 border-green-500/30 text-green-400 hover:bg-green-500/10"
          >
            <Plus className="w-4 h-4 mr-2" />
            Créer un lieu
          </Button>
        </div>
        <LocationFormDialog
          open={showForm}
          onOpenChange={setShowForm}
          location={editingLocation}
          onSuccess={handleFormSuccess}
        />
      </>
    );
  }

  return (
    <>
      {/* Create button */}
      <div className="mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCreate}
          className="border-green-500/30 text-green-400 hover:bg-green-500/10"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nouveau lieu
        </Button>
      </div>

      {/* Grid of location cards */}
      <div className="grid grid-cols-3 gap-3">
        {displayLocations.map((location) => {
          const isInProject = 'isInProject' in location ? Boolean(location.isInProject) : isAssetInProject(location.id);
          const projectAssetId = 'projectAssetId' in location ? String(location.projectAssetId) : undefined;
          const globalLocation = globalAssets.find((a) => a.id === location.id);

          return (
            <LocationCard
              key={location.id}
              location={location as GlobalAsset}
              isInProject={isInProject}
              onImport={projectId && !isInProject ? () => handleImport(location.id) : undefined}
              onRemove={projectAssetId ? () => handleRemove(projectAssetId) : undefined}
              onEdit={globalLocation ? () => handleEdit(globalLocation) : undefined}
              onDelete={() => handleDelete(location.id, location.name)}
            />
          );
        })}
      </div>

      <LocationFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        location={editingLocation}
        onSuccess={handleFormSuccess}
      />
    </>
  );
}
