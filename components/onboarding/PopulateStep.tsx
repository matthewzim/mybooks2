/**
 * PopulateStep - Add books to shelf
 *
 * Offers: Search, Import from Goodreads, Generate sample shelf, or Skip.
 * Tappable option cards instead of forms.
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
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Spacing, BorderRadius, Typography, getFontFamily } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useOnboarding, SAMPLE_BOOKS, type PreviewBook } from './OnboardingContext';
import { LivePreview } from './LivePreview';
import { BookSpine as BookSpineConstants } from '@/constants/theme';
import { supabase, TABLES } from '@/services/supabase';
import { getSpineImageUrl } from '@/services/storage';

function getBookColor(title: string): string {
  const colors = BookSpineConstants.colors;
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

interface SearchResult {
  id: string;
  title: string;
  author: string;
  image_url?: string | null;
}

const GOODREADS_TITLE_COLUMN_INDEX = 1;
const GOODREADS_AUTHOR_COLUMN_INDEX = 2;

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i += 1;
      }
      currentRow.push(currentCell);
      const hasAnyCell = currentRow.some((cell) => cell.trim().length > 0);
      if (hasAnyCell) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  if (currentRow.some((cell) => cell.trim().length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

function parseGoodreadsBooks(csvText: string): { title: string; author: string }[] {
  const rows = parseCsvRows(csvText);
  return rows
    .slice(1)
    .map((row) => ({
      title: row[GOODREADS_TITLE_COLUMN_INDEX]?.trim() || '',
      author: row[GOODREADS_AUTHOR_COLUMN_INDEX]?.trim() || '',
    }))
    .filter((book) => book.title.length > 0 && book.author.length > 0);
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
  const inputRef = useRef<TextInput>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setIsSearching(true);

    try {
      const response = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=8&fields=items(id,volumeInfo/title,volumeInfo/authors)`
      );
      const data = await response.json();
      const items: SearchResult[] = (data.items || []).map((item: any) => ({
        id: item.id,
        title: item.volumeInfo?.title || 'Unknown',
        author: item.volumeInfo?.authors?.[0] || 'Unknown',
      }));

      // Check Supabase for spine images for each result
      const itemsWithImages = await Promise.all(
        items.map(async (item) => {
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
              return { ...item, image_url: resolvedUrl };
            }
          } catch {}
          return item;
        })
      );

      setResults(itemsWithImages);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
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

      <Pressable
        style={[styles.searchInputRow, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
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
          showSoftInputOnFocus
        />
      </Pressable>

      {isSearching && <ActivityIndicator style={styles.loader} color={colors.accent} />}

      {results.map(result => (
        <Pressable
          key={result.id}
          style={[styles.searchResult, { borderColor: colors.borderLight }]}
          onPress={() => handleAddBook(result)}
        >
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

export function PopulateStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const { colors } = useTheme();
  const { addBooks, books } = useOnboarding();
  const [showSearch, setShowSearch] = useState(false);
  const [showGoodreadsModal, setShowGoodreadsModal] = useState(false);
  const [isImportingGoodreads, setIsImportingGoodreads] = useState(false);
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

  const handleGoodreadsImport = useCallback(async () => {
    try {
      setIsImportingGoodreads(true);

      const picked = await DocumentPicker.getDocumentAsync({
        type: 'text/csv',
        copyToCacheDirectory: true,
      });

      if (picked.canceled || !picked.assets?.[0]?.uri) {
        return;
      }

      const csvContent = await FileSystem.readAsStringAsync(picked.assets[0].uri);
      const csvBooks = parseGoodreadsBooks(csvContent);

      if (csvBooks.length === 0) {
        Alert.alert('Import Error', 'No valid books found in CSV.');
        return;
      }

      const uniquePairs = Array.from(
        new Map(csvBooks.map((book) => [`${book.title.toLowerCase()}::${book.author.toLowerCase()}`, book])).values()
      );

      const importedBooks: PreviewBook[] = await Promise.all(
        uniquePairs.map(async (csvBook) => {
          let imageUrl: string | null = null;
          try {
            const { data: matchedBook } = await supabase
              .from(TABLES.BOOKS)
              .select('image_url')
              .eq('title', csvBook.title)
              .eq('author', csvBook.author)
              .not('image_url', 'is', null)
              .limit(1)
              .maybeSingle();

            if (matchedBook?.image_url) {
              imageUrl = await getSpineImageUrl(matchedBook.image_url);
            }
          } catch {}

          return {
            id: `goodreads-${csvBook.title}-${csvBook.author}`,
            title: csvBook.title,
            author: csvBook.author,
            color: getBookColor(csvBook.title),
            genre: 'fiction',
            rating: Math.floor(Math.random() * 2) + 4,
            image_url: imageUrl,
          };
        })
      );

      addBooks(importedBooks);
      setShowGoodreadsModal(false);
      Alert.alert(
        'Import Complete',
        `Added ${importedBooks.length} book${importedBooks.length === 1 ? '' : 's'} to your shelf.`
      );
    } catch (error) {
      console.error('Goodreads import failed:', error);
      Alert.alert('Import Error', 'Failed to import Goodreads CSV. Please try again.');
    } finally {
      setIsImportingGoodreads(false);
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
      ) : (
        <View style={styles.optionsList}>
          <OptionCard
            icon="search"
            label="Search for books"
            description="Find books by title or author"
            onPress={() => setShowSearch(true)}
          />
          <OptionCard
            icon="download-outline"
            label="Import from Goodreads"
            description="Upload your Goodreads CSV export"
            onPress={() => setShowGoodreadsModal(true)}
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
        <Pressable style={styles.skipBtn} onPress={onSkip}>
          <Text style={[styles.skipText, { color: colors.textLight }]}>Skip all</Text>
        </Pressable>
      </View>

      <Modal
        visible={showGoodreadsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGoodreadsModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowGoodreadsModal(false)}
        >
          <Pressable
            style={[styles.modalCard, { backgroundColor: colors.card }]}
            onPress={() => {}}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>Import from Goodreads</Text>
            <Text style={[styles.modalBody, { color: colors.textSecondary }]}>
              Import your books from Goodreads CSV export. How to export your library:{'\n\n'}
              (1) Go to Goodreads.com and log in {'\u2022'}{'\n'}
              (2) Click 'My Books' and then 'Import and export'{"\n"}
              (3) Click 'Export Library' to download CSV file{"\n"}
              (4) Tap the button below to select the file.
            </Text>

            <Pressable
              style={[styles.importButton, { backgroundColor: colors.accent }]}
              onPress={handleGoodreadsImport}
              disabled={isImportingGoodreads}
            >
              <Text style={styles.importButtonText}>
                {isImportingGoodreads ? 'Importing...' : 'Select CSV file'}
              </Text>
            </Pressable>
            {isImportingGoodreads && (
              <View style={styles.importingRow}>
                <ActivityIndicator color={colors.accent} size="small" />
                <Text style={[styles.importingText, { color: colors.textSecondary }]}>Import in progress...</Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.xl,
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
  skipBtn: {
    padding: Spacing.sm,
  },
  skipText: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('medium'),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  modalTitle: {
    fontSize: Typography.sizes.xl,
    fontFamily: getFontFamily('bold'),
  },
  modalBody: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('regular'),
    lineHeight: 22,
  },
  importButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  importButtonText: {
    color: '#fff',
    fontSize: Typography.sizes.lg,
    fontFamily: getFontFamily('semibold'),
  },
  importingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  importingText: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('regular'),
  },
});
