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

// Track if Supabase is properly configured
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== 'https://your-project-id.supabase.co' &&
  supabaseAnonKey !== 'your-supabase-anon-key'
);

// Validate environment variables
if (!isSupabaseConfigured) {
  console.warn(
    'Supabase credentials not found or using placeholder values. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file.'
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
  BOOK_COVERS: 'book-covers',
  AVATARS: 'avatars',
} as const;

/**
 * Table names for type-safe queries
 */
export const TABLES = {
  USERS: 'users',
  BOOKSHELVES: 'bookshelves',
  BOOKS: 'books',
  BOOKSHELF_ITEMS: 'bookshelf_items',
  SUBSCRIPTIONS: 'subscriptions',
} as const;

/**
 * Escape a user-supplied string for use inside a PostgREST filter value.
 *
 * There are two escaping layers here and the order matters:
 *
 *  1. SQL LIKE. `%` and `_` are wildcards, and `\` is LIKE's own escape
 *     character. Without this, searching for "100%" matches every row.
 *  2. PostgREST quoting. `or=(...)` is parsed as a comma-separated list, so a
 *     term containing a comma or parenthesis doesn't merely fail — it changes
 *     which filters run. `ilikeFilter` wraps the value in double quotes to
 *     make those inert, and inside double quotes PostgREST treats `\` as an
 *     escape, so every backslash (including the ones layer 1 just added) has
 *     to be doubled to survive parsing.
 *
 * Doing these in the other order is a silent bug: PostgREST would consume the
 * LIKE escapes as quote escapes and hand SQL a bare `%` wildcard again.
 */
export function escapeFilterValue(value: string): string {
  const likeEscaped = value.replace(/[\\%_]/g, (char) => `\\${char}`);
  return likeEscaped.replace(/[\\"]/g, (char) => `\\${char}`);
}

/**
 * Build a single `column.ilike."%term%"` clause safe to pass to `.or()`.
 *
 * @param column - Column to match against
 * @param term - Raw, user-supplied search text
 * @param mode - `contains` wraps the term in wildcards; `exact` matches the
 *   whole value case-insensitively
 */
export function ilikeFilter(
  column: string,
  term: string,
  mode: 'contains' | 'exact' = 'contains'
): string {
  const escaped = escapeFilterValue(term);
  const pattern = mode === 'contains' ? `%${escaped}%` : escaped;
  return `${column}.ilike."${pattern}"`;
}

/**
 * Whether a Supabase error means the RPC does not exist in this project yet
 * (the migration adding it has not been applied). Callers use this to fall
 * back to the pre-RPC client-side path instead of failing the user's action.
 */
export function isMissingFunctionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: string; message?: string };
  // PGRST202: no function matches in the schema cache. 42883: undefined function.
  if (code === 'PGRST202' || code === '42883') return true;
  return typeof message === 'string' && /could not find the function|does not exist/i.test(message);
}

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
