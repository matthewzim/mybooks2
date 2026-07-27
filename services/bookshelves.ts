/**
 * Bookshelves Service
 *
 * Handles all CRUD operations for bookshelves:
 * - Create, read, update, delete bookshelves
 * - Manage bookshelf positions
 * - Get bookshelves with their books (via bookshelf_items join)
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
  BOOKSHELF_COLORS,
} from '@/types';

/**
 * Transform a bookshelf_items row (with nested book) into the combined Book type.
 */
function itemToBook(item: any): Book {
  const book = item.book || {};
  return {
    id: item.id,
    book_id: item.book_id || book.id,
    title: book.title ?? '',
    author: book.author ?? '',
    image_url: book.image_url ?? null,
    cover_image_url: book.cover_image_url ?? null,
    isbn: book.isbn ?? null,
    uploaded_by_user_id: book.uploaded_by_user_id ?? '',
    is_community: book.is_community ?? false,
    shelf_id: item.shelf_id,
    position: item.position,
    review: item.review ?? null,
    rating: item.rating ?? null,
    is_stacked: item.is_stacked ?? false,
    stack_id: item.stack_id ?? null,
    stack_position: item.stack_position ?? 0,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

/**
 * Transform a raw shelf row (with nested bookshelf_items) into Bookshelf & { books: Book[] }
 */
function shelfWithBooks(raw: any): Bookshelf & { books: Book[] } {
  const items = raw.bookshelf_items || [];
  const books: Book[] = items
    .map(itemToBook)
    .sort((a: Book, b: Book) => a.position - b.position);

  const { bookshelf_items: _, ...shelfData } = raw;
  return { ...shelfData, books };
}

/**
 * Bookshelves Service Class
 * Provides methods for managing user bookshelves
 */
class BookshelvesService {

  private shuffleArray<T>(items: T[]): T[] {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

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
   * Includes all books on the shelf (joined via bookshelf_items → books)
   *
   * @param id - Bookshelf ID
   * @returns Bookshelf with books
   */
  async getBookshelfById(
    id: string
  ): Promise<ApiResponse<Bookshelf & { books: Book[] }>> {
    try {
      const { data, error } = await supabase
        .from(TABLES.BOOKSHELVES)
        .select(
          `
          *,
          bookshelf_items(*, book:books(*))
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return { data: shelfWithBooks(data), error: null };
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
  async getBookshelvesWithPreviews(
    previewLimit: number | null = 3
  ): Promise<ApiResponse<(Bookshelf & { books: Book[] })[]>> {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) {
        throw new Error('Not authenticated');
      }

      // Get bookshelves with their bookshelf_items and nested book data
      const { data, error } = await supabase
        .from(TABLES.BOOKSHELVES)
        .select(
          `
          *,
          bookshelf_items(*, book:books(*))
        `
        )
        .eq('user_id', session.session.user.id)
        .order('position', { ascending: true });

      if (error) throw error;

      // Transform and limit preview books when requested
      const shelves = (data || []).map((raw: any) => {
        const shelf = shelfWithBooks(raw);
        return {
          ...shelf,
          books:
            previewLimit === null ? shelf.books : shelf.books.slice(0, previewLimit),
        };
      });

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
          shelf_style: input.shelf_style || 'full',
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
   * Delete a bookshelf and all its bookshelf_items.
   * Global book records are preserved (other users may still reference them).
   * bookshelf_items cascade-delete via FK, but we explicitly delete for safety.
   *
   * @param id - Bookshelf ID to delete
   */
  async deleteBookshelf(id: string): Promise<ApiResponse<null>> {
    try {
      // Delete all bookshelf_items on this shelf
      await supabase.from(TABLES.BOOKSHELF_ITEMS).delete().eq('shelf_id', id);

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
   * Get a user's public bookshelves by user ID
   * Used for viewing another user's public library
   *
   * @param userId - The user ID to fetch public bookshelves for
   * @returns Array of public bookshelves with preview books and user info
   */
  async getPublicBookshelvesForUser(
    userId: string
  ): Promise<ApiResponse<{ user: { id: string; name: string | null; public_username: string | null }; bookshelves: (Bookshelf & { books: Book[] })[] }>> {
    try {
      // First, attempt to get the user by id
      const { data: userById, error: userByIdError } = await supabase
        .from(TABLES.USERS)
        .select('id, name, public_username')
        .eq('id', userId)
        .maybeSingle();

      if (userByIdError) throw userByIdError;

      // Also support route params that contain public usernames instead of UUIDs
      let resolvedUser =
        (userById as { id: string; name: string | null; public_username: string | null } | null) ||
        null;

      if (!resolvedUser) {
        const { data: userByUsername, error: userByUsernameError } = await supabase
          .from(TABLES.USERS)
          .select('id, name, public_username')
          .eq('public_username', userId)
          .maybeSingle();

        if (userByUsernameError) throw userByUsernameError;
        resolvedUser =
          (userByUsername as { id: string; name: string | null; public_username: string | null } | null) ||
          null;
      }

      const targetUserId = resolvedUser?.id || userId;

      // Get public bookshelves for this user with their books via bookshelf_items
      const { data, error } = await supabase
        .from(TABLES.BOOKSHELVES)
        .select(
          `
          *,
          bookshelf_items(*, book:books(*))
        `
        )
        .eq('user_id', targetUserId)
        .eq('is_public', true)
        .order('position', { ascending: true });

      if (error) throw error;

      const shelves = (data || []).map(shelfWithBooks);

      if (!resolvedUser && shelves.length === 0) {
        throw new Error('User not found');
      }

      return {
        data: {
          user: resolvedUser || {
            id: targetUserId,
            name: null,
            public_username: null,
          },
          bookshelves: shelves,
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
   * Search for users by name
   * Returns users with public bookshelves matching the search query
   *
   * @param query - Search query for user name
   * @param limit - Maximum number of results to return
   * @returns Array of matching users
   */
  async searchUsers(
    query: string,
    limit: number = 10
  ): Promise<ApiResponse<{ id: string; name: string | null; public_username: string | null }[]>> {
    try {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) {
        return { data: [], error: null };
      }

      const normalizedUsernameQuery = trimmedQuery.replace(/^@+/, '');
      const escapedQuery = trimmedQuery.replace(/[%_]/g, (char) => `\\${char}`);

      // Get the current user to exclude from search results
      const { data: session } = await supabase.auth.getSession();
      const currentUserId = session.session?.user?.id;

      // Limit results to discoverable users (users that have at least one public shelf)
      const { data: publicShelfOwners, error: publicOwnersError } = await supabase
        .from(TABLES.BOOKSHELVES)
        .select('user_id')
        .eq('is_public', true)
        .limit(300);

      if (publicOwnersError) throw publicOwnersError;

      const ownerIds = [...new Set((publicShelfOwners || []).map((shelf) => shelf.user_id))];
      if (ownerIds.length === 0) {
        return { data: [], error: null };
      }

      // Search users by name or public_username (case-insensitive)
      const searchFilter = normalizedUsernameQuery
        ? `name.ilike.%${escapedQuery}%,public_username.ilike.%${escapedQuery}%,public_username.ilike.${normalizedUsernameQuery}`
        : `name.ilike.%${escapedQuery}%,public_username.ilike.%${escapedQuery}%`;

      let queryBuilder = supabase
        .from(TABLES.USERS)
        .select('id, name, public_username')
        .in('id', ownerIds)
        .or(searchFilter)
        .limit(limit);

      // Exclude current user from results
      if (currentUserId) {
        queryBuilder = queryBuilder.neq('id', currentUserId);
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;

      return { data: data as { id: string; name: string | null; public_username: string | null }[], error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Get a random selection of public bookshelves from other users.
   * Includes bookshelf preview books and basic owner info.
   */
  async getRandomPublicBookshelfPreviews(
    limit: number = 6
  ): Promise<ApiResponse<({ owner: { id: string; name: string | null; public_username: string | null } } & Bookshelf & { books: Book[] })[]>> {
    try {
      // Fetch all public bookshelves (including current user's) for a random assortment
      const { data, error } = await supabase
        .from(TABLES.BOOKSHELVES)
        .select(
          `
          *,
          bookshelf_items(*, book:books(*))
        `
        )
        .eq('is_public', true)
        .limit(60);

      if (error) throw error;

      const shelves = (data || []).map(shelfWithBooks);
      if (shelves.length === 0) {
        return { data: [], error: null };
      }

      const selectedShelves = this.shuffleArray(shelves).slice(0, limit);
      const userIds = [...new Set(selectedShelves.map((shelf) => shelf.user_id))];

      const { data: usersData, error: usersError } = await supabase
        .from(TABLES.USERS)
        .select('id, name, public_username')
        .in('id', userIds);

      if (usersError) throw usersError;

      const usersById = new Map((usersData || []).map((user) => [user.id, user]));

      const shelvesWithOwners = selectedShelves.map((shelf) => ({
        ...shelf,
        owner: {
          id: shelf.user_id,
          name: usersById.get(shelf.user_id)?.name || null,
          public_username: usersById.get(shelf.user_id)?.public_username || null,
        },
      }));

      return { data: shelvesWithOwners, error: null };
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
}

// Export a singleton instance
export const bookshelvesService = new BookshelvesService();

export default bookshelvesService;
