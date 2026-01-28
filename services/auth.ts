/**
 * Authentication Service
 *
 * Handles all authentication operations with Supabase:
 * - Email/password sign up and sign in
 * - Session management
 * - Password reset
 * - User profile management
 *
 * Usage:
 * import { authService } from '@/services/auth';
 * const { data, error } = await authService.signIn(email, password);
 */

import { supabase, TABLES, handleSupabaseError, isSupabaseConfigured } from './supabase';
import type {
  User,
  LoginCredentials,
  RegisterCredentials,
  ApiResponse,
  UpdateUserInput,
} from '@/types';
import type { Session, AuthError } from '@supabase/supabase-js';

/**
 * Authentication Service Class
 * Provides methods for user authentication and profile management
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
   * Sign up a new user with email and password
   *
   * Flow:
   * 1. Create auth user in Supabase Auth
   * 2. Insert user profile in users table (via database trigger or manually)
   * 3. Return session and user data
   *
   * @param credentials - Email, password, and name
   * @returns User data and session, or error
   */
  async signUp(
    credentials: RegisterCredentials
  ): Promise<ApiResponse<{ user: User; session: Session }>> {
    const configError = this.checkConfiguration<{ user: User; session: Session }>();
    if (configError) return configError;

    try {
      // Create the auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: credentials.email,
        password: credentials.password,
        options: {
          data: {
            name: credentials.name,
          },
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('User creation failed');

      // Create the user profile in the users table
      // Note: You could also use a Supabase trigger to auto-create profiles
      const { data: profile, error: profileError } = await supabase
        .from(TABLES.USERS)
        .insert({
          id: authData.user.id,
          email: credentials.email,
          name: credentials.name,
        })
        .select()
        .single();

      if (profileError) {
        // If profile creation fails, the user still exists in auth
        // You may want to handle this case differently
        console.error('Profile creation failed:', profileError);
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
   * Sign in an existing user with email and password
   *
   * @param credentials - Email and password
   * @returns User profile and session
   */
  async signIn(
    credentials: LoginCredentials
  ): Promise<ApiResponse<{ user: User; session: Session }>> {
    const configError = this.checkConfiguration<{ user: User; session: Session }>();
    if (configError) return configError;

    try {
      // Authenticate the user
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        });

      if (authError) throw authError;
      if (!authData.user || !authData.session) {
        throw new Error('Sign in failed');
      }

      // Fetch the user's profile
      const { data: profile, error: profileError } = await supabase
        .from(TABLES.USERS)
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (profileError) throw profileError;

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
    // If not configured, just return success (nothing to sign out from)
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
    // Return null session if not configured (don't throw error)
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
    // Return null user if not configured (don't throw error)
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
   * Send a password reset email
   *
   * @param email - User's email address
   */
  async resetPassword(email: string): Promise<ApiResponse<null>> {
    const configError = this.checkConfiguration<null>();
    if (configError) return configError;

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'virtuallibrary://reset-password',
      });

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
   * Update the user's password
   * User must be authenticated
   *
   * @param newPassword - New password
   */
  async updatePassword(newPassword: string): Promise<ApiResponse<null>> {
    const configError = this.checkConfiguration<null>();
    if (configError) return configError;

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

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
