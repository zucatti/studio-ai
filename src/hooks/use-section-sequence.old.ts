'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Sequence } from '@/types/cinematic';
import type { MusicSection } from '@/types/database';

interface Shot {
  id: string;
  sequence_id: string;
  description: string;
  duration: number;
  sort_order: number;
  segments: unknown[];
  storyboard_image_url: string | null;
  generated_video_url: string | null;
}

interface UseSectionSequenceReturn {
  sequence: Sequence | null;
  shots: Shot[];
  sectionDuration: number;
  isLoading: boolean;
  error: string | null;
  createSequence: (title?: string) => Promise<void>;
  linkSequence: (sequenceId: string) => Promise<void>;
  unlinkSequence: () => Promise<void>;
  createShot: (description?: string, suggestedDuration?: number) => Promise<Shot | null>;
  updateShot: (shotId: string, updates: Partial<Shot>) => Promise<void>;
  deleteShot: (shotId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useSectionSequence(
  projectId: string,
  section: MusicSection | null
): UseSectionSequenceReturn {
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [sectionDuration, setSectionDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sectionId = section?.id;

  // Fetch sequence and shots
  const refetch = useCallback(async () => {
    if (!projectId || !sectionId) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/sections/${sectionId}/sequence`);
      if (!res.ok) throw new Error('Failed to fetch sequence');

      const data = await res.json();
      setSequence(data.sequence);
      setShots(data.shots || []);
      setSectionDuration(data.sectionDuration || 0);
    } catch (err) {
      console.error('Error fetching section sequence:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, sectionId]);

  // Fetch on mount/change
  useEffect(() => {
    if (sectionId) {
      refetch();
    } else {
      setSequence(null);
      setShots([]);
      setSectionDuration(0);
    }
  }, [sectionId, refetch]);

  // Create a new sequence for this section
  const createSequence = useCallback(async (title?: string) => {
    if (!projectId || !sectionId) return;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sections/${sectionId}/sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });

      if (!res.ok) throw new Error('Failed to create sequence');

      const data = await res.json();
      setSequence(data.sequence);
      setSectionDuration(data.sectionDuration || 0);
    } catch (err) {
      console.error('Error creating sequence:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, sectionId]);

  // Link to existing sequence
  const linkSequence = useCallback(async (existingSequenceId: string) => {
    if (!projectId || !sectionId) return;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sections/${sectionId}/sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ existingSequenceId }),
      });

      if (!res.ok) throw new Error('Failed to link sequence');

      await refetch();
    } catch (err) {
      console.error('Error linking sequence:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, sectionId, refetch]);

  // Unlink sequence from section
  const unlinkSequence = useCallback(async () => {
    if (!projectId || !sectionId) return;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sections/${sectionId}/sequence`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to unlink sequence');

      setSequence(null);
      setShots([]);
    } catch (err) {
      console.error('Error unlinking sequence:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, sectionId]);

  // Create a shot in the sequence
  const createShot = useCallback(async (description = '', suggestedDuration?: number): Promise<Shot | null> => {
    if (!projectId || !sequence?.id) return null;

    try {
      const res = await fetch(`/api/projects/${projectId}/sequences/${sequence.id}/shots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          duration: suggestedDuration || 5,
        }),
      });

      if (!res.ok) throw new Error('Failed to create shot');

      const data = await res.json();
      const newShot = data.shot;

      setShots(prev => [...prev, newShot]);
      return newShot;
    } catch (err) {
      console.error('Error creating shot:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  }, [projectId, sequence?.id]);

  // Update a shot
  const updateShot = useCallback(async (shotId: string, updates: Partial<Shot>) => {
    if (!projectId || !sequence?.id) return;

    try {
      const res = await fetch(`/api/projects/${projectId}/sequences/${sequence.id}/shots/${shotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) throw new Error('Failed to update shot');

      const data = await res.json();
      setShots(prev => prev.map(s => s.id === shotId ? { ...s, ...data.shot } : s));
    } catch (err) {
      console.error('Error updating shot:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [projectId, sequence?.id]);

  // Delete a shot
  const deleteShot = useCallback(async (shotId: string) => {
    if (!projectId || !sequence?.id) return;

    try {
      const res = await fetch(`/api/projects/${projectId}/sequences/${sequence.id}/shots/${shotId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete shot');

      setShots(prev => prev.filter(s => s.id !== shotId));
    } catch (err) {
      console.error('Error deleting shot:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [projectId, sequence?.id]);

  return {
    sequence,
    shots,
    sectionDuration,
    isLoading,
    error,
    createSequence,
    linkSequence,
    unlinkSequence,
    createShot,
    updateShot,
    deleteShot,
    refetch,
  };
}
