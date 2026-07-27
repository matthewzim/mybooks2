/**
 * useBookshelves Hook
 *
 * Custom hook for managing user's bookshelves.
 * Handles fetching, creating, updating, and deleting bookshelves.
 *
 * Usage:
 * const { bookshelves, isLoading, createBookshelf } = useBookshelves();
 */

import { useState, useEffect, useCallback } from 'react';
import { bookshelvesService } from '@/services/bookshelves';
import { widgetManager } from '@/utils';
import type {
  Bookshelf,
  Book,
  CreateBookshelfInput,
  UpdateBookshelfInput,
  LoadingState,
} from '@/types';

interface BookshelfWithBooks extends Bookshelf {
  books: Book[];
}

interface UseBookshelvesReturn {
  bookshelves: BookshelfWithBooks[];
  isLoading: boolean;
  error: string | null;
  loadingState: LoadingState;
  bookshelfCount: number;
  // CRUD operations
  fetchBookshelves: () => Promise<void>;
  getBookshelf: (id: string) => Promise<BookshelfWithBooks | null>;
  createBookshelf: (input: CreateBookshelfInput) => Promise<Bookshelf | null>;
  updateBookshelf: (
    id: string,
    updates: UpdateBookshelfInput
  ) => Promise<Bookshelf | null>;
  deleteBookshelf: (id: string) => Promise<boolean>;
  // Utility operations
  reorderBookshelves: (orderedIds: string[]) => Promise<boolean>;
}

export function useBookshelves(): UseBookshelvesReturn {
  const [bookshelves, setBookshelves] = useState<BookshelfWithBooks[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');

  /**
   * Fetch all bookshelves with preview books
   */
  const fetchBookshelves = useCallback(async () => {
    setLoadingState('loading');
    setIsLoading(true);
    setError(null);

    try {
      const result = await bookshelvesService.getBookshelvesWithPreviews(null);

      if (result.error) {
        setError(result.error.message);
        setLoadingState('error');
      } else {
        const shelves = result.data || [];
        setBookshelves(shelves);

        // Widget gets full shelf snapshots so all widget sizes can render
        // enough spines. Deliberately not awaited: the sync signs spine URLs
        // over the network, and the library list shouldn't wait on widget
        // upkeep to finish rendering. It swallows its own errors.
        void widgetManager.syncLibrarySnapshot(shelves);

        setLoadingState('success');
      }
    } catch (err) {
      setError('Failed to fetch bookshelves');
      setLoadingState('error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Get a single bookshelf with all its books
   */
  const getBookshelf = useCallback(
    async (id: string): Promise<BookshelfWithBooks | null> => {
      try {
        const result = await bookshelvesService.getBookshelfById(id);

        if (result.error) {
          setError(result.error.message);
          return null;
        }

        return result.data || null;
      } catch (err) {
        setError('Failed to fetch bookshelf');
        return null;
      }
    },
    []
  );

  /**
   * Create a new bookshelf
   */
  const createBookshelf = useCallback(
    async (input: CreateBookshelfInput): Promise<Bookshelf | null> => {
      try {
        const result = await bookshelvesService.createBookshelf(input);

        if (result.error) {
          setError(result.error.message);
          return null;
        }

        if (result.data) {
          // Add new bookshelf to local state with empty books array
          setBookshelves((prev) => [...prev, { ...result.data!, books: [] }]);
          return result.data;
        }

        return null;
      } catch (err) {
        setError('Failed to create bookshelf');
        return null;
      }
    },
    []
  );

  /**
   * Update an existing bookshelf
   */
  const updateBookshelf = useCallback(
    async (
      id: string,
      updates: UpdateBookshelfInput
    ): Promise<Bookshelf | null> => {
      try {
        const result = await bookshelvesService.updateBookshelf(id, updates);

        if (result.error) {
          setError(result.error.message);
          return null;
        }

        if (result.data) {
          // Update bookshelf in local state
          setBookshelves((prev) =>
            prev.map((shelf) =>
              shelf.id === id ? { ...shelf, ...result.data! } : shelf
            )
          );
          return result.data;
        }

        return null;
      } catch (err) {
        setError('Failed to update bookshelf');
        return null;
      }
    },
    []
  );

  /**
   * Delete a bookshelf and all its books
   */
  const deleteBookshelf = useCallback(async (id: string): Promise<boolean> => {
    try {
      const result = await bookshelvesService.deleteBookshelf(id);

      if (result.error) {
        setError(result.error.message);
        return false;
      }

      // Remove bookshelf from local state
      setBookshelves((prev) => prev.filter((shelf) => shelf.id !== id));

      // Drop it from the widget snapshot too, so a deleted shelf stops showing
      // up in the widget's shelf picker.
      void widgetManager.removeBookshelfFromWidget(id);

      return true;
    } catch (err) {
      setError('Failed to delete bookshelf');
      return false;
    }
  }, []);

  /**
   * Reorder bookshelves
   */
  const reorderBookshelves = useCallback(
    async (orderedIds: string[]): Promise<boolean> => {
      try {
        // Optimistically update local state
        const reorderedShelves = orderedIds
          .map((id) => bookshelves.find((shelf) => shelf.id === id))
          .filter((shelf): shelf is BookshelfWithBooks => shelf !== undefined);

        setBookshelves(reorderedShelves);

        const result = await bookshelvesService.reorderBookshelves(orderedIds);

        if (result.error) {
          // Revert on error
          fetchBookshelves();
          setError(result.error.message);
          return false;
        }

        return true;
      } catch (err) {
        fetchBookshelves();
        setError('Failed to reorder bookshelves');
        return false;
      }
    },
    [bookshelves, fetchBookshelves]
  );

  // Fetch bookshelves on mount
  useEffect(() => {
    fetchBookshelves();
  }, [fetchBookshelves]);

  return {
    bookshelves,
    isLoading,
    error,
    loadingState,
    bookshelfCount: bookshelves.length,
    fetchBookshelves,
    getBookshelf,
    createBookshelf,
    updateBookshelf,
    deleteBookshelf,
    reorderBookshelves,
  };
}

export default useBookshelves;
