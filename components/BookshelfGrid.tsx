/**
 * BookshelfGrid Component
 *
 * Displays books on a bookshelf in a vertical scrollable grid.
 * Each row represents a shelf with multiple book spines.
 * Expands dynamically as more books are added.
 *
 * Features:
 * - Single column layout with horizontal rows
 * - Minimum 3 rows, expands as needed
 * - Visual shelf appearance with wood texture
 * - Add book button at the end
 */

import React from 'react';
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
import { BookSpine } from './BookSpine';
import {
  Colors,
  Spacing,
  BookSpine as BookSpineConstants,
  BookshelfDimensions,
} from '@/constants/theme';
import type { Book, ShelfStyle } from '@/types';

interface BookshelfGridProps {
  books: Book[];
  onBookPress: (book: Book) => void;
  onAddBook: () => void;
  isLoading?: boolean;
  shelfStyle?: ShelfStyle;
}

// Number of books per row
const BOOKS_PER_ROW = 5;

export function BookshelfGrid({
  books,
  onBookPress,
  onAddBook,
  isLoading = false,
  shelfStyle = 'full',
}: BookshelfGridProps) {
  const { width: screenWidth } = useWindowDimensions();

  // Calculate book dimensions based on screen width
  const availableWidth = screenWidth - Spacing.md * 2;
  const bookWidth = Math.floor(availableWidth / BOOKS_PER_ROW);
  const bookHeight = Math.min(
    Math.floor(bookWidth * 3.6), // Aspect ratio for book spine
    BookSpineConstants.maxHeight
  );

  // Group books into rows
  const rows: (Book | 'add')[][] = [];
  const allItems: (Book | 'add')[] = [...books, 'add'];

  for (let i = 0; i < allItems.length; i += BOOKS_PER_ROW) {
    rows.push(allItems.slice(i, i + BOOKS_PER_ROW));
  }

  // Ensure minimum 3 rows
  while (rows.length < BookshelfDimensions.minRows) {
    rows.push([]);
  }

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
              borderWidth: BookshelfDimensions.shelfThickness / 2,
              borderColor: BookshelfDimensions.shelfColor,
              borderRadius: 4,
            },
          ]}
        >
          {/* Shelf back - only shown in 'full' style */}
          {shelfStyle === 'full' && <View style={styles.shelfBack} />}

          {/* Books row */}
          <View style={[styles.booksRow, { height: bookHeight }]}>
            {row.map((item, bookIndex) => {
              if (item === 'add') {
                return (
                  <AddBookButton
                    key="add-button"
                    width={bookWidth}
                    height={bookHeight}
                    onPress={onAddBook}
                  />
                );
              }

              return (
                <View key={item.id} style={styles.bookWrapper}>
                  <BookSpine
                    book={item}
                    onPress={onBookPress}
                    width={bookWidth}
                    height={bookHeight}
                  />
                </View>
              );
            })}

            {/* Fill empty slots */}
            {row.length < BOOKS_PER_ROW &&
              Array.from({ length: BOOKS_PER_ROW - row.length }).map(
                (_, index) => (
                  <View
                    key={`empty-${index}`}
                    style={[styles.emptySlot, { width: bookWidth }]}
                  />
                )
              )}
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
    left: Spacing.md - 4,
    right: Spacing.md - 4,
    bottom: BookshelfDimensions.shelfThickness - 4,
    height: 200,
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
  },
  bookWrapper: {
    // Shadow for individual books
  },
  emptySlot: {
    // Placeholder for empty book slots
  },
  shelfSurface: {
    height: BookshelfDimensions.shelfThickness,
    backgroundColor: BookshelfDimensions.shelfColor,
    borderRadius: 2,
    marginTop: -2,
    // Wood grain effect
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
  },
  bottomPadding: {
    height: 100,
  },
});

export default BookshelfGrid;
