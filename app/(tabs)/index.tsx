/**
 * Home Screen (My Library)
 *
 * Displays the user's bookshelves with previews.
 * Features:
 * - List of bookshelf previews
 * - Add new bookshelf button
 * - Pull to refresh
 * - Empty state for new users
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBookshelves } from '@/hooks/useBookshelves';
import { useAuth } from '@/contexts/AuthContext';
import { BookshelfPreview } from '@/components/BookshelfPreview';
import { LoadingView, EmptyState } from '@/components/ui';
import { FREE_TIER_LIMITS } from '@/services/stripe';
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  Shadows,
} from '@/constants/theme';
import type { Bookshelf } from '@/types';

export default function HomeScreen() {
  const { user } = useAuth();
  const {
    bookshelves,
    isLoading,
    fetchBookshelves,
    deleteBookshelf,
    bookshelfCount,
  } = useBookshelves();
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Handle pull to refresh
   */
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchBookshelves();
    setRefreshing(false);
  }, [fetchBookshelves]);

  /**
   * Navigate to bookshelf detail
   */
  const handleBookshelfPress = (bookshelf: Bookshelf) => {
    router.push(`/bookshelf/${bookshelf.id}`);
  };

  /**
   * Handle bookshelf deletion
   */
  const handleDeleteBookshelf = async (bookshelf: Bookshelf) => {
    const success = await deleteBookshelf(bookshelf.id);
    if (!success) {
      Alert.alert('Error', 'Failed to delete bookshelf. Please try again.');
    }
  };

  /**
   * Navigate to create bookshelf screen
   */
  const handleAddBookshelf = () => {
    // Check if user has reached free tier limit
    if (!user?.is_premium && bookshelfCount >= FREE_TIER_LIMITS.MAX_BOOKSHELVES) {
      Alert.alert(
        'Bookshelf Limit Reached',
        `Free accounts can have up to ${FREE_TIER_LIMITS.MAX_BOOKSHELVES} bookshelves. Upgrade to Premium for unlimited bookshelves.`,
        [
          { text: 'Maybe Later', style: 'cancel' },
          {
            text: 'Upgrade',
            onPress: () => router.push('/payment'),
          },
        ]
      );
      return;
    }

    router.push('/create-bookshelf');
  };

  // Loading state
  if (isLoading && bookshelves.length === 0) {
    return <LoadingView message="Loading your library..." />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              Hello, {user?.name || 'Book Lover'}!
            </Text>
            <Text style={styles.subGreeting}>
              {bookshelves.length > 0
                ? `You have ${bookshelves.length} ${
                    bookshelves.length === 1 ? 'bookshelf' : 'bookshelves'
                  }`
                : 'Start building your library'}
            </Text>
          </View>

          {/* Premium badge */}
          {user?.is_premium && (
            <View style={styles.premiumBadge}>
              <Ionicons name="star" size={14} color={Colors.starFilled} />
              <Text style={styles.premiumText}>Premium</Text>
            </View>
          )}
        </View>

        {/* Bookshelves List */}
        {bookshelves.length > 0 ? (
          <View style={styles.bookshelvesContainer}>
            {bookshelves.map((shelf) => (
              <BookshelfPreview
                key={shelf.id}
                bookshelf={shelf}
                books={shelf.books}
                onPress={handleBookshelfPress}
                onDelete={handleDeleteBookshelf}
              />
            ))}
          </View>
        ) : (
          <EmptyState
            icon="library-outline"
            title="No Bookshelves Yet"
            description="Create your first bookshelf to start organizing your book collection."
            actionLabel="Create Bookshelf"
            onAction={handleAddBookshelf}
          />
        )}

        {/* Add Bookshelf Button */}
        {bookshelves.length > 0 && (
          <Pressable
            style={({ pressed }) => [
              styles.addButton,
              pressed && styles.addButtonPressed,
            ]}
            onPress={handleAddBookshelf}
          >
            <Ionicons name="add-circle" size={24} color={Colors.primary} />
            <Text style={styles.addButtonText}>Add New Bookshelf</Text>
          </Pressable>
        )}

        {/* Bottom spacing */}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
  },
  greeting: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
  },
  subGreeting: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryLight,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  premiumText: {
    color: Colors.textInverse,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  bookshelvesContainer: {
    paddingTop: Spacing.sm,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.backgroundDark,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  addButtonPressed: {
    backgroundColor: Colors.border,
  },
  addButtonText: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.semibold,
    color: Colors.primary,
  },
  bottomPadding: {
    height: 40,
  },
});
