/**
 * ISBNdb Service
 *
 * Searches the ISBNdb API v2 by title, author, or ISBN to retrieve book
 * metadata and cover images, then caches covers in a Supabase storage bucket.
 *
 * Unlike the Google Books API this replaced, ISBNdb serves one stable cover
 * URL per book (no zoom-level renditions, no "image not available"
 * placeholder served with HTTP 200) and supports exact ISBN lookup. It has
 * no keyless quota, so every entry point degrades gracefully (empty results,
 * no cover) when EXPO_PUBLIC_ISBNDB_API_KEY is unset.
 *
 * Usage:
 * import { isbndbService } from '@/services/isbndb';
 * const coverUrl = await isbndbService.fetchAndCacheCover(book);
 */

import {
  supabase,
  TABLES,
  handleSupabaseError,
  escapeLikePattern,
} from './supabase';
import { storageService } from './storage';
import { normalizeAuthorName, normalizeBookTitle } from '@/utils/bookText';
import type { Book, ApiResponse } from '@/types';

const ISBNDB_API_KEY = process.env.EXPO_PUBLIC_ISBNDB_API_KEY || '';

/**
 * The base URL and request rate are tied to the ISBNdb subscription tier:
 *   Basic   https://api2.isbndb.com        1 request/second
 *   Premium https://api.premium.isbndb.com 3 requests/second
 *   Pro     https://api.pro.isbndb.com     5 requests/second
 * Keep EXPO_PUBLIC_ISBNDB_BASE_URL and EXPO_PUBLIC_ISBNDB_REQUESTS_PER_SECOND
 * in sync with the plan the API key belongs to.
 */
const ISBNDB_BASE_URL =
  process.env.EXPO_PUBLIC_ISBNDB_BASE_URL || 'https://api2.isbndb.com';

const ISBNDB_REQUESTS_PER_SECOND =
  parseFloat(process.env.EXPO_PUBLIC_ISBNDB_REQUESTS_PER_SECOND || '') || 1;

/** Minimum delay between sequential API requests (ms), from the tier's rate. */
const REQUEST_GAP_MS = Math.ceil(1000 / ISBNDB_REQUESTS_PER_SECOND);

/** Maximum number of retries when the API returns 429 (rate-limited). */
const MAX_RETRIES = 2;

/** Base delay in ms for exponential back-off on 429 responses. */
const BACKOFF_BASE_MS = 2000;

/** Cooldown period after receiving a 429 – skip all requests for this long. */
const COOLDOWN_MS = 30_000;

/** Timestamp of the last ISBNdb API request (for rate-limiting). */
let lastRequestTime = 0;

/** When set, all requests are skipped until this timestamp (global cooldown). */
let cooldownUntil = 0;

/**
 * Tail of the shared request queue. Every ISBNdb request from every caller
 * (user search, cover prefetch, shelf scan) chains onto it so overlapping
 * callers are serialized FIFO and the per-second rate limit holds globally —
 * a plain timestamp gap alone would let concurrent callers race past it.
 */
let queueTail: Promise<unknown> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Whether the ISBNdb API key is present. There is no keyless quota. */
export function isbndbConfigured(): boolean {
  return ISBNDB_API_KEY.length > 0;
}

let warnedUnconfigured = false;

/**
 * Perform a rate-limited, authenticated GET against the ISBNdb API.
 *
 * Returns the parsed JSON body, or null when the request was skipped
 * (no API key, global cooldown), the resource doesn't exist (404), or the
 * API errored/rate-limited past the retry budget. Network failures reject
 * so callers that need to surface them (user-facing search) can.
 *
 * @param path - Path + query string, e.g. `/books/dune?pageSize=20`
 * @param options.bypassCooldown - Set for on-demand (user-visible) requests
 *   so they aren't skipped while a background prefetch is cooling down
 *   after a 429.
 */
