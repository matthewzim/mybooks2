/**
 * PopulateStep - Add books to shelf
 *
 * Offers: Search, Scan a real shelf, Generate sample shelf, or Skip.
 * Tappable option cards instead of forms.
 * (Goodreads CSV import lives on the Settings page.)
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Spacing, BorderRadius, Typography, getFontFamily } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useOnboarding, SAMPLE_BOOKS, type PreviewBook } from './OnboardingContext';
import { LivePreview } from './LivePreview';
import { ScanShelfPanel } from './ScanShelfPanel';
import { BookSpine as BookSpineConstants } from '@/constants/theme';
import { supabase, TABLES } from '@/services/supabase';
import { getCoverImageUrl, getSpineImageUrl } from '@/services/storage';
import { searchBookVolumes } from '@/services/isbndb';

function getBookColor(title?: string | null): string {
  const colors = BookSpineConstants.colors;
  const safeTitle = title?.trim() || 'Untitled';
  let hash = 0;
  for (let i = 0; i < safeTitle.length; i++) {
    hash = safeTitle.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

interface SearchResult {
  id: string;
  title: string;
  author: string;
  image_url?: string | null;
  source_image_url?: string | null;
  /** Resolved book cover image URL for display in the results list */
  cover_url?: string | null;
}

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
}

