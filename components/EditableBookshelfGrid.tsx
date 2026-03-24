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
import { getShelfColors } from '@/utils/shelfColors';
import { getPlaceholderSpineSize } from '@/utils/placeholderSpine';
import type { Book, ShelfStyle } from '@/types';

interface EditableBookshelfGridProps {
  books: Book[];
  onBookPress: (book: Book) => void;
  onAddBook: () => void;
  isLoading?: boolean;
  isEditing: boolean;
  shelfStyle?: ShelfStyle;
  shelfColor?: string;
  onReorderBooks: (orderedIds: string[]) => Promise<boolean>;
  onToggleBookStack: (book: Book) => Promise<void>;
  onStackBooks?: (bookId: string, targetBookId: string) => Promise<boolean>;
  onUnstackBook?: (book: Book) => Promise<boolean>;
}

// No offset — each stacked book sits flush on the previous one

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
  shelfColor,
  onReorderBooks,
  onToggleBookStack,
  onStackBooks,
  onUnstackBook,
}: EditableBookshelfGridProps) {
  const { colors } = useTheme();
  const fullShelfBorderWidth = BookshelfDimensions.shelfThickness;
  const fullShelfMargin = Spacing.xs;
  const { width: screenWidth } = useWindowDimensions();
  const shelfColors = useMemo(() => getShelfColors(shelfColor), [shelfColor]);
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
  const availableWidth = shelfStyle === 'full'
    ? screenWidth - (fullShelfMargin * 2) - (fullShelfBorderWidth * 2)
    : screenWidth - Spacing.md * 2;
  const shelfHeight = Math.min(
    BookSpineConstants.maxHeight,
    Math.floor(((availableWidth / 5) * 3.6))
  );

  const placeholderHeightRange = useMemo(() => {
    const minHeight = Math.max(BookSpineConstants.minHeight, Math.round(shelfHeight * 0.68));
    return {
      min: Math.min(minHeight, shelfHeight),
      max: shelfHeight,
    };
  }, [shelfHeight]);

  // Compute display height for a single book using absolute clamping.
  // Images taller than shelfHeight are scaled down; images shorter than 60% of
  // shelfHeight are scaled up; everything in between is left unchanged.
  const minDisplayHeight = Math.round(shelfHeight * 0.6);

  const getBookDisplayHeight = useCallback(
    (book: Book): number => {
      const dims = imageDimensions[book.id];
      if (dims) {
        if (dims.height >= shelfHeight) {
          return shelfHeight;
        }
        if (dims.height < minDisplayHeight) {
          return minDisplayHeight;
        }
        return dims.height;
      }
      return getPlaceholderSpineSize(
        book,
        { min: BookSpineConstants.minWidth, max: BookSpineConstants.maxWidth },
        placeholderHeightRange
      ).height;
    },
    [imageDimensions, shelfHeight, minDisplayHeight, placeholderHeightRange]
  );

  // Compute display width for a single book based on its natural image dimensions
  const getBookDisplayWidth = useCallback(
    (book: Book): number => {
      const dims = imageDimensions[book.id];
      if (dims) {
        const displayHeight = getBookDisplayHeight(book);
        const aspectRatio = dims.width / dims.height;
        const naturalWidth = Math.round(displayHeight * aspectRatio);
        return Math.max(
          BookSpineConstants.minWidth,
          Math.min(BookSpineConstants.maxWidth, naturalWidth)
        );
      }
      return getPlaceholderSpineSize(
        book,
        { min: BookSpineConstants.minWidth, max: BookSpineConstants.maxWidth },
        placeholderHeightRange
      ).width;
    },
    [imageDimensions, getBookDisplayHeight, placeholderHeightRange]
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
        const stackBookHeight = getBookDisplayHeight(stackBooks[0]);
        const stackDisplayHeight = stackBooks.length * stackedBookWidth;

        items.push({
          position: Math.min(...stackBooks.map((b) => b.position)),
          layoutItem: {
            item: stackBooks,
            width: stackBookHeight, // Stacked books use their height as width (rotated)
            height: stackDisplayHeight,
            isStacked: true,
            isVerticalStack: true,
          },
        });
      } else {
        const isStacked = book.is_stacked || false;
        const bookW = getBookDisplayWidth(book);
        const bookH = getBookDisplayHeight(book);
        items.push({
          position: book.position,
          layoutItem: {
            item: book,
            width: isStacked ? bookH : bookW,
            height: isStacked ? bookW : bookH,
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
  }, [localBooks, shelfHeight, getBookDisplayWidth, getBookDisplayHeight]);

  // Build ordered array of draggable books (single books only, matching flatIndex order)
  const draggableBooks = useMemo(() => {
    return processedItems
      .filter((li) => !li.isVerticalStack && li.item !== 'add')
      .map((li) => li.item as Book);
  }, [processedItems]);

  // Compute positions for all draggable books (for drag-and-drop target calculation)
  const bookPositions = useMemo(() => {
    const positions: BookPosition[] = [];
    let currentX = 0;
    let currentRowIndex = 0;
    let currentRowWidth = 0;

    // Walk through processedItems and track positions for all single books
    processedItems.forEach((layoutItem) => {
      if (currentRowWidth + layoutItem.width > availableWidth && currentRowWidth > 0) {
        currentRowIndex++;
        currentX = 0;
        currentRowWidth = 0;
      }

      if (!layoutItem.isVerticalStack && layoutItem.item !== 'add') {
        positions.push({
          x: currentX,
          y: currentRowIndex * (shelfHeight + (shelfStyle === 'full' ? fullShelfBorderWidth : Spacing.lg)),
          width: layoutItem.width,
          rowIndex: currentRowIndex,
        });
      }

      currentX += layoutItem.width;
      currentRowWidth += layoutItem.width;
    });

    return positions;
  }, [processedItems, availableWidth, shelfHeight, shelfStyle, fullShelfBorderWidth]);

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

      const draggedBook = draggableBooks[fromIndex];
      const targetBook = draggableBooks[toIndex];

      // If both books are stacked (laying flat), create a vertical stack pile
      if (draggedBook?.is_stacked && targetBook?.is_stacked && onStackBooks) {
        const success = await onStackBooks(draggedBook.id, targetBook.id);
        if (success) return;
        // If stacking failed, fall through to regular reorder
      }

      // Reorder within the draggable books array (maps 1:1 with flatIndex)
      const newDraggable = [...draggableBooks];
      const [movedBook] = newDraggable.splice(fromIndex, 1);
      newDraggable.splice(toIndex, 0, movedBook);

      // Rebuild full book list: keep vertical stack books in place,
      // replace single books with the reordered draggable books
      const newBooks: Book[] = [];
      let draggableIdx = 0;

      for (const layoutItem of processedItems) {
        if (layoutItem.isVerticalStack && Array.isArray(layoutItem.item)) {
          newBooks.push(...(layoutItem.item as Book[]));
        } else if (layoutItem.item !== 'add') {
          newBooks.push(newDraggable[draggableIdx++]);
        }
      }

      // Update position fields to match new array order so the
      // processedItems sort keeps the intended sequence.
      const updatedBooks = newBooks.map((book, i) => ({ ...book, position: i }));

      // Update local state immediately for responsiveness
      setLocalBooks(updatedBooks);

      // Persist the new order
      const orderedIds = updatedBooks.map((book) => book.id);
      await onReorderBooks(orderedIds);
    },
    [draggableBooks, processedItems, onReorderBooks, onStackBooks]
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
                borderColor: shelfColors.shelfColor,
                borderRadius: 0,
                marginBottom: 0,
                paddingHorizontal: 0,
                marginHorizontal: fullShelfMargin,
                ...(rowIndex > 0 && { borderTopWidth: 0 }),
              },
            ]}
          >
            {/* Shelf back - only shown in 'full' style */}
            {shelfStyle === 'full' && (
              <View
                style={[styles.shelfBack, { backgroundColor: shelfColors.shelfBackColor }]}
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
                  const stackBookHeight = getBookDisplayHeight(stackBooks[0]);

                  return (
                    <View key={stackKey}>
                      <VerticalBookStack
                        books={stackBooks}
                        stackWidth={stackBookHeight}
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
                // Layout dimensions (pre-swapped for stacked books)
                const layoutW = layoutItem.width;
                const layoutH = layoutItem.height;
                // Upright dimensions (DraggableBookSpine handles stacking internally)
                const uprightW = book.is_stacked ? layoutH : layoutW;
                const uprightH = book.is_stacked ? layoutW : layoutH;

                if (isEditing) {
                  return (
                    <DraggableBookSpine
                      key={book.id}
                      book={book}
                      index={currentIndex}
                      width={uprightW}
                      height={uprightH}
                      isEditing={isEditing}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDragMove={handleDragMove}
                      onToggleStack={handleToggleStack}
                      bookPositions={bookPositions}
                      totalBooks={draggableBooks.length}
                    />
                  );
                }

                return (
                  <View key={book.id}>
                    {book.is_stacked ? (
                      <StackedBookSpine
                        book={book}
                        onPress={onBookPress}
                        width={layoutW}
                        height={layoutH}
                      />
                    ) : (
                      <BookSpine
                        book={book}
                        onPress={onBookPress}
                        width={layoutW}
                        height={layoutH}
                      />
                    )}
                  </View>
                );
              })}
            </View>

            {/* Shelf surface - only shown in 'bottom' style (full style uses border instead) */}
            {shelfStyle === 'bottom' && (
              <View style={[styles.shelfSurface, { backgroundColor: shelfColors.shelfColor }]} />
            )}
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
            contentFit="cover"
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
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: BookshelfDimensions.backColor,
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
    textAlign: 'center',
    width: '100%',
  },
  bottomPadding: {
    height: 100,
  },
});

export default EditableBookshelfGrid;
