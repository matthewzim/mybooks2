/**
 * BookshelfPreview Component
 *
 * Displays a preview of a bookshelf with a few book spines.
 * Used on the home screen to show all bookshelves at a glance.
 *
 * Features:
 * - Shows bookshelf name and book count
 * - Displays up to 3 book previews
 * - Swipe to delete functionality
 * - Tap to navigate to full bookshelf view
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import {
  Colors,
  Spacing,
  BorderRadius,
  Shadows,
  Typography,
} from '@/constants/theme';
import { getSpineImageUrl } from '@/services/storage';
import type { Bookshelf, Book } from '@/types';

interface BookshelfPreviewProps {
  bookshelf: Bookshelf;
  books: Book[];
  onPress: (bookshelf: Bookshelf) => void;
  onDelete?: (bookshelf: Bookshelf) => void;
}

export function BookshelfPreview({
  bookshelf,
  books,
  onPress,
  onDelete,
}: BookshelfPreviewProps) {
  const handleDelete = () => {
    Alert.alert(
      'Delete Bookshelf',
      `Are you sure you want to delete "${bookshelf.name}"? This will also delete all books on this shelf.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete?.(bookshelf),
        },
      ]
    );
  };

  const previewBooks = books.slice(0, 3);
  const totalBooks = books.length;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: bookshelf.cover_color || Colors.bookshelfWood },
        pressed && styles.pressed,
      ]}
      onPress={() => onPress(bookshelf)}
      onLongPress={onDelete ? handleDelete : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${bookshelf.name} bookshelf with ${totalBooks} books`}
    >
      {/* Shelf Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.shelfName} numberOfLines={1}>
            {bookshelf.name}
          </Text>
          <Text style={styles.bookCount}>
            {totalBooks} {totalBooks === 1 ? 'book' : 'books'}
          </Text>
        </View>

        {onDelete && (
          <Pressable
            style={styles.deleteButton}
            onPress={handleDelete}
            hitSlop={8}
            accessibilityLabel="Delete bookshelf"
          >
            <Ionicons name="trash-outline" size={18} color={Colors.textInverse} />
          </Pressable>
        )}
      </View>

      {/* Book Previews */}
      <View style={styles.booksContainer}>
        {/* Shelf back */}
        <View style={styles.shelfBack} />

        {/* Books */}
        <View style={styles.booksRow}>
          {previewBooks.length > 0 ? (
            previewBooks.map((book) => (
              <BookPreviewSpine key={book.id} book={book} />
            ))
          ) : (
            <View style={styles.emptyShelf}>
              <Ionicons
                name="book-outline"
                size={24}
                color="rgba(255, 255, 255, 0.5)"
              />
              <Text style={styles.emptyText}>No books yet</Text>
            </View>
          )}

          {/* More books indicator */}
          {totalBooks > 3 && (
            <View style={styles.moreIndicator}>
              <Text style={styles.moreText}>+{totalBooks - 3}</Text>
            </View>
          )}
        </View>

        {/* Shelf surface */}
        <View style={styles.shelfSurface} />
      </View>

      {/* Arrow indicator */}
      <View style={styles.arrowContainer}>
        <Ionicons name="chevron-forward" size={20} color={Colors.textInverse} />
      </View>
    </Pressable>
  );
}

/**
 * Small book spine preview component
 */
interface BookPreviewSpineProps {
  book: Book;
}

function BookPreviewSpine({ book }: BookPreviewSpineProps) {
  // Get the book spine image URL from the book-spines bucket
  const spineImageUrl = getSpineImageUrl(book.image_url);
  const hasImage = !!spineImageUrl;

  // Generate a color based on book title
  const getBookColor = (title: string): string => {
    const colors = [
      '#8B0000', '#00008B', '#006400', '#4B0082', '#8B4513',
      '#2F4F4F', '#483D8B', '#556B2F', '#800000', '#191970',
    ];
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
      hash = title.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <View
      style={[
        styles.bookSpine,
        { backgroundColor: hasImage ? undefined : getBookColor(book.title) },
      ]}
    >
      {hasImage ? (
        <Image
          source={{ uri: spineImageUrl }}
          style={styles.bookImage}
          contentFit="cover"
        />
      ) : (
        <View style={styles.bookPlaceholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.md,
  },
  pressed: {
    opacity: 0.95,
    transform: [{ scale: 0.99 }],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flex: 1,
    marginRight: Spacing.md,
  },
  shelfName: {
    color: Colors.textInverse,
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  bookCount: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: Typography.sizes.sm,
    marginTop: 2,
  },
  deleteButton: {
    padding: Spacing.xs,
  },
  booksContainer: {
    height: 80,
    marginBottom: Spacing.sm,
  },
  shelfBack: {
    position: 'absolute',
    left: -4,
    right: -4,
    bottom: 8,
    height: 60,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  booksRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 60,
    paddingHorizontal: Spacing.xs,
  },
  shelfSurface: {
    height: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 2,
    marginTop: 2,
  },
  bookSpine: {
    width: 30,
    height: 55,
    borderRadius: 2,
    overflow: 'hidden',
  },
  bookImage: {
    width: '100%',
    height: '100%',
  },
  bookPlaceholder: {
    flex: 1,
  },
  emptyShelf: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: Typography.sizes.sm,
  },
  moreIndicator: {
    width: 30,
    height: 55,
    borderRadius: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreText: {
    color: Colors.textInverse,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
  },
  arrowContainer: {
    position: 'absolute',
    right: Spacing.md,
    bottom: Spacing.md,
  },
});

export default BookshelfPreview;
