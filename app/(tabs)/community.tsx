/**
 * Community Screen
 *
 * Discover other readers and browse public bookshelves.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { FREE_TIER_LIMITS, bookshelvesService } from '@/services';
import { UserSearchResult } from '@/components/UserSearchResult';
import { BookshelfPreview } from '@/components/BookshelfPreview';
import { Input, EmptyState, Button } from '@/components/ui';
import { Spacing, Typography, BorderRadius } from '@/constants/theme';
import type { Bookshelf, Book } from '@/types';

interface PublicBookshelfPreview extends Bookshelf {
  books: Book[];
  owner: {
    id: string;
    name: string | null;
  };
}

const PUBLIC_PREVIEW_LIMIT = 6;

export default function CommunityScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  // User search state
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<{ id: string; name: string | null }[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);

  // Public bookshelf previews
  const [publicBookshelfPreviews, setPublicBookshelfPreviews] = useState<PublicBookshelfPreview[]>([]);
  const [isLoadingPublicBookshelves, setIsLoadingPublicBookshelves] = useState(true);

  const canAccessCommunity = user?.is_premium || FREE_TIER_LIMITS.CAN_ACCESS_COMMUNITY;

  const loadPublicBookshelfPreviews = useCallback(async () => {
    try {
      const result = await bookshelvesService.getRandomPublicBookshelfPreviews(PUBLIC_PREVIEW_LIMIT);
      if (result.data) {
        setPublicBookshelfPreviews(result.data);
      }
    } catch (error) {
      console.error('Failed to load public bookshelf previews:', error);
    } finally {
      setIsLoadingPublicBookshelves(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (canAccessCommunity) {
      loadPublicBookshelfPreviews();
    } else {
      setIsLoadingPublicBookshelves(false);
    }
  }, [canAccessCommunity, loadPublicBookshelfPreviews]);

  useEffect(() => {
    const searchUsers = async () => {
      if (!userSearchQuery.trim()) {
        setUserSearchResults([]);
        setIsSearchingUsers(false);
        return;
      }

      setIsSearchingUsers(true);
      const result = await bookshelvesService.searchUsers(userSearchQuery);
      if (result.data) {
        setUserSearchResults(result.data);
      }
      setIsSearchingUsers(false);
    };

    const timeoutId = setTimeout(searchUsers, 300);
    return () => clearTimeout(timeoutId);
  }, [userSearchQuery]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadPublicBookshelfPreviews();
  }, [loadPublicBookshelfPreviews]);

  const handleUserPress = (selectedUser: { id: string; name: string | null }) => {
    setUserSearchQuery('');
    setUserSearchResults([]);
    router.push({
      pathname: '/user/[id]',
      params: { id: selectedUser.id },
    });
  };

  const handlePublicBookshelfPress = (bookshelf: PublicBookshelfPreview) => {
    router.push({
      pathname: '/user/[id]',
      params: { id: bookshelf.owner.id },
    });
  };

  if (!canAccessCommunity) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right']}>
        <View style={styles.premiumGate}>
          <EmptyState
            icon="lock-closed"
            title="Premium Feature"
            description="Access the community book collection with a Premium subscription. Browse thousands of book spines uploaded by other readers."
            colors={colors}
          />
          <Button
            title="Upgrade to Premium"
            onPress={() => router.push('/payment')}
            size="lg"
            colors={colors}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right']}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* User Search Bar */}
        <View style={[styles.userSearchContainer, { backgroundColor: colors.background }]}> 
          <View style={styles.userSearchHeader}>
            <Ionicons name="people" size={18} color={colors.primary} />
            <Text style={[styles.userSearchLabel, { color: colors.primary }]}>Find Users</Text>
          </View>
          <Input
            placeholder="Search by user name..."
            value={userSearchQuery}
            onChangeText={setUserSearchQuery}
            leftIcon="person-outline"
            rightIcon={userSearchQuery ? 'close-circle' : undefined}
            onRightIconPress={() => {
              setUserSearchQuery('');
              setUserSearchResults([]);
            }}
            containerStyle={styles.searchInput}
            colors={colors}
          />

          {(userSearchResults.length > 0 || isSearchingUsers) && (
            <View style={[styles.userSearchResults, { backgroundColor: colors.backgroundDark }]}>
              {isSearchingUsers ? (
                <View style={styles.searchingIndicator}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.searchingText, { color: colors.textSecondary }]}>Searching users...</Text>
                </View>
              ) : userSearchResults.length > 0 ? (
                userSearchResults.map((resultUser) => (
                  <UserSearchResult key={resultUser.id} user={resultUser} onPress={handleUserPress} />
                ))
              ) : null}
            </View>
          )}

          {userSearchQuery.trim() && !isSearchingUsers && userSearchResults.length === 0 && (
            <View style={styles.noResultsContainer}>
              <Text style={[styles.noResultsText, { color: colors.textSecondary }]}>No users found</Text>
            </View>
          )}
        </View>

        {/* Public bookshelf previews */}
        <View style={styles.previewsSection}>
          <View style={styles.userSearchHeader}>
            <Ionicons name="library" size={18} color={colors.primary} />
            <Text style={[styles.userSearchLabel, { color: colors.primary }]}>Public Bookshelves</Text>
          </View>

          {isLoadingPublicBookshelves ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading bookshelf previews...</Text>
            </View>
          ) : publicBookshelfPreviews.length === 0 ? (
            <View style={styles.noResultsContainer}>
              <Text style={[styles.noResultsText, { color: colors.textSecondary }]}>No public bookshelves available yet.</Text>
            </View>
          ) : (
            publicBookshelfPreviews.map((bookshelf) => (
              <BookshelfPreview
                key={bookshelf.id}
                bookshelf={bookshelf}
                books={bookshelf.books.slice(0, 4)}
                onPress={() => handlePublicBookshelfPress(bookshelf)}
              />
            ))
          )}
        </View>
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
  userSearchContainer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  previewsSection: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  userSearchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  userSearchLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  userSearchResults: {
    marginTop: Spacing.xs,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    maxHeight: 200,
  },
  searchingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  searchingText: {
    fontSize: Typography.sizes.sm,
  },
  noResultsContainer: {
    padding: Spacing.md,
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: Typography.sizes.sm,
  },
  searchInput: {
    marginBottom: 0,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: Typography.sizes.sm,
  },
  premiumGate: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
});
