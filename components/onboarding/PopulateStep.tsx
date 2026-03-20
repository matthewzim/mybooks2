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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, Shadows, getFontFamily } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useOnboarding, SAMPLE_BOOKS, type PreviewBook } from './OnboardingContext';
import { LivePreview } from './LivePreview';
import { BookSpine as BookSpineConstants } from '@/constants/theme';

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

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setIsSearching(true);

    try {
      const response = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=8&fields=items(id,volumeInfo/title,volumeInfo/authors)`
      );
      const data = await response.json();
      const items = (data.items || []).map((item: any) => ({
        id: item.id,
        title: item.volumeInfo?.title || 'Unknown',
        author: item.volumeInfo?.authors?.[0] || 'Unknown',
      }));
      setResults(items);
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

      <View style={[styles.searchInputRow, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
        <Ionicons name="search" size={18} color={colors.textLight} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search by title or author..."
          placeholderTextColor={colors.textLight}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          autoFocus
        />
      </View>

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

  const handleGenerateSample = () => {
    addBooks(SAMPLE_BOOKS);
  };

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
            description="Coming soon"
            onPress={() => {}}
          />
          <OptionCard
            icon="sparkles"
            label="Generate sample shelf"
            description="Add 8 popular books instantly"
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
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </Pressable>
        <Pressable style={styles.skipBtn} onPress={onSkip}>
          <Text style={[styles.skipText, { color: colors.textLight }]}>Skip all</Text>
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
});
