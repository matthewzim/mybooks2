/**
 * useBooks Hook
 *
 * Custom hook for managing books on a bookshelf.
 * Handles fetching, creating, updating, and deleting books.
 *
 * Usage:
 * const { books, isLoading, addBook, deleteBook } = useBooks(shelfId);
 */

import { useState, useEffect, useCallback } from 'react';
import { booksService } from '@/services/books';
import { bookshelvesService } from '@/services/bookshelves';
import { widgetManager } from '@/utils';
import type { Book, CreateBookInput, UpdateBookInput, LoadingState } from '@/types';

interface UseBooksReturn {
  books: Book[];
  isLoading: boolean;
  error: string | null;
  loadingState: LoadingState;
  // CRUD operations
  fetchBooks: () => Promise<void>;
  addBook: (input: CreateBookInput) => Promise<Book | null>;
  updateBook: (id: string, updates: UpdateBookInput) => Promise<Book | null>;
  deleteBook: (id: string) => Promise<boolean>;
  // Utility operations
  moveBook: (bookId: string, newShelfId: string) => Promise<boolean>;
  reorderBooks: (orderedIds: string[]) => Promise<boolean>;
  // Stack operations
  stackBookOnTop: (bookId: string, targetBookId: string) => Promise<boolean>;
  unstackBook: (bookId: string) => Promise<boolean>;
}

export function useBooks(shelfId: string): UseBooksReturn {
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');


  const syncWidgetShelf = useCallback(async (targetShelfId: string) => {
    const shelfResult = await bookshelvesService.getBookshelfById(targetShelfId);
    if (shelfResult.data) {
      await widgetManager.syncLibrarySnapshot([shelfResult.data]);
    }
    widgetManager.reloadWidgetTimelines();
  }, []);

  /**
   * Fetch all books on the shelf
   */
  const fetchBooks = useCallback(async () => {
    if (!shelfId) return;

    setLoadingState('loading');
    setIsLoading(true);
    setError(null);

    try {
      const result = await booksService.getBooksByShelf(shelfId);

      if (result.error) {
        setError(result.error.message);
        setLoadingState('error');
      } else {
        setBooks(result.data || []);
        setLoadingState('success');
      }
    } catch (err) {
      setError('Failed to fetch books');
      setLoadingState('error');
    } finally {
      setIsLoading(false);
    }
  }, [shelfId]);

  /**
   * Add a new book to the shelf
   */
  const addBook = useCallback(
    async (input: CreateBookInput): Promise<Book | null> => {
      try {
        const result = await booksService.createBook({
          ...input,
          shelf_id: shelfId,
        });

        if (result.error) {
          setError(result.error.message);
          return null;
        }

        if (result.data) {
          // Add new book to local state
          setBooks((prev) => [...prev, result.data!]);
          await syncWidgetShelf(shelfId);
          return result.data;
        }

        return null;
      } catch (err) {
        setError('Failed to add book');
        return null;
      }
    },
    [shelfId, syncWidgetShelf]
  );

  /**
   * Update an existing book
   */
  const updateBook = useCallback(
    async (id: string, updates: UpdateBookInput): Promise<Book | null> => {
      try {
        const result = await booksService.updateBook(id, updates);

        if (result.error) {
          setError(result.error.message);
          return null;
        }

        if (result.data) {
          // Update book in local state
          setBooks((prev) =>
            prev.map((book) => (book.id === id ? result.data! : book))
          );
          await syncWidgetShelf(updates.shelf_id || shelfId);
          return result.data;
        }

        return null;
      } catch (err) {
        setError('Failed to update book');
        return null;
      }
    },
    [shelfId, syncWidgetShelf]
  );

  /**
   * Delete a book
   */
  const deleteBook = useCallback(async (id: string): Promise<boolean> => {
    try {
      const result = await booksService.deleteBook(id);

      if (result.error) {
        setError(result.error.message);
        return false;
      }

      // Remove book from local state
      setBooks((prev) => prev.filter((book) => book.id !== id));
      await syncWidgetShelf(shelfId);
      return true;
    } catch (err) {
      setError('Failed to delete book');
      return false;
    }
  }, [shelfId, syncWidgetShelf]);

  /**
   * Move a book to a different shelf
   */
  const moveBook = useCallback(
    async (bookId: string, newShelfId: string): Promise<boolean> => {
      try {
        const result = await booksService.moveBookToShelf(bookId, newShelfId);

        if (result.error) {
          setError(result.error.message);
          return false;
        }

        // Remove book from current shelf's local state
        setBooks((prev) => prev.filter((book) => book.id !== bookId));
        await syncWidgetShelf(shelfId);
        await syncWidgetShelf(newShelfId);
        return true;
      } catch (err) {
        setError('Failed to move book');
        return false;
      }
    },
    [shelfId, syncWidgetShelf]
  );

  /**
   * Reorder books on the shelf
   */
  const reorderBooks = useCallback(
    async (orderedIds: string[]): Promise<boolean> => {
      try {
        // Optimistically update local state with corrected position values
        const reorderedBooks = orderedIds
          .map((id, index) => {
            const book = books.find((b) => b.id === id);
            return book ? { ...book, position: index } : undefined;
          })
          .filter((book): book is Book => book !== undefined);

        setBooks(reorderedBooks);

        const result = await booksService.reorderBooks(shelfId, orderedIds);

        if (result.error) {
          // Revert on error
          fetchBooks();
          setError(result.error.message);
          return false;
        }

        await syncWidgetShelf(shelfId);
        return true;
      } catch (err) {
        fetchBooks();
        setError('Failed to reorder books');
        return false;
      }
    },
    [shelfId, books, fetchBooks, syncWidgetShelf]
  );

  /**
   * Stack a book on top of another book (vertical stacking)
   */
  const stackBookOnTop = useCallback(
    async (bookId: string, targetBookId: string): Promise<boolean> => {
      try {
        const result = await booksService.stackBookOnTop(bookId, targetBookId);

        if (result.error) {
          setError(result.error.message);
          return false;
        }

        // Refresh books to get updated stack state
        await fetchBooks();
        await syncWidgetShelf(shelfId);
        return true;
      } catch (err) {
        setError('Failed to stack book');
        return false;
      }
    },
    [fetchBooks, shelfId, syncWidgetShelf]
  );

  /**
   * Remove a book from its stack
   */
  const unstackBook = useCallback(
    async (bookId: string): Promise<boolean> => {
      try {
        const result = await booksService.unstackBook(bookId);

        if (result.error) {
          setError(result.error.message);
          return false;
        }

        // Refresh books to get updated stack state
        await fetchBooks();
        await syncWidgetShelf(shelfId);
        return true;
      } catch (err) {
        setError('Failed to unstack book');
        return false;
      }
    },
    [fetchBooks, shelfId, syncWidgetShelf]
  );

  // Fetch books when shelfId changes
  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  return {
    books,
    isLoading,
    error,
    loadingState,
    fetchBooks,
    addBook,
    updateBook,
    deleteBook,
    moveBook,
    reorderBooks,
    stackBookOnTop,
    unstackBook,
  };
}

export default useBooks;
