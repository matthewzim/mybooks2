/**
 * Authentication Context
 *
 * Provides authentication state and methods throughout the app.
 * Handles anonymous session creation, persistence, and user profile management.
 *
 * Usage:
 * import { useAuth } from '@/contexts/AuthContext';
 *
 * function MyComponent() {
 *   const { user, isAuthenticated } = useAuth();
 *   // ...
 * }
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { authService } from '@/services/auth';
import { isSupabaseConfigured } from '@/services/supabase';
import type {
  User,
  AuthState,
  UpdateUserInput,
  ApiResponse,
} from '@/types';

/**
 * Auth context type definition
 */
interface AuthContextType extends AuthState {
  // Configuration status
  isConfigured: boolean;
  // Profile methods
  updateProfile: (updates: UpdateUserInput) => Promise<ApiResponse<User>>;
  refreshUser: () => Promise<void>;
  restartAnonymousSession: () => Promise<ApiResponse<User>>;
}

// Create context with undefined default
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Auth Provider Component
 *
 * Wraps the app to provide authentication state and methods.
 * Automatically signs in anonymously on first launch and
 * restores the session on subsequent launches.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<AuthState['session']>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  /**
   * Initialize auth state on mount
   * Check for existing session or create anonymous one
   */
  useEffect(() => {
    // Skip auth initialization if Supabase is not configured
    if (!isSupabaseConfigured) {
      console.warn('Supabase is not configured. Skipping auth initialization.');
      setIsLoading(false);
      return;
    }

    initializeAuth();

    // Subscribe to auth state changes
    const unsubscribe = authService.onAuthStateChange(
      async (event, newSession) => {
        console.log('Auth state changed:', event);

        try {
          if (event === 'SIGNED_IN' && newSession) {
            // User signed in - fetch profile
            const { data: profile } = await authService.getCurrentUser();
            setUser(profile);
            setSession(newSession as AuthState['session']);
            setAuthError(null);
          } else if (event === 'SIGNED_OUT') {
            // User signed out - clear state
            setUser(null);
            setSession(null);
            setAuthError(null);
          } else if (event === 'TOKEN_REFRESHED' && newSession) {
            // Token refreshed - update session
            setSession(newSession as AuthState['session']);
          } else if (event === 'INITIAL_SESSION') {
            // Initial session from storage - handled by initializeAuth
          }
        } catch (error) {
          console.error('Error handling auth state change:', error);
          setUser(null);
          setSession(null);
          setAuthError('Authentication state sync failed.');
        }
      }
    );

    // Cleanup subscription on unmount
    return () => {
      unsubscribe();
    };
  }, []);

  /**
   * Initialize authentication state
   * Restores existing session or creates an anonymous one
   */
  const initializeAuth = async () => {
    try {
      setIsLoading(true);

      // Check for existing session
      const { data: existingSession } = await authService.getSession();

      if (existingSession) {
        // Session exists - fetch user profile
        const { data: profile } = await authService.getCurrentUser();
        setUser(profile);
        setSession(existingSession as AuthState['session']);
        setAuthError(null);
      } else {
        // No session - sign in anonymously
        const { data, error } = await authService.signInAnonymously();
        if (error) {
          console.error('Anonymous sign-in failed:', error.message);
          setAuthError(error.message);
        } else if (data) {
          setUser(data.user);
          setSession(data.session as AuthState['session']);
          setAuthError(null);
        }
      }
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      setAuthError(error instanceof Error ? error.message : 'Failed to initialize auth.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Update user profile
   */
  const updateProfile = useCallback(
    async (updates: UpdateUserInput): Promise<ApiResponse<User>> => {
      const result = await authService.updateProfile(updates);

      if (result.data) {
        setUser(result.data);
      }

      return result;
    },
    []
  );

  /**
   * Refresh user data from server
   */
  const refreshUser = useCallback(async () => {
    const { data: profile } = await authService.getCurrentUser();
    if (profile) {
      setUser(profile);
    }
  }, []);

  /**
   * Discard the current session and create a fresh anonymous user/session.
   * Used after destructive account actions such as reset data or account deletion.
   */
  const restartAnonymousSession = useCallback(async (): Promise<ApiResponse<User>> => {
    setIsLoading(true);

    try {
      setUser(null);
      setSession(null);
      setAuthError(null);

      const signOutResult = await authService.signOut();
      if (signOutResult.error) {
        console.warn('Failed to sign out before restarting anonymous session:', signOutResult.error.message);
      }

      const result = await authService.signInAnonymously();

      if (result.error || !result.data) {
        return {
          data: null,
          error: result.error ?? { message: 'Failed to create a new anonymous session.' },
        };
      }

      setUser(result.data.user);
      setSession(result.data.session as AuthState['session']);
      setAuthError(null);

      return { data: result.data.user, error: null };
    } catch (error) {
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : 'Failed to restart anonymous session.',
        },
      };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo<AuthContextType>(
    () => ({
      user,
      session,
      isLoading,
      isAuthenticated: !!user && !!session,
      authError,
      isConfigured: isSupabaseConfigured,
      updateProfile,
      refreshUser,
      restartAnonymousSession,
    }),
    [
      user,
      session,
      isLoading,
      authError,
      updateProfile,
      refreshUser,
      restartAnonymousSession,
    ]
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

/**
 * Custom hook to use auth context
 * Throws error if used outside AuthProvider
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

export default AuthContext;
