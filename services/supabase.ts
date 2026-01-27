/**
 * Supabase Client Configuration
 *
 * This file initializes the Supabase client with environment variables.
 * The client is used throughout the app for database, auth, and storage operations.
 *
 * Setup Instructions:
 * 1. Create a Supabase project at https://supabase.com
 * 2. Copy your project URL and anon key from Project Settings > API
 * 3. Create a .env file with EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
 */

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

// Get environment variables
// In production, these would come from your .env file
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase credentials not found. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your environment.'
  );
}

/**
 * Supabase client instance
 *
 * Configuration:
 * - Uses AsyncStorage for session persistence on mobile
 * - Auto-refreshes tokens
 * - Detects session from URL (useful for OAuth flows)
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      // Use AsyncStorage for persisting auth state on mobile
      storage: AsyncStorage,
      // Automatically refresh the session
      autoRefreshToken: true,
      // Persist session across app restarts
      persistSession: true,
      // Detect session from URL (for OAuth callbacks)
      detectSessionInUrl: false,
    },
  }
);

/**
 * Storage bucket names
 * These should match the buckets created in your Supabase project
 */
export const STORAGE_BUCKETS = {
  BOOK_SPINES: 'book-spines',
  AVATARS: 'avatars',
} as const;

/**
 * Table names for type-safe queries
 */
export const TABLES = {
  USERS: 'users',
  BOOKSHELVES: 'bookshelves',
  BOOKS: 'books',
  SUBSCRIPTIONS: 'subscriptions',
} as const;

/**
 * Helper function to handle Supabase errors consistently
 */
export function handleSupabaseError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'An unexpected error occurred';
}

export default supabase;
