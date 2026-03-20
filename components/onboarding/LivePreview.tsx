/**
 * LivePreview Component
 *
 * Persistent mini-bookshelf preview that updates in real-time
 * as the user makes selections during onboarding.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, useWindowDimensions } from 'react-native';
import { Spacing, BorderRadius, BookshelfDimensions, Typography, getFontFamily } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useOnboarding, type PreviewBook } from './OnboardingContext';

const SPINE_WIDTH = 28;
const SPINE_HEIGHT = 90;
const SHELF_BORDER = 4;

function MiniSpine({ book, index }: { book: PreviewBook; index: number }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        delay: index * 50,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 80,
        friction: 12,
        delay: index * 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.spine,
        {
          backgroundColor: book.color,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    />
  );
}

export function LivePreview() {
  const { colors } = useTheme();
  const { books, shelfStyle, shelfName } = useOnboarding();
  const { width: screenWidth } = useWindowDimensions();

  const previewWidth = screenWidth - Spacing.xl * 2;
  const innerWidth = shelfStyle === 'full'
    ? previewWidth - Spacing.md * 2 - SHELF_BORDER * 2
    : previewWidth - Spacing.md * 2;
  const maxBooks = Math.floor(innerWidth / SPINE_WIDTH);
  const visibleBooks = books.slice(0, maxBooks);

  const displayName = shelfName || 'My Bookshelf';

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>
        {displayName}
      </Text>

      <View
        style={[
          styles.shelf,
          shelfStyle === 'full' && {
            borderWidth: SHELF_BORDER,
            borderColor: BookshelfDimensions.shelfColor,
          },
        ]}
      >
        {shelfStyle === 'full' && (
          <View style={[styles.shelfBack, { backgroundColor: BookshelfDimensions.backColor }]} />
        )}

        <View style={[styles.booksRow, { minHeight: SPINE_HEIGHT }]}>
          {visibleBooks.length > 0 ? (
            visibleBooks.map((book, i) => (
              <MiniSpine key={book.id} book={book} index={i} />
            ))
          ) : (
            <View style={styles.emptyRow}>
              <Text style={[styles.emptyText, {
                color: shelfStyle === 'full' ? colors.textOnDarkMuted : colors.textLight,
              }]}>
                Books will appear here
              </Text>
            </View>
          )}
        </View>

        {shelfStyle === 'bottom' && (
          <View style={styles.shelfSurface} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  label: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('medium'),
  },
  shelf: {
    overflow: 'hidden',
    borderRadius: BorderRadius.md,
  },
  shelfBack: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  booksRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    zIndex: 1,
  },
  spine: {
    width: SPINE_WIDTH,
    height: SPINE_HEIGHT,
    borderRadius: 1,
  },
  emptyRow: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('regular'),
  },
  shelfSurface: {
    height: 10,
    backgroundColor: BookshelfDimensions.shelfColor,
    borderRadius: 2,
    marginTop: -1,
  },
});
