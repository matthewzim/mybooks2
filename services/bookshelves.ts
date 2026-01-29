/**
 * Bookshelves Service
 *
 * Handles all CRUD operations for bookshelves:
 * - Create, read, update, delete bookshelves
 * - Manage bookshelf positions
 * - Get bookshelves with their books
 *
 * Usage:
 * import { bookshelvesService } from '@/services/bookshelves';
 * const { data, error } = await bookshelvesService.getUserBookshelves();
 */

import { supabase, TABLES, handleSupabaseError } from './supabase';
import type {
  Bookshelf,
  Book,
  CreateBookshelfInput,
  UpdateBookshelfInput,
  ApiResponse,
} from '@/types';

/**
 * Bookshelves Service Class
 * Provides methods for managing user bookshelves
 */
class BookshelvesService {
  /**
   * Get all bookshelves for the current user
   * Ordered by position for consistent display
   *
   * @returns Array of user's bookshelves
   */
  async getUserBookshelves(): Promise<ApiResponse<Bookshelf[]>> {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) {
        throw new Error('Not authenticated');
      }

      // Query bookshelves for the current user, ordered by position
      const { data, error } = await supabase
        .from(TABLES.BOOKSHELVES)
        .select('*')
        .eq('user_id', session.session.user.id)
        .order('position', { ascending: true });

      if (error) throw error;

      return { data: data as Bookshelf[], error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Get a single bookshelf by ID
   * Includes all books on the shelf
   *
   * @param id - Bookshelf ID
   * @returns Bookshelf with books
   */
  async getBookshelfById(
    id: string
  ): Promise<ApiResponse<Bookshelf & { books: Book[] }>> {
    try {
      // Fetch the bookshelf with its books using a join
      const { data, error } = await supabase
        .from(TABLES.BOOKSHELVES)
        .select(
          `
          *,
          books:books(*)
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      // Sort books by position
      const bookshelf = data as Bookshelf & { books: Book[] };
      bookshelf.books = bookshelf.books.sort((a, b) => a.position - b.position);

      return { data: bookshelf, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Get bookshelves with preview books (for home screen)
   * Returns first 3 books for each shelf as preview
   *
   * @returns Bookshelves with preview books
   */
  async getBookshelvesWithPreviews(): Promise<
    ApiResponse<(Bookshelf & { books: Book[] })[]>
  > {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) {
        throw new Error('Not authenticated');
      }

      // Get bookshelves with all their books
      const { data, error } = await supabase
        .from(TABLES.BOOKSHELVES)
        .select(
          `
          *,
          books:books(*)
        `
        )
        .eq('user_id', session.session.user.id)
        .order('position', { ascending: true });

      if (error) throw error;

      // Limit books to first 3 for preview and sort by position
      const shelves = (data as (Bookshelf & { books: Book[] })[]).map(
        (shelf) => ({
          ...shelf,
          books: shelf.books
            .sort((a, b) => a.position - b.position)
            .slice(0, 3),
        })
      );

      return { data: shelves, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Create a new bookshelf
   *
   * @param input - Bookshelf name and optional settings
   * @returns Created bookshelf
   */
  async createBookshelf(
    input: CreateBookshelfInput
  ): Promise<ApiResponse<Bookshelf>> {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) {
        throw new Error('Not authenticated');
      }

      // Get the current max position to add new shelf at the end
      const { data: existingShelves } = await supabase
        .from(TABLES.BOOKSHELVES)
        .select('position')
        .eq('user_id', session.session.user.id)
        .order('position', { ascending: false })
        .limit(1);

      const nextPosition =
        existingShelves && existingShelves.length > 0
          ? existingShelves[0].position + 1
          : 0;

      // Insert the new bookshelf
      const { data, error } = await supabase
        .from(TABLES.BOOKSHELVES)
        .insert({
          user_id: session.session.user.id,
          name: input.name,
          description: input.description || null,
          cover_color: input.cover_color || '#8B4513', // Default wood color
          is_public: input.is_public || false,
          position: nextPosition,
        })
        .select()
        .single();

      if (error) throw error;

      return { data: data as Bookshelf, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Update an existing bookshelf
   *
   * @param id - Bookshelf ID
   * @param updates - Fields to update
   * @returns Updated bookshelf
   */
  async updateBookshelf(
    id: string,
    updates: UpdateBookshelfInput
  ): Promise<ApiResponse<Bookshelf>> {
    try {
      const { data, error } = await supabase
        .from(TABLES.BOOKSHELVES)
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return { data: data as Bookshelf, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Delete a bookshelf and all its books
   * Uses cascade delete in database
   *
   * @param id - Bookshelf ID to delete
   */
  async deleteBookshelf(id: string): Promise<ApiResponse<null>> {
    try {
      // First delete all books on this shelf
      // Note: You could also set up cascade delete in Supabase
      await supabase.from(TABLES.BOOKS).delete().eq('shelf_id', id);

      // Then delete the bookshelf
      const { error } = await supabase
        .from(TABLES.BOOKSHELVES)
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
   * Reorder bookshelves
   * Updates position values for all affected shelves
   *
   * @param orderedIds - Array of bookshelf IDs in new order
   */
  async reorderBookshelves(orderedIds: string[]): Promise<ApiResponse<null>> {
    try {
      // Update each bookshelf's position based on array index
      const updates = orderedIds.map((id, index) =>
        supabase
          .from(TABLES.BOOKSHELVES)
          .update({ position: index })
          .eq('id', id)
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
   * Get the count of user's bookshelves
   * Useful for checking premium limits
   */
  async getBookshelfCount(): Promise<ApiResponse<number>> {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) {
        throw new Error('Not authenticated');
      }

      const { count, error } = await supabase
        .from(TABLES.BOOKSHELVES)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.session.user.id);

      if (error) throw error;

      return { data: count || 0, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Get public bookshelves from other users for the Explore page
   * Returns bookshelves with their first 5 books (top row preview)
   *
   * @param page - Page number for pagination (0-indexed)
   * @param pageSize - Number of items per page
   * @returns Paginated list of public bookshelves with owner info and books
   */
  async getPublicBookshelves(
    page: number = 0,
    pageSize: number = 10
  ): Promise<
    ApiResponse<{
      data: (Bookshelf & { books: Book[]; owner_name: string | null })[];
      hasMore: boolean;
      page: number;
      pageSize: number;
    }>
  > {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) {
        throw new Error('Not authenticated');
      }

      const currentUserId = session.session.user.id;
      const offset = page * pageSize;

      // Fetch public bookshelves from other users with their books and owner info
      const { data, error, count } = await supabase
        .from(TABLES.BOOKSHELVES)
        .select(
          `
          *,
          books:books(*),
          users:user_id(name)
        `,
          { count: 'exact' }
        )
        .eq('is_public', true)
        .neq('user_id', currentUserId)
        .order('updated_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error) throw error;

      // Transform the data to include owner_name and limit books to first 5
      const transformedData = (data || []).map((shelf: any) => ({
        ...shelf,
        owner_name: shelf.users?.name || 'Anonymous',
        books: (shelf.books || [])
          .sort((a: Book, b: Book) => a.position - b.position)
          .slice(0, 5), // Only first 5 books for top row preview
        users: undefined, // Remove the users object from the response
      }));

      const totalCount = count || 0;
      const hasMore = offset + pageSize < totalCount;

      return {
        data: {
          data: transformedData,
          hasMore,
          page,
          pageSize,
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
}

// Export a singleton instance
export const bookshelvesService = new BookshelvesService();

export default bookshelvesService;
