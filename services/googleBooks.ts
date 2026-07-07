/**
 * Google Books Service
 *
 * Searches the Google Books API by title and author to retrieve
 * book cover images, then caches them in a Supabase storage bucket.
 *
 * Usage:
 * import { googleBooksService } from '@/services/googleBooks';
 * const coverUrl = await googleBooksService.fetchAndCacheCover(book);
 */

import { supabase, TABLES, handleSupabaseError } from './supabase';
import { storageService } from './storage';
import type { Book, ApiResponse } from '@/types';

const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes';
const GOOGLE_BOOKS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY || '';

/** Maximum number of retries when the API returns 429 (rate-limited). */
const MAX_RETRIES = 2;

/** Base delay in ms for exponential back-off on 429 responses. */
const BACKOFF_BASE_MS = 2000;

/** Minimum delay between sequential API requests (ms). */
const REQUEST_GAP_MS = 1200;

/** Cooldown period after receiving a 429 – skip all requests for this long. */
const COOLDOWN_MS = 30_000;

/** Timestamp of the last Google Books API request (for rate-limiting). */
let lastRequestTime = 0;

/** When set, all requests are skipped until this timestamp (global cooldown). */
let cooldownUntil = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface GoogleBooksVolume {
  id: string;
  volumeInfo: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
  };
}

interface GoogleBooksResponse {
  totalItems: number;
  items?: GoogleBooksVolume[];
}

/** A search result from the user-facing book search */
export interface BookVolumeResult {
  id: string;
  title: string;
  author: string;
  /** Cover thumbnail URL (https), if Google has one */
  thumbnail: string | null;
}

/** Key used to collapse duplicate editions/records of the same book */
export function bookDedupeKey(title: string, author: string): string {
  return `${(title || '').trim().toLowerCase()}|${(author || '').trim().toLowerCase()}`;
}

function mapVolumes(data: GoogleBooksResponse): BookVolumeResult[] {
  return (data.items || [])
    .filter((item) => item.volumeInfo?.title)
    .map((item) => {
      const thumbnail =
        item.volumeInfo.imageLinks?.thumbnail ||
        item.volumeInfo.imageLinks?.smallThumbnail ||
        null;
      return {
        id: item.id,
        title: item.volumeInfo.title || 'Untitled',
        author: item.volumeInfo.authors?.[0] || 'Unknown Author',
        thumbnail: thumbnail ? thumbnail.replace('http://', 'https://') : null,
      };
    });
}

async function fetchVolumes(query: string, maxResults: number): Promise<BookVolumeResult[]> {
  const keyParam = GOOGLE_BOOKS_API_KEY ? `&key=${GOOGLE_BOOKS_API_KEY}` : '';
  const url = `${GOOGLE_BOOKS_API}?q=${encodeURIComponent(query)}&maxResults=${maxResults}&printType=books${keyParam}`;
  const response = await fetch(url);
  if (!response.ok) return [];
  return mapVolumes((await response.json()) as GoogleBooksResponse);
}

/**
 * User-facing book search against the Google Books API.
 *
 * A plain full-text query matches on descriptions and publisher text too,
 * which surfaces irrelevant books (e.g. an author-name search returning a
 * textbook that merely mentions the name). To make searching by author work
 * as expected, this runs two queries in parallel:
 *
 * 1. `inauthor:"<query>"` — books written by a matching author
 * 2. the plain query — title matches etc., kept only when every search term
 *    actually appears in the result's title or author
 *
 * Author matches are listed first, duplicates collapsed by title+author.
 * Falls back to the unfiltered general results if the strict pass finds
 * nothing, so a fuzzy search never gets worse than before.
 */
