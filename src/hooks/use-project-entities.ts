'use client';

import { useEffect, useState, useMemo } from 'react';
import { generateReferenceName } from '@/lib/reference-name';
import type { MentionEntity } from '@/components/ui/mention-text';

interface ProjectEntity {
  id: string;
  name: string;
  type: 'character' | 'location' | 'prop';
  visual_description?: string;
  reference_images?: string[];
}

interface UseProjectEntitiesResult {
  entities: MentionEntity[];
  entityMap: Map<string, MentionEntity>;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch all entities (characters, locations, props) from a project
 * and convert them to MentionEntity format for use with MentionText
 */
export function useProjectEntities(projectId: string | undefined): UseProjectEntitiesResult {
  const [rawEntities, setRawEntities] = useState<ProjectEntity[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchEntities = async () => {
    if (!projectId) {
      setRawEntities([]);
      return;
    }

    setIsLoading(true);
    try {
      const [charactersRes, locationsRes, propsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/characters`),
        fetch(`/api/projects/${projectId}/locations`),
        fetch(`/api/projects/${projectId}/props`),
      ]);

      const entities: ProjectEntity[] = [];

      if (charactersRes.ok) {
        const data = await charactersRes.json();
        for (const char of data.characters || []) {
          entities.push({
            id: char.id,
            name: char.name,
            type: 'character',
            visual_description: char.visual_description,
            reference_images: char.reference_images,
          });
        }
      }

      if (locationsRes.ok) {
        const data = await locationsRes.json();
        for (const loc of data.locations || []) {
          entities.push({
            id: loc.id,
            name: loc.name,
            type: 'location',
            visual_description: loc.visual_description,
            reference_images: loc.reference_images,
          });
        }
      }

      if (propsRes.ok) {
        const data = await propsRes.json();
        for (const prop of data.props || []) {
          entities.push({
            id: prop.id,
            name: prop.name,
            type: 'prop',
            visual_description: prop.visual_description,
            reference_images: prop.reference_images,
          });
        }
      }

      setRawEntities(entities);
    } catch (error) {
      console.error('Error fetching project entities:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEntities();
  }, [projectId]);

  // Convert to MentionEntity format
  const entities: MentionEntity[] = useMemo(() => {
    return rawEntities.map((entity) => ({
      reference: generateReferenceName(entity.name),
      name: entity.name,
      type: entity.type,
      visual_description: entity.visual_description,
      reference_images: entity.reference_images,
    }));
  }, [rawEntities]);

  // Create lookup map
  const entityMap = useMemo(() => {
    const map = new Map<string, MentionEntity>();
    for (const entity of entities) {
      map.set(entity.reference, entity);
    }
    return map;
  }, [entities]);

  return {
    entities,
    entityMap,
    isLoading,
    refetch: fetchEntities,
  };
}

/**
 * Hook to also include global assets from the Bible
 */
export function useAllEntities(
  projectId: string | undefined,
  includeGlobalAssets: boolean = true
): UseProjectEntitiesResult {
  const projectEntities = useProjectEntities(projectId);
  const [globalEntities, setGlobalEntities] = useState<MentionEntity[]>([]);
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(false);

  useEffect(() => {
    if (!includeGlobalAssets) {
      setGlobalEntities([]);
      return;
    }

    const fetchGlobal = async () => {
      setIsLoadingGlobal(true);
      try {
        const res = await fetch('/api/global-assets');
        if (res.ok) {
          const data = await res.json();
          const entities: MentionEntity[] = [];

          for (const asset of data.assets || []) {
            if (asset.asset_type === 'audio') continue;

            const assetData = asset.data as Record<string, unknown>;
            entities.push({
              reference: generateReferenceName(asset.name),
              name: asset.name,
              type: asset.asset_type as 'character' | 'location' | 'prop',
              visual_description: (assetData?.visual_description as string) || (assetData?.description as string),
              reference_images: asset.reference_images,
            });
          }

          setGlobalEntities(entities);
        }
      } catch (error) {
        console.error('Error fetching global assets:', error);
      } finally {
        setIsLoadingGlobal(false);
      }
    };

    fetchGlobal();
  }, [includeGlobalAssets]);

  // Merge project and global entities (project takes precedence)
  const mergedEntities = useMemo(() => {
    const seenRefs = new Set(projectEntities.entities.map((e) => e.reference));
    const uniqueGlobal = globalEntities.filter((e) => !seenRefs.has(e.reference));
    return [...projectEntities.entities, ...uniqueGlobal];
  }, [projectEntities.entities, globalEntities]);

  const entityMap = useMemo(() => {
    const map = new Map<string, MentionEntity>();
    for (const entity of mergedEntities) {
      map.set(entity.reference, entity);
    }
    return map;
  }, [mergedEntities]);

  return {
    entities: mergedEntities,
    entityMap,
    isLoading: projectEntities.isLoading || isLoadingGlobal,
    refetch: projectEntities.refetch,
  };
}
