/**
 * BrowseBooksModal Component
 *
 * A popup modal for searching and adding community books to a bookshelf.
 * Opened from the "Browse Community" option in the bookshelf add-book menu.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { booksService } from '@/services/books';
import { CommunitySpineBrowserModal } from '@/components/CommunitySpineBrowserModal';
import { Input } from '@/components/ui';
import { BorderRadius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { getCoverImageUrl, getSpineImageUrl } from '@/services/storage';
import { searchBookVolumes } from '@/services/isbndb';
import type { Book, CommunityBookSpine } from '@/types';

/** Search result with a resolved cover image URL for the results list */
type BookSearchResult = CommunityBookSpine & {
  cover_url?: string | null;
  /** Canonical ISBN from the API supplement, persisted when the add creates a new record */
  isbn13?: string | null;
};

/** Key used to collapse duplicate editions/records of the same book */
function bookKey(title: string, author: string): string {
  return `${(title || '').trim().toLowerCase()}|${(author || '').trim().toLowerCase()}`;
}

interface LocalBookRow {
  id: string;
  title: string;
  author: string;
  image_url: string | null;
  cover_image_url: string | null;
  uploaded_by_user_id: string;
  created_at: string;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH * 0.9, 420);
const CARD_MAX_HEIGHT = Math.min(SCREEN_HEIGHT * 0.85, 680);

interface BrowseBooksModalProps {
  visible: boolean;
  shelfId: string;
  onClose: () => void;
  onBookAdded: () => void;
}