export async function searchBookVolumes(
  query: string,
  maxResults = 20
): Promise<BookVolumeResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const [authorSettled, generalSettled] = await Promise.allSettled([
    fetchVolumes(`inauthor:"${trimmed}"`, 20),
    fetchVolumes(trimmed, 20),
  ]);
  // One query failing is fine (the other still has results); both failing is
  // a network problem the caller should surface to the user.
  if (authorSettled.status === 'rejected' && generalSettled.status === 'rejected') {
    throw authorSettled.reason;
  }
  const authorResults = authorSettled.status === 'fulfilled' ? authorSettled.value : [];
  const generalResults = generalSettled.status === 'fulfilled' ? generalSettled.value : [];

  const terms = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const isRelevant = (item: BookVolumeResult): boolean => {
    const haystack = `${item.title} ${item.author}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  };
  let filteredGeneral = generalResults.filter(isRelevant);
  if (filteredGeneral.length === 0 && authorResults.length === 0) {
    filteredGeneral = generalResults;
  }

  const merged: BookVolumeResult[] = [];
  const seen = new Set<string>();
  for (const item of [...authorResults, ...filteredGeneral]) {
    const key = bookDedupeKey(item.title, item.author);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= maxResults) break;
  }

  return merged;
}

class GoogleBooksService {
  private buildSearchQueries(title: string, author: string): string[] {
    const cleanTitle = (title || '').trim();
    const cleanAuthor = (author || '').trim();

    // Keep to at most 2 queries to stay within unauthenticated rate limits.
    const queries = [
      cleanAuthor
        ? `intitle:${cleanTitle} inauthor:${cleanAuthor}`
        : cleanTitle,
      `${cleanTitle} ${cleanAuthor}`.trim(),
    ];

    return [...new Set(queries.filter((query) => query.length > 0))];
  }

  private async searchQuery(
    query: string,
    bypassCooldown = false
  ): Promise<string | null> {
    // If we're in a global cooldown after a 429, skip immediately.
    // On-demand requests (e.g. opening the book detail modal) bypass the
    // cooldown so a background prefetch hitting 429 doesn't starve them;
    // they still go through the throttle and per-request retry/backoff.
    if (!bypassCooldown && Date.now() < cooldownUntil) return null;

    const keyParam = GOOGLE_BOOKS_API_KEY ? `&key=${GOOGLE_BOOKS_API_KEY}` : '';
    // Fetch several editions so the newest cover can be preferred below.
    const url = `${GOOGLE_BOOKS_API}?q=${encodeURIComponent(query)}&maxResults=10${keyParam}`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Throttle: ensure a minimum gap between requests
      const now = Date.now();
      const elapsed = now - lastRequestTime;
      if (elapsed < REQUEST_GAP_MS) {
        await sleep(REQUEST_GAP_MS - elapsed);
      }
      lastRequestTime = Date.now();

      const response = await fetch(url);

      if (response.status === 429) {
        // Activate global cooldown so other callers stop hammering too
        cooldownUntil = Date.now() + COOLDOWN_MS;

        if (attempt < MAX_RETRIES) {
          const delay = BACKOFF_BASE_MS * Math.pow(2, attempt);
          console.warn(`Google Books API rate-limited (429). Retrying in ${delay}ms…`);
          await sleep(delay);
          continue;
        }
        console.warn('Google Books API rate-limited (429). Max retries exceeded; cooling down.');
        return null;
      }

      if (!response.ok) {
        console.warn(`Google Books API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data: GoogleBooksResponse = await response.json();
      if (!data.items || data.items.length === 0) return null;

      // The API can't be asked for "the newest cover" directly, so among the
      // returned editions prefer the most recently published one that has an
      // image — this avoids picking a decades-old edition's cover just
      // because it ranks first by relevance.
      let bestUrl: string | null = null;
      let bestYear = -1;
      for (const item of data.items) {
        const imageLinks = item.volumeInfo?.imageLinks;
        const rawUrl = imageLinks?.thumbnail || imageLinks?.smallThumbnail;
        if (!rawUrl) continue;

        const year =
          parseInt((item.volumeInfo?.publishedDate || '').slice(0, 4), 10) || 0;
        if (year > bestYear) {
          bestYear = year;
          bestUrl = rawUrl.replace('http://', 'https://');
        }
      }

      return bestUrl;
    }

    return null;
  }

  /**
   * Search Google Books API by title and author.
   * Returns the best-matching cover image URL or null.
   */
  async searchCoverUrl(
    title: string,
    author: string,
    options?: { bypassCooldown?: boolean }
  ): Promise<string | null> {
    const bypassCooldown = options?.bypassCooldown ?? false;
    try {
      const queries = this.buildSearchQueries(title, author);
      for (const query of queries) {
        // If a previous request triggered cooldown, stop trying more queries
        if (!bypassCooldown && Date.now() < cooldownUntil) return null;
        const imageUrl = await this.searchQuery(query, bypassCooldown);
        if (imageUrl) return imageUrl;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch the book cover from Google Books, upload it to the Supabase
   * `book-covers` bucket, and persist the URL on the books table.
   *
   * Returns the public Supabase URL of the cached cover, or null if
   * no cover was found.
   *
   * @param book - The Book object (needs book_id, title, author)
   * @param options.bypassCooldown - Set for on-demand (user-visible) fetches
   *   so they aren't skipped while a background prefetch is cooling down
   *   after a 429.
   */
  async fetchAndCacheCover(
    book: Pick<Book, 'book_id' | 'title' | 'author'>,
    options?: { bypassCooldown?: boolean }
  ): Promise<ApiResponse<string>> {
    try {
      // 0. Re-check Supabase in case the caller has stale in-memory book data.
      const { data: existingBook, error: existingBookError } = await supabase
        .from(TABLES.BOOKS)
        .select('cover_image_url')
        .eq('id', book.book_id)
        .maybeSingle();

      if (!existingBookError && existingBook?.cover_image_url) {
        return { data: existingBook.cover_image_url, error: null };
      }

      // 1. Search Google Books for a cover image URL
      const googleCoverUrl = await this.searchCoverUrl(
        book.title,
        book.author,
        options
      );

      if (!googleCoverUrl) {
        return {
          data: null,
          error: { message: 'No cover image found on Google Books' },
        };
      }

      // 2. Try to download and upload to Supabase storage
      let uploadResult: { data: string | null; error: { message: string } | null };
      try {
        uploadResult = await storageService.uploadBookCover(
          googleCoverUrl,
          book.book_id
        );
      } catch (uploadError) {
        // If caching fails, still use the direct Google image URL for display.
        console.warn(
          `Failed to cache cover for book ${book.book_id}:`,
          uploadError instanceof Error ? uploadError.message : uploadError
        );
        return { data: googleCoverUrl, error: null };
      }

      if (uploadResult.error || !uploadResult.data) {
        // If caching fails, still use the direct Google image URL for display.
        console.warn(
          `Failed to cache cover for book ${book.book_id}:`,
          uploadResult.error?.message ?? 'upload returned no URL'
        );
        return { data: googleCoverUrl, error: null };
      }

      const supabaseCoverUrl = uploadResult.data;

      // 3. Persist the cover URL on the global books record.
      //    Uses an RPC with SECURITY DEFINER so any authenticated user can
      //    set the cover, not just the original uploader.
      const { error: updateError } = await supabase.rpc('set_book_cover_url', {
        p_book_id: book.book_id,
        p_cover_url: supabaseCoverUrl,
      });

      if (updateError) {
        // Upload succeeded but DB write failed – still return the URL
        // so the UI can display it; next open will retry the DB write.
        console.warn('Failed to persist cover_image_url:', updateError.message);
      }

      return { data: supabaseCoverUrl, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Pre-fetch and cache covers for a list of books that don't have one yet.
   * Runs in the background and calls `onCached` for each book as it completes
   * so the caller can update local state incrementally.
   *
   * @param books - Array of books to check / cache
   * @param onCached - Callback fired for each book whose cover was successfully cached
   */
  async prefetchCovers(
    books: Pick<Book, 'book_id' | 'title' | 'author' | 'cover_image_url'>[],
    onCached: (bookId: string, coverUrl: string) => void
  ): Promise<void> {
    const uncached = books.filter((b) => !b.cover_image_url);
    if (uncached.length === 0) return;

    // Process sequentially with a gap between books to avoid hammering the API
    for (let i = 0; i < uncached.length; i++) {
      const book = uncached[i];
      if (i > 0) await sleep(REQUEST_GAP_MS);

      // If a 429 put us in a global cooldown, wait it out instead of
      // burning through the remaining books as guaranteed no-ops.
      const cooldownRemaining = cooldownUntil - Date.now();
      if (cooldownRemaining > 0) await sleep(cooldownRemaining);

      try {
        const result = await this.fetchAndCacheCover({
          book_id: book.book_id,
          title: book.title,
          author: book.author,
        });

        if (result.data) {
          onCached(book.book_id, result.data);
        }
      } catch {
        // Silently skip failures – the cover will be fetched on-demand later
      }
    }
  }
}

export const googleBooksService = new GoogleBooksService();
export default googleBooksService;
