/**
 * BookshelfPreview Component
 *
 * Displays a compact preview of a bookshelf on the My Library page.
 * Shows the first row of books with the chosen shelf layout style.
 */

import React, { useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, useWindowDimensions, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import {
  Spacing,
  BorderRadius,
  Typography,
  BookshelfDimensions,
  Shadows,
  Animations,
  getFontFamily,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useSpineImageUrl } from '@/hooks/useSpineImageUrl';
import type { Bookshelf, Book } from '@/types';

const PREVIEW_BOOK_WIDTH = 20;
const PREVIEW_BOOK_HEIGHT = 132;
const PREVIEW_SHELF_THICKNESS = 12;
const PREVIEW_BORDER_WIDTH = 4;

interface BookshelfPreviewProps {
  bookshelf: Bookshelf;
  books: Book[];
  onPress: (bookshelf: Bookshelf) => void;
  onDelete?: (bookshelf: Bookshelf) => void;
}

export function BookshelfPreview({ bookshelf, books, onPress, onDelete }: BookshelfPreviewProps) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const scale = useRef(new Animated.Value(1)).current;
  const shelfStyle = bookshelf.shelf_style || 'full';
  const totalBooks = books.length;

  const cardInnerWidth = screenWidth - Spacing.md * 4;
  const shelfInnerWidth = shelfStyle === 'full' ? cardInnerWidth - PREVIEW_BORDER_WIDTH * 2 : cardInnerWidth;
  const booksPerRow = Math.max(1, Math.floor(shelfInnerWidth / PREVIEW_BOOK_WIDTH));
  const firstRowBooks = books.slice(0, booksPerRow);

  const animateScale = (toValue: number) => {
    Animated.timing(scale, {
      toValue,
      duration: Animations.fast,
      useNativeDriver: true,
    }).start();
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Bookshelf',
      `Are you sure you want to delete "${bookshelf.name}"? This will also delete all books on this shelf.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete?.(bookshelf) },
      ]
    );
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={({ pressed }) => [
          styles.container,
          { backgroundColor: colors.card, borderColor: colors.border },
          pressed && styles.pressed,
        ]}
        onPress={() => onPress(bookshelf)}
        onPressIn={() => animateScale(0.985)}
        onPressOut={() => animateScale(1)}
        onLongPress={onDelete ? handleDelete : undefined}
        accessibilityRole="button"
        accessibilityLabel={`${bookshelf.name} bookshelf with ${totalBooks} books`}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.shelfName, { color: colors.text }]} numberOfLines={1}>
              {bookshelf.name}
            </Text>
            <Text style={[styles.bookCount, { color: colors.textSecondary }]}>
              {totalBooks} {totalBooks === 1 ? 'book' : 'books'}
            </Text>
          </View>

          <View style={styles.headerActions}>
            {onDelete && (
              <Pressable
                style={styles.iconButton}
                onPress={handleDelete}
                hitSlop={8}
                accessibilityLabel="Delete bookshelf"
              >
                <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
              </Pressable>
            )}
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </View>
        </View>

        <View
          style={[
            styles.shelfRow,
            shelfStyle === 'full' && {
              borderWidth: PREVIEW_BORDER_WIDTH,
              borderColor: BookshelfDimensions.shelfColor,
            },
          ]}
        >
          {shelfStyle === 'full' && <View style={styles.shelfBack} />}

          <View style={[styles.booksRow, { minHeight: PREVIEW_BOOK_HEIGHT + BorderRadius.md }]}>
            {firstRowBooks.length > 0 ? (
              firstRowBooks.map((book) => <BookPreviewSpine key={book.id} book={book} />)
            ) : (
              <View style={styles.emptyShelf}>
                <Text
                  style={[
                    styles.emptyText,
                    {
                      color: shelfStyle === 'full' ? colors.textOnDarkMuted : colors.textSecondary,
                    },
                  ]}
                >
                  No books yet
                </Text>
              </View>
            )}
          </View>

          {shelfStyle === 'bottom' && <View style={styles.shelfSurface} />}
        </View>
      </Pressable>
    </Animated.View>
  );
}

interface BookPreviewSpineProps {
  book: Book;
}

function BookPreviewSpine({ book }: BookPreviewSpineProps) {
  const spineImageUrl = useSpineImageUrl(book.image_url);
  const hasImage = !!spineImageUrl;

  const getBookColor = (title: string): string => {
    const palette = ['#6b7280', '#64748b', '#7c3aed', '#0f766e', '#92400e', '#1f2937'];
    let hash = 0;
    for (let i = 0; i < title.length; i += 1) {
      hash = title.charCodeAt(i) + ((hash << 5) - hash);
    }
    return palette[Math.abs(hash) % palette.length];
  };

  return (
    <View style={[styles.bookSpine, { backgroundColor: hasImage ? undefined : getBookColor(book.title) }]}>
      {hasImage ? (
        <Image source={{ uri: spineImageUrl }} style={styles.bookImage} contentFit="cover" transition={220} />
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
    borderWidth: 1,
    gap: Spacing.sm,
    ...Shadows.sm,
  },
  pressed: {
    opacity: 0.96,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  shelfName: {
    fontSize: Typography.sizes.lg,
    fontFamily: getFontFamily('semibold'),
  },
  bookCount: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('regular'),
    marginTop: Spacing.xxs,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  iconButton: {
    padding: Spacing.xs,
  },
  shelfRow: {
    overflow: 'hidden',
    borderRadius: BorderRadius.md,
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
    paddingTop: Spacing.md,
  },
  shelfSurface: {
    height: PREVIEW_SHELF_THICKNESS,
    backgroundColor: BookshelfDimensions.shelfColor,
    borderRadius: BorderRadius.sm,
    marginTop: -1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyShelf: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('medium'),
  },
  bookSpine: {
    width: PREVIEW_BOOK_WIDTH,
    height: PREVIEW_BOOK_HEIGHT,
    overflow: 'hidden',
  },
  bookImage: {
    width: '100%',
    height: '100%',
  },
  bookPlaceholder: {
    flex: 1,
  },
});

export default BookshelfPreview;
