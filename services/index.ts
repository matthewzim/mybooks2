/**
 * Services Index
 *
 * Export all services from a single entry point for cleaner imports
 *
 * Usage:
 * import { authService, booksService, storageService } from '@/services';
 */

export { supabase, STORAGE_BUCKETS, TABLES, handleSupabaseError } from './supabase';
export { authService } from './auth';
export { bookshelvesService } from './bookshelves';
export { booksService } from './books';
export { storageService } from './storage';
export {
  stripeService,
  SUBSCRIPTION_PLANS,
  FREE_TIER_LIMITS,
} from './stripe';
