/**
 * Home Screen (My Library)
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
import { useTheme } from '@/contexts/ThemeContext';
import { BookshelfPreview } from '@/components/BookshelfPreview';
import { LoadingView, EmptyState } from '@/components/ui';
import { FREE_TIER_LIMITS } from '@/services/stripe';
import { Spacing, BorderRadius, Typography } from '@/constants/theme';
import type { Bookshelf } from '@/types';

export default function HomeScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const {
    bookshelves,
    isLoading,
    fetchBookshelves,
    deleteBookshelf,
    bookshelfCount,
  } = useBookshelves();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchBookshelves();
    setRefreshing(false);
  }, [fetchBookshelves]);

  const handleBookshelfPress = (bookshelf: Bookshelf) => {
    router.push(`/bookshelf/${bookshelf.id}`);
  };

  const handleDeleteBookshelf = async (bookshelf: Bookshelf) => {
    const success = await deleteBookshelf(bookshelf.id);
    if (!success) {
      Alert.alert('Error', 'Failed to delete bookshelf. Please try again.');
    }
  };

  const handleAddBookshelf = () => {
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

  if (isLoading && bookshelves.length === 0) {
    return <LoadingView message="Loading your library..." colors={colors} />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.heading, { color: colors.text }]}>My Library</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {bookshelves.length} {bookshelves.length === 1 ? 'bookshelf' : 'bookshelves'}
          </Text>
        </View>

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
            title="No bookshelves yet"
            description="Create a shelf to start organizing your books."
            actionLabel="Create Bookshelf"
            onAction={handleAddBookshelf}
            colors={colors}
          />
        )}

        {bookshelves.length > 0 && (
          <Pressable
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { opacity: 0.85 },
            ]}
            onPress={handleAddBookshelf}
          >
            <Ionicons name="add" size={18} color={colors.primary} />
            <Text style={[styles.addButtonText, { color: colors.primary }]}>New bookshelf</Text>
          </Pressable>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Spacing.md,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: 6,
  },
  heading: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.semibold,
    letterSpacing: -0.3,
  },
  meta: {
    fontSize: Typography.sizes.sm,
  },
  bookshelvesContainer: {
    paddingTop: Spacing.xs,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  addButtonText: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.medium,
  },
  bottomPadding: {
    height: 32,
  },
});
