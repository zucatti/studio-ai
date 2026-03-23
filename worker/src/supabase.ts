/**
 * Supabase Client for Worker
 * Uses service role key for full access
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabaseConfig } from './config.js';

let supabaseClient: SupabaseClient | null = null;

/**
 * Get the Supabase client with service role access
 * Singleton pattern for connection reuse
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    if (!supabaseConfig.url || !supabaseConfig.serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }

    supabaseClient = createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log('[Supabase] Client initialized with service role');
  }

  return supabaseClient;
}
