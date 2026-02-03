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
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { DraggableBookSpine } from './DraggableBookSpine';
import { BookSpine } from './BookSpine';
import { VerticalBookStack } from './VerticalBookStack';
import {
  Spacing,
  BookSpine as BookSpineConstants,
  BookshelfDimensions,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { getSpineImageUrl } from '@/services/storage';
import type { Book } from '@/types';

interface EditableBookshelfGridProps {
  books: Book[];
  onBookPress: (book: Book) => void;
  onAddBook: () => void;
  isLoading?: boolean;
  isEditing: boolean;
  onReorderBooks: (orderedIds: string[]) => Promise<boolean>;
  onToggleBookStack: (book: Book) => Promise<void>;
  onStackBooks?: (bookId: string, targetBookId: string) => Promise<boolean>;
  onUnstackBook?: (book: Book) => Promise<boolean>;
}

// Number of books per row
const BOOKS_PER_ROW = 5;

// Vertical offset between books in a stack
const STACK_OFFSET = 4;

// Type for shelf items - can be a book, a vertical stack, or "add" button
type ShelfItem = Book | Book[] | 'add';

// Track which row each item belongs to, accounting for stacked books taking more width
interface LayoutItem {
  item: ShelfItem;
  width: number;
  height: number;
  isStacked: boolean;
  isVerticalStack: boolean;
}

export function EditableBookshelfGrid({
  books,
  onBookPress,
  onAddBook,
  isLoading = false,
  isEditing,
  onReorderBooks,
  onToggleBookStack,
  onStackBooks,
  onUnstackBook,
}: EditableBookshelfGridProps) {
  const { colors } = useTheme();
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

  // Group books by stack_id and organize into layout items
  const processedItems = useMemo(() => {
    const stackGroups = new Map<string, Book[]>();
    const standaloneBooks: Book[] = [];

    // Group books by stack_id
    localBooks.forEach((book) => {
      if (book.stack_id) {
        const existing = stackGroups.get(book.stack_id) || [];
        existing.push(book);
        stackGroups.set(book.stack_id, existing);
      } else {
        standaloneBooks.push(book);
      }
    });

    // Sort books within each stack by stack_position
    stackGroups.forEach((stackBooks, stackId) => {
      stackBooks.sort((a, b) => (a.stack_position || 0) - (b.stack_position || 0));
    });

    // Build layout items based on position order
    const items: { position: number; layoutItem: LayoutItem }[] = [];
    const processedStackIds = new Set<string>();

    localBooks.forEach((book) => {
      if (book.stack_id) {
        // Only process each stack once (using the lowest position book in the stack)
        if (processedStackIds.has(book.stack_id)) return;
        processedStackIds.add(book.stack_id);

        const stackBooks = stackGroups.get(book.stack_id)!;
        const stackHeight = bookWidth + (stackBooks.length - 1) * STACK_OFFSET;

        items.push({
          position: Math.min(...stackBooks.map((b) => b.position)),
          layoutItem: {
            item: stackBooks,
            width: bookHeight, // Stacked books use height as width
            height: stackHeight,
            isStacked: true,
            isVerticalStack: true,
          },
        });
      } else {
        // Standalone book
        const isStacked = book.is_stacked || false;
        items.push({
          position: book.position,
          layoutItem: {
            item: book,
            width: isStacked ? bookHeight : bookWidth,
            height: isStacked ? bookWidth : bookHeight,
            isStacked,
            isVerticalStack: false,
          },
        });
      }
    });

    // Sort by position
    items.sort((a, b) => a.position - b.position);

    return items.map((i) => i.layoutItem);
  }, [localBooks, bookWidth, bookHeight]);

  // Group processed items into rows
  const rows = useMemo(() => {
    const result: LayoutItem[][] = [];
    let currentRow: LayoutItem[] = [];
    let currentRowWidth = 0;

    // Add items (books and stacks)
    processedItems.forEach((layoutItem) => {
      // Check if this item fits in the current row
      if (currentRowWidth + layoutItem.width > availableWidth && currentRow.length > 0) {
        result.push(currentRow);
        currentRow = [];
        currentRowWidth = 0;
      }

      currentRow.push(layoutItem);
      currentRowWidth += layoutItem.width;
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
        height: bookHeight,
        isStacked: false,
        isVerticalStack: false,
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
  }, [processedItems, bookWidth, bookHeight, availableWidth, isEditing]);

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
      let maxHeight = bookHeight;
      row.forEach((item) => {
        maxHeight = Math.max(maxHeight, item.height);
      });
      return maxHeight;
    },
    [bookHeight]
  );

  // Handle unstacking a book from a vertical stack
  const handleUnstackBook = useCallback(
    async (book: Book) => {
      if (onUnstackBook) {
        await onUnstackBook(book);
      }
    },
    [onUnstackBook]
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading books...</Text>
      </View>
    );
  }

  // Flatten books for index calculation in edit mode
  let flatIndex = 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
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
              {row.map((layoutItem, itemIndex) => {
                // Handle "add" button
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

                // Handle vertical stack (array of books)
                if (layoutItem.isVerticalStack && Array.isArray(layoutItem.item)) {
                  const stackBooks = layoutItem.item;
                  const stackKey = stackBooks[0].stack_id || stackBooks[0].id;

                  return (
                    <View key={stackKey} style={styles.bookWrapper}>
                      <VerticalBookStack
                        books={stackBooks}
                        stackWidth={bookHeight}
                        stackHeight={bookWidth}
                        onBookPress={onBookPress}
                        isEditing={isEditing}
                        onUnstackBook={handleUnstackBook}
                      />
                    </View>
                  );
                }

                // Handle single book
                const book = layoutItem.item as Book;
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
  const { colors } = useTheme();
  const spineImageUrl = getSpineImageUrl(book.image_url);
  const hasValidUrl = Boolean(spineImageUrl);
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
          <Image
            source={{ uri: spineImageUrl! }}
            style={[styles.stackedImage, { transform: [{ rotate: '-90deg' }] }]}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        </View>
      ) : (
        <View style={[styles.stackedPlaceholder, { backgroundColor }]}>
          <Text style={[styles.stackedTitle, { color: colors.textOnDark }]} numberOfLines={1}>
            {book.title}
          </Text>
        </View>
      )}
      {/* Top edge effect */}
      <View style={[styles.stackedTopEdge, { backgroundColor: colors.overlayLight }]} />
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
  const { colors } = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.addButton,
        { width, height, backgroundColor: colors.backgroundDark, borderColor: colors.border },
        pressed && { backgroundColor: colors.border, opacity: 0.8 },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add a new book"
    >
      <Ionicons name="add" size={32} color={colors.primary} />
      <Text style={[styles.addButtonText, { color: colors.primary }]}>Add Book</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  stackedImage: {
    width: '100%',
    height: '100%',
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
  },
  // Add button styles
  addButton: {
    borderRadius: 4,
    borderWidth: 2,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: Spacing.xs,
  },
  bottomPadding: {
    height: 100,
  },
});

export default EditableBookshelfGrid;
