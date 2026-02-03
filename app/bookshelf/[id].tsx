/**
 * Bookshelf Detail Screen
 *
 * Displays all books on a specific bookshelf.
 * Features:
 * - Grid of book spines on shelf rows
 * - Add book button (camera or manual)
 * - Edit bookshelf name
 * - Edit mode for drag-and-drop reordering
 * - Rotate books to stack them flat
 * - Dynamic expansion as books are added
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBookshelves } from '@/hooks/useBookshelves';
import { useBooks } from '@/hooks/useBooks';
import { EditableBookshelfGrid } from '@/components/EditableBookshelfGrid';
import { BookDetailModal } from '@/components/BookDetailModal';
import { BookshelfEditModal } from '@/components/BookshelfEditModal';
import { LoadingView, EmptyState } from '@/components/ui';
import { Spacing, Typography, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { Book, Bookshelf, UpdateBookshelfInput } from '@/types';

export default function BookshelfDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getBookshelf, updateBookshelf } = useBookshelves();
  const { books, isLoading: booksLoading, fetchBooks, deleteBook, reorderBooks, updateBook, stackBookOnTop, unstackBook } = useBooks(id || '');
  const [bookshelf, setBookshelf] = useState<Bookshelf | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isBookModalVisible, setIsBookModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);

  /**
   * Fetch bookshelf data
   */
  const loadBookshelf = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    try {
      const result = await getBookshelf(id);
      if (result) {
        setBookshelf(result);
      }
    } catch (error) {
      console.error('Failed to load bookshelf:', error);
    } finally {
      setIsLoading(false);
    }
  }, [id, getBookshelf]);

  useEffect(() => {
    loadBookshelf();
  }, [loadBookshelf]);

  /**
   * Open book detail modal
   */
  const handleBookPress = (book: Book) => {
    setSelectedBook(book);
    setIsBookModalVisible(true);
  };

  /**
   * Close book detail modal
   */
  const handleCloseBookModal = () => {
    setIsBookModalVisible(false);
    // Small delay before clearing selected book to allow close animation
    setTimeout(() => setSelectedBook(null), 400);
  };

  /**
   * Handle book updated from modal
   */
  const handleBookUpdated = (updatedBook: Book) => {
    setSelectedBook(updatedBook);
    fetchBooks(); // Refresh the books list
  };

  /**
   * Handle book deleted from modal
   */
  const handleBookDeleted = (bookId: string) => {
    fetchBooks(); // Refresh the books list
  };

  /**
   * Show add book options
   */
  const handleAddBook = () => {
    Alert.alert('Add Book', 'How would you like to add a book?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Scan Book Spine',
        onPress: () => router.push({ pathname: '/scan', params: { shelfId: id } }),
      },
      {
        text: 'Add Manually',
        onPress: () => router.push({ pathname: '/add-book', params: { shelfId: id } }),
      },
      {
        text: 'Browse Community',
        onPress: () => router.push('/(tabs)/community'),
      },
    ]);
  };

  /**
   * Open edit bookshelf modal
   */
  const handleEditBookshelf = () => {
    setIsEditModalVisible(true);
  };

  /**
   * Handle bookshelf update from edit modal
   */
  const handleSaveBookshelf = async (updates: UpdateBookshelfInput): Promise<boolean> => {
    if (!id) return false;

    const result = await updateBookshelf(id, updates);
    if (result) {
      setBookshelf((prev) =>
        prev
          ? {
              ...prev,
              name: updates.name ?? prev.name,
              description: updates.description ?? prev.description,
              is_public: updates.is_public ?? prev.is_public,
            }
          : null
      );
      return true;
    }
    return false;
  };

  /**
   * Toggle edit mode for drag-and-drop reordering
   */
  const toggleEditMode = () => {
    setIsEditMode((prev) => !prev);
  };

  /**
   * Handle book reordering via drag-and-drop
   */
  const handleReorderBooks = useCallback(
    async (orderedIds: string[]): Promise<boolean> => {
      return reorderBooks(orderedIds);
    },
    [reorderBooks]
  );

  /**
   * Toggle book stacked state (rotate 90 degrees to lay flat)
   */
  const handleToggleBookStack = useCallback(
    async (book: Book): Promise<void> => {
      const newStackedState = !book.is_stacked;
      await updateBook(book.id, { is_stacked: newStackedState });
    },
    [updateBook]
  );

  /**
   * Stack a book on top of another book (vertical stacking)
   */
  const handleStackBooks = useCallback(
    async (bookId: string, targetBookId: string): Promise<boolean> => {
      return stackBookOnTop(bookId, targetBookId);
    },
    [stackBookOnTop]
  );

  /**
   * Remove a book from its vertical stack
   */
  const handleUnstackBook = useCallback(
    async (book: Book): Promise<boolean> => {
      return unstackBook(book.id);
    },
    [unstackBook]
  );

  // Loading state
  if (isLoading) {
    return <LoadingView message="Loading bookshelf..." />;
  }

  // Error state
  if (!bookshelf) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="alert-circle-outline"
          title="Bookshelf Not Found"
          description="This bookshelf may have been deleted."
          actionLabel="Go Back"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return (
    <>
      {/* Dynamic header title */}
      <Stack.Screen
        options={{
          title: bookshelf.name,
          headerRight: () => (
            <View style={styles.headerButtons}>
              <Pressable
                onPress={toggleEditMode}
                style={[styles.headerButton, isEditMode && { backgroundColor: colors.overlayWhiteLight, borderRadius: 4 }]}
                hitSlop={8}
              >
                <Ionicons
                  name={isEditMode ? 'checkmark' : 'swap-horizontal'}
                  size={20}
                  color={colors.textInverse}
                />
              </Pressable>
              <Pressable
                onPress={handleEditBookshelf}
                style={styles.headerButton}
                hitSlop={8}
              >
                <Ionicons name="pencil" size={20} color={colors.textInverse} />
              </Pressable>
            </View>
          ),
        }}
      />

      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right', 'bottom']}>
        {/* Bookshelf Stats */}
        <View style={[styles.statsContainer, { borderBottomColor: colors.border }]}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{books.length}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {books.length === 1 ? 'Book' : 'Books'}
            </Text>
          </View>
          {isEditMode ? (
            <View style={[styles.editModeIndicator, { backgroundColor: colors.backgroundDark }]}>
              <Ionicons name="information-circle" size={16} color={colors.primary} />
              <Text style={[styles.editModeText, { color: colors.primary }]}>
                Drag to reorder. Long-press to stack flat. Drop stacked books on each other to pile.
              </Text>
            </View>
          ) : (
            <>
              <View style={[styles.privacyBadge, { backgroundColor: colors.backgroundDark }]}>
                <Ionicons
                  name={bookshelf.is_public ? 'globe-outline' : 'lock-closed-outline'}
                  size={14}
                  color={bookshelf.is_public ? colors.success : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.privacyBadgeText,
                    { color: colors.textSecondary },
                    bookshelf.is_public && { color: colors.success },
                  ]}
                >
                  {bookshelf.is_public ? 'Public' : 'Private'}
                </Text>
              </View>
              {bookshelf.description && (
                <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
                  {bookshelf.description}
                </Text>
              )}
            </>
          )}
        </View>

        {/* Books Grid */}
        <EditableBookshelfGrid
          books={books}
          onBookPress={handleBookPress}
          onAddBook={handleAddBook}
          isLoading={booksLoading}
          isEditing={isEditMode}
          onReorderBooks={handleReorderBooks}
          onToggleBookStack={handleToggleBookStack}
          onStackBooks={handleStackBooks}
          onUnstackBook={handleUnstackBook}
        />

        {/* Book Detail Modal */}
        <BookDetailModal
          visible={isBookModalVisible}
          book={selectedBook}
          onClose={handleCloseBookModal}
          onBookUpdated={handleBookUpdated}
          onBookDeleted={handleBookDeleted}
        />

        {/* Bookshelf Edit Modal */}
        <BookshelfEditModal
          visible={isEditModalVisible}
          bookshelf={bookshelf}
          onClose={() => setIsEditModalVisible(false)}
          onSave={handleSaveBookshelf}
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerButton: {
    padding: Spacing.xs,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stat: {
    alignItems: 'center',
    marginRight: Spacing.lg,
  },
  statValue: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
  },
  statLabel: {
    fontSize: Typography.sizes.sm,
  },
  description: {
    flex: 1,
    fontSize: Typography.sizes.md,
    fontStyle: 'italic',
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginRight: Spacing.sm,
  },
  privacyBadgeText: {
    fontSize: Typography.sizes.sm,
    marginLeft: 4,
  },
  editModeIndicator: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: 4,
  },
  editModeText: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    marginLeft: Spacing.xs,
  },
});
