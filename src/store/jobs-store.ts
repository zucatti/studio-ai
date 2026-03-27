import { create } from 'zustand';

export type JobType = 'image' | 'video' | 'audio' | 'look';
export type JobStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface GenerationJob {
  id: string;
  user_id: string;
  asset_id: string | null;
  asset_type: string | null;
  asset_name: string | null;
  job_type: JobType;
  job_subtype: string | null;
  status: JobStatus;
  progress: number;
  message: string | null;
  fal_request_id: string | null;
  fal_endpoint: string | null;
  input_data: Record<string, unknown>;
  result_data: Record<string, unknown> | null;
  error_message: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  created_at: string;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface CreateJobInput {
  asset_id?: string;
  asset_type?: string;
  asset_name?: string;
  job_type: JobType;
  job_subtype?: string;
  fal_endpoint: string;
  input_data: Record<string, unknown>;
  estimated_cost?: number;
}

interface JobsStore {
  // State
  jobs: GenerationJob[];
  isLoading: boolean;
  isPanelOpen: boolean;
  pollingInterval: NodeJS.Timeout | null;

  // Actions
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;

  // Data actions
  fetchJobs: () => Promise<void>;
  createJob: (input: CreateJobInput) => Promise<GenerationJob | null>;
  cancelJob: (jobId: string) => Promise<boolean>;
  refreshJob: (jobId: string) => Promise<void>;

  // Polling
  startPolling: () => void;
  stopPolling: () => void;

  // Computed
  activeJobsCount: () => number;
  getJobsByAsset: (assetId: string) => GenerationJob[];
  getJobsForShot: (shotId: string) => GenerationJob[];
}

export const useJobsStore = create<JobsStore>((set, get) => ({
  jobs: [],
  isLoading: false,
  isPanelOpen: false,
  pollingInterval: null,

  setPanelOpen: (open) => {
    set({ isPanelOpen: open });
    if (open) {
      get().fetchJobs();
      get().startPolling();
    } else {
      get().stopPolling();
    }
  },

  togglePanel: () => {
    const { isPanelOpen } = get();
    get().setPanelOpen(!isPanelOpen);
  },

  fetchJobs: async () => {
    try {
      set({ isLoading: true });
      const res = await fetch('/api/jobs?includeCompleted=true&limit=100');
      if (res.ok) {
        const data = await res.json();
        const newJobs = data.jobs || [];
        const { jobs: oldJobs } = get();

        // Check for jobs that just completed or failed
        for (const newJob of newJobs) {
          const oldJob = oldJobs.find((j) => j.id === newJob.id);
          const wasActive = oldJob && ['pending', 'queued', 'running'].includes(oldJob.status);

          if (wasActive && (newJob.status === 'completed' || newJob.status === 'failed')) {
            const shotId = (newJob.input_data as { shotId?: string })?.shotId;
            const shortId = (newJob.input_data as { shortId?: string })?.shortId;
            const assetId = newJob.asset_id || shotId || shortId;

            if (newJob.status === 'completed') {
              console.log(`[JobsStore] fetchJobs detected completion - asset_id: ${newJob.asset_id}, resolved assetId: ${assetId}`);

              if (assetId) {
                console.log(`[JobsStore] Dispatching job-completed from fetchJobs for ${newJob.asset_type} ${assetId}`);
                window.dispatchEvent(
                  new CustomEvent('job-completed', {
                    detail: {
                      jobId: newJob.id,
                      assetId,
                      shotId,
                      shortId,
                      assetType: newJob.asset_type,
                      jobType: newJob.job_type,
                      jobSubtype: newJob.job_subtype,
                    },
                  })
                );
              }
            } else if (newJob.status === 'failed') {
              console.log(`[JobsStore] fetchJobs detected failure - job: ${newJob.id}, error: ${newJob.error_message}`);
              window.dispatchEvent(
                new CustomEvent('job-failed', {
                  detail: {
                    jobId: newJob.id,
                    assetId,
                    shotId,
                    shortId,
                    assetType: newJob.asset_type,
                    jobType: newJob.job_type,
                    jobSubtype: newJob.job_subtype,
                    assetName: newJob.asset_name,
                    errorMessage: newJob.error_message || 'Erreur inconnue',
                  },
                })
              );
            }
          }
        }

        set({ jobs: newJobs });
      }
    } catch (error) {
      console.error('[JobsStore] Error fetching jobs:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  createJob: async (input) => {
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (res.ok) {
        const data = await res.json();
        const newJob = data.job as GenerationJob;

        // Add to local state
        set((state) => ({
          jobs: [newJob, ...state.jobs],
        }));

        // Start polling if not already
        get().startPolling();

        return newJob;
      } else {
        const error = await res.json();
        console.error('[JobsStore] Error creating job:', error);
        return null;
      }
    } catch (error) {
      console.error('[JobsStore] Error creating job:', error);
      return null;
    }
  },

  cancelJob: async (jobId) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        // Update local state
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === jobId
              ? { ...job, status: 'cancelled' as JobStatus, message: 'Annulé' }
              : job
          ),
        }));
        return true;
      }
      return false;
    } catch (error) {
      console.error('[JobsStore] Error cancelling job:', error);
      return false;
    }
  },

  refreshJob: async (jobId) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (res.ok) {
        const data = await res.json();
        const updatedJob = data.job as GenerationJob;

        // Check if job just completed
        const { jobs } = get();
        const oldJob = jobs.find((j) => j.id === jobId);
        const justCompleted =
          oldJob &&
          ['pending', 'queued', 'running'].includes(oldJob.status) &&
          updatedJob.status === 'completed';

        // Update in local state
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === jobId ? updatedJob : job
          ),
        }));

        // If job just completed, emit event for UI to refresh
        if (justCompleted) {
          // For shots, get shotId from input_data; for shorts, get shortId; for assets, use asset_id
          const shotId = (updatedJob.input_data as { shotId?: string })?.shotId;
          const shortId = (updatedJob.input_data as { shortId?: string })?.shortId;
          const assetId = updatedJob.asset_id || shotId || shortId;

          console.log(`[JobsStore] Job completed - asset_id: ${updatedJob.asset_id}, shotId: ${shotId}, shortId: ${shortId}, resolved assetId: ${assetId}`);

          if (assetId) {
            console.log(`[JobsStore] Dispatching job-completed for ${updatedJob.asset_type} ${assetId}, job_type: ${updatedJob.job_type}`);
            // Emit custom event for UI components to react
            window.dispatchEvent(
              new CustomEvent('job-completed', {
                detail: {
                  jobId: updatedJob.id,
                  assetId,
                  shotId, // Include shotId explicitly for shot handlers
                  shortId, // Include shortId explicitly for short/assembly handlers
                  assetType: updatedJob.asset_type,
                  jobType: updatedJob.job_type,
                  jobSubtype: updatedJob.job_subtype,
                },
              })
            );
          }
        }
      }
    } catch (error) {
      console.error('[JobsStore] Error refreshing job:', error);
    }
  },

  startPolling: () => {
    const { pollingInterval } = get();
    if (pollingInterval) {
      console.log('[JobsStore] Already polling, skipping');
      return;
    }

    console.log('[JobsStore] Starting polling...');
    let emptyPollCount = 0;
    const MAX_EMPTY_POLLS = 5; // Wait 5 polls before stopping (in case job hasn't appeared yet)

    const interval = setInterval(async () => {
      // First fetch fresh jobs to catch newly created ones
      await get().fetchJobs();

      const { jobs } = get();
      const activeJobs = jobs.filter((job) =>
        ['pending', 'queued', 'running'].includes(job.status)
      );

      console.log(`[JobsStore] Polling: ${activeJobs.length} active jobs`);

      if (activeJobs.length === 0) {
        emptyPollCount++;
        if (emptyPollCount >= MAX_EMPTY_POLLS) {
          // No active jobs for several polls, stop polling
          console.log('[JobsStore] No active jobs for a while, stopping polling');
          get().stopPolling();
          return;
        }
        console.log(`[JobsStore] No active jobs (${emptyPollCount}/${MAX_EMPTY_POLLS}), waiting...`);
        return;
      }

      // Reset counter when we find active jobs
      emptyPollCount = 0;

      // Refresh each active job
      for (const job of activeJobs) {
        console.log(`[JobsStore] Refreshing job ${job.id} (${job.status})`);
        await get().refreshJob(job.id);
      }
    }, 1000); // Poll every 1 second for faster updates

    set({ pollingInterval: interval });
  },

  stopPolling: () => {
    const { pollingInterval } = get();
    if (pollingInterval) {
      clearInterval(pollingInterval);
      set({ pollingInterval: null });
    }
  },

  activeJobsCount: () => {
    const { jobs } = get();
    return jobs.filter((job) =>
      ['pending', 'queued', 'running'].includes(job.status)
    ).length;
  },

  getJobsByAsset: (assetId) => {
    const { jobs } = get();
    return jobs.filter((job) => job.asset_id === assetId);
  },

  getJobsForShot: (shotId: string) => {
    const { jobs } = get();
    return jobs.filter(
      (job) =>
        job.asset_type === 'shot' &&
        (job.input_data as { shotId?: string })?.shotId === shotId
    );
  },
}));

// Auto-fetch jobs on store initialization
if (typeof window !== 'undefined') {
  // Fetch initial jobs when the app loads
  setTimeout(async () => {
    await useJobsStore.getState().fetchJobs();

    // Re-get state after fetch to see updated jobs
    const { jobs, startPolling } = useJobsStore.getState();
    const activeJobs = jobs.filter((job) =>
      ['pending', 'queued', 'running'].includes(job.status)
    );
    if (activeJobs.length > 0) {
      console.log(`[JobsStore] Found ${activeJobs.length} active jobs, starting polling`);
      startPolling();
    }
  }, 1000);
}
