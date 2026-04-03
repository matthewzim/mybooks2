/**
 * BookshelfGrid Component
 *
 * Displays books on a bookshelf in a vertical scrollable grid.
 * Each row represents a shelf with multiple book spines.
 * Expands dynamically as more books are added.
 *
 * Features:
 * - Variable-width book spines based on natural image dimensions
 * - No gaps between adjacent book spines
 * - Minimum 3 rows, expands as needed
 * - Visual shelf appearance with wood texture
 * - Add book button at the end
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { BookSpine } from './BookSpine';
import {
  Colors,
  Spacing,
  BookSpine as BookSpineConstants,
  BookshelfDimensions,
} from '@/constants/theme';
import { getSpineImageUrl } from '@/services/storage';
import { getImageSpineHeightFactor } from '@/utils/placeholderSpine';
import type { Book, ShelfStyle } from '@/types';

interface BookshelfGridProps {
  books: Book[];
  onBookPress: (book: Book) => void;
  onAddBook: () => void;
  isLoading?: boolean;
  shelfStyle?: ShelfStyle;
}

// Layout item for variable-width packing
interface GridLayoutItem {
  item: Book | 'add';
  width: number;
  height: number;
}

export function BookshelfGrid({
  books,
  onBookPress,
  onAddBook,
  isLoading = false,
  shelfStyle = 'full',
}: BookshelfGridProps) {
  const { width: screenWidth } = useWindowDimensions();

  // Track natural image dimensions for each book: bookId -> { width, height }
  const [imageDimensions, setImageDimensions] = useState<
    Record<string, { width: number; height: number }>
  >({});

  // Calculate shelf layout
  const fullShelfMargin = Spacing.xs;
  const fullShelfBorderWidth = BookshelfDimensions.shelfThickness;
  const availableWidth = shelfStyle === 'full'
    ? screenWidth - (fullShelfMargin * 2) - (fullShelfBorderWidth * 2)
    : screenWidth - Spacing.md * 2;
  const bookHeight = Math.min(
    Math.floor((availableWidth / 5) * 3.6),
    BookSpineConstants.maxHeight
  );

  // Fetch natural image dimensions for all books with images
  useEffect(() => {
    let cancelled = false;

    books.forEach((book) => {
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
  }, [books]);

  // Compute display height for a single book.
  // First clamp to shelf bounds, then apply deterministic height variability
  // so each spine sits at a slightly different height (matching the preview).
  const minDisplayHeight = Math.round(bookHeight * 0.6);

  const getBookDisplayHeight = useCallback(
    (book: Book): number => {
      const heightFactor = getImageSpineHeightFactor(book);
      const dims = imageDimensions[book.id];
      if (dims) {
        let clamped: number;
        if (dims.height >= bookHeight) {
          clamped = bookHeight;
        } else if (dims.height < minDisplayHeight) {
          clamped = minDisplayHeight;
        } else {
          clamped = dims.height;
        }
        return Math.max(minDisplayHeight, Math.round(clamped * heightFactor));
      }
      return Math.round(bookHeight * heightFactor);
    },
    [imageDimensions, bookHeight, minDisplayHeight]
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
      return BookSpineConstants.width; // default 50px
    },
    [imageDimensions, getBookDisplayHeight]
  );

  // Build layout items with variable widths and heights
  const layoutItems: GridLayoutItem[] = useMemo(() => {
    const items: GridLayoutItem[] = books.map((book) => ({
      item: book,
      width: getBookDisplayWidth(book),
      height: getBookDisplayHeight(book),
    }));
    items.push({ item: 'add', width: BookSpineConstants.width, height: bookHeight });
    return items;
  }, [books, getBookDisplayWidth, getBookDisplayHeight, bookHeight]);

  // Group layout items into rows by accumulated width
  const rows = useMemo(() => {
    const result: GridLayoutItem[][] = [];
    let currentRow: GridLayoutItem[] = [];
    let currentRowWidth = 0;

    layoutItems.forEach((layoutItem) => {
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

    if (currentRow.length > 0) {
      result.push(currentRow);
    }

    // Ensure minimum 3 rows
    while (result.length < BookshelfDimensions.minRows) {
      result.push([]);
    }

    return result;
  }, [layoutItems, availableWidth]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading books...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {rows.map((row, rowIndex) => (
        <View
          key={rowIndex}
          style={[
            styles.shelfContainer,
            shelfStyle === 'full' && {
              borderWidth: fullShelfBorderWidth,
              borderColor: BookshelfDimensions.shelfColor,
              borderRadius: 0,
              marginBottom: 0,
              paddingHorizontal: 0,
              marginHorizontal: fullShelfMargin,
              ...(rowIndex > 0 && { borderTopWidth: 0 }),
            },
          ]}
        >
          {/* Shelf back - only shown in 'full' style */}
          {shelfStyle === 'full' && <View style={styles.shelfBack} />}

          {/* Books row - no gaps between spines */}
          <View style={[styles.booksRow, { minHeight: row.length > 0 ? Math.max(bookHeight, ...row.map((li) => li.height)) : bookHeight }]}>
            {row.map((layoutItem) => {
              if (layoutItem.item === 'add') {
                return (
                  <AddBookButton
                    key="add-button"
                    width={layoutItem.width}
                    height={layoutItem.height}
                    onPress={onAddBook}
                  />
                );
              }

              const book = layoutItem.item;
              return (
                <View key={book.id}>
                  <BookSpine
                    book={book}
                    onPress={onBookPress}
                    width={layoutItem.width}
                    height={layoutItem.height}
                  />
                </View>
              );
            })}
          </View>

          {/* Shelf surface - only shown in 'bottom' style */}
          {shelfStyle === 'bottom' && <View style={styles.shelfSurface} />}
        </View>
      ))}

      {/* Bottom spacing */}
      <View style={styles.bottomPadding} />
    </ScrollView>
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
    textAlign: 'center',
    width: '100%',
  },
  bottomPadding: {
    height: 100,
  },
});

export default BookshelfGrid;
