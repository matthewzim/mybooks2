/**
 * Shelf Scan Service
 *
 * Turns a photo of a real bookshelf into books on a virtual shelf:
 * 1. Google Cloud Vision OCR extracts text blocks from the photo — each
 *    block usually corresponds to one spine (or part of one)
 * 2. Each block of spine text is matched against the Google Books API to
 *    recover a canonical title/author (same source the Goodreads import uses)
 * 3. Matches are checked against the Supabase books table so existing
 *    community spine images are reused; the rest get placeholder spines
 *
 * Usage:
 * import { shelfScanService } from '@/services/shelfScan';
 * const texts = await shelfScanService.detectSpineTexts(base64Image);
 * const matches = await shelfScanService.matchSpineTexts(texts, onProgress);
 * const result = await shelfScanService.addMatchesToShelf(matches, shelfId);
 */

import * as ImageManipulator from 'expo-image-manipulator';
import { supabase, TABLES, handleSupabaseError } from './supabase';
import { booksService } from './books';
import { getSpineImageUrl } from './storage';
import { bookDedupeKey } from './googleBooks';
import type { ApiResponse } from '@/types';

const GOOGLE_VISION_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY || '';
const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes';
const GOOGLE_BOOKS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY || '';

/**
 * Longest edge (px) we downscale a shelf photo to before OCR. Full-resolution
 * phone photos base64-encode to several megabytes, which the Vision API
 * rejects with an HTTP 400 ("payload size exceeds the limit"). ~1600px keeps
 * spine text legible while cutting the request well under the limit.
 */
const MAX_OCR_IMAGE_DIMENSION = 1600;

/** Minimum delay between Google Books lookups while matching a whole shelf. */
const MATCH_REQUEST_GAP_MS = 350;

/** Back-off before the single retry after a 429. */
const MATCH_BACKOFF_MS = 2500;

/** A shelf-photo book candidate after OCR + Google Books matching. */
export interface ShelfScanMatch {
  /** Dedupe key (normalized title|author) */
  key: string;
  title: string;
  author: string;
  /** The raw OCR text this match came from (shown for transparency) */
  detectedText: string;
  /** Existing global books row to reference instead of creating a new one */
  existingBookId: string | null;
  /** Raw image_url from the matched books row (storage path or URL) */
  spineImagePath: string | null;
  /** Resolved, displayable spine image URL */
  resolvedSpineUrl: string | null;
  /** Google Books cover thumbnail for the review list */
  coverUrl: string | null;
}

export interface ShelfScanAddResult {
  /** Books successfully added to the shelf */
  added: number;
  /** Subset of added books that have no spine image (placeholder spine) */
  placeholders: number;
}

interface VisionSymbol {
  text?: string;
  property?: { detectedBreak?: { type?: string } };
}
interface VisionWord {
  symbols?: VisionSymbol[];
}
interface VisionParagraph {
  words?: VisionWord[];
}
interface VisionBlock {
  paragraphs?: VisionParagraph[];
}
interface VisionPage {
  blocks?: VisionBlock[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Significant lowercase word tokens used for match scoring. */
function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter(
    (token) => token.length >= 3
  );
}

function blockToText(block: VisionBlock): string {
  const words: string[] = [];
  for (const paragraph of block.paragraphs || []) {
    for (const word of paragraph.words || []) {
      const text = (word.symbols || []).map((s) => s.text || '').join('');
      if (text) words.push(text);
    }
  }
  return words.join(' ').replace(/\s+/g, ' ').trim();
}

class ShelfScanService {
  /** Whether OCR is configured (Vision API key present). */
  isConfigured(): boolean {
    return GOOGLE_VISION_API_KEY.length > 0;
  }

