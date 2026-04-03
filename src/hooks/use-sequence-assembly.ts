import { useState, useCallback, useEffect, useRef } from 'react';
import type { Sequence } from '@/types/cinematic';
import type { Plan } from '@/store/shorts-store';

interface SequenceAssemblyState {
  sequenceId: string;
  status: 'idle' | 'checking' | 'queued' | 'assembling' | 'completed' | 'error';
  progress: number;
  jobId?: string;
  error?: string;
  assembledVideoUrl?: string | null;
}

interface UseSequenceAssemblyOptions {
  projectId: string;
  shortId: string;
  sequences: Sequence[];
  plans: Plan[];
  enabled?: boolean;
}

export function useSequenceAssembly({
  projectId,
  shortId,
  sequences,
  plans,
  enabled = true,
}: UseSequenceAssemblyOptions) {
  const [assemblyStates, setAssemblyStates] = useState<Map<string, SequenceAssemblyState>>(new Map());
  const pollingRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Get plans for a sequence
  const getPlansForSequence = useCallback((sequenceId: string) => {
    return plans
      .filter(p => p.sequence_id === sequenceId && p.generated_video_url)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [plans]);

  // Check if a sequence needs assembly
  const checkSequence = useCallback(async (sequenceId: string): Promise<{ needsAssembly: boolean; assembledVideoUrl?: string }> => {
    setAssemblyStates(prev => {
      const newMap = new Map(prev);
      newMap.set(sequenceId, {
        sequenceId,
        status: 'checking',
        progress: 0,
      });
      return newMap;
    });

    try {
      const res = await fetch(
        `/api/projects/${projectId}/shorts/${shortId}/sequences/${sequenceId}/assemble`
      );
      const data = await res.json();

      if (!data.needsAssembly) {
        // Already assembled
        setAssemblyStates(prev => {
          const newMap = new Map(prev);
          newMap.set(sequenceId, {
            sequenceId,
            status: 'completed',
            progress: 100,
            assembledVideoUrl: data.assembledVideoUrl,
          });
          return newMap;
        });
        return { needsAssembly: false, assembledVideoUrl: data.assembledVideoUrl };
      }

      return { needsAssembly: true };
    } catch (error) {
      setAssemblyStates(prev => {
        const newMap = new Map(prev);
        newMap.set(sequenceId, {
          sequenceId,
          status: 'error',
          progress: 0,
          error: 'Failed to check assembly status',
        });
        return newMap;
      });
      return { needsAssembly: false };
    }
  }, [projectId, shortId]);

  // Queue assembly for a sequence
  const queueAssembly = useCallback(async (sequenceId: string) => {
    setAssemblyStates(prev => {
      const newMap = new Map(prev);
      newMap.set(sequenceId, {
        sequenceId,
        status: 'queued',
        progress: 5,
      });
      return newMap;
    });

    try {
      const res = await fetch(
        `/api/projects/${projectId}/shorts/${shortId}/sequences/${sequenceId}/assemble`,
        { method: 'POST' }
      );
      const data = await res.json();

      if (data.status === 'already_assembled') {
        setAssemblyStates(prev => {
          const newMap = new Map(prev);
          newMap.set(sequenceId, {
            sequenceId,
            status: 'completed',
            progress: 100,
          });
          return newMap;
        });
        return;
      }

      if (data.jobId) {
        setAssemblyStates(prev => {
          const newMap = new Map(prev);
          newMap.set(sequenceId, {
            sequenceId,
            status: 'assembling',
            progress: 10,
            jobId: data.jobId,
          });
          return newMap;
        });

        // Start polling for job status
        pollJobStatus(sequenceId, data.jobId);
      }
    } catch (error) {
      setAssemblyStates(prev => {
        const newMap = new Map(prev);
        newMap.set(sequenceId, {
          sequenceId,
          status: 'error',
          progress: 0,
          error: 'Failed to queue assembly',
        });
        return newMap;
      });
    }
  }, [projectId, shortId]);

  // Poll job status
  const pollJobStatus = useCallback((sequenceId: string, jobId: string) => {
    // Clear any existing polling for this sequence
    const existingInterval = pollingRefs.current.get(sequenceId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const data = await res.json();
        const job = data.job;

        if (!job) {
          return; // Job not found, will retry
        }

        if (job.status === 'completed') {
          clearInterval(interval);
          pollingRefs.current.delete(sequenceId);

          setAssemblyStates(prev => {
            const newMap = new Map(prev);
            newMap.set(sequenceId, {
              sequenceId,
              status: 'completed',
              progress: 100,
              jobId,
              assembledVideoUrl: job.result_data?.outputUrl,
            });
            return newMap;
          });
        } else if (job.status === 'failed') {
          clearInterval(interval);
          pollingRefs.current.delete(sequenceId);

          setAssemblyStates(prev => {
            const newMap = new Map(prev);
            newMap.set(sequenceId, {
              sequenceId,
              status: 'error',
              progress: 0,
              jobId,
              error: job.error_message || 'Assembly failed',
            });
            return newMap;
          });
        } else {
          // Update progress
          setAssemblyStates(prev => {
            const newMap = new Map(prev);
            const current = prev.get(sequenceId);
            newMap.set(sequenceId, {
              ...current,
              sequenceId,
              status: 'assembling',
              progress: job.progress || current?.progress || 10,
              jobId,
            });
            return newMap;
          });
        }
      } catch {
        // Ignore polling errors, will retry
      }
    }, 1500); // Poll every 1.5s

    pollingRefs.current.set(sequenceId, interval);
  }, []);

  // Check and assemble all sequences that need it
  const assembleAll = useCallback(async () => {
    for (const sequence of sequences) {
      const seqPlans = getPlansForSequence(sequence.id);

      // Skip sequences with no videos
      if (seqPlans.length === 0) {
        setAssemblyStates(prev => {
          const newMap = new Map(prev);
          newMap.set(sequence.id, {
            sequenceId: sequence.id,
            status: 'idle',
            progress: 0,
          });
          return newMap;
        });
        continue;
      }

      // Check if needs assembly
      const result = await checkSequence(sequence.id);

      if (result.needsAssembly) {
        await queueAssembly(sequence.id);
      }
    }
  }, [sequences, getPlansForSequence, checkSequence, queueAssembly]);

  // Auto-assemble when enabled changes to true
  useEffect(() => {
    if (enabled && sequences.length > 0) {
      assembleAll();
    }

    // Cleanup polling on unmount
    return () => {
      pollingRefs.current.forEach(interval => clearInterval(interval));
      pollingRefs.current.clear();
    };
  }, [enabled]); // Only trigger on enabled change

  // Get state for a specific sequence
  const getSequenceState = useCallback((sequenceId: string): SequenceAssemblyState | undefined => {
    return assemblyStates.get(sequenceId);
  }, [assemblyStates]);

  // Check if any sequence is currently assembling
  const isAssembling = Array.from(assemblyStates.values()).some(
    s => s.status === 'checking' || s.status === 'queued' || s.status === 'assembling'
  );

  // Get overall progress (average)
  const overallProgress = sequences.length > 0
    ? Array.from(assemblyStates.values()).reduce((sum, s) => sum + s.progress, 0) / sequences.length
    : 0;

  // Assemble a single sequence
  const assembleSequence = useCallback(async (sequenceId: string) => {
    const seqPlans = getPlansForSequence(sequenceId);

    // Skip sequences with no videos
    if (seqPlans.length === 0) {
      setAssemblyStates(prev => {
        const newMap = new Map(prev);
        newMap.set(sequenceId, {
          sequenceId,
          status: 'idle',
          progress: 0,
          error: 'Aucune vidéo à assembler',
        });
        return newMap;
      });
      return;
    }

    // Check if needs assembly
    const result = await checkSequence(sequenceId);

    if (result.needsAssembly) {
      await queueAssembly(sequenceId);
    }
  }, [getPlansForSequence, checkSequence, queueAssembly]);

  return {
    assemblyStates,
    getSequenceState,
    assembleAll,
    assembleSequence,
    isAssembling,
    overallProgress,
  };
}
