/**
 * User Profile Screen
 *
 * Displays another user's public bookshelves.
 * Features:
 * - User name header
 * - Grid of public bookshelves with previews
 * - Navigation to view individual bookshelves
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { bookshelvesService } from '@/services/bookshelves';
import { BookshelfPreview } from '@/components/BookshelfPreview';
import { LoadingView, EmptyState } from '@/components/ui';
import { Colors, Spacing, Typography, BorderRadius } from '@/constants/theme';
import type { Bookshelf, Book } from '@/types';

interface UserData {
  id: string;
  name: string | null;
}

interface BookshelfWithBooks extends Bookshelf {
  books: Book[];
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [user, setUser] = useState<UserData | null>(null);
  const [bookshelves, setBookshelves] = useState<BookshelfWithBooks[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch user's public bookshelves
   */
  const loadUserProfile = useCallback(async () => {
    if (!id) return;

    try {
      setError(null);
      const result = await bookshelvesService.getPublicBookshelvesForUser(id);

      if (result.error) {
        setError(result.error.message);
        return;
      }

      if (result.data) {
        setUser(result.data.user);
        setBookshelves(result.data.bookshelves);
      }
    } catch (err) {
      console.error('Failed to load user profile:', err);
      setError('Failed to load user profile');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    loadUserProfile();
  }, [loadUserProfile]);

  /**
   * Handle pull to refresh
   */
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadUserProfile();
  }, [loadUserProfile]);

  /**
   * Handle bookshelf press - navigate to view-only bookshelf
   */
  const handleBookshelfPress = (bookshelf: Bookshelf) => {
    router.push({
      pathname: '/bookshelf',
      params: { id: bookshelf.id },
    });
  };

  // Loading state
  if (isLoading) {
    return <LoadingView message="Loading profile..." />;
  }

  // Error state
  if (error || !user) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen
          options={{
            title: 'User Profile',
          }}
        />
        <EmptyState
          icon="alert-circle-outline"
          title="User Not Found"
          description={error || 'This user may not exist or their profile is private.'}
          actionLabel="Go Back"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  const displayName = user.name || 'Anonymous User';

  return (
    <>
      <Stack.Screen
        options={{
          title: `${displayName}'s Library`,
        }}
      />

      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
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
          {/* User Header */}
          <View style={styles.header}>
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarText}>
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.userName}>{displayName}</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Ionicons name="library-outline" size={18} color={Colors.primary} />
                <Text style={styles.statText}>
                  {bookshelves.length} public {bookshelves.length === 1 ? 'shelf' : 'shelves'}
                </Text>
              </View>
            </View>
          </View>

          {/* Bookshelves */}
          {bookshelves.length === 0 ? (
            <View style={styles.emptyContainer}>
              <EmptyState
                icon="library-outline"
                title="No Public Bookshelves"
                description={`${displayName} hasn't made any bookshelves public yet.`}
              />
            </View>
          ) : (
            <View style={styles.bookshelvesContainer}>
              <Text style={styles.sectionTitle}>Public Bookshelves</Text>
              {bookshelves.map((bookshelf) => (
                <BookshelfPreview
                  key={bookshelf.id}
                  bookshelf={bookshelf}
                  books={bookshelf.books}
                  onPress={handleBookshelfPress}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
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
    paddingBottom: Spacing.xl,
  },
  header: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: Typography.weights.bold,
    color: Colors.textInverse,
  },
  userName: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statText: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    paddingTop: Spacing.xxl,
  },
  bookshelvesContainer: {
    paddingTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
});
