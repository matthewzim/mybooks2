/**
 * EditableBookshelfGrid Component
 *
 * An enhanced version of BookshelfGrid that supports edit mode.
 * Allows drag-and-drop reordering and rotation of book spines.
 *
 * Features:
 * - Toggle between view and edit modes
 * - Drag-and-drop book reordering
 * - Rotate books 90 degrees to stack flat
 * - Visual feedback during drag operations
 * - Automatic position calculation for stacked books
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Text,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DraggableBookSpine } from './DraggableBookSpine';
import { BookSpine } from './BookSpine';
import {
  Colors,
  Spacing,
  BookSpine as BookSpineConstants,
  BookshelfDimensions,
} from '@/constants/theme';
import type { Book } from '@/types';

interface EditableBookshelfGridProps {
  books: Book[];
  onBookPress: (book: Book) => void;
  onAddBook: () => void;
  isLoading?: boolean;
  isEditing: boolean;
  onReorderBooks: (orderedIds: string[]) => Promise<boolean>;
  onToggleBookStack: (book: Book) => Promise<void>;
}

// Number of books per row
const BOOKS_PER_ROW = 5;

// Type for shelf items - can be a book or "add" button
type ShelfItem = Book | 'add';

// Track which row each item belongs to, accounting for stacked books taking more width
interface LayoutItem {
  item: ShelfItem;
  width: number;
  isStacked: boolean;
}

export function EditableBookshelfGrid({
  books,
  onBookPress,
  onAddBook,
  isLoading = false,
  isEditing,
  onReorderBooks,
  onToggleBookStack,
}: EditableBookshelfGridProps) {
  const { width: screenWidth } = useWindowDimensions();
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [localBooks, setLocalBooks] = useState<Book[]>(books);

  // Sync local state with prop changes (when not dragging)
  React.useEffect(() => {
    if (draggingIndex === null) {
      setLocalBooks(books);
    }
  }, [books, draggingIndex]);

  // Calculate book dimensions based on screen width
  const availableWidth = screenWidth - Spacing.md * 2;
  const bookWidth = Math.floor(availableWidth / BOOKS_PER_ROW);
  const bookHeight = Math.min(
    Math.floor(bookWidth * 3.6),
    BookSpineConstants.maxHeight
  );

  // Calculate positions for drag operations
  const positions = useMemo(() => {
    return localBooks.map((_, index) => {
      const row = Math.floor(index / BOOKS_PER_ROW);
      const col = index % BOOKS_PER_ROW;
      return {
        x: col * bookWidth,
        y: row * bookHeight,
      };
    });
  }, [localBooks, bookWidth, bookHeight]);

  // Group books into rows, accounting for stacked books' different dimensions
  const rows = useMemo(() => {
    const result: LayoutItem[][] = [];
    let currentRow: LayoutItem[] = [];
    let currentRowWidth = 0;

    // Add books
    localBooks.forEach((book) => {
      // Stacked books are rotated, so height becomes width
      const itemWidth = book.is_stacked ? bookHeight : bookWidth;

      // Check if this item fits in the current row
      if (currentRowWidth + itemWidth > availableWidth && currentRow.length > 0) {
        result.push(currentRow);
        currentRow = [];
        currentRowWidth = 0;
      }

      currentRow.push({
        item: book,
        width: itemWidth,
        isStacked: book.is_stacked || false,
      });
      currentRowWidth += itemWidth;
    });

    // Add the "add" button
    if (!isEditing) {
      const addButtonWidth = bookWidth;
      if (currentRowWidth + addButtonWidth > availableWidth && currentRow.length > 0) {
        result.push(currentRow);
        currentRow = [];
      }
      currentRow.push({
        item: 'add' as const,
        width: addButtonWidth,
        isStacked: false,
      });
    }

    // Push the last row if it has items
    if (currentRow.length > 0) {
      result.push(currentRow);
    }

    // Ensure minimum 3 rows
    while (result.length < BookshelfDimensions.minRows) {
      result.push([]);
    }

    return result;
  }, [localBooks, bookWidth, bookHeight, availableWidth, isEditing]);

  // Handle drag start
  const handleDragStart = useCallback((index: number) => {
    setDraggingIndex(index);
  }, []);

  // Handle drag move
  const handleDragMove = useCallback(
    (index: number, translationX: number, translationY: number) => {
      // Could add visual feedback for potential drop position here
    },
    []
  );

  // Handle drag end
  const handleDragEnd = useCallback(
    async (fromIndex: number, toIndex: number) => {
      setDraggingIndex(null);

      if (fromIndex === toIndex) return;

      // Create new order
      const newBooks = [...localBooks];
      const [movedBook] = newBooks.splice(fromIndex, 1);
      newBooks.splice(toIndex, 0, movedBook);

      // Update local state immediately for responsiveness
      setLocalBooks(newBooks);

      // Persist the new order
      const orderedIds = newBooks.map((book) => book.id);
      await onReorderBooks(orderedIds);
    },
    [localBooks, onReorderBooks]
  );

  // Handle stack toggle
  const handleToggleStack = useCallback(
    async (book: Book) => {
      await onToggleBookStack(book);
    },
    [onToggleBookStack]
  );

  // Calculate the max height needed for each row
  const getRowHeight = useCallback(
    (row: LayoutItem[]): number => {
      // Find the maximum height in the row
      // Stacked books use bookWidth as height, regular books use bookHeight
      let maxHeight = bookHeight;
      row.forEach((item) => {
        if (item.item !== 'add' && item.isStacked) {
          // Stacked book height is the bookWidth
          maxHeight = Math.max(maxHeight, bookWidth);
        }
      });
      return maxHeight;
    },
    [bookHeight, bookWidth]
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading books...</Text>
      </View>
    );
  }

  // Flatten books for index calculation in edit mode
  let flatIndex = 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      scrollEnabled={!isEditing || draggingIndex === null}
    >
      {rows.map((row, rowIndex) => {
        const rowHeight = getRowHeight(row);

        return (
          <View key={rowIndex} style={styles.shelfContainer}>
            {/* Shelf back */}
            <View style={[styles.shelfBack, { height: rowHeight + 20 }]} />

            {/* Books row */}
            <View style={[styles.booksRow, { minHeight: rowHeight }]}>
              {row.map((layoutItem, bookIndex) => {
                if (layoutItem.item === 'add') {
                  return (
                    <AddBookButton
                      key="add-button"
                      width={bookWidth}
                      height={bookHeight}
                      onPress={onAddBook}
                    />
                  );
                }

                const book = layoutItem.item;
                const currentIndex = flatIndex++;

                if (isEditing) {
                  return (
                    <DraggableBookSpine
                      key={book.id}
                      book={book}
                      index={currentIndex}
                      width={bookWidth}
                      height={bookHeight}
                      isEditing={isEditing}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDragMove={handleDragMove}
                      onToggleStack={handleToggleStack}
                      positions={positions}
                      totalBooks={localBooks.length}
                      booksPerRow={BOOKS_PER_ROW}
                    />
                  );
                }

                return (
                  <View key={book.id} style={styles.bookWrapper}>
                    {book.is_stacked ? (
                      <StackedBookSpine
                        book={book}
                        onPress={onBookPress}
                        width={bookHeight}
                        height={bookWidth}
                      />
                    ) : (
                      <BookSpine
                        book={book}
                        onPress={onBookPress}
                        width={bookWidth}
                        height={bookHeight}
                      />
                    )}
                  </View>
                );
              })}

              {/* Fill remaining space with empty slots if needed */}
              {!isEditing && row.length > 0 && row.length < BOOKS_PER_ROW && (
                <View style={{ flex: 1 }} />
              )}
            </View>

            {/* Shelf surface */}
            <View style={styles.shelfSurface} />
          </View>
        );
      })}

      {/* Bottom spacing */}
      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

