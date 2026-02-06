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
 * - Variable-width book spines based on natural image dimensions
 * - No gaps between adjacent book spines
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Text,
  ActivityIndicator,
  useWindowDimensions,
  Image as RNImage,
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
import { useSpineImageUrl } from '@/hooks/useSpineImageUrl';
import { getSpineImageUrl } from '@/services/storage';
import type { Book, ShelfStyle } from '@/types';

interface EditableBookshelfGridProps {
  books: Book[];
  onBookPress: (book: Book) => void;
  onAddBook: () => void;
  isLoading?: boolean;
  isEditing: boolean;
  shelfStyle?: ShelfStyle;
  onReorderBooks: (orderedIds: string[]) => Promise<boolean>;
  onToggleBookStack: (book: Book) => Promise<void>;
  onStackBooks?: (bookId: string, targetBookId: string) => Promise<boolean>;
  onUnstackBook?: (book: Book) => Promise<boolean>;
}

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
  bookIndex?: number; // index into localBooks for single books
}

// Position of each book on the grid (for drag calculations)
export interface BookPosition {
  x: number;
  y: number;
  width: number;
  rowIndex: number;
}

export function EditableBookshelfGrid({
  books,
  onBookPress,
  onAddBook,
  isLoading = false,
  isEditing,
  shelfStyle = 'full',
  onReorderBooks,
  onToggleBookStack,
  onStackBooks,
  onUnstackBook,
}: EditableBookshelfGridProps) {
  const { colors } = useTheme();
  const fullShelfBorderWidth = BookshelfDimensions.shelfThickness / 2;
  const { width: screenWidth } = useWindowDimensions();
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [localBooks, setLocalBooks] = useState<Book[]>(books);

  // Track natural image dimensions for each book: bookId -> { width, height }
  const [imageDimensions, setImageDimensions] = useState<
    Record<string, { width: number; height: number }>
  >({});

  // Sync local state with prop changes (when not dragging)
  React.useEffect(() => {
    if (draggingIndex === null) {
      setLocalBooks(books);
    }
  }, [books, draggingIndex]);

  // Fetch natural image dimensions for all books with images
  useEffect(() => {
    let cancelled = false;

    localBooks.forEach((book) => {
      if (book.image_url && !imageDimensions[book.id]) {
        getSpineImageUrl(book.image_url).then((url) => {
          if (cancelled || !url) return;
          RNImage.getSize(
            url,
            (w, h) => {
              if (!cancelled) {
                setImageDimensions((prev) => ({
                  ...prev,
                  [book.id]: { width: w, height: h },
                }));
              }
            },
            () => {
              // getSize failed — leave dimensions unknown, will use default width
            }
          );
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [localBooks]);

  // Calculate shelf height (fixed for all shelves)
  const availableWidth = screenWidth - Spacing.md * 2;
  const shelfHeight = Math.min(
    BookSpineConstants.maxHeight,
    Math.floor(((availableWidth / 5) * 3.6))
  );

  // Compute display width for a single book based on its natural image dimensions
  const getBookDisplayWidth = useCallback(
    (book: Book): number => {
      const dims = imageDimensions[book.id];
      if (dims) {
        const aspectRatio = dims.width / dims.height;
        const naturalWidth = Math.round(shelfHeight * aspectRatio);
        return Math.max(
          BookSpineConstants.minWidth,
          Math.min(BookSpineConstants.maxWidth, naturalWidth)
        );
      }
      return BookSpineConstants.width; // default 50px while loading or for placeholders
    },
    [imageDimensions, shelfHeight]
  );

  // Group books by stack_id and organize into layout items with proper widths
  const processedItems = useMemo(() => {
    const stackGroups = new Map<string, Book[]>();

    // Group books by stack_id
    localBooks.forEach((book) => {
      if (book.stack_id) {
        const existing = stackGroups.get(book.stack_id) || [];
        existing.push(book);
        stackGroups.set(book.stack_id, existing);
      }
    });

    // Sort books within each stack by stack_position
    stackGroups.forEach((stackBooks) => {
      stackBooks.sort(
        (a, b) => (a.stack_position || 0) - (b.stack_position || 0)
      );
    });

    // Build layout items based on position order
    const items: { position: number; layoutItem: LayoutItem }[] = [];
    const processedStackIds = new Set<string>();
    let flatIdx = 0;

    localBooks.forEach((book) => {
      if (book.stack_id) {
        if (processedStackIds.has(book.stack_id)) return;
        processedStackIds.add(book.stack_id);

        const stackBooks = stackGroups.get(book.stack_id)!;
        const stackedBookWidth = getBookDisplayWidth(stackBooks[0]);
        const stackDisplayHeight =
          stackedBookWidth + (stackBooks.length - 1) * STACK_OFFSET;

        items.push({
          position: Math.min(...stackBooks.map((b) => b.position)),
          layoutItem: {
            item: stackBooks,
            width: shelfHeight, // Stacked books use height as width (rotated)
            height: stackDisplayHeight,
            isStacked: true,
            isVerticalStack: true,
          },
        });
      } else {
        const isStacked = book.is_stacked || false;
        const bookW = getBookDisplayWidth(book);
        items.push({
          position: book.position,
          layoutItem: {
            item: book,
            width: isStacked ? shelfHeight : bookW,
            height: isStacked ? bookW : shelfHeight,
            isStacked,
            isVerticalStack: false,
            bookIndex: flatIdx,
          },
        });
        flatIdx++;
      }
    });

    // Sort by position
    items.sort((a, b) => a.position - b.position);

    return items.map((i) => i.layoutItem);
  }, [localBooks, shelfHeight, getBookDisplayWidth]);

  // Compute flat book positions for drag-and-drop (only non-stacked, non-vertical-stack books)
  const bookPositions = useMemo(() => {
    const positions: BookPosition[] = [];
    let currentX = 0;
    let currentRowIndex = 0;
    let currentRowWidth = 0;

    // We need to walk through processedItems and track positions for single books
    processedItems.forEach((layoutItem) => {
      if (currentRowWidth + layoutItem.width > availableWidth && currentRowWidth > 0) {
        currentRowIndex++;
        currentX = 0;
        currentRowWidth = 0;
      }

      if (!layoutItem.isVerticalStack && layoutItem.item !== 'add') {
        const book = layoutItem.item as Book;
        if (!book.is_stacked) {
          positions.push({
            x: currentX,
            y: currentRowIndex * (shelfHeight + Spacing.lg),
            width: layoutItem.width,
            rowIndex: currentRowIndex,
          });
        }
      }

      currentX += layoutItem.width;
      currentRowWidth += layoutItem.width;
    });

    return positions;
  }, [processedItems, availableWidth, shelfHeight]);

  // Group processed items into rows
  const rows = useMemo(() => {
    const result: LayoutItem[][] = [];
    let currentRow: LayoutItem[] = [];
    let currentRowWidth = 0;

    processedItems.forEach((layoutItem) => {
      if (
        currentRowWidth + layoutItem.width > availableWidth &&
        currentRow.length > 0
      ) {
        result.push(currentRow);
        currentRow = [];
        currentRowWidth = 0;
      }

      currentRow.push(layoutItem);
      currentRowWidth += layoutItem.width;
    });

    // Add the "add" button
    if (!isEditing) {
      const addButtonWidth = BookSpineConstants.width;
      if (
        currentRowWidth + addButtonWidth > availableWidth &&
        currentRow.length > 0
      ) {
        result.push(currentRow);
        currentRow = [];
      }
      currentRow.push({
        item: 'add' as const,
        width: addButtonWidth,
        height: shelfHeight,
        isStacked: false,
        isVerticalStack: false,
      });
    }

    if (currentRow.length > 0) {
      result.push(currentRow);
    }

    // Ensure minimum 3 rows
    while (result.length < BookshelfDimensions.minRows) {
      result.push([]);
    }

    return result;
  }, [processedItems, availableWidth, shelfHeight, isEditing]);

  // Handle drag start
  const handleDragStart = useCallback((index: number) => {
    setDraggingIndex(index);
  }, []);

  // Handle drag move
  const handleDragMove = useCallback(
    (_index: number, _translationX: number, _translationY: number) => {
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
      let maxHeight = shelfHeight;
      row.forEach((item) => {
        maxHeight = Math.max(maxHeight, item.height);
      });
      return maxHeight;
    },
    [shelfHeight]
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
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Loading books...
        </Text>
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
          <View
            key={rowIndex}
            style={[
              styles.shelfContainer,
              shelfStyle === 'full' && {
                borderWidth: fullShelfBorderWidth,
                borderColor: BookshelfDimensions.shelfColor,
                borderRadius: 4,
              },
            ]}
          >
            {/* Shelf back - only shown in 'full' style */}
            {shelfStyle === 'full' && (
              <View
                style={[
                  styles.shelfBack,
                  {
                    height: rowHeight + 20,
                    left: fullShelfBorderWidth,
                    right: fullShelfBorderWidth,
                    bottom: fullShelfBorderWidth,
                  },
                ]}
              />
            )}

            {/* Books row - no gaps between spines */}
            <View style={[styles.booksRow, { minHeight: rowHeight }]}>
              {row.map((layoutItem, itemIndex) => {
                // Handle "add" button
                if (layoutItem.item === 'add') {
                  return (
                    <AddBookButton
                      key="add-button"
                      width={BookSpineConstants.width}
                      height={shelfHeight}
                      onPress={onAddBook}
                    />
                  );
                }

                // Handle vertical stack (array of books)
                if (
                  layoutItem.isVerticalStack &&
                  Array.isArray(layoutItem.item)
                ) {
                  const stackBooks = layoutItem.item;
                  const stackKey =
                    stackBooks[0].stack_id || stackBooks[0].id;
                  const stackBookWidth = getBookDisplayWidth(stackBooks[0]);

                  return (
                    <View key={stackKey}>
                      <VerticalBookStack
                        books={stackBooks}
                        stackWidth={shelfHeight}
                        stackHeight={stackBookWidth}
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
                const bookW = layoutItem.width;

                if (isEditing) {
                  return (
                    <DraggableBookSpine
                      key={book.id}
                      book={book}
                      index={currentIndex}
                      width={bookW}
                      height={shelfHeight}
                      isEditing={isEditing}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDragMove={handleDragMove}
                      onToggleStack={handleToggleStack}
                      bookPositions={bookPositions}
                      totalBooks={localBooks.filter((b) => !b.stack_id && !b.is_stacked).length}
                    />
                  );
                }

                return (
                  <View key={book.id}>
                    {book.is_stacked ? (
                      <StackedBookSpine
                        book={book}
                        onPress={onBookPress}
                        width={shelfHeight}
                        height={bookW}
                      />
                    ) : (
                      <BookSpine
                        book={book}
                        onPress={onBookPress}
                        width={bookW}
                        height={shelfHeight}
                      />
                    )}
                  </View>
                );
              })}
            </View>

            {/* Shelf surface - only shown in 'bottom' style (full style uses border instead) */}
            {shelfStyle === 'bottom' && <View style={styles.shelfSurface} />}
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

function StackedBookSpine({
  book,
  onPress,
  width,
  height,
}: StackedBookSpineProps) {
  const { colors } = useTheme();
  const spineImageUrl = useSpineImageUrl(book.image_url);
  const hasValidUrl = Boolean(spineImageUrl);
  const backgroundColor = getBookColor(book.title);

  return (
    <Pressable
      style={({ pressed }) => [
        hasValidUrl ? styles.stackedBookImage : styles.stackedBook,
        { width, height },
        pressed && styles.pressed,
      ]}
      onPress={() => onPress(book)}
      accessibilityRole="button"
      accessibilityLabel={`${book.title} by ${book.author} (stacked)`}
    >
      {hasValidUrl ? (
        <View style={styles.stackedImageContainer}>
          {/* For stacked books, we show the spine rotated */}
          <Image
            source={{ uri: spineImageUrl! }}
            style={{
              width: height,
              height: width,
              transform: [{ rotate: '-90deg' }],
            }}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        </View>
      ) : (
        <View style={[styles.stackedPlaceholder, { backgroundColor }]}>
          <Text
            style={[styles.stackedTitle, { color: colors.textOnDark }]}
            numberOfLines={1}
          >
            {book.title}
          </Text>
        </View>
      )}
      {/* Top edge effect - only for placeholder */}
      {!hasValidUrl && (
        <View
          style={[
            styles.stackedTopEdge,
            { backgroundColor: colors.overlayLight },
          ]}
        />
      )}
    </Pressable>
  );
}

/**
 * Get a consistent color for a book based on its title
 */
function getBookColor(title: string): string {
  const bookColors = BookSpineConstants.colors;
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return bookColors[Math.abs(hash) % bookColors.length];
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
        {
          width,
          height,
          backgroundColor: colors.backgroundDark,
          borderColor: colors.border,
        },
        pressed && { backgroundColor: colors.border, opacity: 0.8 },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add a new book"
    >
      <Ionicons name="add" size={32} color={colors.primary} />
      <Text style={[styles.addButtonText, { color: colors.primary }]}>
        Add Book
      </Text>
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
    backgroundColor: BookshelfDimensions.backColor,
    borderRadius: 2,
  },
  booksRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    zIndex: 1,
    flexWrap: 'nowrap',
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
  stackedBookImage: {
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  stackedImageContainer: {
    flex: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
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
