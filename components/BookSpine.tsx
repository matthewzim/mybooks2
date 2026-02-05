/**
 * BookSpine Component
 *
 * Displays a single book spine with its cover image or a colored placeholder.
 * Used in the bookshelf grid to show books vertically.
 *
 * Features:
 * - Displays book spine image if available
 * - Falls back to colored placeholder with title
 * - Supports custom dimensions
 * - Handles loading and error states
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { BookSpine as BookSpineConstants, Shadows } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useSpineImageUrl } from '@/hooks/useSpineImageUrl';
import type { Book } from '@/types';

interface BookSpineProps {
  book: Book;
  onPress: (book: Book) => void;
  width?: number;
  height?: number;
}

/**
 * Get a consistent color for a book based on its title
 * Uses simple hash to always return the same color for the same title
 */
function getBookColor(title: string): string {
  const colors = BookSpineConstants.colors;
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function BookSpine({
  book,
  onPress,
  width = BookSpineConstants.width,
  height = BookSpineConstants.height,
}: BookSpineProps) {
  const { colors } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Get the book spine image URL from the book-spines bucket
  const spineImageUrl = useSpineImageUrl(book.image_url);
  const hasImage = Boolean(spineImageUrl) && !hasError;
  const backgroundColor = getBookColor(book.title);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        { width, height },
        pressed && styles.pressed,
      ]}
      onPress={() => onPress(book)}
      accessibilityRole="button"
      accessibilityLabel={`${book.title} by ${book.author}`}
    >
      {hasImage ? (
        // Book spine image from book-spines bucket
        <View style={[styles.imageContainer, { backgroundColor }]}>
          <Image
            source={{ uri: spineImageUrl! }}
            style={styles.image}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
            onLoadStart={() => setIsLoading(true)}
            onLoadEnd={() => setIsLoading(false)}
            onError={(error) => {
              console.warn('BookSpine image load error:', book.title, error);
              setHasError(true);
              setIsLoading(false);
            }}
          />
          {isLoading && (
            <View style={[styles.loadingOverlay, { backgroundColor: colors.overlay }]}>
              <ActivityIndicator size="small" color={colors.textOnDark} />
            </View>
          )}
        </View>
      ) : (
        // Placeholder with book title
        <View style={[styles.placeholder, { backgroundColor }]}>
          <Text
            style={[styles.placeholderTitle, { color: colors.textOnDark }]}
            numberOfLines={3}
            ellipsizeMode="tail"
          >
            {book.title}
          </Text>
          <Text
            style={[styles.placeholderAuthor, { color: colors.textOnDarkMuted }]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {book.author}
          </Text>
        </View>
      )}

      {/* Book spine edge effect */}
      <View style={[styles.spineEdge, { backgroundColor: colors.overlayLight }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 2,
    overflow: 'hidden',
    ...Shadows.md,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    flex: 1,
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderTitle: {
    fontSize: 8,
    fontWeight: '600',
    textAlign: 'center',
    writingDirection: 'ltr',
    // Rotate text for spine effect
    transform: [{ rotate: '-90deg' }],
    width: 160,
    position: 'absolute',
  },
  placeholderAuthor: {
    fontSize: 6,
    textAlign: 'center',
    position: 'absolute',
    bottom: 8,
  },
  spineEdge: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
});

export default BookSpine;
