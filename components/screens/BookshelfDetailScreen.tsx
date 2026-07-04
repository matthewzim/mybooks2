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

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, router, Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useBookshelves } from '@/hooks/useBookshelves';
import { useBooks } from '@/hooks/useBooks';
import { EditableBookshelfGrid } from '@/components/EditableBookshelfGrid';
import { BookDetailModal } from '@/components/BookDetailModal';
import { BookshelfEditModal } from '@/components/BookshelfEditModal';
import { BrowseBooksModal } from '@/components/BrowseBooksModal';
import { LoadingView, EmptyState } from '@/components/ui';
import { Spacing, Typography, BorderRadius, Shadows, getSerifFontFamily, serifItalicStyle } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { Book, Bookshelf, ShelfStyle, UpdateBookshelfInput } from '@/types';

export default function BookshelfDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { getBookshelf, updateBookshelf, deleteBookshelf } = useBookshelves();
  const { books, isLoading: booksLoading, fetchBooks, deleteBook, reorderBooks, updateBook, stackBookOnTop, unstackBook } = useBooks(id || '');
  const [bookshelf, setBookshelf] = useState<Bookshelf | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isBookModalVisible, setIsBookModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isBrowseModalVisible, setIsBrowseModalVisible] = useState(false);

  /**
   * Fetch bookshelf data
   */
  const loadBookshelf = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    try {
      const result = await getBookshelf(id);
      if (result) {
        // Ensure shelf_style has a default for pre-migration data
        setBookshelf({ ...result, shelf_style: result.shelf_style || 'full' });
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

  // Refetch books when the screen regains focus so books added via the
  // scan and add-book screens appear immediately on return. useBooks already
  // fetches on mount, so skip the first focus to avoid a duplicate request.
  const hasFocusedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedRef.current) {
        hasFocusedRef.current = true;
        return;
      }
      fetchBooks();
    }, [fetchBooks])
  );

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
        onPress: () => setIsBrowseModalVisible(true),
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
              cover_color: updates.cover_color ?? prev.cover_color,
              is_public: updates.is_public ?? prev.is_public,
              shelf_style: updates.shelf_style ?? prev.shelf_style,
            }
          : null
      );
      return true;
    }
    return false;
  };

  /**
   * Delete this bookshelf (from the edit modal) after confirmation
   */
  const handleDeleteBookshelf = () => {
    if (!id || !bookshelf) return;

    Alert.alert(
      'Delete Bookshelf',
      `Are you sure you want to delete "${bookshelf.name}"? This will also delete all books on this shelf.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const success = await deleteBookshelf(id);
            if (success) {
              setIsEditModalVisible(false);
              router.back();
            } else {
              Alert.alert('Error', 'Failed to delete bookshelf. Please try again.');
            }
          },
        },
      ]
    );
  };

  /**
   * Toggle edit mode for drag-and-drop reordering
   */
  const toggleEditMode = () => {
    setIsEditMode((prev) => !prev);
  };

  /**
   * Toggle shelf display style between 'bottom' and 'full'
   */
  const handleToggleShelfStyle = useCallback(
    async (style: ShelfStyle) => {
      if (!id || !bookshelf || bookshelf.shelf_style === style) return;

      // Update local state immediately
      setBookshelf((prev) => (prev ? { ...prev, shelf_style: style } : null));

      // Persist to database
      await updateBookshelf(id, { shelf_style: style });
    },
    [id, bookshelf, updateBookshelf]
  );

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

  const isOwner = Boolean(user?.id && bookshelf.user_id === user.id);

  return (
    <>
      {/* Dynamic header title */}
      <Stack.Screen
        options={{
          title: bookshelf.name,
          headerTitleAlign: 'center',
          headerTitleStyle: {
            fontFamily: getSerifFontFamily('medium'),
            fontSize: 18,
            color: colors.text,
          },
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.headerButton,
                { backgroundColor: colors.card, borderColor: colors.border },
                pressed && { opacity: 0.8 },
              ]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={18} color={colors.text} />
            </Pressable>
          ),
          headerRight: () =>
            isOwner ? (
              <View style={styles.headerButtons}>
                <Pressable
                  onPress={toggleEditMode}
                  style={({ pressed }) => [
                    styles.headerButton,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    isEditMode && { backgroundColor: colors.primary, borderColor: colors.primary },
                    pressed && { opacity: 0.8 },
                  ]}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={isEditMode ? 'Finish reordering books' : 'Reorder books'}
                >
                  <Ionicons
                    name={isEditMode ? 'checkmark' : 'swap-horizontal'}
                    size={18}
                    color={isEditMode ? colors.textInverse : colors.text}
                  />
                </Pressable>
                <Pressable
                  onPress={handleEditBookshelf}
                  style={({ pressed }) => [
                    styles.headerButton,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    pressed && { opacity: 0.8 },
                  ]}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Edit bookshelf"
                >
                  <Ionicons name="pencil" size={16} color={colors.text} />
                </Pressable>
              </View>
            ) : undefined,
        }}
      />

      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right', 'bottom']}>
        {/* Bookshelf Stats */}
        <View style={[styles.statsContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{books.length}</Text>
          </View>
          {!isEditMode && Boolean(bookshelf.description) && (
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          )}
          {isEditMode ? (
            <View style={styles.editModeControls}>
              <View style={[styles.editModeIndicator, { backgroundColor: colors.backgroundDark }]}>
                <Ionicons name="information-circle" size={16} color={colors.primary} />
                <Text style={[styles.editModeText, { color: colors.primary }]}>
                  Drag to reorder. Long-press to stack flat. Drop stacked books on each other to pile.
                </Text>
              </View>
              <View style={[styles.shelfStyleToggle, { backgroundColor: colors.backgroundDark }]}>
                <Text style={[styles.shelfStyleLabel, { color: colors.textSecondary }]}>Shelf:</Text>
                <Pressable
                  onPress={() => handleToggleShelfStyle('bottom')}
                  style={[
                    styles.shelfStyleOption,
                    { borderColor: colors.border },
                    bookshelf.shelf_style === 'bottom' && { backgroundColor: colors.primary },
                  ]}
                >
                  <Ionicons
                    name="remove-outline"
                    size={14}
                    color={bookshelf.shelf_style === 'bottom' ? colors.textInverse : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.shelfStyleOptionText,
                      { color: bookshelf.shelf_style === 'bottom' ? colors.textInverse : colors.textSecondary },
                    ]}
                  >
                    Bottom Line
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleToggleShelfStyle('full')}
                  style={[
                    styles.shelfStyleOption,
                    { borderColor: colors.border },
                    bookshelf.shelf_style === 'full' && { backgroundColor: colors.primary },
                  ]}
                >
                  <Ionicons
                    name="square-outline"
                    size={14}
                    color={bookshelf.shelf_style === 'full' ? colors.textInverse : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.shelfStyleOptionText,
                      { color: bookshelf.shelf_style === 'full' ? colors.textInverse : colors.textSecondary },
                    ]}
                  >
                    Full Shelf
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
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
          onAddBook={isOwner ? handleAddBook : undefined}
          isLoading={booksLoading}
          isEditing={isOwner ? isEditMode : false}
          shelfStyle={bookshelf.shelf_style}
          shelfColor={bookshelf.cover_color}
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
          readOnly={!isOwner}
        />

        {/* Bookshelf Edit Modal */}
        <BookshelfEditModal
          visible={isEditModalVisible}
          bookshelf={bookshelf}
          onClose={() => setIsEditModalVisible(false)}
          onSave={handleSaveBookshelf}
          onDelete={handleDeleteBookshelf}
        />

        {/* Browse Community Books Modal */}
        <BrowseBooksModal
          visible={isBrowseModalVisible}
          shelfId={id || ''}
          onClose={() => setIsBrowseModalVisible(false)}
          onBookAdded={fetchBooks}
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
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    ...Shadows.sm,
  },
  stat: {
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  statValue: {
    fontSize: 26,
    fontFamily: getSerifFontFamily('medium'),
  },
  statDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: Spacing.xs,
    marginRight: Spacing.md,
  },
  description: {
    flex: 1,
    fontSize: 15,
    ...serifItalicStyle,
  },
  editModeControls: {
    flex: 1,
    gap: Spacing.xs,
  },
  editModeIndicator: {
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
  shelfStyleToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: 4,
    gap: Spacing.xs,
  },
  shelfStyleLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
  },
  shelfStyleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    gap: 3,
  },
  shelfStyleOptionText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.medium,
  },
});
