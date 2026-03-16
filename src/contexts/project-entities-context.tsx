'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useProjectEntities } from '@/hooks/use-project-entities';
import type { MentionEntity } from '@/components/ui/mention-text';

interface ProjectEntitiesContextValue {
  entities: MentionEntity[];
  entityMap: Map<string, MentionEntity>;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

const ProjectEntitiesContext = createContext<ProjectEntitiesContextValue | null>(null);

interface ProjectEntitiesProviderProps {
  projectId: string | undefined;
  children: ReactNode;
}

export function ProjectEntitiesProvider({ projectId, children }: ProjectEntitiesProviderProps) {
  const value = useProjectEntities(projectId);

  return (
    <ProjectEntitiesContext.Provider value={value}>
      {children}
    </ProjectEntitiesContext.Provider>
  );
}

export function useProjectEntitiesContext(): ProjectEntitiesContextValue {
  const context = useContext(ProjectEntitiesContext);
  if (!context) {
    // Return empty values if not in provider context
    return {
      entities: [],
      entityMap: new Map(),
      isLoading: false,
      refetch: async () => {},
    };
  }
  return context;
}
