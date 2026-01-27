/**
 * Community Screen
 *
 * Browse book spines uploaded by other users.
 * Features:
 * - Paginated list of community books
 * - Search functionality
 * - Add to shelf action
 * - Premium-only access option
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { booksService, FREE_TIER_LIMITS } from '@/services';
import { useBookshelves } from '@/hooks/useBookshelves';
import { CommunityBookItem } from '@/components/CommunityBookItem';
import { Input, EmptyState, Button } from '@/components/ui';
import { Colors, Spacing, Typography } from '@/constants/theme';
import type { CommunityBookSpine, PaginatedResponse } from '@/types';

const PAGE_SIZE = 20;

export default function CommunityScreen() {
  const { user } = useAuth();
  const { bookshelves, fetchBookshelves } = useBookshelves();
  const [books, setBooks] = useState<CommunityBookSpine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Check if user can access community
  const canAccessCommunity =
    user?.is_premium || FREE_TIER_LIMITS.CAN_ACCESS_COMMUNITY;

  /**
   * Fetch community books
   */
  const fetchBooks = useCallback(
    async (pageNum: number = 0, append: boolean = false) => {
      try {
        const result = await booksService.getCommunityBooks(
          pageNum,
          PAGE_SIZE,
          searchQuery || undefined
        );

        if (result.data) {
          if (append) {
            setBooks((prev) => [...prev, ...result.data!.data]);
          } else {
            setBooks(result.data.data);
          }
          setHasMore(result.data.hasMore);
          setPage(pageNum);
        }
      } catch (error) {
        console.error('Failed to fetch community books:', error);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
        setRefreshing(false);
      }
    },
    [searchQuery]
  );

  // Initial fetch
  useEffect(() => {
    if (canAccessCommunity) {
      fetchBooks();
    } else {
      setIsLoading(false);
    }
  }, [canAccessCommunity, fetchBooks]);

  /**
   * Handle search
   */
  useEffect(() => {
    if (canAccessCommunity) {
      setIsLoading(true);
      setBooks([]);
      fetchBooks(0);
    }
  }, [searchQuery]);

  /**
   * Handle pull to refresh
   */
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchBooks(0);
    fetchBookshelves();
  }, [fetchBooks, fetchBookshelves]);

  /**
   * Handle load more
   */
  const handleLoadMore = () => {
    if (!isLoadingMore && hasMore) {
      setIsLoadingMore(true);
      fetchBooks(page + 1, true);
    }
  };

  /**
   * Handle adding a book to a shelf
   */
  const handleAddToShelf = async (book: CommunityBookSpine) => {
    // If user has no shelves, prompt to create one
    if (bookshelves.length === 0) {
      Alert.alert(
        'No Bookshelves',
        'Create a bookshelf first to add books.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Create Bookshelf',
            onPress: () => router.push('/create-bookshelf'),
          },
        ]
      );
      return;
    }

    // If user has one shelf, add directly
    if (bookshelves.length === 1) {
      const result = await booksService.addCommunityBookToShelf(
        book,
        bookshelves[0].id
      );

      if (result.error) {
        Alert.alert('Error', result.error.message);
      }
      return;
    }

    // If user has multiple shelves, show picker
    Alert.alert(
      'Select Bookshelf',
      'Which bookshelf would you like to add this book to?',
      [
        { text: 'Cancel', style: 'cancel' },
        ...bookshelves.slice(0, 5).map((shelf) => ({
          text: shelf.name,
          onPress: async () => {
            const result = await booksService.addCommunityBookToShelf(
              book,
              shelf.id
            );
            if (result.error) {
              Alert.alert('Error', result.error.message);
            }
          },
        })),
      ]
    );
  };

  /**
   * Render premium gate for non-premium users
   */
  if (!canAccessCommunity) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.premiumGate}>
          <EmptyState
            icon="lock-closed"
            title="Premium Feature"
            description="Access the community book collection with a Premium subscription. Browse thousands of book spines uploaded by other readers."
          />
          <Button
            title="Upgrade to Premium"
            onPress={() => router.push('/payment')}
            size="lg"
          />
        </View>
      </SafeAreaView>
    );
  }

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
        icon="book-outline"
        title="No Books Found"
        description={
          searchQuery
            ? 'Try a different search term.'
            : 'Be the first to add a book to the community!'
        }
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Input
          placeholder="Search by title or author..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIcon="search"
          rightIcon={searchQuery ? 'close-circle' : undefined}
          onRightIconPress={() => setSearchQuery('')}
          containerStyle={styles.searchInput}
        />
      </View>

      {/* Books List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading community books...</Text>
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CommunityBookItem book={item} onAddToShelf={handleAddToShelf} />
          )}
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
            books.length === 0 && styles.emptyListContent,
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchContainer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.background,
  },
  searchInput: {
    marginBottom: 0,
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
  premiumGate: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
});
