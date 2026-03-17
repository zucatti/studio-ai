/**
 * User Access Control
 *
 * Checks if the authenticated user is allowed to access the application.
 * Users must have `active = true` in the users table.
 */

import { createServerSupabaseClient } from '@/lib/supabase';
import { auth0 } from '@/lib/auth0';

export interface UserRecord {
  id: string;
  auth0_id: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserAccessResult {
  isAuthorized: boolean;
  user: UserRecord | null;
  error?: string;
}

/**
 * Check if the current user is authorized to access the app.
 *
 * This function:
 * 1. Gets the Auth0 session
 * 2. Looks up or creates the user in our database
 * 3. Checks if user.active is true
 *
 * @returns UserAccessResult with authorization status
 */
export async function checkUserAccess(): Promise<UserAccessResult> {
  try {
    const session = await auth0.getSession();

    if (!session?.user) {
      return {
        isAuthorized: false,
        user: null,
        error: 'not_authenticated',
      };
    }

    const auth0Id = session.user.sub;
    const supabase = createServerSupabaseClient();

    // Try to find existing user
    let { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth0_id', auth0Id)
      .single();

    // Handle table not existing (42P01) or other relation errors
    if (error && (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist'))) {
      console.warn('[checkUserAccess] Users table does not exist yet, allowing access');
      return {
        isAuthorized: true,
        user: null,
        error: 'table_not_exists',
      };
    }

    if (error && error.code === 'PGRST116') {
      // User doesn't exist, create them (inactive by default)
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          auth0_id: auth0Id,
          email: session.user.email || null,
          name: session.user.name || null,
          picture: session.user.picture || null,
          active: false, // New users are inactive by default
        })
        .select()
        .single();

      if (insertError) {
        console.error('[checkUserAccess] Failed to create user:', insertError.message, insertError.code);
        // If insert fails due to table not existing, allow access
        if (insertError.code === '42P01' || insertError.message?.includes('relation')) {
          console.warn('[checkUserAccess] Users table does not exist, allowing access');
          return {
            isAuthorized: true,
            user: null,
          };
        }
        return {
          isAuthorized: false,
          user: null,
          error: 'database_error',
        };
      }

      user = newUser;
    } else if (error) {
      console.error('[checkUserAccess] Database error:', error.message, error.code, error.details);
      // On any database error, allow access (fail open for now)
      // This prevents blocking users if there's a DB issue
      return {
        isAuthorized: true,
        user: null,
        error: 'database_error',
      };
    }

    // Update user info if changed
    if (user && (
      user.email !== session.user.email ||
      user.name !== session.user.name ||
      user.picture !== session.user.picture
    )) {
      await supabase
        .from('users')
        .update({
          email: session.user.email || null,
          name: session.user.name || null,
          picture: session.user.picture || null,
        })
        .eq('auth0_id', auth0Id);
    }

    return {
      isAuthorized: user?.active === true,
      user: user as UserRecord,
    };
  } catch (error) {
    console.error('[checkUserAccess] Error:', error);
    // Fail open - don't block users on unexpected errors
    return {
      isAuthorized: true,
      user: null,
      error: 'unknown_error',
    };
  }
}

/**
 * Get user record without checking access.
 * Useful for displaying user info.
 */
export async function getUserRecord(): Promise<UserRecord | null> {
  try {
    const session = await auth0.getSession();

    if (!session?.user) {
      return null;
    }

    const supabase = createServerSupabaseClient();
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('auth0_id', session.user.sub)
      .single();

    return user as UserRecord | null;
  } catch {
    return null;
  }
}
