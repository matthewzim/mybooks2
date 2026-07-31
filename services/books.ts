/**
 * Books Service
 *
 * Handles all CRUD operations for books and bookshelf items:
 * - Global book records (shared across users)
 * - Per-user bookshelf item placement (position, review, rating, stacking)
 * - Community book operations
 *
 * Schema:
 *   books          – global data: title, author, image_url, isbn, is_community
 *   bookshelf_items – per-user: book_id, shelf_id, position, review, rating, stack fields
 *
 * The service returns a combined `Book` type (join of both tables) for UI consumption.
 *
 * Usage:
 * import { booksService } from '@/services/books';
 * const { data, error } = await booksService.getBooksByShelf(shelfId);
 */

import {
  supabase,
  TABLES,
  handleSupabaseError,
  ilikeFilter,
  isMissingFunctionError,
} from './supabase';
import { bookDedupeKey, isbndbService } from './isbndb';
import { normalizeAuthorName, normalizeBookTitle } from '@/utils/bookText';
import type {
  Book,
  CommunityBookSpine,
  CreateBookInput,
  UpdateBookInput,
  ApiResponse,
  PaginatedResponse,
} from '@/types';

/** A global books row as returned by the search helpers below. */
export interface ExistingBookRow {
  id: string;
  title: string;
  author: string;
  image_url: string | null;
  cover_image_url: string | null;
  uploaded_by_user_id: string | null;
  created_at: string;
}

/**
 * How many candidate book rows the alternate-spine picker will scan. Rows are
 * deduplicated by image URL afterwards, so this bounds the request without
 * meaningfully reducing the choices offered.
 */
const ALTERNATIVE_SPINE_SCAN_LIMIT = 100;

/**
 * Transform a joined bookshelf_items + books row into the combined Book type.
 */
