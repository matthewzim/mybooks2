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
import { Colors, BookSpine as BookSpineConstants, Shadows } from '@/constants/theme';
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
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const hasImage = book.image_url && !hasError;
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
        // Book spine image
        <View style={[styles.imageContainer, { backgroundColor }]}>
          <Image
            source={{ uri: book.image_url! }}
            style={styles.image}
            contentFit="cover"
            transition={200}
            onLoadStart={() => setIsLoading(true)}
            onLoadEnd={() => setIsLoading(false)}
            onError={() => {
              setHasError(true);
              setIsLoading(false);
            }}
          />
          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="small" color={Colors.textInverse} />
            </View>
          )}
        </View>
      ) : (
        // Placeholder with book title
        <View style={[styles.placeholder, { backgroundColor }]}>
          <Text
            style={styles.placeholderTitle}
            numberOfLines={3}
            ellipsizeMode="tail"
          >
            {book.title}
          </Text>
          <Text
            style={styles.placeholderAuthor}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {book.author}
          </Text>
        </View>
      )}

      {/* Book spine edge effect */}
      <View style={styles.spineEdge} />
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
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
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
    color: Colors.textInverse,
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
    color: 'rgba(255, 255, 255, 0.7)',
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
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
});

export default BookSpine;
