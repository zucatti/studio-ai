import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Use runtime env vars (SUPABASE_*) for server-side, fallback to build-time (NEXT_PUBLIC_*) for client
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client-side Supabase client (untyped for flexibility)
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// Server-side Supabase client with service role (for API routes)
// Service role key should bypass RLS automatically
export function createServerSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(url, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: 'public',
    },
  });
}

// Re-export types for convenience
export type { Database } from '@/types/database';
