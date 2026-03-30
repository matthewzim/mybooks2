/**
 * LivePreview Component
 *
 * Persistent mini-bookshelf preview that updates in real-time
 * as the user makes selections during onboarding.
 *
 * Matches the BookshelfPreview component used on the home page:
 * same spine dimensions, shelf height, and scaling behaviour.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, useWindowDimensions, Image } from 'react-native';
import { Spacing, BorderRadius, Typography, getFontFamily } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useOnboarding, type PreviewBook } from './OnboardingContext';

const SPINE_WIDTH = 20;
const SPINE_HEIGHT = 132;
const SHELF_BORDER = 4;
const SHELF_THICKNESS = 12;

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
          backgroundColor: book.image_url ? 'transparent' : book.color,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {book.image_url && (
        <Image
          source={{ uri: book.image_url }}
          style={styles.spineImage}
          resizeMode="cover"
        />
      )}
    </Animated.View>
  );
}

function darkenColor(hex: string, factor: number = 0.7): string {
  const c = hex.replace('#', '');
  const r = Math.round(parseInt(c.substring(0, 2), 16) * factor);
  const g = Math.round(parseInt(c.substring(2, 4), 16) * factor);
  const b = Math.round(parseInt(c.substring(4, 6), 16) * factor);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function LivePreview() {
  const { colors } = useTheme();
  const { books, shelfStyle, shelfName, shelfColor } = useOnboarding();
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
            borderColor: shelfColor,
          },
        ]}
      >
        {shelfStyle === 'full' && (
          <View style={[styles.shelfBack, { backgroundColor: darkenColor(shelfColor) }]} />
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
          <View style={[styles.shelfSurface, { backgroundColor: shelfColor }]} />
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
    flexWrap: 'nowrap',
    zIndex: 1,
  },
  spine: {
    width: SPINE_WIDTH,
    height: SPINE_HEIGHT,
    overflow: 'hidden',
  },
  spineImage: {
    width: '100%',
    height: '100%',
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
    height: SHELF_THICKNESS,
    borderRadius: BorderRadius.sm,
    marginTop: -1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
});
