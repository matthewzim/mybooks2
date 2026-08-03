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

import {
  supabase,
  TABLES,
  handleSupabaseError,
  ilikeFilter,
  isMissingFunctionError,
} from './supabase';
import type {
  Bookshelf,
  Book,
  CreateBookshelfInput,
  UpdateBookshelfInput,
  ApiResponse,
  BOOKSHELF_COLORS,
} from '@/types';

/**
 * Columns selected when a shelf's books are only being *previewed* (home
 * screen, Explore tab, another user's profile).
 *
 * `bookshelf_items(*, book:books(*))` pulls the full review text for every
 * book on every shelf — the single largest field in the schema and unused by
 * every preview surface. Naming columns instead keeps a library-sized
 * response proportional to what is actually rendered.
 */
const PREVIEW_ITEM_SELECT = `
  id,
  book_id,
  shelf_id,
  position,
  rating,
  is_stacked,
  stack_id,
  stack_position,
  created_at,
  updated_at,
  book:books(
    id,
    title,
    author,
    image_url,
    cover_image_url,
    isbn,
    uploaded_by_user_id,
    is_community
  )
`;

/**
 * Public shelves sampled for the Explore tab carry at most this many books —
 * far more than the single row a preview card renders, but bounded so one
 * user with a 2,000-book shelf can't dominate the response.
 */
const PREVIEW_BOOKS_PER_SHELF = 40;

/**
 * A shelf with a bounded slice of its books plus the true total, so the count
 * badge stays honest even though only `PREVIEW_BOOKS_PER_SHELF` were fetched.
 */
