'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Check, User, MapPin, Package, Loader2, RefreshCw } from 'lucide-react';

interface Entity {
  id: string;
  name: string;
  reference: string;
  type: 'character' | 'location' | 'prop';
  visual_description?: string;
  reference_images?: string[];
}

interface EntitySelectorProps {
  projectId: string;
  selectedEntities: string[];
  onSelectionChange: (entities: string[]) => void;
}

export function EntitySelector({
  projectId,
  selectedEntities,
  onSelectionChange,
}: EntitySelectorProps) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchEntities = async (showRefreshing = false) => {
    try {
      if (showRefreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      // Fetch all entity types in parallel
      const [charactersRes, locationsRes, propsRes, assetsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/characters`),
        fetch(`/api/projects/${projectId}/locations`),
        fetch(`/api/projects/${projectId}/props`),
        fetch(`/api/projects/${projectId}/assets`),
      ]);

      const allEntities: Entity[] = [];

      if (charactersRes.ok) {
        const data = await charactersRes.json();
        for (const char of data.characters || []) {
          allEntities.push({
            id: char.id,
            name: char.name,
            reference: char.name.replace(/\s+/g, ''),
            type: 'character',
            visual_description: char.visual_description,
            reference_images: char.reference_images,
          });
        }
      }

      if (locationsRes.ok) {
        const data = await locationsRes.json();
        for (const loc of data.locations || []) {
          allEntities.push({
            id: loc.id,
            name: loc.name,
            reference: loc.name.replace(/\s+/g, ''),
            type: 'location',
            visual_description: loc.visual_description,
            reference_images: loc.reference_images,
          });
        }
      }

      if (propsRes.ok) {
        const data = await propsRes.json();
        for (const prop of data.props || []) {
          allEntities.push({
            id: prop.id,
            name: prop.name,
            reference: prop.name.replace(/\s+/g, ''),
            type: 'prop',
            visual_description: prop.visual_description,
            reference_images: prop.reference_images,
          });
        }
      }

      // Also add global assets imported to this project
      if (assetsRes.ok) {
        const data = await assetsRes.json();
        for (const asset of data.assets || []) {
          // Skip if already exists (by name)
          if (allEntities.some(e => e.name.toLowerCase() === asset.name.toLowerCase())) {
            continue;
          }
          if (asset.asset_type === 'audio') continue;

          allEntities.push({
            id: asset.id,
            name: asset.name,
            reference: asset.name.replace(/\s+/g, ''),
            type: asset.asset_type as 'character' | 'location' | 'prop',
            visual_description: asset.data?.visual_description || asset.data?.description,
            reference_images: asset.reference_images,
          });
        }
      }

      setEntities(allEntities);
    } catch (error) {
      console.error('Failed to fetch entities:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEntities();
  }, [projectId]);

  const toggleEntity = (reference: string) => {
    if (selectedEntities.includes(reference)) {
      onSelectionChange(selectedEntities.filter((r) => r !== reference));
    } else {
      onSelectionChange([...selectedEntities, reference]);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'character':
        return User;
      case 'location':
        return MapPin;
      case 'prop':
        return Package;
      default:
        return User;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (entities.length === 0) {
    return (
      <div className="flex items-center justify-between">
        <div className="text-slate-500 text-sm">
          Aucune entité dans la Bible.
          <span className="text-slate-600 ml-1">Ajoutez des personnages, lieux ou accessoires.</span>
        </div>
        <button
          type="button"
          onClick={() => fetchEntities(true)}
          disabled={isRefreshing}
          className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
          title="Actualiser"
        >
          <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
        </button>
      </div>
    );
  }

  // Group by type
  const characters = entities.filter((e) => e.type === 'character');
  const locations = entities.filter((e) => e.type === 'location');
  const props = entities.filter((e) => e.type === 'prop');

  const renderGroup = (title: string, items: Entity[], icon: typeof User) => {
    if (items.length === 0) return null;
    const Icon = icon;

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium uppercase tracking-wide">
          <Icon className="w-3.5 h-3.5" />
          {title}
        </div>
        <div className="flex flex-wrap gap-2">
          {items.map((entity) => {
            const isSelected = selectedEntities.includes(entity.reference);
            return (
              <button
                key={entity.id}
                type="button"
                onClick={() => toggleEntity(entity.reference)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all',
                  isSelected
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                    : 'bg-white/5 text-slate-400 border border-white/10 hover:border-white/20 hover:text-slate-300'
                )}
              >
                {isSelected && <Check className="w-3.5 h-3.5" />}
                <span>{entity.type === 'character' ? '@' : '#'}{entity.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1 space-y-4">
          {renderGroup('Personnages', characters, User)}
          {renderGroup('Lieux', locations, MapPin)}
          {renderGroup('Accessoires', props, Package)}
        </div>
        <button
          type="button"
          onClick={() => fetchEntities(true)}
          disabled={isRefreshing}
          className="ml-3 p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors self-start"
          title="Actualiser les entités"
        >
          <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
        </button>
      </div>
    </div>
  );
}
