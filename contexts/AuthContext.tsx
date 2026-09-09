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
  useRef,
} from 'react';
import { authService } from '@/services/auth';
import { AppState } from 'react-native';
import { supabase, isSupabaseConfigured } from '@/services/supabase';
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
  retryAuth: () => Promise<void>;
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

  const authGeneration = useRef(0);

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

    let mounted = true;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const unsubscribe = authService.onAuthStateChange((event, newSession) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        authGeneration.current += 1;
        setUser(null);
        setSession(null);
      } else if (newSession) {
        setSession(newSession as AuthState['session']);
        if (event === 'SIGNED_IN') {
          const generation = ++authGeneration.current;
          // Supabase callbacks run under the auth lock. Query after it releases.
          const timer = setTimeout(() => {
            timers.delete(timer);
            void authService.getCurrentUser().then(({ data, error }) => {
              if (!mounted || generation !== authGeneration.current) return;
              setUser(data);
              setAuthError(error?.message ?? null);
            });
          }, 0);
          timers.add(timer);
        }
      }
    });
    void initializeAuth();
    const refresh = (state: string) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    };
    refresh(AppState.currentState);
    const appState = AppState.addEventListener('change', refresh);
    return () => {
      mounted = false;
      authGeneration.current += 1;
      timers.forEach(clearTimeout);
      unsubscribe();
      appState.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  /**
   * Initialize authentication state
   * Restores existing session or creates an anonymous one
   */
  const initializeAuth = useCallback(async () => {
    try {
      setIsLoading(true);

      // Check for existing session
      const { data: existingSession, error: sessionError } = await authService.getSession();
      if (sessionError) throw new Error(sessionError.message);

      if (existingSession) {
        // Session exists - fetch user profile
        const { data: profile, error } = await authService.getCurrentUser();
        if (error) throw new Error(error.message);
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
  }, []);

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
      retryAuth: initializeAuth,
      restartAnonymousSession,
    }),
    [
      user,
      session,
      isLoading,
      authError,
      updateProfile,
      refreshUser,
      initializeAuth,
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