function toBook(row: any): Book {
  const book = row.book || {};
  return {
    id: row.id,                                   // bookshelf_items.id
    book_id: row.book_id || book.id,              // books.id
    title: book.title ?? row.title ?? 'Untitled',
    author: book.author ?? row.author ?? 'Unknown Author',
    image_url: book.image_url ?? row.image_url ?? null,
    cover_image_url: book.cover_image_url ?? row.cover_image_url ?? null,
    isbn: book.isbn ?? row.isbn ?? null,
    uploaded_by_user_id: book.uploaded_by_user_id ?? row.uploaded_by_user_id ?? '',
    is_community: book.is_community ?? row.is_community ?? false,
    shelf_id: row.shelf_id,
    position: row.position,
    review: row.review ?? null,
    rating: row.rating ?? null,
    is_stacked: row.is_stacked ?? false,
    stack_id: row.stack_id ?? null,
    stack_position: row.stack_position ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Books Service Class
 * Provides methods for managing books on bookshelves
 */
class BooksService {
  /**
   * Get all books on a specific shelf
   * Joins bookshelf_items with books for complete data
   *
   * @param shelfId - Bookshelf ID
   * @returns Array of books on the shelf
   */
  async getBooksByShelf(shelfId: string): Promise<ApiResponse<Book[]>> {
    try {
      const { data, error } = await supabase
        .from(TABLES.BOOKSHELF_ITEMS)
        .select(`
          *,
          book:books(*)
        `)
        .eq('shelf_id', shelfId)
        .order('position', { ascending: true });

      if (error) throw error;

      return { data: (data || []).map(toBook), error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Get a single book by its bookshelf_item ID
   *
   * @param id - BookshelfItem ID
   * @returns Book details (combined view)
   */
  async getBookById(id: string): Promise<ApiResponse<Book>> {
    try {
      const { data, error } = await supabase
        .from(TABLES.BOOKSHELF_ITEMS)
        .select(`
          *,
          book:books(*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      return { data: toBook(data), error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Create a new book on a shelf.
   *
   * If `input.book_id` is provided, references the existing global book.
   * Otherwise, creates a new global book record first.
   *
   * @param input - Book details including title, author, shelf_id
   * @returns Created book (combined view)
   */
  async createBook(input: CreateBookInput): Promise<ApiResponse<Book>> {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) {
        throw new Error('Not authenticated');
      }

      let bookId = input.book_id;

      // If no existing book_id, create a new global book record
      if (!bookId) {
        // Every entry point lands here — spine scan, manual entry, CSV import,
        // community browse — so this is where SHOUTED text gets folded back to
        // title case. Global book rows are shared across users and drive the
        // cover-image search, so a title stored as "THE HOBBIT" would shout on
        // every shelf that references it and query ISBNdb in capitals too.
        const { data: newBook, error: bookError } = await supabase
          .from(TABLES.BOOKS)
          .insert({
            title: normalizeBookTitle(input.title),
            author: normalizeAuthorName(input.author),
            image_url: input.image_url || null,
            isbn: input.isbn || null,
            uploaded_by_user_id: session.session.user.id,
            is_community: input.is_community ?? true,
          })
          .select()
          .single();

        if (bookError) throw bookError;
        bookId = newBook.id;
      }

      // Only look up the next position when the caller didn't supply one.
      // Bulk adds (onboarding, shelf scan) pass explicit positions, and this
      // query was running once per book anyway — an extra round trip per
      // book that also can't produce a correct answer when several inserts
      // are in flight at once, since they all read the same maximum.
      let position = input.position;
      if (position === undefined) {
        const { data: existingItems } = await supabase
          .from(TABLES.BOOKSHELF_ITEMS)
          .select('position')
          .eq('shelf_id', input.shelf_id)
          .order('position', { ascending: false })
          .limit(1);

        position =
          existingItems && existingItems.length > 0
            ? existingItems[0].position + 1
            : 0;
      }

      // Create the bookshelf_item linking the book to the shelf
      const { data: item, error: itemError } = await supabase
        .from(TABLES.BOOKSHELF_ITEMS)
        .insert({
          book_id: bookId,
          shelf_id: input.shelf_id,
          position,
          review: input.review || null,
          rating: input.rating || null,
          is_stacked: input.is_stacked ?? false,
          stack_id: input.stack_id || null,
          stack_position: input.stack_position ?? 0,
        })
        .select(`
          *,
          book:books(*)
        `)
        .single();

      if (itemError) throw itemError;

      return { data: toBook(item), error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Check whether a global book is already on a shelf.
   * Used to confirm with the user before adding a duplicate.
   *
   * @param bookId - Global book ID
   * @param shelfId - Bookshelf ID
   * @returns true if the book already has an item on the shelf
   */
  async isBookOnShelf(bookId: string, shelfId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from(TABLES.BOOKSHELF_ITEMS)
        .select('id')
        .eq('book_id', bookId)
        .eq('shelf_id', shelfId)
        .limit(1);

      if (error) throw error;
      return (data?.length ?? 0) > 0;
    } catch {
      // If the check fails, assume no duplicate and let the insert proceed
      return false;
    }
  }

  /**
   * Update an existing book.
   * Routes fields to the correct table:
   *   - title, author, image_url, isbn → books table (global)
   *   - review, rating, position, shelf_id, stack fields → bookshelf_items table (per-user)
   *
   * When the edit changes the title or author, the cover image is looked up
   * again — see `refetchCoverAfterRename`.
   *
   * @param id - BookshelfItem ID
   * @param updates - Fields to update
   * @returns Updated book (combined view)
   */
  async updateBook(
    id: string,
    updates: UpdateBookInput
  ): Promise<ApiResponse<Book>> {
    try {
      // Separate updates for each table
      const bookUpdates: Record<string, any> = {};
      const itemUpdates: Record<string, any> = {};

      // Global book fields. Title/author are re-cased on the way in for the
      // same reason as createBook — an all-caps edit shouldn't stick.
      if (updates.title !== undefined) bookUpdates.title = normalizeBookTitle(updates.title);
      if (updates.author !== undefined) bookUpdates.author = normalizeAuthorName(updates.author);
      if (updates.image_url !== undefined) bookUpdates.image_url = updates.image_url;
      if (updates.cover_image_url !== undefined) bookUpdates.cover_image_url = updates.cover_image_url;
      if (updates.isbn !== undefined) bookUpdates.isbn = updates.isbn;

      // Per-user bookshelf_item fields
      if (updates.review !== undefined) itemUpdates.review = updates.review;
      if (updates.rating !== undefined) itemUpdates.rating = updates.rating;
      if (updates.position !== undefined) itemUpdates.position = updates.position;
      if (updates.shelf_id !== undefined) itemUpdates.shelf_id = updates.shelf_id;
      if (updates.is_stacked !== undefined) itemUpdates.is_stacked = updates.is_stacked;
      if (updates.stack_id !== undefined) itemUpdates.stack_id = updates.stack_id;
      if (updates.stack_position !== undefined) itemUpdates.stack_position = updates.stack_position;

      // If we have global book updates, get the book_id and update the books table
      if (Object.keys(bookUpdates).length > 0) {
        // First get the book_id from the bookshelf_item, along with the text
        // the cover was last searched with so a rename can be detected.
        const { data: itemRow, error: fetchError } = await supabase
          .from(TABLES.BOOKSHELF_ITEMS)
          .select('book_id, book:books(title, author)')
          .eq('id', id)
          .single();

        if (fetchError) throw fetchError;

        const previousBook = (itemRow as unknown as {
          book_id: string;
          book: { title: string; author: string } | null;
        }).book;

        bookUpdates.updated_at = new Date().toISOString();
        // `select()` reports what was actually written: the books table's RLS
        // policy only lets the uploader update a shared row, and a blocked
        // update returns no error, just no rows.
        const { data: updatedBooks, error: bookError } = await supabase
          .from(TABLES.BOOKS)
          .update(bookUpdates)
          .eq('id', itemRow.book_id)
          .select('title, author');

        if (bookError) throw bookError;

        const updatedBook = updatedBooks?.[0];
        if (updatedBook) {
          await this.refetchCoverAfterRename(
            itemRow.book_id,
            previousBook,
            updatedBook
          );
        }
      }

      // If we have per-user updates, update the bookshelf_items table
      if (Object.keys(itemUpdates).length > 0) {
        itemUpdates.updated_at = new Date().toISOString();
        const { error: itemError } = await supabase
          .from(TABLES.BOOKSHELF_ITEMS)
          .update(itemUpdates)
          .eq('id', id);

        if (itemError) throw itemError;
      }

      // Re-fetch the combined record to return
      return this.getBookById(id);
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Look the cover image up again after an edit changed the book's title or
   * author.
   *
   * A book shows no cover when nothing in the ISBNdb catalogue matched the
   * title/author it was stored with — a typo in either is the usual cause,
   * and correcting it is exactly the moment the search is worth re-running.
   * The same edit can also mean an existing cover was found for the wrong
   * book, so the re-fetch is allowed to overwrite it; a re-fetch that finds
   * nothing leaves whatever is stored alone.
   *
   * Only title/author edits get here — a review, rating, spine image or
   * shelf move changes nothing the cover search reads, and must not spend a
   * request against the shared ISBNdb quota.
   *
   * Failures are swallowed: the edit itself has already been saved, and the
   * cover is retried whenever the book is opened or prefetched.
   */
  private async refetchCoverAfterRename(
    bookId: string,
    previous: { title: string; author: string } | null,
    current: { title: string; author: string }
  ): Promise<void> {
    // Compare the way the cover search does: case and surrounding whitespace
    // don't change which book ISBNdb returns, so re-casing "the hobbit" is
    // not a reason to spend an API request.
    const previousKey = previous
      ? bookDedupeKey(previous.title || '', previous.author || '')
      : null;
    const currentKey = bookDedupeKey(current.title || '', current.author || '');
    if (previousKey === currentKey) return;

    try {
      await isbndbService.refetchCoverForBook({
        book_id: bookId,
        title: current.title,
        author: current.author,
      });
    } catch {
      // Cover lookups are best-effort; the edit is already saved.
    }
  }

  /**
   * Delete a book from a user's shelf (removes the bookshelf_item).
   * The global book record is preserved so other users still have access.
   *
   * @param id - BookshelfItem ID to delete
   */
  async deleteBook(id: string): Promise<ApiResponse<null>> {
    try {
      const { error } = await supabase
        .from(TABLES.BOOKSHELF_ITEMS)
        .delete()
        .eq('id', id);

      if (error) throw error;

      return { data: null, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Move a book to a different shelf
   *
   * @param bookId - BookshelfItem ID
   * @param newShelfId - Target shelf ID
   * @param newPosition - Optional position on new shelf
   */
  async moveBookToShelf(
    bookId: string,
    newShelfId: string,
    newPosition?: number
  ): Promise<ApiResponse<Book>> {
    try {
      let position = newPosition;
      if (position === undefined) {
        const { data: existingItems } = await supabase
          .from(TABLES.BOOKSHELF_ITEMS)
          .select('position')
          .eq('shelf_id', newShelfId)
          .order('position', { ascending: false })
          .limit(1);

        position =
          existingItems && existingItems.length > 0
            ? existingItems[0].position + 1
            : 0;
      }

      const { data, error } = await supabase
        .from(TABLES.BOOKSHELF_ITEMS)
        .update({
          shelf_id: newShelfId,
          position: position,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookId)
        .select(`
          *,
          book:books(*)
        `)
        .single();

      if (error) throw error;

      return { data: toBook(data), error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Reorder books within a shelf
   *
   * @param shelfId - Shelf ID
   * @param orderedIds - Array of bookshelf_item IDs in new order
   */
  async reorderBooks(
    shelfId: string,
    orderedIds: string[]
  ): Promise<ApiResponse<null>> {
    try {
      if (orderedIds.length === 0) {
        return { data: null, error: null };
      }

      // A single set-based UPDATE. Reordering used to fire one HTTP request
      // per book with `await Promise.all(updates)` discarding every result:
      // a 200-book shelf opened 200 connections at once, and any that failed
      // (rate limit, dropped connection) left the shelf permanently out of
      // order with no error shown.
      const { error } = await supabase.rpc('reorder_bookshelf_items', {
        p_shelf_id: shelfId,
        p_item_ids: orderedIds,
      });

      if (error && !isMissingFunctionError(error)) throw error;

      if (error) {
        // RPC not deployed yet — keep the old path but check the results.
        const results = await Promise.all(
          orderedIds.map((id, index) =>
            supabase
              .from(TABLES.BOOKSHELF_ITEMS)
              .update({ position: index })
              .eq('id', id)
              .eq('shelf_id', shelfId)
          )
        );

        const failure = results.find((result) => result.error);
        if (failure?.error) throw failure.error;
      }

      return { data: null, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Get community book spines (paginated)
   * Queries the global books table for community-shared books.
   *
   * @param page - Page number (0-indexed)
   * @param pageSize - Number of items per page
   * @param searchQuery - Optional search filter
   * @returns Paginated list of community books
   */
  async getCommunityBooks(
    page: number = 0,
    pageSize: number = 20,
    searchQuery?: string
  ): Promise<ApiResponse<PaginatedResponse<CommunityBookSpine>>> {
    try {
      let query = supabase
        .from(TABLES.BOOKS)
        .select(
          `
          id,
          title,
          author,
          image_url,
          uploaded_by_user_id,
          created_at,
          users!uploaded_by_user_id(name)
        `
        )
        .eq('is_community', true);

      if (searchQuery) {
        query = query.or(
          [ilikeFilter('title', searchQuery), ilikeFilter('author', searchQuery)].join(',')
        );
      }

      // Fetch one row past the page to learn whether another page exists.
      // `{ count: 'exact' }` made every page request also run a COUNT(*) over
      // the entire community corpus — a full scan that grows with the user
      // base while answering a question this one extra row answers exactly.
      const from = page * pageSize;
      const to = from + pageSize;
      query = query.range(from, to).order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      const rows = data || [];
      const hasMore = rows.length > pageSize;

      const communityBooks: CommunityBookSpine[] = rows
        .slice(0, pageSize)
        .map((book: any) => ({
          id: book.id,
          title: book.title,
          author: book.author,
          image_url: book.image_url,
          uploaded_by_user_id: book.uploaded_by_user_id ?? '',
          uploader_name: book.users?.name || null,
          times_added: 0,
          created_at: book.created_at,
        }));

      return {
        data: {
          data: communityBooks,
          // Total is no longer queried; callers use `hasMore` for paging.
          count: from + communityBooks.length,
          page,
          pageSize,
          hasMore,
        },
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Free-text search over the global books table (title or author).
   *
   * Centralised so the search surfaces don't hand-build PostgREST `or`
   * filters out of raw user input — a query containing a comma or a
   * parenthesis silently changed which filters ran.
   *
   * @param searchQuery - Raw, user-supplied search text
   * @param limit - Maximum rows to return
   */
  async searchBooks(
    searchQuery: string,
    limit: number = 40
  ): Promise<ApiResponse<ExistingBookRow[]>> {
    try {
      const trimmed = searchQuery.trim();
      if (!trimmed) return { data: [], error: null };

      const { data, error } = await supabase
        .from(TABLES.BOOKS)
        .select('id, title, author, image_url, cover_image_url, uploaded_by_user_id, created_at')
        .or([ilikeFilter('title', trimmed), ilikeFilter('author', trimmed)].join(','))
        .limit(limit);

      if (error) throw error;

      return { data: (data || []) as ExistingBookRow[], error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Look up which of the given title/author pairs already exist in the books
   * table with a spine image, in one request.
   *
   * The search screens used to run this as a separate query per API result —
   * up to 20 round trips per search, on every search, from every user. One
   * `in (...)` over the titles answers all of them.
   *
   * @returns Map keyed by `bookDedupeKey(title, author)`
   */
  async findExistingBooksWithSpines(
    items: { title: string; author: string }[]
  ): Promise<Map<string, ExistingBookRow>> {
    const byKey = new Map<string, ExistingBookRow>();

    const titles = [...new Set(items.map((item) => item.title).filter(Boolean))];
    if (titles.length === 0) return byKey;

    try {
      const { data, error } = await supabase
        .from(TABLES.BOOKS)
        .select('id, title, author, image_url, cover_image_url, uploaded_by_user_id, created_at')
        .in('title', titles)
        .not('image_url', 'is', null);

      if (error || !data) return byKey;

      for (const row of data as ExistingBookRow[]) {
        const key = bookDedupeKey(row.title || '', row.author || '');
        // Keep the first match per book, mirroring the previous `.limit(1)`.
        if (!byKey.has(key)) byKey.set(key, row);
      }
    } catch {
      // A failed lookup just means no spine images are attached.
    }

    return byKey;
  }

  /**
   * Add a community book to user's shelf.
   * References the same global book record (no duplication of spine images).
   *
   * @param communityBook - Community book to add
   * @param shelfId - Target shelf ID
   * @returns Created book on user's shelf
   */
  async addCommunityBookToShelf(
    communityBook: CommunityBookSpine,
    shelfId: string
  ): Promise<ApiResponse<Book>> {
    try {
      // Reference the existing global book by its id
      return this.createBook({
        title: communityBook.title,
        author: communityBook.author,
        image_url: communityBook.image_url || undefined,
        shelf_id: shelfId,
        is_community: false,
        book_id: communityBook.id, // reuse the same global book record
      });
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Update book review and rating (per-user data on bookshelf_items)
   *
   * @param id - BookshelfItem ID
   * @param review - User's review text
   * @param rating - User's rating (1-5)
   */
  async updateBookReview(
    id: string,
    review: string | null,
    rating: number | null
  ): Promise<ApiResponse<Book>> {
    return this.updateBook(id, { review, rating });
  }

  /**
   * Find alternate spine images for the same book.
   * Matches on ISBN when available, otherwise exact title/author pairs.
   *
   * @param book - Current book
   * @returns Other global book rows that can provide a spine image
   */
  async getAlternativeSpines(
    book: Pick<Book, 'book_id' | 'title' | 'author' | 'isbn' | 'image_url'>
  ): Promise<ApiResponse<CommunityBookSpine[]>> {
    try {
      // Bounded: a popular title accumulates a books row per user who added
      // it, and this query has no user filter at all — without a limit the
      // spine picker downloads every copy in the system. The rows are then
      // deduplicated by image URL, so the distinct spines a user can choose
      // between are far fewer than the rows scanned.
      let query = supabase
        .from(TABLES.BOOKS)
        .select(`
          id,
          title,
          author,
          image_url,
          uploaded_by_user_id,
          created_at,
          users!uploaded_by_user_id(name)
        `)
        .not('image_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(ALTERNATIVE_SPINE_SCAN_LIMIT);

      if (book.isbn) {
        query = query.eq('isbn', book.isbn);
      } else {
        query = query.eq('title', book.title).eq('author', book.author);
      }

      const { data, error } = await query;

      if (error) throw error;

      const seenUrls = new Set<string>();
      const alternatives: CommunityBookSpine[] = [];

      for (const row of data || []) {
        if (!row.image_url || seenUrls.has(row.image_url)) {
          continue;
        }

        seenUrls.add(row.image_url);
        alternatives.push({
          id: row.id,
          title: row.title,
          author: row.author,
          image_url: row.image_url,
          uploaded_by_user_id: row.uploaded_by_user_id ?? '',
          uploader_name: row.users?.name || null,
          times_added: 0,
          created_at: row.created_at,
        });
      }

      return {
        data: alternatives.filter((item) => item.image_url !== book.image_url),
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Apply a community spine image to a user's bookshelf item.
   *
   * The books table's RLS policy only lets the original uploader update a
   * row, so writing the community image_url onto a shared book silently
   * updates zero rows (no error, no change on the shelf). Instead:
   *   - if the user owns the underlying book row, update its image in place
   *   - otherwise re-point the bookshelf_item at the community book row that
   *     already carries the selected spine (items are always user-owned)
   *
   * @param itemId - BookshelfItem ID on the user's shelf
   * @param option - Community spine option (a books row with an image)
   * @returns Updated book (combined view)
   */
  async setBookSpineFromCommunity(
    itemId: string,
    option: Pick<CommunityBookSpine, 'id' | 'image_url'>
  ): Promise<ApiResponse<Book>> {
    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user?.id;
      if (!userId) throw new Error('Not authenticated');
      if (!option.image_url) throw new Error('The selected spine has no image');

      const { data, error: itemError } = await supabase
        .from(TABLES.BOOKSHELF_ITEMS)
        .select('book_id, book:books(uploaded_by_user_id)')
        .eq('id', itemId)
        .single();

      if (itemError) throw itemError;
      const itemRow = data as unknown as {
        book_id: string;
        book: { uploaded_by_user_id: string } | null;
      };

      // Own book row: update the image in place so any edits the user made
      // to their copy (title, ISBN, review target) are preserved.
      if (itemRow.book?.uploaded_by_user_id === userId && itemRow.book_id !== option.id) {
        const { data: updatedBooks, error: bookError } = await supabase
          .from(TABLES.BOOKS)
          .update({
            image_url: option.image_url,
            updated_at: new Date().toISOString(),
          })
          .eq('id', itemRow.book_id)
          .select('id');

        if (!bookError && updatedBooks && updatedBooks.length > 0) {
          return this.getBookById(itemId);
        }
        // RLS blocked the update — fall through to re-pointing the item.
      }

      const { data: updatedItems, error: updateError } = await supabase
        .from(TABLES.BOOKSHELF_ITEMS)
        .update({
          book_id: option.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId)
        .select('id');

      if (updateError) throw updateError;
      if (!updatedItems || updatedItems.length === 0) {
        throw new Error('Could not update the book spine. Please try again.');
      }

      return this.getBookById(itemId);
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Stack a book on top of another book
   *
   * @param bookId - BookshelfItem ID of the book to stack
   * @param targetBookId - BookshelfItem ID of the target book
   * @returns Updated book
   */
  async stackBookOnTop(
    bookId: string,
    targetBookId: string
  ): Promise<ApiResponse<Book>> {
    try {
      // Get the target item to find its stack
      const { data: targetItem, error: targetError } = await supabase
        .from(TABLES.BOOKSHELF_ITEMS)
        .select('*')
        .eq('id', targetBookId)
        .single();

      if (targetError) throw targetError;

      // Determine the stack_id - use existing or create new from target item id
      const stackId = targetItem.stack_id || targetBookId;

      // Get the current max stack_position in this stack
      const { data: stackItems } = await supabase
        .from(TABLES.BOOKSHELF_ITEMS)
        .select('stack_position')
        .or(`id.eq.${targetBookId},stack_id.eq.${stackId}`)
        .order('stack_position', { ascending: false })
        .limit(1);

      const nextStackPosition =
        stackItems && stackItems.length > 0
          ? (stackItems[0].stack_position || 0) + 1
          : 1;

      // If target item doesn't have a stack_id, update it first
      if (!targetItem.stack_id) {
        await supabase
          .from(TABLES.BOOKSHELF_ITEMS)
          .update({
            stack_id: stackId,
            stack_position: 0,
            is_stacked: true,
          })
          .eq('id', targetBookId);
      }

      // Update the item being stacked
      const { data, error } = await supabase
        .from(TABLES.BOOKSHELF_ITEMS)
        .update({
          stack_id: stackId,
          stack_position: nextStackPosition,
          is_stacked: true,
          position: targetItem.position,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookId)
        .select(`
          *,
          book:books(*)
        `)
        .single();

      if (error) throw error;

      return { data: toBook(data), error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Remove a book from its stack
   *
   * @param bookId - BookshelfItem ID to unstack
   * @returns Updated book
   */
  async unstackBook(bookId: string): Promise<ApiResponse<Book>> {
    try {
      // Get the item's current stack info
      const { data: item, error: itemError } = await supabase
        .from(TABLES.BOOKSHELF_ITEMS)
        .select(`
          *,
          book:books(*)
        `)
        .eq('id', bookId)
        .single();

      if (itemError) throw itemError;

      if (!item.stack_id) {
        return { data: toBook(item), error: null };
      }

      // Check how many items are left in this stack
      const { data: stackItems, error: countError } = await supabase
        .from(TABLES.BOOKSHELF_ITEMS)
        .select('id, stack_position')
        .eq('stack_id', item.stack_id);

      if (countError) throw countError;

      // Remove this item from the stack
      const { data: updatedItem, error: updateError } = await supabase
        .from(TABLES.BOOKSHELF_ITEMS)
        .update({
          stack_id: null,
          stack_position: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookId)
        .select(`
          *,
          book:books(*)
        `)
        .single();

      if (updateError) throw updateError;

      // If only one item left in stack, clear its stack_id too
      const remainingItems = stackItems.filter((b) => b.id !== bookId);
      if (remainingItems.length === 1) {
        await supabase
          .from(TABLES.BOOKSHELF_ITEMS)
          .update({
            stack_id: null,
            stack_position: 0,
          })
          .eq('id', remainingItems[0].id);
      } else if (remainingItems.length > 1) {
        const sortedRemaining = remainingItems.sort(
          (a, b) => (a.stack_position || 0) - (b.stack_position || 0)
        );
        await Promise.all(
          sortedRemaining.map((b, index) =>
            supabase
              .from(TABLES.BOOKSHELF_ITEMS)
              .update({ stack_position: index })
              .eq('id', b.id)
          )
        );
      }

      return { data: toBook(updatedItem), error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }
}

// Export a singleton instance
export const booksService = new BooksService();

export default booksService;
