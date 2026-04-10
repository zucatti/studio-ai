'use client';

/**
 * Hook for loading and saving Timeline Editor data
 */

import { useCallback, useEffect, useState } from 'react';
import { useTimelineStore, TimelineData } from '@/store/timeline-store';

interface UseTimelineOptions {
  sceneId: string;
  projectId: string;
  autoSave?: boolean;
  autoSaveInterval?: number;
}

export function useTimeline({
  sceneId,
  projectId,
  autoSave = true,
  autoSaveInterval = 30000, // 30 seconds
}: UseTimelineOptions) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const initialize = useTimelineStore((state) => state.initialize);
  const toJSON = useTimelineStore((state) => state.toJSON);
  const isDirty = useTimelineStore((state) => state.isDirty);
  const markClean = useTimelineStore((state) => state.markClean);

  // Load timeline data
  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/scenes/${sceneId}/timeline`
      );

      if (!response.ok) {
        throw new Error('Failed to load timeline');
      }

      const { timelineData } = await response.json();
      initialize(sceneId, projectId, timelineData as TimelineData | undefined);
    } catch (err) {
      console.error('[useTimeline] Load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load timeline');
      // Initialize with defaults on error
      initialize(sceneId, projectId);
    } finally {
      setIsLoading(false);
    }
  }, [sceneId, projectId, initialize]);

  // Save timeline data
  const save = useCallback(async () => {
    if (isSaving) return;

    setIsSaving(true);
    setError(null);

    try {
      const timelineData = toJSON();

      const response = await fetch(
        `/api/projects/${projectId}/scenes/${sceneId}/timeline`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timelineData }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to save timeline');
      }

      markClean();
      setLastSaved(new Date());
    } catch (err) {
      console.error('[useTimeline] Save error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save timeline');
    } finally {
      setIsSaving(false);
    }
  }, [sceneId, projectId, toJSON, markClean, isSaving]);

  // Load on mount
  useEffect(() => {
    load();
  }, [load]);

  // Auto-save
  useEffect(() => {
    if (!autoSave) return;

    const interval = setInterval(() => {
      if (isDirty && !isSaving) {
        save();
      }
    }, autoSaveInterval);

    return () => clearInterval(interval);
  }, [autoSave, autoSaveInterval, isDirty, isSaving, save]);

  // Save before unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  return {
    isLoading,
    isSaving,
    isDirty,
    error,
    lastSaved,
    save,
    reload: load,
  };
}
