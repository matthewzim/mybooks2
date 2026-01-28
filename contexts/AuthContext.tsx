/**
 * Authentication Context
 *
 * Provides authentication state and methods throughout the app.
 * Handles session persistence, auth state changes, and user profile management.
 *
 * Usage:
 * import { useAuth } from '@/contexts/AuthContext';
 *
 * function MyComponent() {
 *   const { user, isAuthenticated, signIn, signOut } = useAuth();
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
  LoginCredentials,
  RegisterCredentials,
  UpdateUserInput,
  ApiResponse,
} from '@/types';

/**
 * Auth context type definition
 */
interface AuthContextType extends AuthState {
  // Configuration status
  isConfigured: boolean;
  // Auth methods
  signIn: (credentials: LoginCredentials) => Promise<ApiResponse<{ user: User }>>;
  signUp: (credentials: RegisterCredentials) => Promise<ApiResponse<{ user: User }>>;
  signOut: () => Promise<void>;
  // Profile methods
  updateProfile: (updates: UpdateUserInput) => Promise<ApiResponse<User>>;
  refreshUser: () => Promise<void>;
  // Password methods
  resetPassword: (email: string) => Promise<ApiResponse<null>>;
}

// Create context with undefined default
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Auth Provider Component
 *
 * Wraps the app to provide authentication state and methods.
 * Automatically handles session restoration on app start.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<AuthState['session']>(null);

  /**
   * Initialize auth state on mount
   * Check for existing session and restore user data
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
          } else if (event === 'SIGNED_OUT') {
            // User signed out - clear state
            setUser(null);
            setSession(null);
          } else if (event === 'TOKEN_REFRESHED' && newSession) {
            // Token refreshed - update session
            setSession(newSession as AuthState['session']);
          } else if (event === 'INITIAL_SESSION') {
            // Initial session from storage - handled by initializeAuth
            // No additional action needed here
          }
        } catch (error) {
          console.error('Error handling auth state change:', error);
          // Clear auth state on error to prevent stuck loading states
          setUser(null);
          setSession(null);
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
   * Checks for existing session on app start
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
      }
    } catch (error) {
      console.error('Failed to initialize auth:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Sign in with email and password
   */
  const signIn = useCallback(
    async (
      credentials: LoginCredentials
    ): Promise<ApiResponse<{ user: User }>> => {
      setIsLoading(true);

      try {
        const result = await authService.signIn(credentials);

        if (result.data) {
          setUser(result.data.user);
          setSession(result.data.session as AuthState['session']);
          return { data: { user: result.data.user }, error: null };
        }

        return { data: null, error: result.error };
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  /**
   * Sign up with email, password, and name
   */
  const signUp = useCallback(
    async (
      credentials: RegisterCredentials
    ): Promise<ApiResponse<{ user: User }>> => {
      setIsLoading(true);

      try {
        const result = await authService.signUp(credentials);

        if (result.data) {
          setUser(result.data.user);
          setSession(result.data.session as AuthState['session']);
          return { data: { user: result.data.user }, error: null };
        }

        return { data: null, error: result.error };
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  /**
   * Sign out the current user
   */
  const signOut = useCallback(async () => {
    setIsLoading(true);

    try {
      await authService.signOut();
      setUser(null);
      setSession(null);
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
   * Send password reset email
   */
  const resetPassword = useCallback(
    async (email: string): Promise<ApiResponse<null>> => {
      return authService.resetPassword(email);
    },
    []
  );

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo<AuthContextType>(
    () => ({
      user,
      session,
      isLoading,
      isAuthenticated: !!user && !!session,
      isConfigured: isSupabaseConfigured,
      signIn,
      signUp,
      signOut,
      updateProfile,
      refreshUser,
      resetPassword,
    }),
    [
      user,
      session,
      isLoading,
      signIn,
      signUp,
      signOut,
      updateProfile,
      refreshUser,
      resetPassword,
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
