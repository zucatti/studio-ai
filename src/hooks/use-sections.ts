'use client';

import { useState, useEffect, useCallback } from 'react';
import type { MusicSection } from '@/types/database';

interface UseSectionsReturn {
  sections: MusicSection[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createSection: (data: Partial<MusicSection>) => Promise<MusicSection | null>;
  updateSection: (id: string, data: Partial<MusicSection>) => Promise<MusicSection | null>;
  deleteSection: (id: string) => Promise<boolean>;
  setSections: (sections: MusicSection[]) => void;
}

export function useSections(projectId: string | null): UseSectionsReturn {
  const [sections, setSections] = useState<MusicSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSections = useCallback(async () => {
    if (!projectId) {
      setSections([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch(`/api/projects/${projectId}/sections`);
      if (!res.ok) throw new Error('Failed to fetch sections');
      const data = await res.json();
      setSections(data.sections || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  const createSection = async (data: Partial<MusicSection>): Promise<MusicSection | null> => {
    if (!projectId) return null;

    try {
      const res = await fetch(`/api/projects/${projectId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error('Failed to create section');
      const result = await res.json();
      setSections((prev) => [...prev, result.section]);
      return result.section;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  };

  const updateSection = async (id: string, data: Partial<MusicSection>): Promise<MusicSection | null> => {
    if (!projectId) return null;

    try {
      const res = await fetch(`/api/projects/${projectId}/sections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error('Failed to update section');
      const result = await res.json();
      setSections((prev) =>
        prev.map((s) => (s.id === id ? result.section : s))
      );
      return result.section;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  };

  const deleteSection = async (id: string): Promise<boolean> => {
    if (!projectId) return false;

    try {
      const res = await fetch(`/api/projects/${projectId}/sections/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete section');
      setSections((prev) => prev.filter((s) => s.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  };

  return {
    sections,
    isLoading,
    error,
    refetch: fetchSections,
    createSection,
    updateSection,
    deleteSection,
    setSections,
  };
}