async function isbndbFetch<T>(
  path: string,
  options?: { bypassCooldown?: boolean }
): Promise<T | null> {
  if (!isbndbConfigured()) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(
        'ISBNdb API key is not configured — book search and cover fetching are disabled.'
      );
    }
    return null;
  }

  // If we're in a global cooldown after a 429, skip immediately.
  if (!options?.bypassCooldown && Date.now() < cooldownUntil) return null;

  const run = queueTail.then(async (): Promise<T | null> => {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Throttle: ensure a minimum gap between requests
      const elapsed = Date.now() - lastRequestTime;
      if (elapsed < REQUEST_GAP_MS) {
        await sleep(REQUEST_GAP_MS - elapsed);
      }
      lastRequestTime = Date.now();

      const response = await fetch(`${ISBNDB_BASE_URL}${path}`, {
        headers: { Authorization: ISBNDB_API_KEY },
      });

      if (response.status === 429) {
        // Activate global cooldown so other callers stop hammering too
        cooldownUntil = Date.now() + COOLDOWN_MS;

        if (attempt < MAX_RETRIES) {
          const delay = BACKOFF_BASE_MS * Math.pow(2, attempt);
          console.warn(`ISBNdb API rate-limited (429). Retrying in ${delay}ms…`);
          await sleep(delay);
          continue;
        }
        console.warn('ISBNdb API rate-limited (429). Max retries exceeded; cooling down.');
        return null;
      }

      // The API answered something other than 429, so it is serving us again.
      // Clear any cooldown a previous 429 set: without this, a rate-limit that
      // recovered on retry would still silently skip every background request
      // (and make prefetchCovers sleep) for the rest of the 30s window.
      // Requests are serialized through the shared queue, so this can't race
      // with another caller's in-flight back-off.
      cooldownUntil = 0;

      // ISBNdb answers 404 for lookups with no result (e.g. an unknown
      // ISBN) — a clean miss, not an error worth logging.
      if (response.status === 404) return null;

      if (!response.ok) {
        console.warn(`ISBNdb API error: ${response.status} ${response.statusText}`);
        return null;
      }

      return (await response.json()) as T;
    }
    return null;
  });

  // A failed request must not wedge the shared queue for later callers.
  queueTail = run.catch(() => {});
  return run;
}

/** Book record as returned by the ISBNdb API. */
export interface IsbnDbBook {
  title?: string;
  /** Full title including subtitle/series suffix */
  title_long?: string;
  isbn?: string;
  isbn13?: string;
  authors?: string[];
  publisher?: string;
  date_published?: string;
  pages?: number;
  language?: string;
  synopsis?: string;
  binding?: string;
  edition?: string;
  subjects?: string[];
  /** Cover image URL (images.isbndb.com) */
  image?: string;
}

interface IsbnDbBookResponse {
  book?: IsbnDbBook;
}

interface IsbnDbSearchResponse {
  total?: number;
  books?: IsbnDbBook[];
}

/** A search result from the user-facing book search */
export interface BookVolumeResult {
  id: string;
  title: string;
  author: string;
  /** Cover image URL (https), if ISBNdb has one */
  thumbnail: string | null;
  /** Canonical ISBN (13 preferred), if ISBNdb has one */
  isbn13: string | null;
}

/** Key used to collapse duplicate editions/records of the same book */
export function bookDedupeKey(title: string, author: string): string {
  return `${(title || '').trim().toLowerCase()}|${(author || '').trim().toLowerCase()}`;
}

/**
 * Query-string marker appended to cover URLs cached by the current
 * pipeline. cv=2 covers came from the old Google Books pipeline; bumping to
 * cv=3 makes every one of them lazily re-fetch from ISBNdb, which fixes the
 * wrong/low-quality covers Google produced. Bump the version if the pipeline
 * improves again — the guard inside the `set_book_cover_url` RPC must be
 * updated in lockstep (see supabase/migrations/20260713_isbndb_cover_migration.sql).
 */
const COVER_VERSION_MARKER = 'cv=3';

/** Whether a stored cover URL still needs the current-pipeline re-fetch. */
export function needsCoverUpgrade(coverUrl: string | null | undefined): boolean {
  return !coverUrl || !coverUrl.includes(COVER_VERSION_MARKER);
}

