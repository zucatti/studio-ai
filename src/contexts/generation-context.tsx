'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { toast } from 'sonner';

export interface GenerationJob {
  id: string;
  projectId: string;
  type: 'quick-shot' | 'storyboard' | 'character';
  status: 'pending' | 'generating' | 'completed' | 'error';
  imageCount?: number;
  completedCount?: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

interface GenerationContextType {
  jobs: GenerationJob[];
  activeCount: number;
  addJob: (job: Omit<GenerationJob, 'startedAt'>) => void;
  updateJob: (id: string, updates: Partial<GenerationJob>) => void;
  removeJob: (id: string) => void;
  getJobsForProject: (projectId: string) => GenerationJob[];
}

const GenerationContext = createContext<GenerationContextType | null>(null);

const STORAGE_KEY = 'generation-jobs';
const JOB_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes - remove old completed jobs
const STALE_JOB_MS = 10 * 60 * 1000; // 10 minutes - auto-cleanup stuck pending/generating jobs

export function GenerationProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<GenerationJob[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as GenerationJob[];
        // Filter out old completed jobs and stale pending/generating jobs
        const now = Date.now();
        const validJobs = parsed.filter(job => {
          if (job.status === 'completed' || job.status === 'error') {
            return (job.completedAt || job.startedAt) + JOB_EXPIRY_MS > now;
          }
          // Clean up pending/generating jobs that are stuck for too long
          // (e.g., page was closed during generation)
          return job.startedAt + STALE_JOB_MS > now;
        });
        setJobs(validJobs);
      } catch (e) {
        console.error('Failed to parse generation jobs:', e);
      }
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  }, [jobs]);

  // Periodic cleanup of stale jobs (every minute)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setJobs(prev => {
        const filtered = prev.filter(job => {
          if (job.status === 'completed' || job.status === 'error') {
            return (job.completedAt || job.startedAt) + JOB_EXPIRY_MS > now;
          }
          return job.startedAt + STALE_JOB_MS > now;
        });
        // Only update if something changed
        return filtered.length !== prev.length ? filtered : prev;
      });
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const addJob = useCallback((job: Omit<GenerationJob, 'startedAt'>) => {
    const newJob: GenerationJob = {
      ...job,
      startedAt: Date.now(),
    };
    setJobs(prev => [...prev, newJob]);
  }, []);

  const updateJob = useCallback((id: string, updates: Partial<GenerationJob>) => {
    setJobs(prev => {
      const updated = prev.map(job => {
        if (job.id !== id) return job;

        const newJob = { ...job, ...updates };

        // Show toast on completion
        if (updates.status === 'completed' && job.status !== 'completed') {
          newJob.completedAt = Date.now();
          const typeLabel = job.type === 'quick-shot' ? 'Quick Shot' :
                           job.type === 'storyboard' ? 'Storyboard' : 'Personnage';
          const count = updates.completedCount || job.imageCount || 1;
          toast.success(`${typeLabel} termine`, {
            description: `${count} image${count > 1 ? 's' : ''} generee${count > 1 ? 's' : ''}`,
          });
        } else if (updates.status === 'error' && job.status !== 'error') {
          newJob.completedAt = Date.now();
          toast.error('Erreur de generation', {
            description: updates.error || 'Une erreur est survenue',
          });
        }

        return newJob;
      });
      return updated;
    });
  }, []);

  const removeJob = useCallback((id: string) => {
    setJobs(prev => prev.filter(job => job.id !== id));
  }, []);

  const getJobsForProject = useCallback((projectId: string) => {
    return jobs.filter(job => job.projectId === projectId);
  }, [jobs]);

  const activeCount = jobs.filter(j => j.status === 'pending' || j.status === 'generating').length;

  return (
    <GenerationContext.Provider value={{
      jobs,
      activeCount,
      addJob,
      updateJob,
      removeJob,
      getJobsForProject,
    }}>
      {children}
    </GenerationContext.Provider>
  );
}

export function useGeneration() {
  const context = useContext(GenerationContext);
  if (!context) {
    throw new Error('useGeneration must be used within a GenerationProvider');
  }
  return context;
}
