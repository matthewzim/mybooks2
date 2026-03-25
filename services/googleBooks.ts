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

interface GoogleBooksVolume {
  id: string;
  volumeInfo: {
    title?: string;
    authors?: string[];
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

class GoogleBooksService {
  private buildSearchQueries(title: string, author: string): string[] {
    const cleanTitle = title.trim();
    const cleanAuthor = author.trim();
    const normalizedTitle = cleanTitle.replace(/\s*\([^)]*\)\s*/g, ' ').trim();

    const queries = [
      `intitle:${cleanTitle} inauthor:${cleanAuthor}`,
      `intitle:${normalizedTitle} inauthor:${cleanAuthor}`,
      `${cleanTitle} ${cleanAuthor}`.trim(),
      cleanTitle,
    ];

    return [...new Set(queries.filter((query) => query.length > 0))];
  }

  private async searchQuery(query: string): Promise<string | null> {
    const url = `${GOOGLE_BOOKS_API}?q=${encodeURIComponent(query)}&maxResults=5&fields=totalItems,items(id,volumeInfo/title,volumeInfo/authors,volumeInfo/imageLinks)`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data: GoogleBooksResponse = await response.json();
    if (!data.items || data.items.length === 0) return null;

    for (const item of data.items) {
      const imageLinks = item.volumeInfo.imageLinks;
      if (imageLinks?.thumbnail || imageLinks?.smallThumbnail) {
        let imageUrl = imageLinks.thumbnail || imageLinks.smallThumbnail || '';
        imageUrl = imageUrl.replace('http://', 'https://');
        imageUrl = imageUrl.replace('zoom=1', 'zoom=2');
        return imageUrl;
      }
    }

    return null;
  }

  /**
   * Search Google Books API by title and author.
   * Returns the best-matching cover image URL or null.
   */
  async searchCoverUrl(
    title: string,
    author: string
  ): Promise<string | null> {
    try {
      const queries = this.buildSearchQueries(title, author);
      for (const query of queries) {
        const imageUrl = await this.searchQuery(query);
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
   */
  async fetchAndCacheCover(
    book: Pick<Book, 'book_id' | 'title' | 'author'>
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
      const googleCoverUrl = await this.searchCoverUrl(book.title, book.author);

      if (!googleCoverUrl) {
        return {
          data: null,
          error: { message: 'No cover image found on Google Books' },
        };
      }

      // 2. Download and upload to Supabase storage
      const uploadResult = await storageService.uploadBookCover(
        googleCoverUrl,
        book.book_id
      );

      if (uploadResult.error || !uploadResult.data) {
        // If caching fails, still use the direct Google image URL for display.
        return { data: googleCoverUrl, error: null };
      }

      const supabaseCoverUrl = uploadResult.data;

      // 3. Persist the cover URL on the global books record
      const { error: updateError } = await supabase
        .from(TABLES.BOOKS)
        .update({
          cover_image_url: supabaseCoverUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', book.book_id);

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
}

export const googleBooksService = new GoogleBooksService();
export default googleBooksService;
