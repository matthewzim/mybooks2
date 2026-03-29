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
import { booksService } from '@/services/books';
import { Input } from '@/components/ui';
import { BorderRadius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase, TABLES } from '@/services/supabase';
import { getSpineImageUrl } from '@/services/storage';
import type { CommunityBookSpine } from '@/types';

const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes';

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

  const [searchQuery, setSearchQuery] = useState('');
  const [bookSearchResults, setBookSearchResults] = useState<CommunityBookSpine[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

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

  // Debounced search via Google Books API
  useEffect(() => {
    const trimmedQuery = searchQuery.trim();

    if (!trimmedQuery) {
      setBookSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    const timeoutId = setTimeout(async () => {
      try {
        const apiKey = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY || '';
        const keyParam = apiKey ? `&key=${apiKey}` : '';
        const response = await fetch(
          `${GOOGLE_BOOKS_API}?q=${encodeURIComponent(trimmedQuery)}&maxResults=20${keyParam}`
        );

        if (!response.ok) {
          setBookSearchResults([]);
          setIsSearching(false);
          return;
        }

        const data = await response.json();
        const items: CommunityBookSpine[] = (data.items || []).map((item: any) => ({
          id: item.id,
          title: item.volumeInfo?.title || 'Untitled',
          author: item.volumeInfo?.authors?.[0] || 'Unknown Author',
          image_url: null,
          uploaded_by_user_id: '',
          uploader_name: null,
          times_added: 0,
          created_at: new Date().toISOString(),
        }));

        // Check Supabase for existing spine images for each result
        const itemsWithImages = await Promise.all(
          items.map(async (item) => {
            try {
              const { data: matchedBook } = await supabase
                .from(TABLES.BOOKS)
                .select('id, image_url')
                .eq('title', item.title)
                .eq('author', item.author)
                .not('image_url', 'is', null)
                .limit(1)
                .maybeSingle();

              if (matchedBook?.image_url) {
                const resolvedUrl = await getSpineImageUrl(matchedBook.image_url);
                return { ...item, id: matchedBook.id, image_url: resolvedUrl };
              }
            } catch {}
            return item;
          })
        );

        setBookSearchResults(itemsWithImages);
      } catch {
        setBookSearchResults([]);
      }
      setIsSearching(false);
    }, 300);

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

  const handleAddBook = async (book: CommunityBookSpine) => {
    setIsAdding(book.id);
    try {
      // If the book has an existing Supabase ID (matched from community), reference it
      // Otherwise create a new book record
      const isExistingBook = book.uploaded_by_user_id !== '';
      const result = isExistingBook
        ? await booksService.addCommunityBookToShelf(book, shelfId)
        : await booksService.createBook({
            title: book.title,
            author: book.author,
            shelf_id: shelfId,
            is_community: false,
          });

      if (result.data) {
        onBookAdded();
        Alert.alert('Added', `"${book.title}" has been added to your shelf.`);
      } else if (result.error) {
        Alert.alert('Error', result.error.message);
      }
    } catch {
      Alert.alert('Error', 'Failed to add book to shelf');
    } finally {
      setIsAdding(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity, backgroundColor: colors.overlay }]}>
        <Pressable style={styles.backdropPress} onPress={handleClose} accessible={false} />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} pointerEvents="box-none" style={styles.keyboardView}>
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
              showsVerticalScrollIndicator={false}
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
                    {book.image_url ? (
                      <Image source={{ uri: book.image_url }} style={styles.bookThumbnail} contentFit="cover" />
                    ) : (
                      <View style={[styles.bookThumbnail, styles.bookPlaceholder, { backgroundColor: colors.primary }]}>
                        <Text style={[styles.bookPlaceholderTitle, { color: colors.textInverse }]} numberOfLines={3}>
                          {book.title}
                        </Text>
                        <Text style={[styles.bookPlaceholderAuthor, { color: colors.textOnDarkMuted }]} numberOfLines={2}>
                          {book.author}
                        </Text>
                      </View>
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
    padding: Spacing.md,
  },
  card: {
    width: CARD_WIDTH,
    maxHeight: CARD_MAX_HEIGHT,
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
    flexGrow: 0,
    maxHeight: CARD_MAX_HEIGHT - 140,
  },
  scrollContent: {
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
  bookPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  bookPlaceholderTitle: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    textAlign: 'center',
  },
  bookPlaceholderAuthor: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 4,
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
