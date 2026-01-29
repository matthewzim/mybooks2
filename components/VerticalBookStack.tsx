/**
 * VerticalBookStack Component
 *
 * Renders a vertical stack of books laying flat (horizontally) on top of each other.
 * Books in a stack share the same stack_id and are ordered by stack_position.
 *
 * Features:
 * - Displays multiple stacked books in a pile
 * - Offset positioning for visual depth
 * - Press on individual books to select
 * - Edit mode support for unstacking
 */

import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Colors, BookSpine as BookSpineConstants, Shadows } from '@/constants/theme';
import { getSpineImageUrl } from '@/services/storage';
import type { Book } from '@/types';

interface VerticalBookStackProps {
  books: Book[]; // Books in the stack, sorted by stack_position
  stackWidth: number; // Width of each stacked book (same as bookHeight when horizontal)
  stackHeight: number; // Height of each stacked book (same as bookWidth when horizontal)
  onBookPress: (book: Book) => void;
  isEditing?: boolean;
  onUnstackBook?: (book: Book) => void;
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

// Vertical offset between books in the stack
const STACK_OFFSET = 4;

export function VerticalBookStack({
  books,
  stackWidth,
  stackHeight,
  onBookPress,
  isEditing = false,
  onUnstackBook,
}: VerticalBookStackProps) {
  // Sort books by stack_position (0 = bottom, higher = on top)
  const sortedBooks = [...books].sort(
    (a, b) => (a.stack_position || 0) - (b.stack_position || 0)
  );

  // Calculate total height of the stack
  const totalHeight = stackHeight + (sortedBooks.length - 1) * STACK_OFFSET;

  return (
    <View style={[styles.container, { width: stackWidth, height: totalHeight }]}>
      {sortedBooks.map((book, index) => {
        const spineImageUrl = getSpineImageUrl(book.image_url);
        const hasValidUrl = Boolean(spineImageUrl);
        const backgroundColor = getBookColor(book.title);

        // Books higher in stack appear higher (smaller bottom offset)
        const bottomOffset = (sortedBooks.length - 1 - index) * STACK_OFFSET;
        const isTopBook = index === sortedBooks.length - 1;

        return (
          <Pressable
            key={book.id}
            style={({ pressed }) => [
              styles.stackedBook,
              {
                width: stackWidth,
                height: stackHeight,
                bottom: bottomOffset,
                zIndex: index,
              },
              pressed && styles.pressed,
            ]}
            onPress={() => onBookPress(book)}
            accessibilityRole="button"
            accessibilityLabel={`${book.title} by ${book.author} (in stack, position ${index + 1} of ${sortedBooks.length})`}
          >
            {hasValidUrl ? (
              <View style={[styles.stackedImageContainer, { backgroundColor }]}>
                <Image
                  source={{ uri: spineImageUrl! }}
                  style={[styles.stackedImage, { transform: [{ rotate: '-90deg' }] }]}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
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

            {/* Edit mode overlay - show unstack button on top book */}
            {isEditing && isTopBook && onUnstackBook && (
              <View style={styles.editOverlay}>
                <View style={styles.stackBadge}>
                  <Ionicons name="layers" size={12} color={Colors.textInverse} />
                  <Text style={styles.stackBadgeText}>{sortedBooks.length}</Text>
                </View>
                <Pressable
                  style={styles.unstackButton}
                  onPress={() => onUnstackBook(book)}
                  hitSlop={8}
                >
                  <Ionicons name="arrow-up-outline" size={14} color={Colors.textInverse} />
                </Pressable>
              </View>
            )}

            {/* Stack count badge (view mode) */}
            {!isEditing && isTopBook && sortedBooks.length > 1 && (
              <View style={styles.stackCountBadge}>
                <Ionicons name="layers" size={10} color={Colors.textInverse} />
                <Text style={styles.stackCountText}>{sortedBooks.length}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  stackedBook: {
    position: 'absolute',
    left: 0,
    borderRadius: 2,
    overflow: 'hidden',
    ...Shadows.md,
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
  // Edit mode overlay
  editOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  stackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  stackBadgeText: {
    color: Colors.textInverse,
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
  },
  unstackButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Stack count badge (view mode)
  stackCountBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  stackCountText: {
    color: Colors.textInverse,
    fontSize: 9,
    fontWeight: '600',
    marginLeft: 2,
  },
});

export default VerticalBookStack;
