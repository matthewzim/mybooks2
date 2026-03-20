/**
 * Authentication Service
 *
 * Handles anonymous authentication with Supabase:
 * - Anonymous sign-in (auto-creates a user on first launch)
 * - Session management
 * - User profile management
 *
 * Usage:
 * import { authService } from '@/services/auth';
 * const { data, error } = await authService.signInAnonymously();
 */

import { supabase, TABLES, handleSupabaseError, isSupabaseConfigured } from './supabase';
import type {
  User,
  ApiResponse,
  UpdateUserInput,
} from '@/types';
import type { Session, AuthError } from '@supabase/supabase-js';

/**
 * Authentication Service Class
 * Provides methods for anonymous authentication and profile management
 */
class AuthService {
  /**
   * Check if Supabase is properly configured
   * Returns an error response if not configured
   */
  private checkConfiguration<T>(): ApiResponse<T> | null {
    if (!isSupabaseConfigured) {
      return {
        data: null,
        error: {
          message: 'Supabase is not configured. Please add your credentials to the .env file.',
          code: 'SUPABASE_NOT_CONFIGURED',
        },
      };
    }
    return null;
  }

  /**
   * Sign in anonymously
   *
   * Flow:
   * 1. Call Supabase anonymous sign-in (creates an anonymous auth user)
   * 2. Upsert a user profile in the users table
   * 3. Return session and user data
   *
   * @returns User data and session, or error
   */
  async signInAnonymously(): Promise<ApiResponse<{ user: User; session: Session }>> {
    const configError = this.checkConfiguration<{ user: User; session: Session }>();
    if (configError) return configError;

    try {
      const { data: authData, error: authError } = await supabase.auth.signInAnonymously();

      if (authError) throw authError;
      if (!authData.user) throw new Error('Anonymous sign-in failed');

      // Upsert the user profile in the users table
      const { data: profile, error: profileError } = await supabase
        .from(TABLES.USERS)
        .upsert(
          {
            id: authData.user.id,
            name: null,
          },
          { onConflict: 'id' }
        )
        .select()
        .single();

      if (profileError) {
        console.error('Profile upsert failed:', profileError);
      }

      return {
        data: {
          user: profile as User,
          session: authData.session as Session,
        },
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: {
          message: handleSupabaseError(error),
          code: (error as AuthError)?.code,
        },
      };
    }
  }

  /**
   * Sign out the current user
   * Clears local session and invalidates refresh token
   */
  async signOut(): Promise<ApiResponse<null>> {
    if (!isSupabaseConfigured) {
      return { data: null, error: null };
    }

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      return { data: null, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Get the current session
   * Returns null if no active session or if Supabase is not configured
   */
  async getSession(): Promise<ApiResponse<Session | null>> {
    if (!isSupabaseConfigured) {
      return { data: null, error: null };
    }

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      return { data: data.session, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Get the current user's profile
   * Fetches from the users table, not just auth
   */
  async getCurrentUser(): Promise<ApiResponse<User | null>> {
    if (!isSupabaseConfigured) {
      return { data: null, error: null };
    }

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) {
        return { data: null, error: null };
      }

      const { data: profile, error } = await supabase
        .from(TABLES.USERS)
        .select('*')
        .eq('id', session.session.user.id)
        .single();

      if (error) throw error;

      return { data: profile as User, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Update the current user's profile
   *
   * @param updates - Fields to update (name, avatar_url, etc.)
   */
  async updateProfile(updates: UpdateUserInput): Promise<ApiResponse<User>> {
    const configError = this.checkConfiguration<User>();
    if (configError) return configError;

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) {
        throw new Error('Not authenticated');
      }

      const { data, error } = await supabase
        .from(TABLES.USERS)
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.session.user.id)
        .select()
        .single();

      if (error) throw error;

      return { data: data as User, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Subscribe to auth state changes
   * Useful for keeping UI in sync with auth state
   *
   * @param callback - Function to call when auth state changes
   * @returns Unsubscribe function
   */
  onAuthStateChange(
    callback: (event: string, session: Session | null) => void
  ) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session as Session | null);
    });

    return data.subscription.unsubscribe;
  }
}

// Export a singleton instance
export const authService = new AuthService();

export default authService;
