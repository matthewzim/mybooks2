/**
 * StyleStep - Shelf style selection
 *
 * Clickable preview cards for shelf styles (bottom vs full)
 * that update the live preview in real-time.
 */

import React, { useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, BookshelfDimensions, getFontFamily, Animations } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useOnboarding } from './OnboardingContext';
import { LivePreview } from './LivePreview';
import type { ShelfStyle } from '@/types';
import { BOOKSHELF_COLORS } from '@/types';

const STYLE_OPTIONS: { id: ShelfStyle; label: string }[] = [
  { id: 'full', label: 'Classic Cabinet' },
  { id: 'bottom', label: 'Open Shelf' },
];

const COLOR_OPTIONS = BOOKSHELF_COLORS.slice(0, 8);

function StyleCard({
  option,
  isSelected,
  onSelect,
}: {
  option: typeof STYLE_OPTIONS[number];
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { colors } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const miniBooks = [
    { color: '#8B0000', h: 42 },
    { color: '#00008B', h: 50 },
    { color: '#006400', h: 38 },
    { color: '#4B0082', h: 46 },
    { color: '#8B4513', h: 44 },
  ];

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], flex: 1 }}>
      <Pressable
        style={[
          styles.styleCard,
          {
            backgroundColor: colors.card,
            borderColor: isSelected ? colors.accent : colors.border,
            borderWidth: isSelected ? 2 : 1,
          },
        ]}
        onPress={onSelect}
        onPressIn={() => Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start()}
      >
        {/* Mini shelf preview */}
        <View
          style={[
            styles.miniShelf,
            option.id === 'full' && {
              borderWidth: 3,
              borderColor: BookshelfDimensions.shelfColor,
            },
          ]}
        >
          {option.id === 'full' && (
            <View style={[styles.miniBack, { backgroundColor: BookshelfDimensions.backColor }]} />
          )}
          <View style={styles.miniBooks}>
            {miniBooks.map((b, i) => (
              <View key={i} style={[styles.miniSpine, { backgroundColor: b.color, height: b.h }]} />
            ))}
          </View>
          {option.id === 'bottom' && (
            <View style={styles.miniShelfBar} />
          )}
        </View>

        <Text style={[styles.styleLabel, { color: colors.text }]}>{option.label}</Text>

        {isSelected && (
          <View style={[styles.checkBadge, { backgroundColor: colors.accent }]}>
            <Ionicons name="checkmark" size={14} color="#fff" />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

export function StyleStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const { colors } = useTheme();
  const { shelfStyle, setShelfStyle, shelfColor, setShelfColor } = useOnboarding();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={[styles.stepLabel, { color: colors.accent }]}>STEP 1 OF 4</Text>
        <Text style={[styles.title, { color: colors.text }]}>Choose your shelf style</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Pick how your books are displayed
        </Text>
      </View>

      <View style={styles.cardsRow}>
        {STYLE_OPTIONS.map(option => (
          <StyleCard
            key={option.id}
            option={option}
            isSelected={shelfStyle === option.id}
            onSelect={() => setShelfStyle(option.id)}
          />
        ))}
      </View>

      {/* Color selection */}
      <View style={styles.colorSection}>
        <Text style={[styles.colorLabel, { color: colors.text }]}>Shelf Color</Text>
        <View style={styles.colorRow}>
          {COLOR_OPTIONS.map(color => (
            <Pressable
              key={color}
              style={[
                styles.colorSwatch,
                { backgroundColor: color },
                shelfColor === color && { borderColor: colors.accent, borderWidth: 2.5 },
              ]}
              onPress={() => setShelfColor(color)}
            />
          ))}
        </View>
      </View>

      <LivePreview />

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
  cardsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  styleCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  miniShelf: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
  },
  miniBack: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  miniBooks: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    minHeight: 55,
    paddingHorizontal: 4,
  },
  miniSpine: {
    width: 16,
    borderRadius: 1,
  },
  miniShelfBar: {
    height: 5,
    backgroundColor: BookshelfDimensions.shelfColor,
    marginTop: -1,
  },
  styleLabel: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('semibold'),
  },
  checkBadge: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorSection: {
    gap: Spacing.sm,
  },
  colorLabel: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('semibold'),
  },
  colorRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
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