export type PreviewShelf = Bookshelf & { books: Book[]; book_count: number };

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

  /**
   * Fetch the preview books for a set of shelves, one bounded request each.
   *
   * `count: 'exact'` is scoped to the shelf's own rows (an indexed count on
   * `bookshelf_items(shelf_id)`), so the caller gets the true book total for
   * the count badge in the same round trip as the capped preview rows — the
   * cap must not make a 200-book shelf advertise itself as a 40-book one.
   */
  private async fetchPreviewBooks(
    shelfIds: string[]
  ): Promise<Map<string, { books: Book[]; total: number }>> {
    const byShelf = new Map<string, { books: Book[]; total: number }>();
    if (shelfIds.length === 0) return byShelf;

    const results = await Promise.all(
      shelfIds.map((shelfId) =>
        supabase
          .from(TABLES.BOOKSHELF_ITEMS)
          .select(PREVIEW_ITEM_SELECT, { count: 'exact' })
          .eq('shelf_id', shelfId)
          .order('position', { ascending: true })
          .limit(PREVIEW_BOOKS_PER_SHELF)
      )
    );

    results.forEach((result, index) => {
      if (result.error) return;
      const books = (result.data || []).map(itemToBook);
      byShelf.set(shelfIds[index], {
        books,
        total: result.count ?? books.length,
      });
    });

    return byShelf;
  }

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

      // Get bookshelves with their bookshelf_items and nested book data.
      // When a preview limit is given, apply it to the embedded items so the
      // rows are trimmed by Postgres rather than downloaded and sliced here.
      let query = supabase
        .from(TABLES.BOOKSHELVES)
        .select(`*, bookshelf_items(${PREVIEW_ITEM_SELECT})`)
        .eq('user_id', session.session.user.id)
        .order('position', { ascending: true });

      if (previewLimit !== null) {
        query = query
          .order('position', { referencedTable: 'bookshelf_items', ascending: true })
          .limit(previewLimit, { referencedTable: 'bookshelf_items' });
      }

      const { data, error } = await query;

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
          // New shelves are public unless the caller says otherwise, so a
          // shelf is discoverable in Explore without the user having to opt in.
          is_public: input.is_public ?? true,
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
      if (orderedIds.length === 0) {
        return { data: null, error: null };
      }

      // One statement for the whole reorder. The previous version issued one
      // request per shelf and threw the results away, so a partial failure
      // left the stored order silently disagreeing with the screen.
      const { error } = await supabase.rpc('reorder_bookshelves', {
        p_shelf_ids: orderedIds,
      });

      if (error && !isMissingFunctionError(error)) throw error;

      if (error) {
        // RPC not deployed yet — fall back to per-row updates, but surface
        // failures instead of swallowing them.
        const results = await Promise.all(
          orderedIds.map((id, index) =>
            supabase.from(TABLES.BOOKSHELVES).update({ position: index }).eq('id', id)
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
   * Get a user's public bookshelves by user ID
   * Used for viewing another user's public library
   *
   * @param userId - The user ID to fetch public bookshelves for
   * @returns Array of public bookshelves with preview books and user info
   */
  async getPublicBookshelvesForUser(
    userId: string
  ): Promise<ApiResponse<{ user: { id: string; name: string | null; public_username: string | null }; bookshelves: PreviewShelf[] }>> {
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

      // Get this user's public shelves, then their preview books separately.
      // Books are capped per shelf: the profile renders one preview row per
      // shelf, so opening a stranger with a huge library must not become a
      // multi-megabyte download.
      const { data, error } = await supabase
        .from(TABLES.BOOKSHELVES)
        .select('*')
        .eq('user_id', targetUserId)
        .eq('is_public', true)
        .order('position', { ascending: true });

      if (error) throw error;

      const shelfRows = (data || []) as Bookshelf[];
      const booksByShelf = await this.fetchPreviewBooks(shelfRows.map((s) => s.id));

      const shelves = shelfRows.map((shelf) => ({
        ...shelf,
        books: booksByShelf.get(shelf.id)?.books || [],
        book_count: booksByShelf.get(shelf.id)?.total ?? 0,
      }));

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

      // Get the current user to exclude from search results
      const { data: session } = await supabase.auth.getSession();
      const currentUserId = session.session?.user?.id;

      // Match users first, then keep the ones who are discoverable (have at
      // least one public shelf).
      //
      // This used to run the other way around — download up to 300 public
      // shelf rows, then filter users by that id list. That capped
      // discoverability at whichever arbitrary 300 shelves Postgres returned
      // (users beyond them became unsearchable once the corpus grew) and put
      // 300 UUIDs into the request URL. Matching first keeps both queries
      // bounded by `limit` no matter how large the corpus gets.
      const searchClauses = [
        ilikeFilter('name', trimmedQuery),
        ilikeFilter('public_username', trimmedQuery),
      ];
      if (normalizedUsernameQuery) {
        searchClauses.push(ilikeFilter('public_username', normalizedUsernameQuery, 'exact'));
      }

      // Over-fetch a little: some matches will be filtered out for having no
      // public shelf, and we still want to fill `limit` when possible.
      const candidateLimit = Math.min(limit * 5, 100);

      let queryBuilder = supabase
        .from(TABLES.USERS)
        .select('id, name, public_username')
        .or(searchClauses.join(','))
        .limit(candidateLimit);

      // Exclude current user from results
      if (currentUserId) {
        queryBuilder = queryBuilder.neq('id', currentUserId);
      }

      const { data: candidates, error } = await queryBuilder;

      if (error) throw error;

      const candidateIds = (candidates || []).map((candidate) => candidate.id);
      if (candidateIds.length === 0) {
        return { data: [], error: null };
      }

      const { data: publicShelfOwners, error: publicOwnersError } = await supabase
        .from(TABLES.BOOKSHELVES)
        .select('user_id')
        .eq('is_public', true)
        .in('user_id', candidateIds);

      if (publicOwnersError) throw publicOwnersError;

      const discoverable = new Set((publicShelfOwners || []).map((shelf) => shelf.user_id));

      return {
        data: (candidates || [])
          .filter((candidate) => discoverable.has(candidate.id))
          .slice(0, limit),
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
   * Get a random selection of public bookshelves from other users.
   * Includes bookshelf preview books and basic owner info.
   */
  /**
   * Pick `limit` public shelves at random.
   *
   * Prefers a server-side sample; falls back to fetching a bounded window of
   * shelf rows (no books) and shuffling locally when the RPC isn't deployed
   * yet. Either way only shelf rows cross the wire here — the books for the
   * chosen few are fetched separately.
   */
  private async sampleRandomPublicShelves(limit: number): Promise<Bookshelf[]> {
    const { data, error } = await supabase.rpc('random_public_bookshelves', {
      p_limit: limit,
    });

    if (!error) {
      return (data || []) as Bookshelf[];
    }
    if (!isMissingFunctionError(error)) {
      throw error;
    }

    const { data: fallbackData, error: fallbackError } = await supabase
      .from(TABLES.BOOKSHELVES)
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(200);

    if (fallbackError) throw fallbackError;

    return this.shuffleArray((fallbackData || []) as Bookshelf[]).slice(0, limit);
  }

  async getRandomPublicBookshelfPreviews(
    limit: number = 6
  ): Promise<ApiResponse<({ owner: { id: string; name: string | null; public_username: string | null } } & PreviewShelf)[]>> {
    try {
      // Sample the shelves first, then fetch books only for the handful that
      // will actually be rendered.
      //
      // The previous version downloaded 60 public shelves *with every book on
      // every one of them*, shuffled on the phone and displayed 6. At a few
      // hundred users with real libraries that is megabytes of JSON parsed on
      // the main thread every time the Explore tab opens or is pulled to
      // refresh — and because the query had no ORDER BY, it was the same
      // arbitrary 60 shelves every time, so most users were never discoverable.
      const selectedShelves = await this.sampleRandomPublicShelves(limit);
      if (selectedShelves.length === 0) {
        return { data: [], error: null };
      }

      const shelfIds = selectedShelves.map((shelf) => shelf.id);
      const userIds = [...new Set(selectedShelves.map((shelf) => shelf.user_id))];

      // One bounded request per selected shelf: a single flat query would let
      // one huge shelf consume the entire row budget and starve the others.
      const booksByShelf = await this.fetchPreviewBooks(shelfIds);

      const { data: usersData, error: usersError } = await supabase
        .from(TABLES.USERS)
        .select('id, name, public_username')
        .in('id', userIds);

      if (usersError) throw usersError;

      const usersById = new Map((usersData || []).map((user) => [user.id, user]));

      const shelvesWithOwners = selectedShelves.map((shelf) => ({
        ...shelf,
        books: booksByShelf.get(shelf.id)?.books || [],
        book_count: booksByShelf.get(shelf.id)?.total ?? 0,
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
