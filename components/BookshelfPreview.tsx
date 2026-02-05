/**
 * BookshelfPreview Component
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Spacing, BorderRadius, Typography } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useSpineImageUrl } from '@/hooks/useSpineImageUrl';
import type { Bookshelf, Book } from '@/types';

interface BookshelfPreviewProps {
  bookshelf: Bookshelf;
  books: Book[];
  onPress: (bookshelf: Bookshelf) => void;
  onDelete?: (bookshelf: Bookshelf) => void;
}

export function BookshelfPreview({ bookshelf, books, onPress, onDelete }: BookshelfPreviewProps) {
  const { colors } = useTheme();

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

  const previewBooks = books.slice(0, 4);
  const totalBooks = books.length;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
      onPress={() => onPress(bookshelf)}
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
            <Pressable style={styles.iconButton} onPress={handleDelete} hitSlop={8} accessibilityLabel="Delete bookshelf">
              <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
            </Pressable>
          )}
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </View>
      </View>

      <View style={styles.booksRow}>
        {previewBooks.length > 0 ? (
          previewBooks.map((book) => <BookPreviewSpine key={book.id} book={book} />)
        ) : (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No books yet</Text>
        )}

        {totalBooks > 4 && (
          <View style={[styles.moreIndicator, { borderColor: colors.border }]}>
            <Text style={[styles.moreText, { color: colors.textSecondary }]}>+{totalBooks - 4}</Text>
          </View>
        )}
      </View>
    </Pressable>
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
    for (let i = 0; i < title.length; i++) {
      hash = title.charCodeAt(i) + ((hash << 5) - hash);
    }
    return palette[Math.abs(hash) % palette.length];
  };

  return (
    <View style={[styles.bookSpine, { backgroundColor: hasImage ? undefined : getBookColor(book.title) }]}>
      {hasImage ? <Image source={{ uri: spineImageUrl }} style={styles.bookImage} contentFit="contain" /> : <View style={styles.bookPlaceholder} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.9,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  shelfName: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  bookCount: {
    fontSize: Typography.sizes.sm,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  iconButton: {
    padding: Spacing.xs,
  },
  booksRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xs,
    minHeight: 56,
  },
  bookSpine: {
    width: 24,
    height: 52,
    borderRadius: 4,
    overflow: 'hidden',
  },
  bookImage: {
    width: '100%',
    height: '100%',
  },
  bookPlaceholder: {
    flex: 1,
  },
  emptyText: {
    fontSize: Typography.sizes.sm,
  },
  moreIndicator: {
    width: 24,
    height: 52,
    borderRadius: 4,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.medium,
  },
});

export default BookshelfPreview;
