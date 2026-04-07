/**
 * Snapshot Scheduler
 *
 * Automatically takes provider balance snapshots:
 * - Every 30 minutes: periodic snapshot
 * - At midnight: daily_start snapshot
 */

import { createClient } from '@supabase/supabase-js';

const SNAPSHOT_INTERVAL = 30 * 60 * 1000; // 30 minutes
const DAILY_CHECK_INTERVAL = 60 * 1000; // Check every minute for midnight

// Track if we've taken the daily snapshot today
let lastDailySnapshotDate: string | null = null;

// Get the API base URL
function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3001';
}

// Get service key for internal API calls
function getServiceKey(): string {
  return process.env.INTERNAL_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

// Get all user IDs that should have snapshots taken
async function getUserIds(): Promise<string[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[Snapshot] Missing Supabase credentials, cannot fetch users');
    return [];
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get distinct user IDs from credit_allocations (users who care about spending)
  const { data, error } = await supabase
    .from('credit_allocations')
    .select('user_id')
    .limit(100);

  if (error) {
    console.error('[Snapshot] Failed to fetch users:', error);
    return [];
  }

  // Dedupe user IDs
  const userIds = [...new Set(data?.map((d) => d.user_id) || [])];
  return userIds;
}

// Take snapshot for a user
async function takeSnapshot(userId: string, type: 'periodic' | 'daily_start'): Promise<boolean> {
  const apiUrl = getApiBaseUrl();
  const serviceKey = getServiceKey();

  if (!serviceKey) {
    console.warn('[Snapshot] No service key configured');
    return false;
  }

  try {
    const res = await fetch(`${apiUrl}/api/internal/take-snapshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ userId, type }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`[Snapshot] Failed for user ${userId}:`, error);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`[Snapshot] Error for user ${userId}:`, error);
    return false;
  }
}

// Take snapshots for all users
async function takeSnapshotsForAllUsers(type: 'periodic' | 'daily_start'): Promise<void> {
  const userIds = await getUserIds();

  if (userIds.length === 0) {
    console.log('[Snapshot] No users to snapshot');
    return;
  }

  console.log(`[Snapshot] Taking ${type} snapshots for ${userIds.length} user(s)...`);

  let successCount = 0;
  for (const userId of userIds) {
    const success = await takeSnapshot(userId, type);
    if (success) successCount++;
  }

  console.log(`[Snapshot] Completed: ${successCount}/${userIds.length} successful`);
}

// Check if we need to take daily snapshot
function checkDailySnapshot(): void {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const hour = now.getHours();
  const minute = now.getMinutes();

  // Take daily snapshot between 00:00 and 00:05
  if (hour === 0 && minute < 5 && lastDailySnapshotDate !== today) {
    console.log('[Snapshot] Midnight detected, taking daily_start snapshots...');
    lastDailySnapshotDate = today;
    takeSnapshotsForAllUsers('daily_start').catch(console.error);
  }
}

// Periodic snapshot timer
function startPeriodicSnapshots(): void {
  console.log(`[Snapshot] Starting periodic snapshots every ${SNAPSHOT_INTERVAL / 60000} minutes`);

  // Take initial snapshot after 5 seconds (let worker stabilize)
  setTimeout(() => {
    console.log('[Snapshot] Taking initial periodic snapshot...');
    takeSnapshotsForAllUsers('periodic').catch(console.error);
  }, 5000);

  // Then every 30 minutes
  setInterval(() => {
    takeSnapshotsForAllUsers('periodic').catch(console.error);
  }, SNAPSHOT_INTERVAL);
}

// Daily snapshot checker
function startDailySnapshotChecker(): void {
  console.log('[Snapshot] Starting daily snapshot checker');

  // Check every minute if it's midnight
  setInterval(checkDailySnapshot, DAILY_CHECK_INTERVAL);

  // Also check immediately in case worker starts at midnight
  checkDailySnapshot();
}

/**
 * Start the snapshot scheduler
 */
export function startSnapshotScheduler(): void {
  console.log('[Snapshot] Initializing snapshot scheduler...');

  // Check if we have the required env vars
  const apiUrl = getApiBaseUrl();
  const serviceKey = getServiceKey();

  if (!serviceKey) {
    console.warn('[Snapshot] INTERNAL_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY not set, scheduler disabled');
    return;
  }

  console.log(`[Snapshot] API URL: ${apiUrl}`);
  console.log('[Snapshot] Service key: configured');

  startPeriodicSnapshots();
  startDailySnapshotChecker();

  console.log('[Snapshot] Scheduler started');
}
