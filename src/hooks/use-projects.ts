'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Project } from '@/types/database';

interface UseProjectsReturn {
  projects: Project[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createProject: (name: string, description?: string, thumbnailUrl?: string) => Promise<Project | null>;
  updateProject: (id: string, data: Partial<Project>) => Promise<Project | null>;
  deleteProject: (id: string) => Promise<boolean>;
}

export function useProjects(): UseProjectsReturn {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('Failed to fetch projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = async (name: string, description?: string, thumbnailUrl?: string): Promise<Project | null> => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, thumbnail_url: thumbnailUrl }),
      });
      if (!res.ok) throw new Error('Failed to create project');
      const data = await res.json();
      setProjects((prev) => [data.project, ...prev]);
      return data.project;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  };

  const updateProject = async (id: string, data: Partial<Project>): Promise<Project | null> => {
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update project');
      const result = await res.json();
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? result.project : p))
      );
      return result.project;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  };

  const deleteProject = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete project');
      setProjects((prev) => prev.filter((p) => p.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  };

  return {
    projects,
    isLoading,
    error,
    refetch: fetchProjects,
    createProject,
    updateProject,
    deleteProject,
  };
}