function OptionCard({
  icon,
  label,
  description,
  onPress,
  accent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  onPress: () => void;
  accent?: boolean;
}) {
  const { colors } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        style={[
          styles.optionCard,
          {
            backgroundColor: accent ? colors.accent : colors.card,
            borderColor: accent ? colors.accent : colors.border,
          },
        ]}
        onPress={onPress}
        onPressIn={() => Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start()}
      >
        <View style={[styles.iconCircle, {
          backgroundColor: accent ? 'rgba(255,255,255,0.2)' : colors.backgroundDark,
        }]}>
          <Ionicons name={icon} size={22} color={accent ? '#fff' : colors.accent} />
        </View>
        <View style={styles.optionText}>
          <Text style={[styles.optionLabel, { color: accent ? '#fff' : colors.text }]}>
            {label}
          </Text>
          <Text style={[styles.optionDesc, { color: accent ? 'rgba(255,255,255,0.8)' : colors.textSecondary }]}>
            {description}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={accent ? 'rgba(255,255,255,0.6)' : colors.textLight} />
      </Pressable>
    </Animated.View>
  );
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const { addBooks } = useOnboarding();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setIsSearching(true);
    setSearchError(null);
    setHasSearched(true);

    try {
      // 1. Search Supabase for existing books first (free, fast)
      const { data: localBooks } = await supabase
        .from(TABLES.BOOKS)
        .select('id, title, author, image_url, cover_image_url')
        .or(`title.ilike.%${trimmed}%,author.ilike.%${trimmed}%`)
        .limit(24);

      // Collapse duplicate records of the same book (many users can own the
      // same title), merging in spine/cover images from later duplicates.
      const localRows = (localBooks || []) as LocalBookRow[];
      const localByKey = new Map<string, LocalBookRow>();
      for (const book of localRows) {
        const key = bookKey(book.title || '', book.author || '');
        const existing = localByKey.get(key);
        if (!existing) {
          localByKey.set(key, { ...book });
        } else {
          if (!existing.image_url && book.image_url) existing.image_url = book.image_url;
          if (!existing.cover_image_url && book.cover_image_url) existing.cover_image_url = book.cover_image_url;
        }
      }
      const dedupedLocalBooks = Array.from(localByKey.values()).slice(0, 8);

      const localResults: SearchResult[] = await Promise.all(
        dedupedLocalBooks.map(async (book) => {
          let resolvedUrl: string | null = null;
          let sourceUrl: string | null = null;
          let coverUrl: string | null = null;
          if (book.image_url) {
            try {
              resolvedUrl = await getSpineImageUrl(book.image_url);
              sourceUrl = book.image_url;
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
            source_image_url: sourceUrl,
            cover_url: coverUrl,
          };
        })
      );

      // Show local results immediately
      if (localResults.length > 0) {
        setResults(localResults);
      }

      // 2. Always supplement with the ISBNdb API so searching a
      // prolific author surfaces their whole catalog, not just the few
      // titles other users happen to own.
      const apiVolumes = await searchBookVolumes(trimmed, 12);
      const apiItems: SearchResult[] = apiVolumes.map((volume) => ({
        id: volume.id,
        title: volume.title,
        author: volume.author,
        cover_url: volume.thumbnail,
      }));

      if (apiItems.length === 0 && localResults.length === 0) {
        setResults([]);
        Keyboard.dismiss();
        return;
      }

      // Deduplicate: drop API results that match local books, and collapse
      // duplicate editions of the same book within the API results.
      const seenKeys = new Set(localResults.map((b) => bookKey(b.title, b.author)));
      const newApiItems: SearchResult[] = [];
      for (const item of apiItems) {
        const key = bookKey(item.title, item.author);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        newApiItems.push(item);
      }

      // Resolve spine images for API results that exist in Supabase
      const apiItemsWithImages = await Promise.all(
        newApiItems.map(async (item) => {
          try {
            const { data: matchedBook } = await supabase
              .from(TABLES.BOOKS)
              .select('image_url')
              .eq('title', item.title)
              .eq('author', item.author)
              .not('image_url', 'is', null)
              .limit(1)
              .maybeSingle();

            if (matchedBook?.image_url) {
              const resolvedUrl = await getSpineImageUrl(matchedBook.image_url);
              return { ...item, image_url: resolvedUrl, source_image_url: matchedBook.image_url };
            }
          } catch {}
          return item;
        })
      );

      const combined = [...localResults, ...apiItemsWithImages];
      if (combined.length === 0) {
        setResults([]);
        Keyboard.dismiss();
        return;
      }

      setResults(combined);
    } catch {
      setSearchError('Network error. Check your connection and try again.');
      setResults([]);
    } finally {
      setIsSearching(false);
      Keyboard.dismiss();
    }
  }, [query]);

  const handleAddBook = (result: SearchResult) => {
    const book: PreviewBook = {
      id: `search-${result.id}`,
      title: result.title,
      author: result.author,
      color: getBookColor(result.title),
      genre: 'fiction',
      rating: Math.floor(Math.random() * 2) + 4,
      image_url: result.image_url || null,
      source_image_url: result.source_image_url || null,
    };
    addBooks([book]);
  };

  return (
    <View style={[styles.searchPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.searchHeader}>
        <Text style={[styles.searchTitle, { color: colors.text }]}>Search Books</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.searchInputWithButton}>
        <Pressable
          style={[styles.searchInputRow, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, flex: 1 }]}
          onPress={() => inputRef.current?.focus()}
        >
          <Ionicons name="search" size={18} color={colors.textLight} />
          <TextInput
            ref={inputRef}
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search by title or author..."
            placeholderTextColor={colors.textLight}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoFocus
          />
        </Pressable>
        <Pressable
          style={[styles.searchButton, { backgroundColor: colors.accent, opacity: query.trim() ? 1 : 0.5 }]}
          onPress={handleSearch}
          disabled={!query.trim() || isSearching}
        >
          <Text style={styles.searchButtonText}>Search</Text>
        </Pressable>
      </View>

      {isSearching && <ActivityIndicator style={styles.loader} color={colors.accent} />}

      {searchError && (
        <Text style={[styles.searchErrorText, { color: colors.error || '#ef4444' }]}>{searchError}</Text>
      )}

      {hasSearched && !isSearching && !searchError && results.length === 0 && (
        <Text style={[styles.noResultsText, { color: colors.textSecondary }]}>No results found. Try a different search.</Text>
      )}

      {results.map(result => (
        <Pressable
          key={result.id}
          style={[styles.searchResult, { borderColor: colors.borderLight }]}
          onPress={() => handleAddBook(result)}
        >
          {result.cover_url ? (
            <Image source={{ uri: result.cover_url }} style={styles.resultCover} contentFit="cover" />
          ) : (
            <View style={[styles.resultCover, { backgroundColor: colors.backgroundDark }]} />
          )}
          <View style={styles.resultText}>
            <Text style={[styles.resultTitle, { color: colors.text }]} numberOfLines={1}>{result.title}</Text>
            <Text style={[styles.resultAuthor, { color: colors.textSecondary }]} numberOfLines={1}>{result.author}</Text>
          </View>
          <Ionicons name="add-circle" size={24} color={colors.accent} />
        </Pressable>
      ))}
    </View>
  );
}

