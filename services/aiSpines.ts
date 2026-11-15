/**
 * AI-generated spines: the curated fallback drawn when a book has no real
 * spine photo. Kept out of services/storage.ts so the book services can map
 * rows without pulling in the upload/file-system code.
 */

import { supabase, STORAGE_BUCKETS } from './supabase';

/**
 * Public URL for an AI-generated spine, from its path in the ai-book-spines
 * bucket (`books.ai_spine_path`). The bucket is public, so this needs no
 * signing and no network call — and because the URL is outside the
 * book-spines bucket, the spine resolvers in services/storage.ts pass it
 * through untouched.
 */
export function getAiSpinePublicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKETS.AI_BOOK_SPINES).getPublicUrl(path);
  return publicUrl;
}
