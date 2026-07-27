/**
 * Community Screen
 *
 * Discover other readers and browse public bookshelves.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { FREE_TIER_LIMITS, bookshelvesService, moderationService } from '@/services';
import { UserSearchResult } from '@/components/UserSearchResult';
import { BookshelfPreview } from '@/components/BookshelfPreview';
import { Input, EmptyState, Button } from '@/components/ui';
import { Spacing, Typography, BorderRadius, getFontFamily, getSerifFontFamily } from '@/constants/theme';
import type { Bookshelf, Book } from '@/types';

/** Decorative mini spines in the hero card, in warm cloth colors */
const HERO_MINI_SPINES = [
  { color: '#7c3b2e', height: 34 },
  { color: '#c08a2d', height: 42 },
  { color: '#3f5641', height: 30 },
  { color: '#2d3a54', height: 38 },
  { color: '#d9c9a8', height: 33 },
];

interface PublicBookshelfPreview extends Bookshelf {
  books: Book[];
  /** True shelf size; only a capped slice of `books` is fetched for the preview */
  book_count: number;
  owner: {
    id: string;
    name: string | null;
    public_username: string | null;
  };
}

const PUBLIC_PREVIEW_LIMIT = 6;

export default function CommunityScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<{ id: string; name: string | null; public_username: string | null }[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [publicBookshelfPreviews, setPublicBookshelfPreviews] = useState<PublicBookshelfPreview[]>([]);
  const [isLoadingPublicBookshelves, setIsLoadingPublicBookshelves] = useState(true);

  const canAccessCommunity = user?.is_premium || FREE_TIER_LIMITS.CAN_ACCESS_COMMUNITY;

  // The block list is stable for the whole session unless the user blocks
  // somebody, so it is fetched once and reused rather than re-queried on
  // every keystroke-batch of the search box.
  const blockedIdsRef = useRef<Promise<string[]> | null>(null);
  const getBlockedIds = useCallback(() => {
    if (!blockedIdsRef.current) {
      blockedIdsRef.current = moderationService.getBlockedUserIds();
    }
    return blockedIdsRef.current;
  }, []);

  const loadPublicBookshelfPreviews = useCallback(async () => {
    try {
      // Pull-to-refresh is also how a user expects a fresh block list to
      // take effect, so drop the cached one first.
      blockedIdsRef.current = null;
      const [result, blockedIds] = await Promise.all([
        bookshelvesService.getRandomPublicBookshelfPreviews(PUBLIC_PREVIEW_LIMIT),
        getBlockedIds(),
      ]);
      if (result.data) {
        const blocked = new Set(blockedIds);
        setPublicBookshelfPreviews(
          result.data.filter((shelf) => !blocked.has(shelf.owner.id))
        );
      }
    } catch (error) {
      console.error('Failed to load public bookshelf previews:', error);
    } finally {
      setIsLoadingPublicBookshelves(false);
      setRefreshing(false);
    }
  }, [getBlockedIds]);

  useEffect(() => {
    if (canAccessCommunity) {
      loadPublicBookshelfPreviews();
    } else {
      setIsLoadingPublicBookshelves(false);
    }
  }, [canAccessCommunity, loadPublicBookshelfPreviews]);

  // Monotonic token so a slow request for an earlier query can never
  // overwrite the results of a later one. Without it, typing "tolkien" and
  // pausing mid-word leaves whichever response happens to land last on
  // screen — which on a flaky connection is regularly the wrong one.
  const searchRunIdRef = useRef(0);

  useEffect(() => {
    const trimmed = userSearchQuery.trim();

    if (!trimmed) {
      searchRunIdRef.current += 1;
      setUserSearchResults([]);
      setIsSearchingUsers(false);
      return;
    }

    const runId = ++searchRunIdRef.current;
    setIsSearchingUsers(true);

    const searchUsers = async () => {
      try {
        const [result, blockedIds] = await Promise.all([
          bookshelvesService.searchUsers(trimmed),
          getBlockedIds(),
        ]);

        if (runId !== searchRunIdRef.current) return;

        const blocked = new Set(blockedIds);
        setUserSearchResults(result.data?.filter((u) => !blocked.has(u.id)) ?? []);
      } catch (error) {
        if (runId !== searchRunIdRef.current) return;
        console.error('User search failed:', error);
        setUserSearchResults([]);
      } finally {
        if (runId === searchRunIdRef.current) {
          setIsSearchingUsers(false);
        }
      }
    };

    const timeoutId = setTimeout(searchUsers, 500);
    return () => clearTimeout(timeoutId);
  }, [userSearchQuery, getBlockedIds]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadPublicBookshelfPreviews();
  }, [loadPublicBookshelfPreviews]);

  const handleUserPress = (selectedUser: { id: string; name: string | null; public_username?: string | null }) => {
    setUserSearchQuery('');
    setUserSearchResults([]);
    router.push({
      pathname: '/user/[id]',
      params: {
        id: selectedUser.id,
        name: selectedUser.name ?? '',
        public_username: selectedUser.public_username ?? '',
      },
    });
  };

  const handlePublicBookshelfPress = (bookshelf: PublicBookshelfPreview) => {
    router.push({
      pathname: '/user/[id]',
      params: {
        id: bookshelf.owner.id,
        name: bookshelf.owner.name ?? '',
        public_username: bookshelf.owner.public_username ?? '',
      },
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
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroSection}>
          <LinearGradient
            colors={['#3a2418', '#5c3a22']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroMiniSpines} pointerEvents="none">
            {HERO_MINI_SPINES.map((spine, index) => (
              <View
                key={index}
                style={[styles.heroMiniSpine, { backgroundColor: spine.color, height: spine.height }]}
              />
            ))}
          </View>
          <Text style={styles.heroEyebrow}>Community</Text>
          <Text style={styles.heroTitle}>Discover other shelves</Text>
          <Text style={styles.heroSubtitle}>Browse public libraries from readers around the world.</Text>
        </View>

        <View style={[styles.userSearchContainer, { backgroundColor: colors.background }]}>
          <Input
            placeholder="Search readers by name or @username"
            value={userSearchQuery}
            onChangeText={setUserSearchQuery}
            leftIcon="search-outline"
            rightIcon={userSearchQuery ? 'close-circle' : undefined}
            onRightIconPress={() => {
              setUserSearchQuery('');
              setUserSearchResults([]);
            }}
            colors={{ ...colors, inputBackground: colors.card }}
          />

          {(userSearchResults.length > 0 || isSearchingUsers) && (
            <View style={[styles.userSearchResults, { backgroundColor: colors.backgroundDark, borderColor: colors.border }]}>
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
            <View style={[styles.noResultsContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.noResultsText, { color: colors.textSecondary }]}>No users found</Text>
            </View>
          )}
        </View>

        <View style={styles.previewsSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Public bookshelves</Text>

          {isLoadingPublicBookshelves ? (
            <View style={[styles.loadingContainer, styles.previewsContentInset]}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading bookshelf previews...</Text>
            </View>
          ) : publicBookshelfPreviews.length === 0 ? (
            <View
              style={[
                styles.noResultsContainer,
                styles.previewsContentInset,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.noResultsText, { color: colors.textSecondary }]}>No public bookshelves available yet.</Text>
            </View>
          ) : (
            publicBookshelfPreviews.map((bookshelf) => (
              <BookshelfPreview
                key={bookshelf.id}
                bookshelf={bookshelf}
                books={bookshelf.books}
                totalBooks={bookshelf.book_count}
                onPress={() => handlePublicBookshelfPress(bookshelf)}
                containerStyle={styles.previewCard}
                owner={bookshelf.owner}
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
  scrollContent: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },
  heroSection: {
    marginHorizontal: Spacing.md,
    padding: Spacing.lg,
    borderRadius: 22,
    gap: Spacing.xs,
    overflow: 'hidden',
  },
  heroEyebrow: {
    fontSize: 11,
    fontFamily: getFontFamily('semibold'),
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: '#e0a562',
  },
  heroTitle: {
    fontSize: 26,
    fontFamily: getSerifFontFamily('medium'),
    color: '#f7efe0',
  },
  heroSubtitle: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('regular'),
    lineHeight: 20,
    color: 'rgba(247, 239, 224, 0.72)',
    maxWidth: '80%',
  },
  heroMiniSpines: {
    position: 'absolute',
    right: Spacing.md,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    opacity: 0.5,
  },
  heroMiniSpine: {
    width: 9,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  userSearchContainer: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  previewsSection: {
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: getSerifFontFamily('medium'),
  },
  userSearchResults: {
    marginTop: Spacing.xs,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: 200,
    gap: Spacing.xs,
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
    fontFamily: getFontFamily('regular'),
  },
  noResultsContainer: {
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
  },
  noResultsText: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('regular'),
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  previewsContentInset: {
    marginHorizontal: 0,
  },
  previewCard: {
    marginHorizontal: 0,
  },
  loadingText: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('regular'),
  },
  premiumGate: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
});