export function PopulateStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { colors } = useTheme();
  const { addBooks, books } = useOnboarding();
  const [showSearch, setShowSearch] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [isGeneratingSample, setIsGeneratingSample] = useState(false);

  const handleGenerateSample = useCallback(async () => {
    setIsGeneratingSample(true);
    try {
      // Query Supabase for books that have spine images
      const { data: booksWithSpines, error } = await supabase
        .from(TABLES.BOOKS)
        .select('id, title, author, image_url')
        .not('image_url', 'is', null)
        .limit(8);

      if (error || !booksWithSpines || booksWithSpines.length === 0) {
        // Fallback to hardcoded sample books if no spine images found
        addBooks(SAMPLE_BOOKS);
        return;
      }

      const sampleBooks: PreviewBook[] = await Promise.all(
        booksWithSpines.map(async (book) => {
          const resolvedUrl = await getSpineImageUrl(book.image_url);
          return {
            id: `sample-${book.id}`,
            title: book.title,
            author: book.author,
            color: getBookColor(book.title),
            genre: 'fiction',
            rating: Math.floor(Math.random() * 2) + 4,
            image_url: resolvedUrl,
            source_image_url: book.image_url,
          };
        })
      );

      addBooks(sampleBooks);
    } catch {
      // Fallback to hardcoded sample books
      addBooks(SAMPLE_BOOKS);
    } finally {
      setIsGeneratingSample(false);
    }
  }, [addBooks]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={[styles.stepLabel, { color: colors.accent }]}>STEP 2 OF 4</Text>
        <Text style={[styles.title, { color: colors.text }]}>Populate your shelf</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Add some books to get started
        </Text>
      </View>

      <LivePreview />

      {books.length > 0 && (
        <View style={[styles.bookCount, { backgroundColor: colors.backgroundDark }]}>
          <Ionicons name="book" size={16} color={colors.accent} />
          <Text style={[styles.bookCountText, { color: colors.text }]}>
            {books.length} {books.length === 1 ? 'book' : 'books'} added
          </Text>
        </View>
      )}

      {showSearch ? (
        <SearchPanel onClose={() => setShowSearch(false)} />
      ) : showScan ? (
        <ScanShelfPanel onClose={() => setShowScan(false)} />
      ) : (
        <View style={styles.optionsList}>
          <OptionCard
            icon="search"
            label="Search for books"
            description="Find books by title or author"
            onPress={() => setShowSearch(true)}
          />
          <OptionCard
            icon="camera"
            label="Scan your shelf"
            description="Photograph a real bookshelf to add its books"
            onPress={() => setShowScan(true)}
          />
          <OptionCard
            icon="sparkles"
            label="Generate sample shelf"
            description={isGeneratingSample ? 'Loading...' : 'Add popular books with spine images'}
            onPress={handleGenerateSample}
            accent
          />
        </View>
      )}

      <View style={styles.actions}>
        <Pressable
          style={[styles.nextButton, { backgroundColor: colors.accent }]}
          onPress={onNext}
        >
          <Text style={styles.nextButtonText}>
            {books.length > 0 ? 'Next' : 'Skip for now'}
          </Text>
        </Pressable>
        <Pressable style={styles.backBtn} onPress={onBack}>
          <Text style={[styles.backText, { color: colors.textLight }]}>Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.xl,
    paddingTop: Spacing.xxl,
    gap: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  header: {
    gap: Spacing.xs,
  },
  stepLabel: {
    fontSize: Typography.sizes.xs,
    fontFamily: getFontFamily('semibold'),
    letterSpacing: 1.5,
  },
  title: {
    fontSize: Typography.sizes.xxl,
    fontFamily: getFontFamily('bold'),
  },
  subtitle: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('regular'),
  },
  optionsList: {
    gap: Spacing.sm,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('semibold'),
  },
  optionDesc: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('regular'),
  },
  bookCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  bookCountText: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('medium'),
  },
  searchPanel: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  searchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  searchTitle: {
    fontSize: Typography.sizes.lg,
    fontFamily: getFontFamily('semibold'),
  },
  searchInputWithButton: {
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'stretch',
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.xs,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.sm,
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('regular'),
  },
  searchButton: {
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('semibold'),
  },
  searchErrorText: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('regular'),
    textAlign: 'center',
    paddingVertical: Spacing.sm,
  },
  noResultsText: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('regular'),
    textAlign: 'center',
    paddingVertical: Spacing.sm,
  },
  loader: {
    paddingVertical: Spacing.md,
  },
  searchResult: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  resultCover: {
    width: 32,
    height: 46,
    borderRadius: BorderRadius.sm,
  },
  resultText: {
    flex: 1,
    gap: 2,
  },
  resultTitle: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('medium'),
  },
  resultAuthor: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('regular'),
  },
  actions: {
    gap: Spacing.sm,
    alignItems: 'center',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    width: '100%',
    minHeight: 48,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: Typography.sizes.lg,
    fontFamily: getFontFamily('semibold'),
  },
  backBtn: {
    padding: Spacing.sm,
  },
  backText: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('medium'),
  },
});
