/**
 * LivePreview Component
 *
 * Persistent mini-bookshelf preview that updates in real-time
 * as the user makes selections during onboarding.
 *
 * Matches the BookshelfPreview component used on the home page:
 * same cabinet frame, spine styling (rounded with shadow), spine
 * dimensions, and shelf name typography.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Spacing,
  BorderRadius,
  Typography,
  Shadows,
  Wood,
  BookshelfDimensions,
  getFontFamily,
  getSerifFontFamily,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { getShelfColors } from '@/utils/shelfColors';
import { getSpineCloth } from '@/utils/spineCloth';
import { getPlaceholderSpineSize } from '@/utils/placeholderSpine';
import { SPINE_SHEEN_COLORS, SPINE_SHEEN_LOCATIONS } from '@/components/BookSpine';
import { useOnboarding, type PreviewBook } from './OnboardingContext';
import type { Book } from '@/types';

// Spine and frame metrics mirror BookshelfPreview on the home page
const SPINE_WIDTH = 20;
const SPINE_HEIGHT = 132;
const MIN_SPINE_WIDTH = 14;
const MAX_SPINE_WIDTH = 32;
const MIN_SPINE_HEIGHT = 90;
const SHELF_THICKNESS = BookshelfDimensions.shelfThickness;
const SHELF_BORDER_WIDTH = Math.round(BookshelfDimensions.shelfThickness * 0.75);
const FRAME_EDGE_WIDTH = 1;

export function getSpineSize(book: PreviewBook): { width: number; height: number } {
  if (book.image_url) {
    return { width: SPINE_WIDTH, height: SPINE_HEIGHT };
  }

  // getPlaceholderSpineSize only reads id and title, which PreviewBook has
  return getPlaceholderSpineSize(
    { id: book.id, title: book.title } as Book,
    { min: MIN_SPINE_WIDTH, max: MAX_SPINE_WIDTH },
    { min: MIN_SPINE_HEIGHT, max: SPINE_HEIGHT }
  );
}

export function MiniSpine({
  book,
  width,
  height,
  index,
}: {
  book: PreviewBook;
  width: number;
  height: number;
  index: number;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const cloth = getSpineCloth(book.title);

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
        styles.spineShadow,
        {
          width,
          height,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.spine}>
        {book.image_url ? (
          <Image
            source={{ uri: book.image_url }}
            style={styles.spineImage}
            contentFit="contain"
            transition={220}
          />
        ) : (
          <View style={[styles.spinePlaceholder, { backgroundColor: cloth.color }]}>
            <LinearGradient
              colors={SPINE_SHEEN_COLORS}
              locations={SPINE_SHEEN_LOCATIONS}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={[styles.giltBand, { top: 6, backgroundColor: cloth.bandColor }]} />
            <View style={[styles.giltBand, { bottom: 7, backgroundColor: cloth.bandColor }]} />
            <Text
              style={[
                styles.placeholderTitle,
                { color: cloth.titleColor, width: Math.max(30, height - 26) },
              ]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {book.title?.trim() || 'Untitled'}
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

export function LivePreview() {
  const { colors } = useTheme();
  const { books, shelfStyle, shelfName, shelfColor } = useOnboarding();
  const { width: screenWidth } = useWindowDimensions();
  const shelfColors = getShelfColors(shelfColor);

  // Steps pad the screen by Spacing.xl; the card itself pads by Spacing.md
  const cardInnerWidth = screenWidth - Spacing.xl * 2 - Spacing.md * 2;
  const shelfInnerWidth =
    shelfStyle === 'full'
      ? cardInnerWidth - (SHELF_BORDER_WIDTH + FRAME_EDGE_WIDTH) * 2
      : cardInnerWidth;

  // Fill the row by accumulated spine width so books never spill past the
  // right shelf border.
  const visibleBooks: { book: PreviewBook; width: number; height: number }[] = [];
  let usedWidth = 0;
  for (const book of books) {
    const size = getSpineSize(book);
    if (usedWidth + size.width > shelfInnerWidth && visibleBooks.length > 0) break;
    visibleBooks.push({ book, ...size });
    usedWidth += size.width;
  }

  const displayName = shelfName || 'My Bookshelf';

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.shelfName, { color: colors.text }]} numberOfLines={1}>
          {displayName}
        </Text>
        <View style={[styles.countPill, { backgroundColor: colors.pill }]}>
          <Text style={[styles.countPillText, { color: colors.pillText }]}>
            {books.length}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.shelfRow,
          shelfStyle === 'full' && {
            padding: SHELF_BORDER_WIDTH,
            borderWidth: FRAME_EDGE_WIDTH,
            borderColor: shelfColors.frameEdge,
          },
        ]}
      >
        {/* Wood frame around the row, matching the home page shelf previews */}
        {shelfStyle === 'full' && (
          <LinearGradient
            colors={[...shelfColors.frameGradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}

        <View style={styles.shelfInterior}>
          {shelfStyle === 'full' && (
            <LinearGradient
              colors={[...shelfColors.backGradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}

          <View style={[styles.booksRow, { minHeight: SPINE_HEIGHT }]}>
            {visibleBooks.length > 0 ? (
              visibleBooks.map(({ book, width, height }, i) => (
                <MiniSpine key={book.id} book={book} width={width} height={height} index={i} />
              ))
            ) : (
              <View style={styles.emptyRow}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  Books will appear here
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Floating plank only for the open 'bottom' style; the full style
            rests books on the frame border below them */}
        {shelfStyle !== 'full' && (
          <View style={styles.plank}>
            <LinearGradient
              colors={[...shelfColors.plankGradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.plankHighlight} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.xxl,
    padding: Spacing.md,
    borderWidth: 1,
    gap: Spacing.sm,
    ...Shadows.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  shelfName: {
    fontSize: 20,
    fontFamily: getSerifFontFamily('medium'),
    flexShrink: 1,
  },
  countPill: {
    borderRadius: BorderRadius.full,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  countPillText: {
    fontSize: 11,
    fontFamily: getFontFamily('semibold'),
  },
  shelfRow: {
    overflow: 'hidden',
    borderRadius: BorderRadius.md,
  },
  shelfInterior: {
    overflow: 'hidden',
  },
  booksRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    flexWrap: 'nowrap',
    zIndex: 1,
  },
  spineShadow: {
    shadowColor: '#32190a',
    shadowOpacity: 0.45,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  spine: {
    flex: 1,
    overflow: 'hidden',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 1,
  },
  spineImage: {
    width: '100%',
    height: '100%',
  },
  spinePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  giltBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
  },
  placeholderTitle: {
    fontSize: 7,
    fontFamily: getSerifFontFamily('medium'),
    letterSpacing: 0.3,
    textAlign: 'center',
    writingDirection: 'ltr',
    transform: [{ rotate: '-90deg' }],
    position: 'absolute',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  emptyRow: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('medium'),
  },
  plank: {
    height: SHELF_THICKNESS,
    borderRadius: BorderRadius.sm,
    marginTop: -1,
    overflow: 'hidden',
    shadowColor: '#4a2f19',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  plankHighlight: {
    height: 1.5,
    backgroundColor: Wood.plankHighlight,
  },
});
