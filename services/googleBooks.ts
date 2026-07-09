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

/**
 * Zoom level requested from Google's book-content image server when
 * downloading a cover for caching. The API's `imageLinks.thumbnail` URL
 * uses zoom=1 (~128px wide), which looks blurry rendered at full cover
 * size. The same endpoint serves larger renditions of the same image at
 * higher zoom levels (2 ≈ 300px, 3 ≈ 575px wide); 3 is plenty for a
 * phone-sized cover without fetching print-quality files.
 */
const COVER_ZOOM = 3;

/**
 * Rewrite a Google Books thumbnail URL to a higher-quality rendition:
 * bumps the zoom level and drops the `edge=curl` page-curl overlay.
 * Non-Google URLs are returned unchanged. Not every volume serves every
 * zoom level, so callers must fall back to the original URL when the
 * upgraded one fails to download.
 */
export function upgradeGoogleCoverUrl(url: string, zoom: number = COVER_ZOOM): string {
  if (!url.includes('books.google')) return url;
  return url
    .replace(/([?&])edge=curl(&)?/, (_match, prefix, trailing) => (trailing ? prefix : ''))
    .replace(/([?&])zoom=\d+/, `$1zoom=${zoom}`);
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

/**
 * Normalize a title/author string for comparison: lowercase, strip
 * diacritics and punctuation, collapse whitespace.
 */
function normalizeForMatch(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whether a Google Books result title refers to the same book as the
 * requested title. Exact match after normalization, or a prefix match in
 * either direction to tolerate subtitles ("Why Buddhism Is True" vs.
 * "Why Buddhism Is True: The Science and Philosophy of…") and series
 * suffixes ("Fourth Wing (The Empyrean, 1)").
 */
function titleMatches(wantedTitle: string, candidateTitle: string): boolean {
  const wanted = normalizeForMatch(wantedTitle);
  const candidate = normalizeForMatch(candidateTitle);
  if (!wanted || !candidate) return false;
  return (
    wanted === candidate ||
    wanted.startsWith(`${candidate} `) ||
    candidate.startsWith(`${wanted} `)
  );
}

/** Common filler words that appear in stored author strings but not in
 *  Google's authors array (e.g. "Neil Gaiman and Terry Pratchett"). */
const AUTHOR_STOPWORDS = new Set(['and', 'with', 'the']);

/**
 * Whether a result's authors plausibly match the requested author.
 * Every meaningful name token must appear somewhere in the candidate
 * authors — so "Robert Wright" rejects "Robert Thurman", while
 * "Yarros, Rebecca" still matches "Rebecca Yarros". Initials and
 * middle-initial differences are tolerated by skipping 1-letter tokens.
 */
function authorMatches(
  wantedAuthor: string,
  candidateAuthors: string[] | undefined
): boolean {
  const wanted = normalizeForMatch(wantedAuthor);
  if (!wanted) return true;
  const haystack = normalizeForMatch((candidateAuthors || []).join(' '));
  if (!haystack) return false;
  const tokens = wanted
    .split(' ')
    .filter((token) => token.length > 1 && !AUTHOR_STOPWORDS.has(token));
  if (tokens.length === 0) return true;
  return tokens.every((token) => haystack.includes(token));
}

class GoogleBooksService {
  private buildSearchQueries(title: string, author: string): string[] {
    // Strip embedded quotes so the terms can be safely quoted below.
    const cleanTitle = (title || '').replace(/"/g, ' ').trim();
    const cleanAuthor = (author || '').replace(/"/g, ' ').trim();

    // Quote the intitle:/inauthor: terms — unquoted, Google only scopes the
    // first word to the field (intitle:Fourth Wing scopes just "Fourth"),
    // which lets other books by the same author rank highly.
    // Keep to at most 2 queries to stay within unauthenticated rate limits.
    const queries = [
      cleanAuthor
        ? `intitle:"${cleanTitle}" inauthor:"${cleanAuthor}"`
        : `intitle:"${cleanTitle}"`,
      `${cleanTitle} ${cleanAuthor}`.trim(),
    ];

    return [...new Set(queries.filter((query) => query.length > 0))];
  }

  /**
   * Pick the best cover URL from a page of search results.
   *
   * Only volumes whose title actually matches the requested book are
   * considered — the API's relevance ranking freely mixes in other books
   * by the same author (series siblings, forewords, summaries), and
   * blindly taking the newest of those is how "Fourth Wing" ends up with
   * the "Onyx Storm" cover. Among title matches, author-matching volumes
   * are preferred, then the most recently published edition (so an old
   * book still gets its modern cover).
   */
  private pickBestCover(
    items: GoogleBooksVolume[],
    title: string,
    author: string
  ): string | null {
    let bestUrl: string | null = null;
    let bestScore = -1;

    for (const item of items) {
      const info = item.volumeInfo;
      const rawUrl = info?.imageLinks?.thumbnail || info?.imageLinks?.smallThumbnail;
      if (!rawUrl) continue;
      if (!titleMatches(title, info?.title || '')) continue;

      const year = parseInt((info?.publishedDate || '').slice(0, 4), 10) || 0;
      // Author match dominates recency; recency breaks ties between editions.
      const score = (authorMatches(author, info?.authors) ? 1_000_000 : 0) + year;
      if (score > bestScore) {
        bestScore = score;
        bestUrl = rawUrl.replace('http://', 'https://');
      }
    }

    return bestUrl;
  }

  private async searchQuery(
    query: string,
    bypassCooldown = false
  ): Promise<GoogleBooksVolume[] | null> {
    // If we're in a global cooldown after a 429, skip immediately.
    // On-demand requests (e.g. opening the book detail modal) bypass the
    // cooldown so a background prefetch hitting 429 doesn't starve them;
    // they still go through the throttle and per-request retry/backoff.
    if (!bypassCooldown && Date.now() < cooldownUntil) return null;

    const keyParam = GOOGLE_BOOKS_API_KEY ? `&key=${GOOGLE_BOOKS_API_KEY}` : '';
    // Fetch several editions so the caller can pick the best-matching cover.
    const url = `${GOOGLE_BOOKS_API}?q=${encodeURIComponent(query)}&maxResults=10&printType=books${keyParam}`;

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
      return data.items || [];
    }

    return null;
  }

  /**
   * Search Google Books API by title and author.
   * Returns the best-matching cover image URL, or null when no result
   * verifiably matches the requested book — a missing cover is better
   * than a wrong one.
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
        const items = await this.searchQuery(query, bypassCooldown);
        if (!items || items.length === 0) continue;
        const imageUrl = this.pickBestCover(items, title, author);
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

      // 2. Try to download and upload to Supabase storage. Try the
      //    high-quality rendition first; volumes that don't serve the
      //    higher zoom level fall back to the API-provided thumbnail.
      const candidateUrls = [
        ...new Set([upgradeGoogleCoverUrl(googleCoverUrl), googleCoverUrl]),
      ];

      let uploadResult: { data: string | null; error: { message: string } | null } = {
        data: null,
        error: { message: 'No cover URL candidates' },
      };
      for (const candidateUrl of candidateUrls) {
        try {
          uploadResult = await storageService.uploadBookCover(
            candidateUrl,
            book.book_id
          );
        } catch (uploadError) {
          uploadResult = {
            data: null,
            error: {
              message:
                uploadError instanceof Error ? uploadError.message : String(uploadError),
            },
          };
        }
        if (uploadResult.data) break;
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
