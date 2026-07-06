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
  Pressable,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { bookshelvesService } from '@/services/bookshelves';
import { moderationService, REPORT_REASONS } from '@/services/moderation';
import { BookshelfPreview } from '@/components/BookshelfPreview';
import { LoadingView, EmptyState } from '@/components/ui';
import { Colors, Spacing, Typography, BorderRadius } from '@/constants/theme';
import type { Bookshelf, Book } from '@/types';

interface UserData {
  id: string;
  name: string | null;
  public_username: string | null;
}

interface BookshelfWithBooks extends Bookshelf {
  books: Book[];
}

export default function UserProfileScreen() {
  const { id, name: routeName, public_username: routePublicUsername } = useLocalSearchParams<{
    id: string;
    name?: string;
    public_username?: string;
  }>();
  const { user: currentUser } = useAuth();
  const [user, setUser] = useState<UserData | null>(null);
  const [bookshelves, setBookshelves] = useState<BookshelfWithBooks[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwnProfile = currentUser?.id === id;
  const displayNameForMenu =
    user?.name || (user?.public_username ? `@${user.public_username}` : 'This User');

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
        setUser((previousUser) => ({
          ...result.data.user,
          name: result.data.user.name ?? previousUser?.name ?? null,
          public_username:
            result.data.user.public_username ?? previousUser?.public_username ?? null,
        }));
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

  useEffect(() => {
    if (!id) return;
    if (!routeName && !routePublicUsername) return;

    setUser((previousUser) =>
      previousUser ?? {
        id,
        name: routeName || null,
        public_username: routePublicUsername || null,
      }
    );
  }, [id, routeName, routePublicUsername]);

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

  /**
   * Report this user's content (App Store Guideline 1.2).
   * Presents a reason picker, then files a content_reports row.
   */
  const handleReportUser = useCallback(() => {
    if (!id) return;

    Alert.alert(
      'Report Content',
      'Why are you reporting this user?',
      [
        ...REPORT_REASONS.map((reason) => ({
          text: reason,
          onPress: async () => {
            const result = await moderationService.reportUser(id, reason);
            if (result.error) {
              Alert.alert('Report Failed', result.error.message);
              return;
            }
            Alert.alert(
              'Report Submitted',
              'Thank you. We review reports within 24 hours and remove content that violates our guidelines.'
            );
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  }, [id]);

  /**
   * Block this user. Their shelves stop appearing in community surfaces.
   */
  const handleBlockUser = useCallback(() => {
    if (!id) return;

    Alert.alert(
      'Block User',
      "You won't see this user's shelves or profile in the community anymore.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            const result = await moderationService.blockUser(id);
            if (result.error) {
              Alert.alert('Block Failed', result.error.message);
              return;
            }
            Alert.alert('User Blocked', 'You will no longer see their content.', [
              { text: 'OK', onPress: () => router.back() },
            ]);
          },
        },
      ]
    );
  }, [id]);

  /**
   * "..." menu with moderation actions.
   */
  const handleModerationMenu = useCallback(() => {
    Alert.alert(displayNameForMenu, undefined, [
      { text: 'Report Content', onPress: handleReportUser },
      { text: 'Block User', style: 'destructive', onPress: handleBlockUser },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [handleReportUser, handleBlockUser, displayNameForMenu]);

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

  const displayName = user.name || (user.public_username ? `@${user.public_username}` : 'Anonymous User');

  return (
    <>
      <Stack.Screen
        options={{
          title: `${displayName}'s Library`,
          headerRight: isOwnProfile
            ? undefined
            : () => (
                <Pressable
                  onPress={handleModerationMenu}
                  style={styles.headerMenuButton}
                  accessibilityRole="button"
                  accessibilityLabel="Report or block this user"
                >
                  <Ionicons
                    name="ellipsis-horizontal"
                    size={22}
                    color={Colors.textInverse}
                  />
                </Pressable>
              ),
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
            {user.public_username && (
              <Text style={styles.publicUsername}>@{user.public_username}</Text>
            )}
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
  headerMenuButton: {
    padding: Spacing.xs,
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
    marginBottom: Spacing.xs,
  },
  publicUsername: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
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
