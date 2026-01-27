/**
 * Books Service
 *
 * Handles all CRUD operations for books:
 * - Create, read, update, delete books
 * - Manage book positions within shelves
 * - Move books between shelves
 * - Community book operations
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
 * Books Service Class
 * Provides methods for managing books on bookshelves
 */
class BooksService {
  /**
   * Get all books on a specific shelf
   * Ordered by position for correct display
   *
   * @param shelfId - Bookshelf ID
   * @returns Array of books on the shelf
   */
  async getBooksByShelf(shelfId: string): Promise<ApiResponse<Book[]>> {
    try {
      const { data, error } = await supabase
        .from(TABLES.BOOKS)
        .select('*')
        .eq('shelf_id', shelfId)
        .order('position', { ascending: true });

      if (error) throw error;

      return { data: data as Book[], error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Get a single book by ID
   *
   * @param id - Book ID
   * @returns Book details
   */
  async getBookById(id: string): Promise<ApiResponse<Book>> {
    try {
      const { data, error } = await supabase
        .from(TABLES.BOOKS)
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      return { data: data as Book, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Create a new book on a shelf
   *
   * @param input - Book details including title, author, shelf_id
   * @returns Created book
   */
  async createBook(input: CreateBookInput): Promise<ApiResponse<Book>> {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) {
        throw new Error('Not authenticated');
      }

      // Get the current max position on this shelf
      const { data: existingBooks } = await supabase
        .from(TABLES.BOOKS)
        .select('position')
        .eq('shelf_id', input.shelf_id)
        .order('position', { ascending: false })
        .limit(1);

      const nextPosition =
        existingBooks && existingBooks.length > 0
          ? existingBooks[0].position + 1
          : 0;

      // Insert the new book
      const { data, error } = await supabase
        .from(TABLES.BOOKS)
        .insert({
          title: input.title,
          author: input.author,
          image_url: input.image_url || null,
          shelf_id: input.shelf_id,
          position: input.position ?? nextPosition,
          review: input.review || null,
          rating: input.rating || null,
          isbn: input.isbn || null,
          uploaded_by_user_id: session.session.user.id,
          is_community: input.is_community ?? true, // Default to sharing with community
        })
        .select()
        .single();

      if (error) throw error;

      return { data: data as Book, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Update an existing book
   *
   * @param id - Book ID
   * @param updates - Fields to update
   * @returns Updated book
   */
  async updateBook(
    id: string,
    updates: UpdateBookInput
  ): Promise<ApiResponse<Book>> {
    try {
      const { data, error } = await supabase
        .from(TABLES.BOOKS)
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return { data: data as Book, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Delete a book
   *
   * @param id - Book ID to delete
   */
  async deleteBook(id: string): Promise<ApiResponse<null>> {
    try {
      const { error } = await supabase
        .from(TABLES.BOOKS)
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
   * @param bookId - Book ID
   * @param newShelfId - Target shelf ID
   * @param newPosition - Optional position on new shelf
   */
  async moveBookToShelf(
    bookId: string,
    newShelfId: string,
    newPosition?: number
  ): Promise<ApiResponse<Book>> {
    try {
      // Get the position if not provided
      let position = newPosition;
      if (position === undefined) {
        const { data: existingBooks } = await supabase
          .from(TABLES.BOOKS)
          .select('position')
          .eq('shelf_id', newShelfId)
          .order('position', { ascending: false })
          .limit(1);

        position =
          existingBooks && existingBooks.length > 0
            ? existingBooks[0].position + 1
            : 0;
      }

      const { data, error } = await supabase
        .from(TABLES.BOOKS)
        .update({
          shelf_id: newShelfId,
          position: position,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookId)
        .select()
        .single();

      if (error) throw error;

      return { data: data as Book, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Reorder books within a shelf
   * Updates position values for all affected books
   *
   * @param shelfId - Shelf ID
   * @param orderedIds - Array of book IDs in new order
   */
  async reorderBooks(
    shelfId: string,
    orderedIds: string[]
  ): Promise<ApiResponse<null>> {
    try {
      // Update each book's position based on array index
      const updates = orderedIds.map((id, index) =>
        supabase
          .from(TABLES.BOOKS)
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
   * Shows all books marked as community from all users
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
      // Build the query for community books
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

      // Add search filter if provided
      if (searchQuery) {
        query = query.or(
          `title.ilike.%${searchQuery}%,author.ilike.%${searchQuery}%`
        );
      }

      // Add pagination
      const from = page * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to).order('created_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) throw error;

      // Transform the data to match CommunityBookSpine type
      const communityBooks: CommunityBookSpine[] = (data || []).map(
        (book: any) => ({
          id: book.id,
          title: book.title,
          author: book.author,
          image_url: book.image_url,
          uploaded_by_user_id: book.uploaded_by_user_id,
          uploader_name: book.users?.name || null,
          times_added: 0, // Would need a separate counter table for this
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
   * Add a community book to user's shelf
   * Creates a copy of the book on the user's shelf
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
      // Create a copy of the book on the user's shelf
      return this.createBook({
        title: communityBook.title,
        author: communityBook.author,
        image_url: communityBook.image_url,
        shelf_id: shelfId,
        is_community: false, // User's copy is not automatically shared
      });
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Update book review and rating
   *
   * @param id - Book ID
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
}

// Export a singleton instance
export const booksService = new BooksService();

export default booksService;
