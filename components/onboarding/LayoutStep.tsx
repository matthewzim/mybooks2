/**
 * LayoutStep - Book arrangement selection
 *
 * Options: by color, genre, rating, or random.
 * Tapping animates real-time rearrangement in the live preview.
 */

import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, getFontFamily } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useOnboarding, type LayoutMode, type PreviewBook } from './OnboardingContext';
import { LivePreview } from './LivePreview';

const LAYOUT_OPTIONS: { id: LayoutMode; icon: keyof typeof Ionicons.glyphMap; label: string; description: string }[] = [
  { id: 'color', icon: 'color-palette', label: 'By Color', description: 'Group by spine color' },
  { id: 'genre', icon: 'library', label: 'By Genre', description: 'Fiction, non-fiction, etc.' },
  { id: 'rating', icon: 'star', label: 'By Rating', description: 'Highest rated first' },
  { id: 'random', icon: 'shuffle', label: 'Random', description: 'Surprise arrangement' },
];

function sortBooks(books: PreviewBook[], mode: LayoutMode): PreviewBook[] {
  const sorted = [...books];
  switch (mode) {
    case 'color':
      return sorted.sort((a, b) => a.color.localeCompare(b.color));
    case 'genre':
      return sorted.sort((a, b) => (a.genre || '').localeCompare(b.genre || ''));
    case 'rating':
      return sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    case 'random':
      for (let i = sorted.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
      }
      return sorted;
    default:
      return sorted;
  }
}

function LayoutCard({
  option,
  isSelected,
  onSelect,
}: {
  option: typeof LAYOUT_OPTIONS[number];
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { colors } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={[styles.layoutCardWrapper, { transform: [{ scale: scaleAnim }] }]}>
      <Pressable
        style={[
          styles.layoutCard,
          {
            backgroundColor: isSelected ? colors.accent : colors.card,
            borderColor: isSelected ? colors.accent : colors.border,
          },
        ]}
        onPress={onSelect}
        onPressIn={() => Animated.spring(scaleAnim, { toValue: 0.95, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start()}
      >
        <Ionicons
          name={option.icon}
          size={24}
          color={isSelected ? '#fff' : colors.accent}
        />
        <Text style={[styles.layoutLabel, { color: isSelected ? '#fff' : colors.text }]}>
          {option.label}
        </Text>
        <Text style={[styles.layoutDesc, { color: isSelected ? 'rgba(255,255,255,0.7)' : colors.textSecondary }]}>
          {option.description}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function LayoutStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const { colors } = useTheme();
  const { layoutMode, setLayoutMode, books, setBooks } = useOnboarding();

  const handleSelectLayout = useCallback((mode: LayoutMode) => {
    setLayoutMode(mode);
    if (books.length > 0) {
      setBooks(sortBooks(books, mode));
    }
  }, [books, setLayoutMode, setBooks]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={[styles.stepLabel, { color: colors.accent }]}>STEP 3 OF 4</Text>
        <Text style={[styles.title, { color: colors.text }]}>Arrange your books</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Choose how to organize your shelf
        </Text>
      </View>

      <LivePreview />

      <View style={styles.grid}>
        {LAYOUT_OPTIONS.map(option => (
          <LayoutCard
            key={option.id}
            option={option}
            isSelected={layoutMode === option.id}
            onSelect={() => handleSelectLayout(option.id)}
          />
        ))}
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.nextButton, { backgroundColor: colors.accent }]}
          onPress={onNext}
        >
          <Text style={styles.nextButtonText}>Next</Text>
        </Pressable>
        <Pressable style={styles.skipBtn} onPress={onSkip}>
          <Text style={[styles.skipText, { color: colors.textLight }]}>Skip</Text>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  layoutCardWrapper: {
    width: '48%',
    flexGrow: 1,
  },
  layoutCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xxs,
    minHeight: 100,
    justifyContent: 'center',
  },
  layoutLabel: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('semibold'),
  },
  layoutDesc: {
    fontSize: Typography.sizes.xs,
    fontFamily: getFontFamily('regular'),
    textAlign: 'center',
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