  /**
   * Downscale and re-encode a picked photo to a JPEG that is safely under the
   * Vision API's request-size limit, returning its base64 content.
   *
   * Full-resolution photos (or large PNGs) routinely exceed the limit and make
   * Vision reject the request with HTTP 400. Resizing the longest edge down to
   * {@link MAX_OCR_IMAGE_DIMENSION} and re-encoding as JPEG keeps the payload
   * small while preserving enough detail to read spine text.
   *
   * @param uri - Local file URI of the picked/captured photo
   * @param width - Original pixel width, so small photos are not upscaled
   * @param height - Original pixel height, so small photos are not upscaled
   * @returns Base64 (no data-URI prefix), or null if manipulation failed
   */
  async prepareImageForOcr(
    uri: string,
    width?: number,
    height?: number
  ): Promise<string | null> {
    try {
      const longestEdge = Math.max(width || 0, height || 0);
      const isPortrait = (height || 0) > (width || 0);
      // Only downscale when we know the photo is larger than the target;
      // re-encode to JPEG regardless to shrink oversized PNGs/originals.
      const actions: ImageManipulator.Action[] =
        longestEdge > MAX_OCR_IMAGE_DIMENSION
          ? [
              {
                resize: isPortrait
                  ? { height: MAX_OCR_IMAGE_DIMENSION }
                  : { width: MAX_OCR_IMAGE_DIMENSION },
              },
            ]
          : [];

      const result = await ImageManipulator.manipulateAsync(uri, actions, {
        compress: 0.7,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      });
      return result.base64 ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Run Google Cloud Vision OCR on a shelf photo and return candidate
   * spine texts, one per detected text block.
   *
   * @param base64Image - Photo content as base64 (no data-URI prefix)
   */
  async detectSpineTexts(base64Image: string): Promise<ApiResponse<string[]>> {
    if (!this.isConfigured()) {
      return {
        data: null,
        error: { message: 'Text recognition is not configured on this build.' },
      };
    }

    try {
      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [
              {
                image: { content: base64Image },
                // DOCUMENT_TEXT_DETECTION returns text grouped into blocks,
                // which map well onto individual book spines.
                features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        // Surface the Vision API's own error message (e.g. an invalid key or an
        // oversized payload) instead of a bare status code, so failures are
        // diagnosable rather than a generic "HTTP 400".
        let detail = '';
        try {
          const errorBody = await response.json();
          const apiMessage = errorBody?.error?.message;
          if (typeof apiMessage === 'string' && apiMessage) {
            detail = ` ${apiMessage}`;
          }
        } catch {
          // Non-JSON error body — fall back to the status code alone
        }
        return {
          data: null,
          error: {
            message: `Text recognition failed (HTTP ${response.status}).${detail}`,
          },
        };
      }

      const payload = await response.json();
      const pages: VisionPage[] =
        payload?.responses?.[0]?.fullTextAnnotation?.pages || [];

      const texts: string[] = [];
      for (const page of pages) {
        for (const block of page.blocks || []) {
          const text = blockToText(block);
          // Keep blocks that plausibly contain a title/author: some length
          // and at least one alphabetic word.
          if (text.length >= 4 && /[a-z]{2,}/i.test(text)) {
            texts.push(text);
          }
        }
      }

      return { data: texts, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Match OCR spine texts against the Google Books API.
   *
   * For each detected block, the top few volumes are scored by how much of
   * their title (and author) actually appears in the detected text; weak
   * matches are discarded so random shelf text doesn't become a book.
   * Matches are then checked against Supabase so existing community spine
   * images can be reused.
   *
   * @param texts - Candidate spine texts from detectSpineTexts
   * @param onProgress - Called with (processed, total) as blocks complete
   */
  async matchSpineTexts(
    texts: string[],
    onProgress?: (processed: number, total: number) => void
  ): Promise<ShelfScanMatch[]> {
    const matchesByKey = new Map<string, ShelfScanMatch>();

    for (let i = 0; i < texts.length; i++) {
      const detectedText = texts[i];
      try {
        const match = await this.matchSingleText(detectedText);
        if (match && !matchesByKey.has(match.key)) {
          matchesByKey.set(match.key, match);
        }
      } catch {
        // A single unmatched spine shouldn't fail the whole scan
      }
      onProgress?.(i + 1, texts.length);
      if (i < texts.length - 1) await sleep(MATCH_REQUEST_GAP_MS);
    }

    const matches = Array.from(matchesByKey.values());
    await this.attachExistingSpines(matches);
    return matches;
  }

  /**
   * Add matched books to a shelf. Existing books (with community spines)
   * are referenced; unmatched ones become new records with placeholder
   * spines, mirroring the Goodreads CSV import behaviour.
   */
  async addMatchesToShelf(
    matches: ShelfScanMatch[],
    shelfId: string,
    onProgress?: (processed: number, total: number) => void
  ): Promise<ShelfScanAddResult> {
    let added = 0;
    let placeholders = 0;

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const result = match.existingBookId
        ? await booksService.createBook({
            title: match.title,
            author: match.author,
            shelf_id: shelfId,
            book_id: match.existingBookId,
          })
        : await booksService.createBook({
            title: match.title,
            author: match.author,
            shelf_id: shelfId,
            is_community: false,
          });

      if (!result.error) {
        added += 1;
        if (!match.spineImagePath) placeholders += 1;
      }
      onProgress?.(i + 1, matches.length);
    }

    return { added, placeholders };
  }

  /** Match one OCR text block to a Google Books volume, or null. */
  private async matchSingleText(detectedText: string): Promise<ShelfScanMatch | null> {
    const detectedTokens = new Set(tokenize(detectedText));
    if (detectedTokens.size === 0) return null;

    const volumes = await this.fetchVolumesThrottled(detectedText);

    let best: { score: number; title: string; author: string; coverUrl: string | null } | null =
      null;

    for (const volume of volumes) {
      const title = volume.volumeInfo?.title || '';
      const author = volume.volumeInfo?.authors?.[0] || '';
      if (!title) continue;

      const titleTokens = tokenize(title);
      const authorTokens = tokenize(author);
      if (titleTokens.length === 0) continue;

      const titleHits = titleTokens.filter((t) => detectedTokens.has(t)).length;
      const authorHits = authorTokens.filter((t) => detectedTokens.has(t)).length;
      const titleRatio = titleHits / titleTokens.length;
      const authorRatio = authorTokens.length > 0 ? authorHits / authorTokens.length : 0;

      // Require most of the title to be present on the spine, or a solid
      // title hit backed up by the author's name.
      const accept =
        titleRatio >= 0.8 || (titleRatio >= 0.5 && titleHits >= 1 && authorRatio >= 0.5);
      if (!accept) continue;

      const score = titleRatio * 2 + authorRatio;
      if (!best || score > best.score) {
        const rawThumbnail =
          volume.volumeInfo?.imageLinks?.thumbnail ||
          volume.volumeInfo?.imageLinks?.smallThumbnail ||
          null;
        best = {
          score,
          title,
          author: author || 'Unknown Author',
          coverUrl: rawThumbnail ? rawThumbnail.replace('http://', 'https://') : null,
        };
      }
    }

    if (!best) return null;

    return {
      key: bookDedupeKey(best.title, best.author),
      title: best.title,
      author: best.author,
      detectedText,
      existingBookId: null,
      spineImagePath: null,
      resolvedSpineUrl: null,
      coverUrl: best.coverUrl,
    };
  }

  /** Google Books lookup with a small gap and one retry on rate limiting. */
  private async fetchVolumesThrottled(query: string): Promise<
    {
      volumeInfo?: {
        title?: string;
        authors?: string[];
        imageLinks?: { thumbnail?: string; smallThumbnail?: string };
      };
    }[]
  > {
    const keyParam = GOOGLE_BOOKS_API_KEY ? `&key=${GOOGLE_BOOKS_API_KEY}` : '';
    const url = `${GOOGLE_BOOKS_API}?q=${encodeURIComponent(query)}&maxResults=5&printType=books${keyParam}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(url);
      if (response.status === 429) {
        await sleep(MATCH_BACKOFF_MS);
        continue;
      }
      if (!response.ok) return [];
      const data = await response.json();
      return data?.items || [];
    }
    return [];
  }

  /**
   * Look up each match in the Supabase books table so shelves reuse
   * existing records (and their community spine images) where possible.
   */
  private async attachExistingSpines(matches: ShelfScanMatch[]): Promise<void> {
    await Promise.all(
      matches.map(async (match) => {
        try {
          // Non-null image_url rows first so a spine is preferred over a
          // bare record when several users own the same title.
          const { data } = await supabase
            .from(TABLES.BOOKS)
            .select('id, image_url')
            .eq('title', match.title)
            .eq('author', match.author)
            .order('image_url', { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();
          const existing = data as { id: string; image_url: string | null } | null;

          if (existing?.id) {
            match.existingBookId = existing.id;
            match.spineImagePath = existing.image_url || null;
            if (existing.image_url) {
              match.resolvedSpineUrl = await getSpineImageUrl(existing.image_url);
            }
          }
        } catch {
          // No existing record — the book will be created fresh
        }
      })
    );
  }
}

export const shelfScanService = new ShelfScanService();
export default shelfScanService;
