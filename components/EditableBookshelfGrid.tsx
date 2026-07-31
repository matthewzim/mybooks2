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
import { LinearGradient } from 'expo-linear-gradient';
import { DraggableBookSpine } from './DraggableBookSpine';
import { BookSpine } from './BookSpine';
import { VerticalBookStack } from './VerticalBookStack';
import {
  Spacing,
  BorderRadius,
  BookSpine as BookSpineConstants,
  BookshelfDimensions,
  Wood,
  FIXED_GEOMETRY_MAX_FONT_SCALE,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useSpineImageUrl } from '@/hooks/useSpineImageUrl';
import { getSpineImageUrl } from '@/services/storage';
import { getShelfColors, type ShelfColors } from '@/utils/shelfColors';
import { getSpineCloth } from '@/utils/spineCloth';
import {
  getPlaceholderSpineSize,
  getImageSpineHeightFactor,
  getImageSpineSize,
} from '@/utils/placeholderSpine';
import type { Book, ShelfStyle } from '@/types';

interface EditableBookshelfGridProps {
  books: Book[];
  onBookPress: (book: Book) => void;
  onAddBook?: () => void;
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

  // Books already queued for measurement. Tracked in a ref because
  // `imageDimensions` is captured stale here (it is deliberately not a
  // dependency), so reading it cannot tell us what is already in flight.
  const measureRequestedRef = React.useRef(new Set<string>());

