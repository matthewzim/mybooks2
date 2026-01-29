/**
 * Explore Screen
 *
 * Browse public bookshelves from other users.
 * Features:
 * - Paginated list of public bookshelves
 * - Preview of top row (first 5 books) for each shelf
 * - Shows bookshelf name, description, and owner
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { bookshelvesService } from '@/services/bookshelves';
import { EmptyState } from '@/components/ui';
import {
  Colors,
  Spacing,
  BorderRadius,
  Shadows,
  Typography,
} from '@/constants/theme';
import type { Bookshelf, Book } from '@/types';

const PAGE_SIZE = 10;

// Extended type for public bookshelves with owner info
type PublicBookshelf = Bookshelf & {
  books: Book[];
  owner_name: string | null;
};

export default function ExploreScreen() {
  const [bookshelves, setBookshelves] = useState<PublicBookshelf[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  /**
   * Fetch public bookshelves
   */
  const fetchBookshelves = useCallback(
    async (pageNum: number = 0, append: boolean = false) => {
      try {
        const result = await bookshelvesService.getPublicBookshelves(
          pageNum,
          PAGE_SIZE
        );

        if (result.data) {
          if (append) {
            setBookshelves((prev) => [...prev, ...result.data!.data]);
          } else {
            setBookshelves(result.data.data);
          }
          setHasMore(result.data.hasMore);
          setPage(pageNum);
        }
      } catch (error) {
        console.error('Failed to fetch public bookshelves:', error);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
        setRefreshing(false);
      }
    },
    []
  );

  // Initial fetch
  useEffect(() => {
    fetchBookshelves();
  }, [fetchBookshelves]);

  /**
   * Handle pull to refresh
   */
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchBookshelves(0);
  }, [fetchBookshelves]);

  /**
   * Handle load more
   */
  const handleLoadMore = () => {
    if (!isLoadingMore && hasMore) {
      setIsLoadingMore(true);
      fetchBookshelves(page + 1, true);
    }
  };

  /**
   * Render list footer (loading indicator)
   */
  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  };

  /**
   * Render empty state
   */
  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <EmptyState
        icon="library-outline"
        title="No Public Bookshelves"
        description="Be the first to share your bookshelf with the community! Toggle your bookshelf to public in the edit settings."
      />
    );
  };

  /**
   * Render a single bookshelf preview item
   */
  const renderBookshelfItem = ({ item }: { item: PublicBookshelf }) => (
    <PublicBookshelfPreview bookshelf={item} />
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Books List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Discovering bookshelves...</Text>
        </View>
      ) : (
        <FlatList
          data={bookshelves}
          keyExtractor={(item) => item.id}
          renderItem={renderBookshelfItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={[
            styles.listContent,
            bookshelves.length === 0 && styles.emptyListContent,
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

/**
 * Public Bookshelf Preview Component
 *
 * Displays a preview of a public bookshelf with:
 * - Owner name
 * - Bookshelf name and description
 * - Top row of books (up to 5)
 */
interface PublicBookshelfPreviewProps {
  bookshelf: PublicBookshelf;
}

function PublicBookshelfPreview({ bookshelf }: PublicBookshelfPreviewProps) {
  const books = bookshelf.books;
  const totalBooks = books.length;

  // Generate a color based on book title for placeholder
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
        styles.previewContainer,
        { backgroundColor: bookshelf.cover_color || Colors.bookshelfWood },
      ]}
    >
      {/* Owner Badge */}
      <View style={styles.ownerBadge}>
        <Ionicons name="person-circle-outline" size={14} color={Colors.textInverse} />
        <Text style={styles.ownerName} numberOfLines={1}>
          {bookshelf.owner_name || 'Anonymous'}
        </Text>
      </View>

      {/* Shelf Header */}
      <View style={styles.header}>
        <Text style={styles.shelfName} numberOfLines={1}>
          {bookshelf.name}
        </Text>
        {bookshelf.description && (
          <Text style={styles.description} numberOfLines={2}>
            {bookshelf.description}
          </Text>
        )}
      </View>

      {/* Book Previews - Top Row Only */}
      <View style={styles.booksContainer}>
        {/* Shelf back */}
        <View style={styles.shelfBack} />

        {/* Books */}
        <View style={styles.booksRow}>
          {books.length > 0 ? (
            books.map((book) => (
              <View
                key={book.id}
                style={[
                  styles.bookSpine,
                  { backgroundColor: book.image_url ? undefined : getBookColor(book.title) },
                ]}
              >
                {book.image_url ? (
                  <Image
                    source={{ uri: book.image_url }}
                    style={styles.bookImage}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.bookPlaceholder} />
                )}
              </View>
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

          {/* Spacers to fill empty slots for consistent layout */}
          {books.length > 0 && books.length < 5 && (
            [...Array(5 - books.length)].map((_, index) => (
              <View key={`spacer-${index}`} style={styles.bookSpaceholder} />
            ))
          )}
        </View>

        {/* Shelf surface */}
        <View style={styles.shelfSurface} />
      </View>

      {/* Book count indicator */}
      <View style={styles.bookCountContainer}>
        <Ionicons name="book" size={12} color="rgba(255, 255, 255, 0.7)" />
        <Text style={styles.bookCount}>
          {totalBooks} {totalBooks === 1 ? 'book' : 'books'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.md,
    color: Colors.textSecondary,
    fontSize: Typography.sizes.md,
  },
  listContent: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  emptyListContent: {
    flex: 1,
  },
  footer: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  // Preview Card Styles
  previewContainer: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.md,
  },
  ownerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: 4,
  },
  ownerName: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: Typography.sizes.xs,
    flex: 1,
  },
  header: {
    marginBottom: Spacing.md,
  },
  shelfName: {
    color: Colors.textInverse,
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  description: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: Typography.sizes.sm,
    marginTop: 4,
    lineHeight: 18,
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
    gap: 4,
  },
  shelfSurface: {
    height: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 2,
    marginTop: 2,
  },
  bookSpine: {
    width: 36,
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
  bookSpaceholder: {
    width: 36,
    height: 55,
    opacity: 0,
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
  bookCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bookCount: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: Typography.sizes.xs,
  },
});
