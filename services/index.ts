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
export { accountService } from './account';
export { bookshelvesService } from './bookshelves';
export { booksService } from './books';
export { storageService } from './storage';
export { moderationService, REPORT_REASONS } from './moderation';
export {
  revenueCatService,
  FREE_TIER_LIMITS,
  PREMIUM_FEATURES,
  ENTITLEMENT_ID,
  PRODUCT_IDS,
} from './revenuecat';