  // Fetch natural image dimensions for all books with images
  useEffect(() => {
    let cancelled = false;

    localBooks.forEach((book) => {
      if (book.image_url && !measureRequestedRef.current.has(book.id)) {
        measureRequestedRef.current.add(book.id);
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
  // Full style: subtract cabinet margins, frame padding, and the 1px cabinet border on each side
  const availableWidth = shelfStyle === 'full'
    ? screenWidth - (fullShelfMargin * 2) - (fullShelfBorderWidth * 2) - 2
    : screenWidth - Spacing.md * 2;
  const shelfHeight = Math.min(
    BookSpineConstants.maxHeight,
    Math.floor(((availableWidth / 5) * 3.6))
  );

  const placeholderHeightRange = useMemo(() => {
    const minHeight = Math.max(BookSpineConstants.minHeight, Math.round(shelfHeight * 0.75));
    return {
      min: Math.min(minHeight, shelfHeight),
      max: shelfHeight,
    };
  }, [shelfHeight]);

  // Compute display height for a single book.
  // First clamp to shelf bounds, then apply deterministic height variability
  // so each spine sits at a slightly different height (matching the preview).
  const minDisplayHeight = Math.round(shelfHeight * 0.6);

  // Books with an image are sized from the image's own aspect ratio, matching
  // the read-only grid so a shelf doesn't reflow when edit mode opens.
  const getBookDisplaySize = useCallback(
    (book: Book): { width: number; height: number } => {
      const dims = imageDimensions[book.id];

      if (!dims) {
        return getPlaceholderSpineSize(
          book,
          { min: BookSpineConstants.minWidth, max: BookSpineConstants.maxWidth },
          placeholderHeightRange
        );
      }

      const heightFactor = getImageSpineHeightFactor(book);
      let clamped: number;
      if (dims.height >= shelfHeight) {
        clamped = shelfHeight;
      } else if (dims.height < minDisplayHeight) {
        clamped = minDisplayHeight;
      } else {
        clamped = dims.height;
      }

      return getImageSpineSize(
        dims.width,
        dims.height,
        clamped * heightFactor,
        { min: BookSpineConstants.minWidth, max: BookSpineConstants.maxWidth },
        { min: minDisplayHeight, max: shelfHeight }
      );
    },
    [imageDimensions, shelfHeight, minDisplayHeight, placeholderHeightRange]
  );

  const getBookDisplayHeight = useCallback(
    (book: Book): number => getBookDisplaySize(book).height,
    [getBookDisplaySize]
  );

  const getBookDisplayWidth = useCallback(
    (book: Book): number => getBookDisplaySize(book).width,
    [getBookDisplaySize]
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
    if (!isEditing && onAddBook) {
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

  const isCabinet = shelfStyle === 'full';

  const renderedRows = rows.map((row, rowIndex) => {
        const rowHeight = getRowHeight(row);

        return (
          <View
            key={rowIndex}
            style={[
              styles.shelfContainer,
              isCabinet && {
                marginBottom: 0,
                paddingHorizontal: fullShelfBorderWidth,
                paddingTop: fullShelfBorderWidth,
                paddingBottom: 0,
              },
            ]}
          >
            {/* Warm lit back panel behind the books - only in 'full' style */}
            {isCabinet && (
              <LinearGradient
                colors={[...shelfColors.backGradient]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={[
                  styles.shelfBack,
                  {
                    left: fullShelfBorderWidth,
                    right: fullShelfBorderWidth,
                    top: fullShelfBorderWidth,
                    bottom: 0,
                  },
                ]}
              />
            )}

            {/* Books row - no gaps between spines. Outside edit mode the row
                clips its children so spine cast shadows stop at the shelf
                line instead of bleeding onto the frame/plank below (matching
                the clipped shelf previews). Edit mode leaves it unclipped so
                dragged books stay visible outside the row. */}
            <View
              style={[
                styles.booksRow,
                { minHeight: rowHeight },
                !isEditing && styles.booksRowClipped,
              ]}
            >
              {row.map((layoutItem, itemIndex) => {
                // Handle "add" button (only added to rows when onAddBook exists)
                if (layoutItem.item === 'add') {
                  return onAddBook ? (
                    <AddBookButton
                      key="add-button"
                      width={BookSpineConstants.width}
                      height={shelfHeight}
                      onPress={onAddBook}
                    />
                  ) : null;
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

            {/* Floating plank only for the open 'bottom' style; cabinet rows
                rest directly on the frame border below them */}
            {!isCabinet && <ShelfPlank shelfColors={shelfColors} />}
          </View>
        );
      });

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      scrollEnabled={!isEditing || draggingIndex === null}
    >
      {isCabinet ? (
        <View
          style={[
            styles.cabinet,
            {
              marginHorizontal: fullShelfMargin,
              borderColor: shelfColors.frameEdge,
              // Frame strip under the last row now that rows carry no plank
              paddingBottom: fullShelfBorderWidth,
            },
          ]}
        >
          {/* Cabinet frame behind the rows */}
          <LinearGradient
            colors={[...shelfColors.frameGradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {renderedRows}
        </View>
      ) : (
        renderedRows
      )}

      {/* Bottom spacing */}
      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

/**
 * Shelf plank: wood gradient with a lit top highlight and a drop shadow so
 * books read as sitting on the surface.
 */
function ShelfPlank({ shelfColors }: { shelfColors: ShelfColors }) {
  return (
    <View style={styles.shelfSurface}>
      <LinearGradient
        colors={[...shelfColors.plankGradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.plankHighlight} />
    </View>
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
  const displayTitle = book.title?.trim() || 'Untitled';
  const displayAuthor = book.author?.trim() || 'Unknown Author';
  const cloth = getSpineCloth(displayTitle);
  const backgroundColor = cloth.color;

  return (
    <Pressable
      style={({ pressed }) => [
        hasValidUrl ? styles.stackedBookImage : styles.stackedBook,
        { width, height },
        pressed && styles.pressed,
      ]}
      onPress={() => onPress(book)}
      accessibilityRole="button"
      accessibilityLabel={`${displayTitle} by ${displayAuthor} (stacked)`}
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
            style={[styles.stackedTitle, { color: cloth.titleColor }]}
            numberOfLines={1}
            maxFontSizeMultiplier={FIXED_GEOMETRY_MAX_FONT_SCALE}
          >
            {displayTitle}
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
        {
          width,
          height,
          borderColor: '#FFFFFF',
        },
        pressed && { backgroundColor: 'rgba(255, 255, 255, 0.2)', opacity: 0.9 },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add a new book"
    >
      <Ionicons name="add" size={32} color="#FFFFFF" />
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
  cabinet: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  shelfBack: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  booksRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    zIndex: 1,
    flexWrap: 'nowrap',
  },
  booksRowClipped: {
    overflow: 'hidden',
  },
  shelfSurface: {
    height: BookshelfDimensions.shelfThickness,
    borderRadius: 2,
    marginTop: -2,
    overflow: 'hidden',
    shadowColor: '#4a2f19',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  plankHighlight: {
    height: 1.5,
    backgroundColor: Wood.plankHighlight,
  },
  // Stacked book styles
  stackedBook: {
    borderRadius: 2,
    overflow: 'hidden',
    shadowColor: '#32190a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
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
    borderRadius: 6,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomPadding: {
    height: 100,
  },
});

export default EditableBookshelfGrid;
