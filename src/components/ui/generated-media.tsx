'use client';

import { useEffect, useState } from 'react';
import { GeneratingPlaceholder } from './generating-placeholder';
import { StorageImg } from './storage-image';
import { AlertCircle, ImageIcon, Film } from 'lucide-react';
import { useJobsStore } from '@/store/jobs-store';

interface GeneratedMediaProps {
  // Media URL (b2:// or https://)
  url?: string | null;
  // Media type
  type?: 'image' | 'video';
  // Aspect ratio for placeholder
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5' | '4:3';
  // Job tracking - provide assetId OR jobId to track generation
  assetId?: string;
  assetType?: string;
  jobId?: string;
  // Manual status override (if not using job tracking)
  status?: 'idle' | 'generating' | 'completed' | 'failed';
  progress?: number;
  startedAt?: string | number;
  errorMessage?: string;
  // Styling
  className?: string;
  // Empty state text
  emptyText?: string;
  // Alt text for images
  alt?: string;
  // Callbacks
  onCompleted?: () => void;
  onFailed?: (error: string) => void;
}

/**
 * Generic component for displaying generated media (image or video)
 * Automatically shows generation progress if a job is active
 */
export function GeneratedMedia({
  url,
  type = 'image',
  aspectRatio = '16:9',
  assetId,
  assetType,
  jobId,
  status: manualStatus,
  progress: manualProgress,
  startedAt: manualStartedAt,
  errorMessage: manualError,
  className = '',
  emptyText,
  alt = 'Generated media',
  onCompleted,
  onFailed,
}: GeneratedMediaProps) {
  const { jobs } = useJobsStore();

  // Track job state
  const [jobState, setJobState] = useState<{
    status: 'idle' | 'generating' | 'completed' | 'failed';
    progress: number;
    startedAt?: string | number;
    error?: string;
  }>({
    status: url ? 'completed' : 'idle',
    progress: 0,
  });

  // Find active job for this asset
  useEffect(() => {
    if (!assetId && !jobId) return;

    const activeJob = jobs.find((job) => {
      if (jobId && job.id === jobId) return true;
      if (assetId) {
        // Check asset_id or input_data for matching ID
        if (job.asset_id === assetId) return true;
        const inputData = job.input_data as Record<string, unknown>;
        if (
          inputData?.assetId === assetId ||
          inputData?.frameId === assetId ||
          inputData?.shotId === assetId ||
          inputData?.shortId === assetId
        ) {
          return true;
        }
      }
      if (assetType && job.asset_type !== assetType) return false;
      return false;
    });

    if (activeJob) {
      const isActive = ['pending', 'queued', 'running'].includes(activeJob.status);
      const isFailed = activeJob.status === 'failed';
      const isCompleted = activeJob.status === 'completed';

      if (isActive) {
        setJobState({
          status: 'generating',
          progress: activeJob.progress,
          startedAt: activeJob.started_at || activeJob.created_at,
        });
      } else if (isFailed) {
        setJobState({
          status: 'failed',
          progress: 0,
          error: activeJob.error_message || 'Erreur inconnue',
        });
        onFailed?.(activeJob.error_message || 'Erreur inconnue');
      } else if (isCompleted) {
        setJobState({
          status: 'completed',
          progress: 100,
        });
        onCompleted?.();
      }
    } else if (!url) {
      setJobState({ status: 'idle', progress: 0 });
    }
  }, [jobs, assetId, assetType, jobId, url, onCompleted, onFailed]);

  // Listen for job events
  useEffect(() => {
    if (!assetId) return;

    const handleCompleted = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.assetId === assetId || detail?.frameId === assetId || detail?.shotId === assetId) {
        setJobState({ status: 'completed', progress: 100 });
        onCompleted?.();
      }
    };

    const handleFailed = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.assetId === assetId || detail?.frameId === assetId || detail?.shotId === assetId) {
        setJobState({
          status: 'failed',
          progress: 0,
          error: detail.errorMessage || 'Erreur inconnue',
        });
        onFailed?.(detail.errorMessage || 'Erreur inconnue');
      }
    };

    window.addEventListener('job-completed', handleCompleted);
    window.addEventListener('job-failed', handleFailed);
    return () => {
      window.removeEventListener('job-completed', handleCompleted);
      window.removeEventListener('job-failed', handleFailed);
    };
  }, [assetId, onCompleted, onFailed]);

  // Determine actual state (manual override or job-based)
  const status = manualStatus || jobState.status;
  const progress = manualProgress ?? jobState.progress;
  const startedAt = manualStartedAt || jobState.startedAt;
  const error = manualError || jobState.error;

  // If we have a URL, show the media
  if (url) {
    if (type === 'video') {
      return (
        <video
          src={url}
          className={`w-full h-full object-cover ${className}`}
          autoPlay
          loop
          muted
          playsInline
        />
      );
    }
    return (
      <StorageImg
        src={url}
        alt={alt}
        className={`w-full h-full object-contain ${className}`}
      />
    );
  }

  // If generating, show placeholder with progress
  if (status === 'generating') {
    return (
      <GeneratingPlaceholder
        aspectRatio={aspectRatio as '16:9' | '9:16' | '1:1' | '4:5'}
        status={progress > 70 ? 'uploading' : progress > 0 ? 'generating' : 'queued'}
        progress={progress}
        startedAt={startedAt}
        className={className}
      />
    );
  }

  // If failed, show error
  if (status === 'failed') {
    return (
      <div className={`flex flex-col items-center justify-center bg-black/30 ${className}`}>
        <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
        <span className="text-xs text-red-400">Échec</span>
        {error && (
          <span className="text-[10px] text-slate-500 mt-1 px-2 text-center line-clamp-2">
            {error}
          </span>
        )}
      </div>
    );
  }

  // Empty state
  const Icon = type === 'video' ? Film : ImageIcon;
  return (
    <div className={`flex flex-col items-center justify-center bg-black/30 ${className}`}>
      <Icon className="w-8 h-8 text-slate-600 mb-2" />
      <span className="text-xs text-slate-500">{emptyText || (type === 'video' ? 'Pas de vidéo' : 'Pas d\'image')}</span>
    </div>
  );
}
