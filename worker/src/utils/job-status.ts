/**
 * Job Status Utilities
 * Update job status in Supabase
 */

import { getSupabase } from '../supabase.js';

export type JobStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Update job progress
 */
export async function updateJobProgress(
  jobId: string,
  progress: number,
  message: string
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('generation_jobs')
    .update({
      progress: Math.round(Math.min(Math.max(progress, 0), 100)),
      message,
    })
    .eq('id', jobId);

  if (error) {
    console.error(`[Job ${jobId}] Failed to update progress:`, error);
  }
}

/**
 * Mark job as running
 */
export async function startJob(jobId: string, message = 'Processing...'): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('generation_jobs')
    .update({
      status: 'running' as JobStatus,
      progress: 0,
      message,
      started_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  if (error) {
    console.error(`[Job ${jobId}] Failed to start:`, error);
  }
}

/**
 * Mark job as completed
 */
export async function completeJob(
  jobId: string,
  resultData: Record<string, unknown>,
  actualCost?: number
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('generation_jobs')
    .update({
      status: 'completed' as JobStatus,
      progress: 100,
      message: 'Terminé',
      result_data: resultData,
      actual_cost: actualCost,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  if (error) {
    console.error(`[Job ${jobId}] Failed to complete:`, error);
  }
}

/**
 * Mark job as failed
 */
export async function failJob(jobId: string, errorMessage: string): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('generation_jobs')
    .update({
      status: 'failed' as JobStatus,
      message: 'Échec',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  if (error) {
    console.error(`[Job ${jobId}] Failed to mark as failed:`, error);
  }
}

/**
 * Get job by ID
 */
export async function getJob(jobId: string): Promise<Record<string, unknown> | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('generation_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) {
    console.error(`[Job ${jobId}] Failed to get:`, error);
    return null;
  }

  return data;
}
