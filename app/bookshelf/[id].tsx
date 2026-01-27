/**
 * Bookshelf Detail Screen
 *
 * Displays all books on a specific bookshelf.
 * Features:
 * - Grid of book spines on shelf rows
 * - Add book button (camera or manual)
 * - Edit bookshelf name
 * - Dynamic expansion as books are added
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBookshelves } from '@/hooks/useBookshelves';
import { useBooks } from '@/hooks/useBooks';
import { BookshelfGrid } from '@/components/BookshelfGrid';
import { LoadingView, EmptyState } from '@/components/ui';
import { Colors, Spacing, Typography } from '@/constants/theme';
import type { Book, Bookshelf } from '@/types';

export default function BookshelfDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getBookshelf, updateBookshelf } = useBookshelves();
  const { books, isLoading: booksLoading, fetchBooks, deleteBook } = useBooks(id || '');
  const [bookshelf, setBookshelf] = useState<Bookshelf | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Fetch bookshelf data
   */
  const loadBookshelf = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    try {
      const result = await getBookshelf(id);
      if (result) {
        setBookshelf(result);
      }
    } catch (error) {
      console.error('Failed to load bookshelf:', error);
    } finally {
      setIsLoading(false);
    }
  }, [id, getBookshelf]);

  useEffect(() => {
    loadBookshelf();
  }, [loadBookshelf]);

  /**
   * Navigate to book detail
   */
  const handleBookPress = (book: Book) => {
    router.push({
      pathname: '/book/[id]',
      params: { id: book.id, shelfId: id },
    });
  };

  /**
   * Show add book options
   */
  const handleAddBook = () => {
    Alert.alert('Add Book', 'How would you like to add a book?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Scan Book Spine',
        onPress: () => router.push({ pathname: '/scan', params: { shelfId: id } }),
      },
      {
        text: 'Add Manually',
        onPress: () => router.push({ pathname: '/add-book', params: { shelfId: id } }),
      },
      {
        text: 'Browse Community',
        onPress: () => router.push('/(tabs)/community'),
      },
    ]);
  };

  /**
   * Show edit bookshelf options
   */
  const handleEditBookshelf = () => {
    Alert.prompt(
      'Rename Bookshelf',
      'Enter a new name for this bookshelf',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async (newName) => {
            if (newName && newName.trim() && id) {
              const result = await updateBookshelf(id, { name: newName.trim() });
              if (result) {
                setBookshelf((prev) =>
                  prev ? { ...prev, name: newName.trim() } : null
                );
              }
            }
          },
        },
      ],
      'plain-text',
      bookshelf?.name
    );
  };

  // Loading state
  if (isLoading) {
    return <LoadingView message="Loading bookshelf..." />;
  }

  // Error state
  if (!bookshelf) {
    return (
      <SafeAreaView style={styles.container}>
        <EmptyState
          icon="alert-circle-outline"
          title="Bookshelf Not Found"
          description="This bookshelf may have been deleted."
          actionLabel="Go Back"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return (
    <>
      {/* Dynamic header title */}
      <Stack.Screen
        options={{
          title: bookshelf.name,
          headerRight: () => (
            <Pressable
              onPress={handleEditBookshelf}
              style={styles.headerButton}
              hitSlop={8}
            >
              <Ionicons name="pencil" size={20} color={Colors.textInverse} />
            </Pressable>
          ),
        }}
      />

      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        {/* Bookshelf Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{books.length}</Text>
            <Text style={styles.statLabel}>
              {books.length === 1 ? 'Book' : 'Books'}
            </Text>
          </View>
          {bookshelf.description && (
            <Text style={styles.description} numberOfLines={2}>
              {bookshelf.description}
            </Text>
          )}
        </View>

        {/* Books Grid */}
        <BookshelfGrid
          books={books}
          onBookPress={handleBookPress}
          onAddBook={handleAddBook}
          isLoading={booksLoading}
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerButton: {
    padding: Spacing.xs,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  stat: {
    alignItems: 'center',
    marginRight: Spacing.lg,
  },
  statValue: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.primary,
  },
  statLabel: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
  },
  description: {
    flex: 1,
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
});
