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

/**
 * Query-string marker appended to cover URLs cached by the current
 * high-quality pipeline. Covers stored without it were cached by the old
 * low-resolution pipeline (or are raw Google URLs), so they get re-fetched
 * and overwritten in place. Bump the version if the pipeline improves again
 * — the guard inside the `set_book_cover_url` RPC must be updated in
 * lockstep (see supabase/migrations/20260709_book_cover_quality_upgrade.sql).
 */
const COVER_VERSION_MARKER = 'cv=2';

/** Whether a stored cover URL still needs the high-quality re-fetch. */
export function needsCoverUpgrade(coverUrl: string | null | undefined): boolean {
  return !coverUrl || !coverUrl.includes(COVER_VERSION_MARKER);
}

/** Tag a freshly cached cover URL as produced by the current pipeline. */
function markCoverUrl(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}${COVER_VERSION_MARKER}`;
}

/**
 * Base64 prefixes of the magic bytes for the image formats Google serves
 * (JPEG, PNG, GIF, WebP). The content server can answer 200 with an HTML
 * error page, which previously got cached as a cover and rendered blank.
 */
const IMAGE_BASE64_PREFIXES = ['/9j/', 'iVBOR', 'R0lGOD', 'UklGR'];

function isImageBase64(base64: string): boolean {
  return IMAGE_BASE64_PREFIXES.some((prefix) => base64.startsWith(prefix));
}

/**
 * Volume id used to probe Google's "image not available" placeholder: it is
 * syntactically valid but unassigned, so the content server answers with the
 * same static placeholder it serves for volumes that lack the requested zoom
 * level. Comparing bytes against this reference detects placeholders exactly.
 */
const PLACEHOLDER_PROBE_ID = 'zzzzzzzzzzzz';

/**
 * Fallback floor (bytes) used only when the placeholder probe is unavailable:
 * real covers at zoom >= 2 are tens of kilobytes, while the flat placeholder
 * graphic is far smaller. Rejecting a rare small-but-real upgrade just falls
 * back to the original thumbnail — never worse than the old behaviour.
 */
const MIN_UPGRADED_COVER_BYTES = 15_000;

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
 * Whether a stored author string carries real author information.
 * Several flows default to "Unknown Author" when nothing better is
 * available; requiring a match against that would reject every volume.
 */
function hasAuthorInfo(author: string): boolean {
  const normalized = normalizeForMatch(author);
  return normalized !== '' && normalized !== 'unknown' && normalized !== 'unknown author';
}

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
  /**
   * Reference "image not available" placeholder per zoom level, fetched
   * lazily via PLACEHOLDER_PROBE_ID. `null` means the probe failed (blocked
   * network, unexpected 404), in which case a size heuristic is used instead.
   */
  private placeholderRefByZoom = new Map<string, string | null>();

  /**
   * Whether downloaded cover bytes are Google's "image not available"
   * placeholder. The content server answers HTTP 200 with that placeholder
   * when a volume doesn't serve the requested zoom level, so status checks
   * alone let it slip through and get cached as the real cover.
   */
  private async isGooglePlaceholder(base64: string, url: string): Promise<boolean> {
    if (!url.includes('books.google')) return false;
    const zoom = url.match(/[?&]zoom=(\d+)/)?.[1] ?? '1';

    if (!this.placeholderRefByZoom.has(zoom)) {
      const probeUrl = url.replace(/([?&]id=)[^&]*/, `$1${PLACEHOLDER_PROBE_ID}`);
      let reference: string | null = null;
      if (probeUrl !== url) {
        reference = await storageService.downloadImageAsBase64(probeUrl);
        if (reference && !isImageBase64(reference)) reference = null;
      }
      this.placeholderRefByZoom.set(zoom, reference);
    }

    const reference = this.placeholderRefByZoom.get(zoom);
    if (reference) return base64 === reference;

    // No reference available — fall back to the size floor for upgraded
    // renditions only (small originals are normal at zoom=1).
    if (parseInt(zoom, 10) >= 2) {
      return base64.length * 0.75 < MIN_UPGRADED_COVER_BYTES;
    }
    return false;
  }

  /**
   * Look for another record of the same book (matching title + author,
   * case-insensitively) that already has a high-quality cached cover, so
   * duplicate records end up with one canonical cover image instead of
   * each running its own Google Books fetch (which can pick different
   * editions).
   */
  private async findSharedCover(
    book: Pick<Book, 'book_id' | 'title' | 'author'>
  ): Promise<string | null> {
    const title = (book.title || '').trim();
    const author = (book.author || '').trim();
    if (!title) return null;

    // Escape LIKE wildcards so ilike performs a case-insensitive equality match.
    const escapeLike = (value: string) => value.replace(/[\\%_]/g, (m) => `\\${m}`);

    try {
      const { data, error } = await supabase
        .from(TABLES.BOOKS)
        .select('cover_image_url')
        .neq('id', book.book_id)
        .ilike('title', escapeLike(title))
        .ilike('author', escapeLike(author))
        .not('cover_image_url', 'is', null)
        .limit(10);

      if (error || !data) return null;
      // Only reuse covers produced by the current pipeline — legacy URLs may
      // be low-quality or cached placeholders.
      const match = data.find(
        (row) => row.cover_image_url && !needsCoverUpgrade(row.cover_image_url)
      );
      return match?.cover_image_url ?? null;
    } catch {
      return null;
    }
  }

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
   * the "Onyx Storm" cover. When the author is known, volumes by a
   * different author are rejected outright rather than merely
   * deprioritised: a title collision ("It" matching "It Ends with Us")
   * must not produce a wrong cover — missing is better than wrong.
   *
   * Among the surviving volumes, prefer exact title matches over
   * subtitle/prefix matches (reprints, summaries and omnibus editions
   * tend to carry junk imagery), then volumes with a real thumbnail over
   * ones with only a tiny smallThumbnail, then the most recently
   * published edition (so an old book still gets its modern cover).
   */
  private pickBestCover(
    items: GoogleBooksVolume[],
    title: string,
    author: string
  ): string | null {
    let bestUrl: string | null = null;
    let bestScore = -1;
    const authorKnown = hasAuthorInfo(author);
    const wantedTitle = normalizeForMatch(title);

    for (const item of items) {
      const info = item.volumeInfo;
      const rawUrl = info?.imageLinks?.thumbnail || info?.imageLinks?.smallThumbnail;
      if (!rawUrl) continue;
      if (!titleMatches(title, info?.title || '')) continue;
      if (authorKnown && !authorMatches(author, info?.authors)) continue;

      const year = parseInt((info?.publishedDate || '').slice(0, 4), 10) || 0;
      const score =
        (normalizeForMatch(info?.title || '') === wantedTitle ? 1_000_000 : 0) +
        (info?.imageLinks?.thumbnail ? 100_000 : 0) +
        year;
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
   * Covers cached by the old low-resolution pipeline (no version marker in
   * the URL) are re-fetched and overwritten in place; up-to-date covers
   * return immediately. Duplicate records of the same title/author copy the
   * already-cached cover instead of each querying Google separately.
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

      const existingUrl =
        (!existingBookError && existingBook?.cover_image_url) || null;
      if (existingUrl && !needsCoverUpgrade(existingUrl)) {
        return { data: existingUrl, error: null };
      }

      // 1. Reuse the high-quality cover another record of the same
      //    title/author already cached: copy its bytes into this book's own
      //    file instead of hitting the Google Books API again. Copying
      //    (rather than pointing both records at one file) keeps storage
      //    lifecycles independent — account deletion removes a book's own
      //    cover file, which must not blank out other users' books.
      const sharedUrl = await this.findSharedCover(book);
      if (sharedUrl) {
        const base64 = await storageService.downloadImageAsBase64(sharedUrl);
        if (base64 && isImageBase64(base64)) {
          const uploadResult = await storageService.uploadBookCoverBase64(
            base64,
            book.book_id
          );
          if (uploadResult.data) {
            const markedCoverUrl = markCoverUrl(uploadResult.data);
            const { error: shareError } = await supabase.rpc('set_book_cover_url', {
              p_book_id: book.book_id,
              p_cover_url: markedCoverUrl,
            });
            if (shareError) {
              console.warn(
                'Failed to persist shared cover_image_url:',
                shareError.message
              );
            }
            return { data: markedCoverUrl, error: null };
          }
        }
        // Copying failed — fall through to a fresh Google Books fetch.
      }

      // 2. Search Google Books for a cover image URL
      const googleCoverUrl = await this.searchCoverUrl(
        book.title,
        book.author,
        options
      );

      if (!googleCoverUrl) {
        // Keep showing the legacy cover (if any) until a re-fetch succeeds.
        if (existingUrl) return { data: existingUrl, error: null };
        return {
          data: null,
          error: { message: 'No cover image found on Google Books' },
        };
      }

      // 3. Download, validate and upload to Supabase storage. Try the
      //    high-quality renditions first; volumes that don't serve a higher
      //    zoom level fall back to the API-provided thumbnail. Candidates
      //    that aren't a real image (HTML error pages) or that are Google's
      //    "image not available" placeholder are rejected — the placeholder
      //    is served with HTTP 200, so a status check alone would cache it.
      const candidateUrls = [
        ...new Set([
          upgradeGoogleCoverUrl(googleCoverUrl, 3),
          upgradeGoogleCoverUrl(googleCoverUrl, 2),
          googleCoverUrl,
        ]),
      ];

      let supabaseCoverUrl: string | null = null;
      let lastFailure = 'No cover URL candidates';
      for (const candidateUrl of candidateUrls) {
        try {
          const base64 = await storageService.downloadImageAsBase64(candidateUrl);
          if (!base64 || !isImageBase64(base64)) {
            lastFailure = 'Downloaded data is not an image';
            continue;
          }
          if (await this.isGooglePlaceholder(base64, candidateUrl)) {
            lastFailure = 'Google served the "image not available" placeholder';
            continue;
          }
          const uploadResult = await storageService.uploadBookCoverBase64(
            base64,
            book.book_id
          );
          if (uploadResult.data) {
            supabaseCoverUrl = uploadResult.data;
            break;
          }
          lastFailure = uploadResult.error?.message ?? 'upload returned no URL';
        } catch (uploadError) {
          lastFailure =
            uploadError instanceof Error ? uploadError.message : String(uploadError);
        }
      }

      if (!supabaseCoverUrl) {
        // If caching fails, still use the direct Google image URL for display.
        console.warn(`Failed to cache cover for book ${book.book_id}:`, lastFailure);
        return { data: googleCoverUrl, error: null };
      }

      // The marker records that the current pipeline produced this cover and
      // doubles as a cache-buster now that overwrites are possible.
      const markedCoverUrl = markCoverUrl(supabaseCoverUrl);

      // 4. Persist the cover URL on the global books record.
      //    Uses an RPC with SECURITY DEFINER so any authenticated user can
      //    set the cover, not just the original uploader.
      const { error: updateError } = await supabase.rpc('set_book_cover_url', {
        p_book_id: book.book_id,
        p_cover_url: markedCoverUrl,
      });

      if (updateError) {
        // Upload succeeded but DB write failed – still return the URL
        // so the UI can display it; next open will retry the DB write.
        console.warn('Failed to persist cover_image_url:', updateError.message);
      }

      return { data: markedCoverUrl, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Pre-fetch and cache covers for a list of books that don't have a
   * high-quality one yet — no cover at all, or one cached by the old
   * low-resolution pipeline (which gets overwritten in place).
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
    const uncached = books.filter((b) => needsCoverUpgrade(b.cover_image_url));
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