/**
 * Stacked Book Spine Component
 * Displays a book laying flat on the shelf
 */
interface StackedBookSpineProps {
  book: Book;
  onPress: (book: Book) => void;
  width: number;
  height: number;
}

function StackedBookSpine({ book, onPress, width, height }: StackedBookSpineProps) {
  const hasValidUrl = Boolean(book.image_url && book.image_url.startsWith('http'));
  const backgroundColor = getBookColor(book.title);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.stackedBook,
        { width, height },
        pressed && styles.pressed,
      ]}
      onPress={() => onPress(book)}
      accessibilityRole="button"
      accessibilityLabel={`${book.title} by ${book.author} (stacked)`}
    >
      {hasValidUrl ? (
        <View style={[styles.stackedImageContainer, { backgroundColor }]}>
          {/* For stacked books, we show the spine rotated */}
          <View style={styles.stackedImageWrapper}>
            <View style={{ width: height, height: width, transform: [{ rotate: '-90deg' }] }}>
              <View style={{ width: width, height: height, backgroundColor }}>
                {/* Show a portion of the cover */}
              </View>
            </View>
          </View>
        </View>
      ) : (
        <View style={[styles.stackedPlaceholder, { backgroundColor }]}>
          <Text style={styles.stackedTitle} numberOfLines={1}>
            {book.title}
          </Text>
        </View>
      )}
      {/* Top edge effect */}
      <View style={styles.stackedTopEdge} />
    </Pressable>
  );
}

/**
 * Get a consistent color for a book based on its title
 */
function getBookColor(title: string): string {
  const colors = BookSpineConstants.colors;
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Add Book Button Component
 */
interface AddBookButtonProps {
  width: number;
  height: number;
  onPress: () => void;
}

function AddBookButton({ width, height, onPress }: AddBookButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.addButton,
        { width, height },
        pressed && styles.addButtonPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add a new book"
    >
      <Ionicons name="add" size={32} color={Colors.primary} />
      <Text style={styles.addButtonText}>Add Book</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    paddingTop: Spacing.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  loadingText: {
    marginTop: Spacing.md,
    color: Colors.textSecondary,
    fontSize: 14,
  },
  shelfContainer: {
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  shelfBack: {
    position: 'absolute',
    left: Spacing.md - 4,
    right: Spacing.md - 4,
    bottom: BookshelfDimensions.shelfThickness - 4,
    backgroundColor: BookshelfDimensions.backColor,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  booksRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    paddingHorizontal: Spacing.sm,
    zIndex: 1,
    flexWrap: 'nowrap',
  },
  bookWrapper: {
    // Container for individual books
  },
  shelfSurface: {
    height: BookshelfDimensions.shelfThickness,
    backgroundColor: BookshelfDimensions.shelfColor,
    borderRadius: 2,
    marginTop: -2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 4,
  },
  // Stacked book styles
  stackedBook: {
    borderRadius: 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  stackedImageContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  stackedImageWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stackedPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  stackedTitle: {
    color: Colors.textInverse,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  stackedTopEdge: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  // Add button styles
  addButton: {
    backgroundColor: Colors.backgroundDark,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonPressed: {
    backgroundColor: Colors.border,
    opacity: 0.8,
  },
  addButtonText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '500',
    marginTop: Spacing.xs,
  },
  bottomPadding: {
    height: 100,
  },
});

export default EditableBookshelfGrid;
