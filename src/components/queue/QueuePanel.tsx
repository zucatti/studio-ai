'use client';

import { useEffect } from 'react';
import { X, Loader2, CheckCircle, XCircle, Clock, Trash2, Image, Video, Mic, Shirt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useJobsStore, type GenerationJob, type JobStatus } from '@/store/jobs-store';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

const STATUS_CONFIG: Record<JobStatus, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  pending: { icon: Clock, color: 'text-slate-400', label: 'En attente' },
  queued: { icon: Clock, color: 'text-yellow-400', label: 'En file' },
  running: { icon: Loader2, color: 'text-blue-400', label: 'En cours' },
  completed: { icon: CheckCircle, color: 'text-green-400', label: 'Terminé' },
  failed: { icon: XCircle, color: 'text-red-400', label: 'Échec' },
  cancelled: { icon: XCircle, color: 'text-slate-500', label: 'Annulé' },
};

const JOB_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  image: Image,
  video: Video,
  audio: Mic,
  look: Shirt,
};

function JobCard({ job, onCancel }: { job: GenerationJob; onCancel: () => void }) {
  const statusConfig = STATUS_CONFIG[job.status];
  const StatusIcon = statusConfig.icon;
  const TypeIcon = JOB_TYPE_ICONS[job.job_type] || Image;
  const isActive = ['pending', 'queued', 'running'].includes(job.status);
  const isRunning = job.status === 'running';

  return (
    <div
      className={cn(
        'p-3 rounded-lg border transition-all',
        isActive
          ? 'bg-white/5 border-white/10'
          : job.status === 'completed'
          ? 'bg-green-500/5 border-green-500/20'
          : job.status === 'failed'
          ? 'bg-red-500/5 border-red-500/20'
          : 'bg-white/[0.02] border-white/5'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={cn('p-1.5 rounded-md bg-white/5', statusConfig.color)}>
            <TypeIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">
              {job.asset_name || 'Génération'}
            </p>
            <p className="text-xs text-slate-500 truncate">
              {job.job_subtype && <span className="capitalize">{job.job_subtype}</span>}
              {job.job_subtype && ' · '}
              {formatDistanceToNow(new Date(job.created_at), { addSuffix: true, locale: fr })}
            </p>
          </div>
        </div>

        {isActive && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-red-400 hover:bg-red-500/10 flex-shrink-0"
            onClick={onCancel}
            title="Annuler"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Progress bar for active jobs */}
      {isActive && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className={cn('flex items-center gap-1', statusConfig.color)}>
              <StatusIcon className={cn('w-3 h-3', isRunning && 'animate-spin')} />
              {job.message || statusConfig.label}
            </span>
            {job.progress > 0 && (
              <span className="text-slate-400">{job.progress}%</span>
            )}
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                isRunning ? 'bg-blue-500' : 'bg-yellow-500'
              )}
              style={{ width: `${Math.max(job.progress, isRunning ? 10 : 5)}%` }}
            />
          </div>
        </div>
      )}

      {/* Status for completed/failed jobs */}
      {!isActive && (
        <div className="mt-2 flex items-center gap-1.5">
          <StatusIcon className={cn('w-3.5 h-3.5', statusConfig.color)} />
          <span className={cn('text-xs', statusConfig.color)}>
            {job.status === 'failed' && job.error_message
              ? job.error_message.slice(0, 50)
              : statusConfig.label}
          </span>
        </div>
      )}

      {/* Cost if available */}
      {job.estimated_cost && (
        <div className="mt-2 text-xs text-slate-500">
          Coût estimé: ${job.estimated_cost.toFixed(3)}
        </div>
      )}
    </div>
  );
}

export function QueuePanel() {
  const { jobs, isPanelOpen, setPanelOpen, cancelJob, startPolling, activeJobsCount } = useJobsStore();

  // Start polling when panel opens
  useEffect(() => {
    if (isPanelOpen) {
      startPolling();
    }
  }, [isPanelOpen, startPolling]);

  // Separate active and completed jobs
  const activeJobs = jobs.filter((job) => ['pending', 'queued', 'running'].includes(job.status));
  const recentJobs = jobs
    .filter((job) => ['completed', 'failed', 'cancelled'].includes(job.status))
    .slice(0, 10);

  if (!isPanelOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={() => setPanelOpen(false)}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-96 bg-[#0d1520] border-l border-white/10 z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-white">File d'attente</h2>
            {activeJobsCount() > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-blue-500/20 text-blue-400 rounded-full">
                {activeJobsCount()} en cours
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-white"
            onClick={() => setPanelOpen(false)}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-6">
          {/* Active Jobs */}
          {activeJobs.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                En cours ({activeJobs.length})
              </h3>
              <div className="space-y-2">
                {activeJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onCancel={() => cancelJob(job.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Recent Jobs */}
          {recentJobs.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Récents
              </h3>
              <div className="space-y-2">
                {recentJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onCancel={() => {}}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {jobs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-4 rounded-full bg-white/5 mb-4">
                <Clock className="w-8 h-8 text-slate-500" />
              </div>
              <p className="text-sm text-slate-400">Aucun job en cours</p>
              <p className="text-xs text-slate-500 mt-1">
                Les générations apparaîtront ici
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Badge to show in header/nav
 */
export function QueueBadge() {
  const { activeJobsCount, togglePanel, fetchJobs } = useJobsStore();
  const count = activeJobsCount();

  // Fetch jobs on mount
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        'relative gap-2',
        count > 0
          ? 'text-blue-400 hover:text-blue-300'
          : 'text-slate-400 hover:text-white'
      )}
      onClick={togglePanel}
    >
      <Clock className="w-4 h-4" />
      <span className="hidden sm:inline">File</span>
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-blue-500 text-white rounded-full px-1">
          {count}
        </span>
      )}
    </Button>
  );
}
