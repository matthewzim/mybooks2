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
import { BookSpine as BookSpineConstants, Shadows } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useSpineImageUrl } from '@/hooks/useSpineImageUrl';
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

// No offset — each book sits flush on the previous one (no overlap, no gap)

export function VerticalBookStack({
  books,
  stackWidth,
  stackHeight,
  onBookPress,
  isEditing = false,
  onUnstackBook,
}: VerticalBookStackProps) {
  const { colors } = useTheme();

  // Sort books by stack_position (0 = bottom, higher = on top)
  const sortedBooks = [...books].sort(
    (a, b) => (a.stack_position || 0) - (b.stack_position || 0)
  );

  // Calculate total height of the stack (each book adds exactly stackHeight)
  const totalHeight = sortedBooks.length * stackHeight;

  return (
    <View style={[styles.container, { width: stackWidth, height: totalHeight }]}>
      {sortedBooks.map((book, index) => {
        // Books higher in stack (higher stack_position) have higher bottom offset
        const bottomOffset = index * stackHeight;
        const isTopBook = index === sortedBooks.length - 1;

        return (
          <StackedBookItem
            key={book.id}
            book={book}
            index={index}
            stackCount={sortedBooks.length}
            stackWidth={stackWidth}
            stackHeight={stackHeight}
            bottomOffset={bottomOffset}
            isTopBook={isTopBook}
            isEditing={isEditing}
            onBookPress={onBookPress}
            onUnstackBook={onUnstackBook}
          />
        );
      })}
    </View>
  );
}

interface StackedBookItemProps {
  book: Book;
  index: number;
  stackCount: number;
  stackWidth: number;
  stackHeight: number;
  bottomOffset: number;
  isTopBook: boolean;
  isEditing: boolean;
  onBookPress: (book: Book) => void;
  onUnstackBook?: (book: Book) => void;
}

function StackedBookItem({
  book,
  index,
  stackCount,
  stackWidth,
  stackHeight,
  bottomOffset,
  isTopBook,
  isEditing,
  onBookPress,
  onUnstackBook,
}: StackedBookItemProps) {
  const { colors } = useTheme();
  const spineImageUrl = useSpineImageUrl(book.image_url);
  const hasValidUrl = Boolean(spineImageUrl);
  const backgroundColor = getBookColor(book.title);

  return (
    <Pressable
      style={({ pressed }) => [
        hasValidUrl ? styles.stackedBookImage : styles.stackedBook,
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
      accessibilityLabel={`${book.title} by ${book.author} (in stack, position ${index + 1} of ${stackCount})`}
    >
      {hasValidUrl ? (
        <View style={styles.stackedImageContainer}>
          <Image
            source={{ uri: spineImageUrl! }}
            style={{ width: stackHeight, height: stackWidth, transform: [{ rotate: '-90deg' }] }}
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
      {!hasValidUrl && (
        <View style={[styles.stackedTopEdge, { backgroundColor: colors.overlayLight }]} />
      )}

      {isEditing && isTopBook && onUnstackBook && (
        <View style={[styles.editOverlay, { backgroundColor: colors.overlay }]}> 
          <View style={[styles.stackBadge, { backgroundColor: colors.overlayDark }]}> 
            <Ionicons name="layers" size={12} color={colors.textOnDark} />
            <Text style={[styles.stackBadgeText, { color: colors.textOnDark }]}>{stackCount}</Text>
          </View>
          <Pressable
            style={[styles.unstackButton, { backgroundColor: colors.primary }]}
            onPress={() => onUnstackBook(book)}
            hitSlop={8}
          >
            <Ionicons name="arrow-up-outline" size={14} color={colors.textInverse} />
          </Pressable>
        </View>
      )}

      {!isEditing && isTopBook && stackCount > 1 && (
        <View style={[styles.stackCountBadge, { backgroundColor: colors.overlayDark }]}> 
          <Ionicons name="layers" size={10} color={colors.textOnDark} />
          <Text style={[styles.stackCountText, { color: colors.textOnDark }]}>{stackCount}</Text>
        </View>
      )}
    </Pressable>
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
  stackedBookImage: {
    position: 'absolute',
    left: 0,
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
  // Edit mode overlay
  editOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  stackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  stackBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
  },
  unstackButton: {
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
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  stackCountText: {
    fontSize: 9,
    fontWeight: '600',
    marginLeft: 2,
  },
});

export default VerticalBookStack;
