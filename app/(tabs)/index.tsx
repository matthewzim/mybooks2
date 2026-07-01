/**
 * Home Screen (My Library)
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBookshelves } from '@/hooks/useBookshelves';
import { useAuth } from '@/contexts/AuthContext';
import { useRevenueCat } from '@/contexts/RevenueCatContext';
import { useTheme } from '@/contexts/ThemeContext';
import { BookshelfPreview } from '@/components/BookshelfPreview';
import { LoadingView, EmptyState } from '@/components/ui';
import { FREE_TIER_LIMITS } from '@/services/revenuecat';
import { Spacing, BorderRadius, Typography, getFontFamily } from '@/constants/theme';
import type { Bookshelf } from '@/types';

export default function HomeScreen() {
  const { user } = useAuth();
  const { isPro } = useRevenueCat();
  const { colors } = useTheme();
  const {
    bookshelves,
    isLoading,
    fetchBookshelves,
    deleteBookshelf,
    bookshelfCount,
  } = useBookshelves();
  const [refreshing, setRefreshing] = useState(false);

  // Refetch when the screen regains focus so shelves created or modified on
  // other screens (create-bookshelf, onboarding, bookshelf detail) appear
  // without a manual pull-to-refresh. The hook already fetches on mount, so
  // skip the first focus to avoid a duplicate request.
  const hasFocusedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedRef.current) {
        hasFocusedRef.current = true;
        return;
      }
      fetchBookshelves();
    }, [fetchBookshelves])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchBookshelves();
    setRefreshing(false);
  }, [fetchBookshelves]);

  const handleBookshelfPress = (bookshelf: Bookshelf) => {
    router.push({ pathname: '/bookshelf', params: { id: bookshelf.id } });
  };

  const handleDeleteBookshelf = async (bookshelf: Bookshelf) => {
    const success = await deleteBookshelf(bookshelf.id);
    if (!success) {
      Alert.alert('Error', 'Failed to delete bookshelf. Please try again.');
    }
  };

  const handleAddBookshelf = () => {
    // RevenueCat entitlement is the source of truth; the Supabase flag is a
    // synced cache that can lag behind (e.g. right after a purchase).
    const isPremium = isPro || user?.is_premium;
    if (!isPremium && bookshelfCount >= FREE_TIER_LIMITS.MAX_BOOKSHELVES) {
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
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>Your shelves</Text>
            <Text style={[styles.heading, { color: colors.text }]}>My Library</Text>
            <Text style={[styles.subheading, { color: colors.textSecondary }]}>
              {bookshelves.length === 0
                ? 'Build a reading space that feels intentional from the first shelf onward.'
                : `${bookshelves.length} ${bookshelves.length === 1 ? 'bookshelf' : 'bookshelves'} organized and ready to explore.`}
            </Text>
          </View>
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
              pressed && { opacity: 0.92 },
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
    paddingBottom: Spacing.xl,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  headerText: {
    gap: Spacing.xs,
  },
  eyebrow: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('semibold'),
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  heading: {
    fontSize: Typography.sizes.xxl,
    fontFamily: getFontFamily('bold'),
  },
  subheading: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('regular'),
    lineHeight: 20,
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
    fontFamily: getFontFamily('medium'),
  },
  bottomPadding: {
    height: Spacing.xl,
  },
});
