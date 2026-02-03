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

import { supabase, TABLES, handleSupabaseError } from './supabase';
import type {
  Book,
  CommunityBookSpine,
  CreateBookInput,
  UpdateBookInput,
  ApiResponse,
  PaginatedResponse,
} from '@/types';

/**
 * Transform a joined bookshelf_items + books row into the combined Book type.
 */
function toBook(row: any): Book {
  const book = row.book || {};
  return {
    id: row.id,                                   // bookshelf_items.id
    book_id: row.book_id || book.id,              // books.id
    title: book.title ?? row.title,
    author: book.author ?? row.author,
    image_url: book.image_url ?? row.image_url ?? null,
    isbn: book.isbn ?? row.isbn ?? null,
    uploaded_by_user_id: book.uploaded_by_user_id ?? row.uploaded_by_user_id,
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
        const { data: newBook, error: bookError } = await supabase
          .from(TABLES.BOOKS)
          .insert({
            title: input.title,
            author: input.author,
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

      // Get the current max position on this shelf
      const { data: existingItems } = await supabase
        .from(TABLES.BOOKSHELF_ITEMS)
        .select('position')
        .eq('shelf_id', input.shelf_id)
        .order('position', { ascending: false })
        .limit(1);

      const nextPosition =
        existingItems && existingItems.length > 0
          ? existingItems[0].position + 1
          : 0;

      // Create the bookshelf_item linking the book to the shelf
      const { data: item, error: itemError } = await supabase
        .from(TABLES.BOOKSHELF_ITEMS)
        .insert({
          book_id: bookId,
          shelf_id: input.shelf_id,
          position: input.position ?? nextPosition,
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
   * Update an existing book.
   * Routes fields to the correct table:
   *   - title, author, image_url, isbn → books table (global)
   *   - review, rating, position, shelf_id, stack fields → bookshelf_items table (per-user)
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

      // Global book fields
      if (updates.title !== undefined) bookUpdates.title = updates.title;
      if (updates.author !== undefined) bookUpdates.author = updates.author;
      if (updates.image_url !== undefined) bookUpdates.image_url = updates.image_url;
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
        // First get the book_id from the bookshelf_item
        const { data: itemRow, error: fetchError } = await supabase
          .from(TABLES.BOOKSHELF_ITEMS)
          .select('book_id')
          .eq('id', id)
          .single();

        if (fetchError) throw fetchError;

        bookUpdates.updated_at = new Date().toISOString();
        const { error: bookError } = await supabase
          .from(TABLES.BOOKS)
          .update(bookUpdates)
          .eq('id', itemRow.book_id);

        if (bookError) throw bookError;
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
      const updates = orderedIds.map((id, index) =>
        supabase
          .from(TABLES.BOOKSHELF_ITEMS)
          .update({ position: index })
          .eq('id', id)
          .eq('shelf_id', shelfId)
      );

      await Promise.all(updates);

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
        `,
          { count: 'exact' }
        )
        .eq('is_community', true)
        .not('image_url', 'is', null);

      if (searchQuery) {
        query = query.or(
          `title.ilike.%${searchQuery}%,author.ilike.%${searchQuery}%`
        );
      }

      const from = page * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to).order('created_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) throw error;

      const communityBooks: CommunityBookSpine[] = (data || []).map(
        (book: any) => ({
          id: book.id,
          title: book.title,
          author: book.author,
          image_url: book.image_url,
          uploaded_by_user_id: book.uploaded_by_user_id,
          uploader_name: book.users?.name || null,
          times_added: 0,
          created_at: book.created_at,
        })
      );

      return {
        data: {
          data: communityBooks,
          count: count || 0,
          page,
          pageSize,
          hasMore: (count || 0) > (page + 1) * pageSize,
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
        image_url: communityBook.image_url,
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