export function BrowseBooksModal({
  visible,
  shelfId,
  onClose,
  onBookAdded,
}: BrowseBooksModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [searchQuery, setSearchQuery] = useState('');
  const [bookSearchResults, setBookSearchResults] = useState<BookSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  // Book just added with a placeholder spine — target for the community
  // spine picker that we offer right after the add.
  const [spinePickerBook, setSpinePickerBook] = useState<Book | null>(null);
  const [isApplyingSpine, setIsApplyingSpine] = useState(false);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(24)).current;
  const cardScale = useRef(new Animated.Value(0.98)).current;

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setSearchQuery('');
      setBookSearchResults([]);
      setIsSearching(false);
      setIsAdding(null);
      setIsClosing(false);
      setSpinePickerBook(null);
      setIsApplyingSpine(false);

      overlayOpacity.setValue(0);
      cardOpacity.setValue(0);
      cardTranslateY.setValue(24);
      cardScale.setValue(0.98);

      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(cardTranslateY, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(cardScale, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, overlayOpacity, cardOpacity, cardTranslateY, cardScale]);

  // Debounced search: Supabase first, then the ISBNdb API for additional
  // results. `searchRunIdRef` discards responses from a superseded query —
  // the Supabase and ISBNdb legs finish at very different speeds, so without
  // it a slow earlier search regularly lands on top of a newer one.
  const searchRunIdRef = useRef(0);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();

    if (!trimmedQuery) {
      searchRunIdRef.current += 1;
      setBookSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    const runId = ++searchRunIdRef.current;

    const timeoutId = setTimeout(async () => {
      try {
        // 1. Search Supabase for existing books first (free, fast)
        const { data: localBooks } = await booksService.searchBooks(trimmedQuery, 40);

        // Collapse duplicate records of the same book (many users can own the
        // same title), merging in spine/cover images from later duplicates.
        const localRows = (localBooks || []) as LocalBookRow[];
        const localByKey = new Map<string, LocalBookRow>();
        for (const book of localRows) {
          const key = bookKey(book.title, book.author);
          const existing = localByKey.get(key);
          if (!existing) {
            localByKey.set(key, { ...book });
          } else {
            if (!existing.image_url && book.image_url) existing.image_url = book.image_url;
            if (!existing.cover_image_url && book.cover_image_url) existing.cover_image_url = book.cover_image_url;
          }
        }
        const dedupedLocalBooks = Array.from(localByKey.values()).slice(0, 20);

        const localResults: BookSearchResult[] = await Promise.all(
          dedupedLocalBooks.map(async (book) => {
            let resolvedUrl: string | null = null;
            let coverUrl: string | null = null;
            if (book.image_url) {
              try {
                resolvedUrl = await getSpineImageUrl(book.image_url);
              } catch {}
            }
            if (book.cover_image_url) {
              try {
                coverUrl = await getCoverImageUrl(book.cover_image_url);
              } catch {}
            }
            return {
              id: book.id,
              title: book.title,
              author: book.author,
              image_url: resolvedUrl,
              cover_url: coverUrl,
              uploaded_by_user_id: book.uploaded_by_user_id,
              uploader_name: null,
              times_added: 0,
              created_at: book.created_at,
            };
          })
        );

        // Show local results immediately while the API supplement loads
        if (runId !== searchRunIdRef.current) return;
        if (localResults.length > 0) {
          setBookSearchResults(localResults);
        }

        // 2. Always supplement with the ISBNdb API so searching a
        // prolific author lists their whole catalog, not only the titles
        // other users happen to own already.
        const apiVolumes = await searchBookVolumes(trimmedQuery, 20);
        const localKeys = new Set(localResults.map((b) => bookKey(b.title, b.author)));
        const dedupedApiItems: BookSearchResult[] = apiVolumes
          .filter((volume) => !localKeys.has(bookKey(volume.title, volume.author)))
          .map((volume) => ({
            id: volume.id,
            title: volume.title,
            author: volume.author,
            image_url: null,
            cover_url: volume.thumbnail,
            isbn13: volume.isbn13,
            uploaded_by_user_id: '',
            uploader_name: null,
            times_added: 0,
            created_at: new Date().toISOString(),
          }));

        // Resolve spine images for API results that exist in Supabase.
        // One batched lookup for the whole page of results — this used to be
        // a separate query per result, i.e. up to 20 round trips per search.
        const existingByKey = await booksService.findExistingBooksWithSpines(dedupedApiItems);

        const apiItemsWithImages = await Promise.all(
          dedupedApiItems.map(async (item) => {
            const matchedBook = existingByKey.get(bookKey(item.title, item.author));
            if (!matchedBook?.image_url) return item;

            try {
              const resolvedUrl = await getSpineImageUrl(matchedBook.image_url);
              let coverUrl = item.cover_url;
              if (!coverUrl && matchedBook.cover_image_url) {
                coverUrl = await getCoverImageUrl(matchedBook.cover_image_url);
              }
              // Carry uploaded_by_user_id so handleAddBook treats this as an
              // existing book and references its row — otherwise the add
              // creates a fresh record without the spine image.
              return {
                ...item,
                id: matchedBook.id,
                uploaded_by_user_id: matchedBook.uploaded_by_user_id ?? '',
                image_url: resolvedUrl,
                cover_url: coverUrl,
              };
            } catch {
              return item;
            }
          })
        );

        if (runId !== searchRunIdRef.current) return;
        setBookSearchResults([...localResults, ...apiItemsWithImages]);
      } catch {
        if (runId !== searchRunIdRef.current) return;
        setBookSearchResults([]);
      }
      if (runId !== searchRunIdRef.current) return;
      setIsSearching(false);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 0,
        duration: 140,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(cardTranslateY, {
        toValue: 16,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardScale, {
        toValue: 0.98,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsClosing(false);
      onClose();
    });
  };

  const addBookToShelf = async (book: BookSearchResult, isExistingBook: boolean) => {
    setIsAdding(book.id);
    try {
      const result = isExistingBook
        ? await booksService.addCommunityBookToShelf(book, shelfId)
        : await booksService.createBook({
            title: book.title,
            author: book.author,
            isbn: book.isbn13 || undefined,
            shelf_id: shelfId,
            is_community: false,
          });

      if (result.data) {
        onBookAdded();
        const addedBook = result.data;
        if (!addedBook.image_url) {
          // The book landed on the shelf with a blank placeholder spine —
          // tell the user, and offer the community spine picker when other
          // users have already uploaded a spine photo for this book.
          const spinesResult = await booksService.getAlternativeSpines(addedBook);
          const hasCommunitySpines = (spinesResult.data || []).length > 0;

          if (hasCommunitySpines) {
            Alert.alert(
              'Added with Placeholder Spine',
              `"${book.title}" was added to your shelf, but it doesn't have a spine photo yet. Want to pick a spine image from the community?`,
              [
                { text: 'Not Now', style: 'cancel' },
                { text: 'Choose Spine', onPress: () => setSpinePickerBook(addedBook) },
              ]
            );
          } else {
            Alert.alert(
              'Added with Placeholder Spine',
              `"${book.title}" was added to your shelf. No community spine photos exist for it yet — you can scan or upload one from the book's edit screen.`
            );
          }
        } else {
          // The book landed with a real spine — either the record it
          // references already carried one, or the add picked up a spine
          // somebody had already uploaded for this title. Offer the picker so
          // the user can swap it for a different one when others exist.
          const spinesResult = await booksService.getAlternativeSpines(addedBook);
          const otherSpines = spinesResult.data || [];

          if (otherSpines.length > 0) {
            Alert.alert(
              'Added',
              `"${book.title}" was added to your shelf with an existing spine photo. Want to use a different one?`,
              [
                { text: 'Keep This Spine', style: 'cancel' },
                { text: 'Choose Another', onPress: () => setSpinePickerBook(addedBook) },
              ]
            );
          } else {
            Alert.alert('Added', `"${book.title}" has been added to your shelf.`);
          }
        }
      } else if (result.error) {
        Alert.alert('Error', result.error.message);
      }
    } catch {
      Alert.alert('Error', 'Failed to add book to shelf');
    } finally {
      setIsAdding(null);
    }
  };

  const handleSpinePicked = async (option: CommunityBookSpine) => {
    if (!spinePickerBook || isApplyingSpine) return;

    setIsApplyingSpine(true);
    try {
      const result = await booksService.setBookSpineFromCommunity(spinePickerBook.id, option);
      if (result.data) {
        onBookAdded();
        setSpinePickerBook(null);
        Alert.alert('Spine Updated', 'The selected community spine is now on your shelf.');
      } else {
        Alert.alert('Error', result.error?.message || 'Failed to apply the spine.');
      }
    } catch {
      Alert.alert('Error', 'Failed to apply the spine.');
    } finally {
      setIsApplyingSpine(false);
    }
  };

  const handleAddBook = async (book: BookSearchResult) => {
    // If the book has an existing Supabase ID (matched from community), reference it
    // Otherwise create a new book record
    const isExistingBook = book.uploaded_by_user_id !== '';

    // Confirm before adding a book that is already on this shelf
    if (isExistingBook) {
      setIsAdding(book.id);
      const alreadyOnShelf = await booksService.isBookOnShelf(book.id, shelfId);
      setIsAdding(null);

      if (alreadyOnShelf) {
        Alert.alert(
          'Duplicate Book',
          'Are you sure you want to add a duplicate book?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Add', onPress: () => addBookToShelf(book, isExistingBook) },
          ]
        );
        return;
      }
    }

    await addBookToShelf(book, isExistingBook);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity, backgroundColor: colors.overlay }]}>
        <Pressable style={styles.backdropPress} onPress={handleClose} accessible={false} />

        {/* The card fills the space the keyboard leaves rather than sizing to
            its content, so the header and search bar keep a fixed position no
            matter how many results come back. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
          // Only the top inset is set here: with `behavior="padding"` the
          // KeyboardAvoidingView owns paddingBottom, so the card carries its
          // own bottom gap instead.
          style={[styles.keyboardView, { paddingTop: insets.top + Spacing.md }]}
        >
          <Animated.View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.inputBorder,
                opacity: cardOpacity,
                transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
              },
            ]}
          >
            {/* Header */}
            <View style={[styles.headerRow, { borderBottomColor: colors.inputBorder }]}>
              <View style={styles.headerTitle}>
                <Ionicons name="book" size={20} color={colors.primary} />
                <Text style={[styles.pageTitle, { color: colors.text }]}>Browse Books</Text>
              </View>
              <Pressable onPress={handleClose} style={styles.iconButton} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            {/* Search Input */}
            <View style={styles.searchSection}>
              <Input
                placeholder="Search by title or author..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                leftIcon="search"
                rightIcon={searchQuery ? 'close-circle' : undefined}
                onRightIconPress={() => {
                  setSearchQuery('');
                  setBookSearchResults([]);
                }}
                containerStyle={styles.searchInput}
                colors={colors}
              />
            </View>

            {/* Results */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              {isSearching ? (
                <View style={styles.centerContainer}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.statusText, { color: colors.textSecondary }]}>Searching books...</Text>
                </View>
              ) : bookSearchResults.length > 0 ? (
                bookSearchResults.map((book) => (
                  <Pressable
                    key={book.id}
                    style={[styles.bookRow, { backgroundColor: colors.backgroundDark }]}
                    onPress={() => handleAddBook(book)}
                    disabled={isAdding === book.id}
                  >
                    {book.cover_url ? (
                      <Image source={{ uri: book.cover_url }} style={styles.bookThumbnail} contentFit="cover" />
                    ) : (
                      <View style={[styles.bookThumbnail, { backgroundColor: colors.background }]} />
                    )}
                    <View style={styles.bookInfo}>
                      <Text style={[styles.bookTitle, { color: colors.text }]} numberOfLines={1}>
                        {book.title}
                      </Text>
                      <Text style={[styles.bookAuthor, { color: colors.textSecondary }]} numberOfLines={1}>
                        {book.author}
                      </Text>
                    </View>
                    {isAdding === book.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
                    )}
                  </Pressable>
                ))
              ) : searchQuery.trim() ? (
                <View style={styles.centerContainer}>
                  <Ionicons name="search-outline" size={32} color={colors.textLight} />
                  <Text style={[styles.statusText, { color: colors.textSecondary }]}>No books found</Text>
                </View>
              ) : (
                <View style={styles.centerContainer}>
                  <Ionicons name="search" size={32} color={colors.textLight} />
                  <Text style={[styles.statusText, { color: colors.textSecondary }]}>
                    Search for books to add to your shelf
                  </Text>
                </View>
              )}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>

      {/* Community spine picker for books added with a placeholder spine */}
      <CommunitySpineBrowserModal
        visible={spinePickerBook !== null}
        book={spinePickerBook}
        isUpdatingSpine={isApplyingSpine}
        onSelect={handleSpinePicked}
        onClose={() => setSpinePickerBook(null)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  keyboardView: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  card: {
    width: CARD_WIDTH,
    // flex + maxHeight sizes the card from the available space instead of from
    // the number of results, which is what keeps the search bar from drifting
    // off the top of the screen once a search returns a long list.
    flex: 1,
    maxHeight: CARD_MAX_HEIGHT,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  pageTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  iconButton: {
    padding: Spacing.xs,
  },
  searchSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  searchInput: {
    marginBottom: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: Spacing.md,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  bookThumbnail: {
    width: 36,
    height: 52,
    borderRadius: BorderRadius.sm,
  },
  bookInfo: {
    flex: 1,
  },
  bookTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
  },
  bookAuthor: {
    fontSize: Typography.sizes.xs,
    marginTop: 2,
  },
  centerContainer: {
    // Fills the results area so the empty/loading states sit centred under the
    // search bar instead of hugging the top of the now taller card.
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  statusText: {
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
  },
});

export default BrowseBooksModal;