/** Tag a freshly cached cover URL as produced by the current pipeline. */
function markCoverUrl(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}${COVER_VERSION_MARKER}`;
}

/**
 * Base64 prefixes of the magic bytes for common cover image formats
 * (JPEG, PNG, GIF, WebP). An image host can answer 200 with an HTML
 * error page, which previously got cached as a cover and rendered blank.
 */
const IMAGE_BASE64_PREFIXES = ['/9j/', 'iVBOR', 'R0lGOD', 'UklGR'];

function isImageBase64(base64: string): boolean {
  return IMAGE_BASE64_PREFIXES.some((prefix) => base64.startsWith(prefix));
}

/**
 * Floor (bytes) below which a downloaded cover is rejected as a stub.
 * Deliberately conservative: ISBNdb serves one rendition per book with no
 * fallback, so an aggressive floor would turn small-but-real covers into
 * permanent misses. 2KB only rejects error stubs and tracking pixels.
 */
const MIN_COVER_BYTES = 2_000;

function mapBooks(books: IsbnDbBook[]): BookVolumeResult[] {
  return books
    .filter((book) => book.title)
    .map((book) => {
      const isbn13 = book.isbn13 || book.isbn || null;
      // Some ISBNdb records are catalogued in block capitals ("DUNE",
      // "HERBERT, FRANK"). Fold those back to title case here, at the edge of
      // the API, so nothing downstream — search results, prefilled add-book
      // fields, stored book rows — ever carries the shouting.
      const title = normalizeBookTitle(book.title) || 'Untitled';
      const author = normalizeAuthorName(book.authors?.[0]) || 'Unknown Author';
      return {
        id: isbn13 || bookDedupeKey(title, author),
        title,
        author,
        thumbnail: book.image || null,
        isbn13,
      };
    });
}

/**
 * User-facing book search against the ISBNdb API.
 *
 * A single all-columns query matches on both titles and author names (two
 * separate requests would double the hit on the requests-per-second budget).
 * To make searching by author work as expected, results whose author matches
 * every search term are listed first; the remaining results are kept only
 * when every term appears in their title or author, falling back to the
 * unfiltered list when nothing survives so a fuzzy search never gets worse.
 * Duplicates are collapsed by title+author.
 */
export async function searchBookVolumes(
  query: string,
  maxResults = 20
): Promise<BookVolumeResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Over-fetch so author-first reordering and dedupe still fill maxResults.
  const pageSize = Math.min(maxResults * 2, 40);
  // User-initiated search shouldn't be starved by a background prefetch's
  // rate-limit cooldown; it still goes through the shared throttle queue.
  const data = await isbndbFetch<IsbnDbSearchResponse>(
    `/books/${encodeURIComponent(trimmed)}?page=1&pageSize=${pageSize}`,
    { bypassCooldown: true }
  );
  if (!data) return [];
  const results = mapBooks(data.books || []);

  const terms = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const matchesAllTerms = (haystack: string): boolean =>
    terms.every((term) => haystack.includes(term));
  const isAuthorMatch = (item: BookVolumeResult): boolean =>
    matchesAllTerms(item.author.toLowerCase());
  const isRelevant = (item: BookVolumeResult): boolean =>
    matchesAllTerms(`${item.title} ${item.author}`.toLowerCase());

  const authorResults = results.filter(isAuthorMatch);
  let generalResults = results.filter((item) => !isAuthorMatch(item) && isRelevant(item));
  if (authorResults.length === 0 && generalResults.length === 0) {
    generalResults = results;
  }

  const merged: BookVolumeResult[] = [];
  const seen = new Set<string>();
  for (const item of [...authorResults, ...generalResults]) {
    const key = bookDedupeKey(item.title, item.author);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= maxResults) break;
  }

  return merged;
}

/**
 * Normalize an ISBN for lookup: strip separators, validate as ISBN-10
 * (digits with an optional trailing X) or ISBN-13 (digits only).
 * Returns null when the value isn't a plausible ISBN.
 */
export function normalizeIsbn(value: string): string | null {
  const cleaned = (value || '').replace(/[-\s]/g, '').toUpperCase();
  if (/^\d{13}$/.test(cleaned)) return cleaned;
  if (/^\d{9}[\dX]$/.test(cleaned)) return cleaned;
  return null;
}

export interface IsbnLookupResult {
  title: string;
  author: string;
  isbn13: string | null;
  thumbnail: string | null;
}

/**
 * Exact-ISBN lookup. Returns the book's core fields, or null when the ISBN
 * is malformed or unknown to ISBNdb.
 */
export async function lookupBookByIsbn(isbn: string): Promise<IsbnLookupResult | null> {
  const normalized = normalizeIsbn(isbn);
  if (!normalized) return null;

  const data = await isbndbFetch<IsbnDbBookResponse>(`/book/${normalized}`, {
    bypassCooldown: true,
  });
  const book = data?.book;
  if (!book?.title) return null;

  return {
    title: normalizeBookTitle(book.title),
    author: normalizeAuthorName(book.authors?.[0]),
    isbn13: book.isbn13 || book.isbn || normalized,
    thumbnail: book.image || null,
  };
}

/**
 * Look up candidate books for a block of OCR'd spine text.
 *
 * Spine text arrives as the spine printed it, which is frequently block
 * capitals; it is title-cased and whitespace-collapsed before it becomes a
 * query so ISBNdb is asked for the book the way its catalogue spells it.
 *
 * `shouldMatchAll=0` keeps the search an OR-match: spine text routinely
 * carries junk tokens (publisher names, shelf labels) that would zero out
 * an AND-match. The caller's token-overlap scoring is the real noise filter.
 */
export async function searchBooksForSpineText(text: string): Promise<IsbnDbBook[]> {
  const query = normalizeBookTitle(text);
  if (!query) return [];

  const data = await isbndbFetch<IsbnDbSearchResponse>(
    `/books/${encodeURIComponent(query)}?page=1&pageSize=10&shouldMatchAll=0`
  );
  return data?.books || [];
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
 * Whether an ISBNdb result title refers to the same book as the requested
 * title. Exact match after normalization, or a prefix match in either
 * direction to tolerate subtitles ("Why Buddhism Is True" vs. "Why Buddhism
 * Is True: The Science and Philosophy of…") and series suffixes
 * ("Fourth Wing (The Empyrean, 1)").
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
 *  ISBNdb's authors array (e.g. "Neil Gaiman and Terry Pratchett"). */
const AUTHOR_STOPWORDS = new Set(['and', 'with', 'the']);

/**
 * Whether a stored author string carries real author information.
 * Several flows default to "Unknown Author" when nothing better is
 * available; requiring a match against that would reject every result.
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

/**
 * Books ISBNdb has no usable cover for, keyed by title|author with the time
 * of the miss.
 *
 * A miss leaves `cover_image_url` null, which is exactly what marks a book as
 * needing a cover — so without this, every shelf open re-runs the same
 * two-request search for the same permanently coverless books, which is the
 * fastest way to exhaust a 1-request/second quota. Only background prefetches
 * consult it; an on-demand fetch (`bypassCooldown`, i.e. the user is looking
 * at the book) always gets a fresh attempt.
 *
 * Session-scoped and bounded: entries expire so a book that ISBNdb indexes
 * later is picked up, and the map can't grow without limit on a long session.
 */
const coverMisses = new Map<string, number>();
const COVER_MISS_TTL_MS = 6 * 60 * 60 * 1000;
const COVER_MISS_MAX_ENTRIES = 500;

/**
 * Ceiling on how many covers one shelf open will prefetch in the background.
 *
 * At the Basic tier's one request per second, 40 books is already up to ~80
 * seconds of queued API traffic; anything beyond that is still running when
 * the user has moved on, and it competes with the on-demand fetch for the
 * book they actually opened.
 */
const PREFETCH_MAX_BOOKS = 40;

function hasRecentCoverMiss(key: string): boolean {
  const missedAt = coverMisses.get(key);
  if (missedAt === undefined) return false;
  if (Date.now() - missedAt > COVER_MISS_TTL_MS) {
    coverMisses.delete(key);
    return false;
  }
  return true;
}

function recordCoverMiss(key: string): void {
  // Map iteration is insertion-ordered, so this evicts the oldest entry.
  if (coverMisses.size >= COVER_MISS_MAX_ENTRIES) {
    const oldest = coverMisses.keys().next();
    if (!oldest.done) coverMisses.delete(oldest.value);
  }
  coverMisses.set(key, Date.now());
}

class IsbndbCoverService {
  /**
   * Look for another record of the same book (matching title + author,
   * case-insensitively) that already has a current-pipeline cached cover, so
   * duplicate records end up with one canonical cover image instead of
   * each running its own ISBNdb fetch (which can pick different editions).
   */
  private async findSharedCover(
    book: Pick<Book, 'book_id' | 'title' | 'author'>
  ): Promise<string | null> {
    const title = (book.title || '').trim();
    const author = (book.author || '').trim();
    if (!title) return null;

    try {
      const { data, error } = await supabase
        .from(TABLES.BOOKS)
        .select('cover_image_url')
        .neq('id', book.book_id)
        // Escaped ilike, i.e. case-insensitive equality — it also matches rows
        // stored in block capitals before titles were normalized.
        .ilike('title', escapeLikePattern(title))
        .ilike('author', escapeLikePattern(author))
        .not('cover_image_url', 'is', null)
        .limit(10);

      if (error || !data) return null;
      // Only reuse covers produced by the current pipeline — legacy URLs
      // are Google-sourced and get re-fetched from ISBNdb instead.
      const match = data.find(
        (row) => row.cover_image_url && !needsCoverUpgrade(row.cover_image_url)
      );
      return match?.cover_image_url ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Build the request paths tried in order when looking up a cover:
   * a title-column search first (precise), then an all-columns search on
   * title + author as the fallback for titles ISBNdb indexes differently.
   *
   * The title and author are re-cased before they reach the query string, so
   * a book stored in block capitals (a spine scan from before titles were
   * normalized, or a shouted manual entry) still searches ISBNdb the way the
   * catalogue spells it rather than as "THE HOBBIT".
   */
  private buildCoverQueryPaths(title: string, author: string): string[] {
    const cleanTitle = normalizeBookTitle(title);
    const cleanAuthor = normalizeAuthorName(author);
    if (!cleanTitle) return [];

    const paths = [
      `/books/${encodeURIComponent(cleanTitle)}?page=1&pageSize=20&column=title`,
      `/books/${encodeURIComponent(`${cleanTitle} ${cleanAuthor}`.trim())}?page=1&pageSize=20`,
    ];

    return [...new Set(paths)];
  }

  /**
   * Pick the best cover URL from a page of search results.
   *
   * Only books whose title actually matches the requested one are
   * considered — a title search freely returns other books that merely
   * share words with the query. When the author is known, books by a
   * different author are rejected outright rather than merely
   * deprioritised: a title collision ("It" matching "It Ends with Us")
   * must not produce a wrong cover — missing is better than wrong.
   *
   * When the author is *not* known ("Unknown Author" is the fallback in
   * several add-book flows) there is no signal left to break such a
   * collision, so the subtitle/prefix tolerance is dropped and only an exact
   * title match counts. Without that, a book stored as "It" with no author
   * silently picks up the cover of "It Ends with Us".
   *
   * Among the surviving books, prefer exact title matches over
   * subtitle/prefix matches (reprints, summaries and omnibus editions
   * tend to carry junk imagery), then the most recently published edition
   * (so an old book still gets its modern cover).
   */
  private pickBestCover(
    books: IsbnDbBook[],
    title: string,
    author: string
  ): string | null {
    let bestUrl: string | null = null;
    let bestScore = -1;
    const authorKnown = hasAuthorInfo(author);
    const wantedTitle = normalizeForMatch(title);

    for (const book of books) {
      const rawUrl = book.image;
      if (!rawUrl) continue;
      // ISBNdb splits subtitles between `title` and `title_long`; accept
      // whichever form matches the requested title.
      const matchedTitle = titleMatches(title, book.title || '')
        ? book.title || ''
        : titleMatches(title, book.title_long || '')
          ? book.title_long || ''
          : null;
      if (matchedTitle === null) continue;

      const isExactTitle = normalizeForMatch(matchedTitle) === wantedTitle;
      if (authorKnown) {
        if (!authorMatches(author, book.authors)) continue;
      } else if (!isExactTitle) {
        // No author to disambiguate with — a prefix match is a coin flip.
        continue;
      }

      const year = parseInt((book.date_published || '').slice(0, 4), 10) || 0;
      const score = (isExactTitle ? 1_000_000 : 0) + year;
      if (score > bestScore) {
        bestScore = score;
        bestUrl = rawUrl;
      }
    }

    return bestUrl;
  }

  /**
   * Search the ISBNdb API by title and author.
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
      for (const path of this.buildCoverQueryPaths(title, author)) {
        // If a previous request triggered cooldown, stop trying more queries
        if (!bypassCooldown && Date.now() < cooldownUntil) return null;
        const data = await isbndbFetch<IsbnDbSearchResponse>(path, options);
        const books = data?.books;
        if (!books || books.length === 0) continue;
        const imageUrl = this.pickBestCover(books, title, author);
        if (imageUrl) return imageUrl;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch the book cover from ISBNdb, upload it to the Supabase
   * `book-covers` bucket, and persist the URL on the books table.
   *
   * Covers cached by the old Google Books pipeline (no cv=3 marker in the
   * URL) are re-fetched and overwritten in place; up-to-date covers return
   * immediately. Duplicate records of the same title/author copy the
   * already-cached cover instead of each querying ISBNdb separately.
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

      // 1. Reuse the cover another record of the same title/author already
      //    cached: copy its bytes into this book's own file instead of
      //    hitting the ISBNdb API again. Copying (rather than pointing both
      //    records at one file) keeps storage lifecycles independent —
      //    account deletion removes a book's own cover file, which must not
      //    blank out other users' books.
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
        // Copying failed — fall through to a fresh ISBNdb fetch.
      }

      // 2. Search ISBNdb for a cover image URL. A background prefetch skips
      //    books ISBNdb already failed to match this session rather than
      //    spending two more requests re-confirming the miss.
      const bypassCooldown = options?.bypassCooldown ?? false;
      const missKey = bookDedupeKey(book.title, book.author);

      const noCoverFound = (): ApiResponse<string> => {
        // Keep showing the legacy cover (if any) until a re-fetch succeeds.
        if (existingUrl) return { data: existingUrl, error: null };
        return {
          data: null,
          error: { message: 'No cover image found on ISBNdb' },
        };
      };

      if (!bypassCooldown && hasRecentCoverMiss(missKey)) {
        return noCoverFound();
      }

      const isbndbCoverUrl = await this.searchCoverUrl(
        book.title,
        book.author,
        options
      );

      if (!isbndbCoverUrl) {
        // Only remember a miss that the API actually answered. A null while
        // unconfigured or mid-cooldown means the search was skipped, not that
        // the book has no cover.
        if (isbndbConfigured() && Date.now() >= cooldownUntil) {
          recordCoverMiss(missKey);
        }
        return noCoverFound();
      }

      // 3. Download, validate and upload to Supabase storage. ISBNdb serves
      //    a single rendition per book, so there are no higher-quality
      //    candidates to try. Downloads that aren't a real image (HTML error
      //    pages) or that are implausibly small stubs are rejected rather
      //    than cached.
      let supabaseCoverUrl: string | null = null;
      let lastFailure = 'Download failed';
      try {
        const base64 = await storageService.downloadImageAsBase64(isbndbCoverUrl);
        if (!base64 || !isImageBase64(base64)) {
          lastFailure = 'Downloaded data is not an image';
        } else if (base64.length * 0.75 < MIN_COVER_BYTES) {
          lastFailure = 'Downloaded image is too small to be a real cover';
        } else {
          const uploadResult = await storageService.uploadBookCoverBase64(
            base64,
            book.book_id
          );
          if (uploadResult.data) {
            supabaseCoverUrl = uploadResult.data;
          } else {
            lastFailure = uploadResult.error?.message ?? 'upload returned no URL';
          }
        }
      } catch (uploadError) {
        lastFailure =
          uploadError instanceof Error ? uploadError.message : String(uploadError);
      }

      if (!supabaseCoverUrl) {
        // If caching fails, still use the direct ISBNdb image URL for display.
        console.warn(`Failed to cache cover for book ${book.book_id}:`, lastFailure);
        return { data: isbndbCoverUrl, error: null };
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
   * current-pipeline one yet — no cover at all, or one cached by the old
   * Google Books pipeline (which gets overwritten in place).
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
    if (!isbndbConfigured()) return;

    // Bounded per shelf open. Every book here costs at least one Supabase
    // round trip and, on a miss, two ISBNdb requests against a quota shared
    // by the entire install base — so a 600-book shelf must not queue 600
    // background fetches every time it is opened. The remainder is picked up
    // on demand when the user opens a book, and on subsequent shelf opens as
    // the front of the queue fills in.
    const uncached = books
      .filter((b) => needsCoverUpgrade(b.cover_image_url))
      .slice(0, PREFETCH_MAX_BOOKS);
    if (uncached.length === 0) return;

    // The shared queue already paces requests; this short gap between books
    // just keeps on-demand requests from waiting behind a monolithic burst.
    const PREFETCH_GAP_MS = 250;

    for (let i = 0; i < uncached.length; i++) {
      const book = uncached[i];
      if (i > 0) await sleep(PREFETCH_GAP_MS);

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

export const isbndbService = new IsbndbCoverService();
export default isbndbService;
