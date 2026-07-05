/**
 * BookshelfPreview Component
 *
 * Displays a compact preview of a bookshelf on the My Library page.
 * Shows the first row of books with the chosen shelf layout style.
 */

import React, { useRef, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions, Animated, ViewStyle, Image as RNImage } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Spacing,
  BorderRadius,
  Typography,
  Shadows,
  Animations,
  Wood,
  BookshelfDimensions,
  getFontFamily,
  getSerifFontFamily,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useSpineImageUrl } from '@/hooks/useSpineImageUrl';
import { getShelfColors } from '@/utils/shelfColors';
import { getSpineCloth } from '@/utils/spineCloth';
import { getPlaceholderSpineSize, getImageSpineHeightFactor } from '@/utils/placeholderSpine';
import { getSpineImageUrl } from '@/services/storage';
import { SPINE_SHEEN_COLORS, SPINE_SHEEN_LOCATIONS } from '@/components/BookSpine';
import type { Bookshelf, Book } from '@/types';

const PREVIEW_DEFAULT_BOOK_WIDTH = 20;
const PREVIEW_BOOK_HEIGHT = 132;
const PREVIEW_MIN_BOOK_HEIGHT = 90;
const PREVIEW_MIN_BOOK_WIDTH = 14;
const PREVIEW_MAX_BOOK_WIDTH = 32;
const PREVIEW_SHELF_THICKNESS = BookshelfDimensions.shelfThickness;
// Outer cabinet frame thickness for previews — slightly thinner (75%) than
// the frame on the actual bookshelf page. Tweak the 0.75 factor to taste.
const PREVIEW_BORDER_WIDTH = Math.round(BookshelfDimensions.shelfThickness * 0.75);
// The cabinet also strokes a 1px frame edge around the wood frame
const PREVIEW_FRAME_EDGE_WIDTH = 1;

interface BookshelfOwner {
  name: string | null;
  public_username: string | null;
}

interface BookshelfPreviewProps {
  bookshelf: Bookshelf;
  books: Book[];
  onPress: (bookshelf: Bookshelf) => void;
  containerStyle?: ViewStyle;
  /** When provided, renders an owner row (avatar + handle) under the shelf */
  owner?: BookshelfOwner;
}

export function BookshelfPreview({ bookshelf, books, onPress, containerStyle, owner }: BookshelfPreviewProps) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const scale = useRef(new Animated.Value(1)).current;
  const shelfStyle = bookshelf.shelf_style || 'full';
  const totalBooks = books.length;
  const shelfColors = getShelfColors(bookshelf.cover_color);

  const cardInnerWidth = screenWidth - Spacing.md * 4;
  const shelfInnerWidth =
    shelfStyle === 'full'
      ? cardInnerWidth - (PREVIEW_BORDER_WIDTH + PREVIEW_FRAME_EDGE_WIDTH) * 2
      : cardInnerWidth;

  const [imageDimensions, setImageDimensions] = useState<Record<string, { width: number; height: number }>>({});

  const PREVIEW_MIN_DISPLAY_HEIGHT = Math.round(PREVIEW_BOOK_HEIGHT * 0.6);

  const getSpineSize = (book: Book): { width: number; height: number } => {
    if (!book.image_url) {
      return getPlaceholderSpineSize(
        book,
        { min: PREVIEW_MIN_BOOK_WIDTH, max: PREVIEW_MAX_BOOK_WIDTH },
        { min: PREVIEW_MIN_BOOK_HEIGHT, max: PREVIEW_BOOK_HEIGHT }
      );
    }

    const dimensions = imageDimensions[book.id];
    const imageHeightFactor = getImageSpineHeightFactor(book);

    // Absolute clamping: cap at PREVIEW_BOOK_HEIGHT, floor at min display height
    let computedHeight: number | undefined;
    if (dimensions) {
      if (dimensions.height >= PREVIEW_BOOK_HEIGHT) {
        computedHeight = PREVIEW_BOOK_HEIGHT;
      } else if (dimensions.height < PREVIEW_MIN_DISPLAY_HEIGHT) {
        computedHeight = PREVIEW_MIN_DISPLAY_HEIGHT;
      } else {
        computedHeight = dimensions.height;
      }
    }

    const imageHeight = computedHeight || PREVIEW_BOOK_HEIGHT;
    const spineHeight = Math.max(PREVIEW_MIN_DISPLAY_HEIGHT, Math.round(imageHeight * imageHeightFactor));
    const spineWidth = dimensions
      ? Math.max(
          PREVIEW_MIN_BOOK_WIDTH,
          Math.min(PREVIEW_MAX_BOOK_WIDTH, Math.round((dimensions.width / dimensions.height) * spineHeight))
        )
      : PREVIEW_DEFAULT_BOOK_WIDTH;

    return { width: spineWidth, height: spineHeight };
  };

  // Fill the row by accumulated spine width so books never spill past the
  // right shelf border.
  const firstRowBooks = useMemo(() => {
    const row: { book: Book; width: number; height: number }[] = [];
    let usedWidth = 0;

    for (const book of books) {
      const size = getSpineSize(book);
      if (usedWidth + size.width > shelfInnerWidth && row.length > 0) break;
      row.push({ book, ...size });
      usedWidth += size.width;
    }

    return row;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books, imageDimensions, shelfInnerWidth]);

  useEffect(() => {
    let cancelled = false;

    firstRowBooks.forEach(({ book }) => {
      if (!book.image_url || imageDimensions[book.id]) return;

      getSpineImageUrl(book.image_url).then((url) => {
        if (!url || cancelled) return;

        RNImage.getSize(
          url,
          (width, height) => {
            if (cancelled) return;
            setImageDimensions((prev) => ({
              ...prev,
              [book.id]: { width, height },
            }));
          },
          () => {
            // Ignore invalid image metadata and fall back to defaults
          }
        );
      });
    });

    return () => {
      cancelled = true;
    };
  }, [firstRowBooks, imageDimensions]);

  const animateScale = (toValue: number) => {
    Animated.timing(scale, {
      toValue,
      duration: Animations.fast,
      useNativeDriver: true,
    }).start();
  };

  const ownerName = owner ? owner.name || 'Anonymous reader' : null;
  const ownerHandle = owner?.public_username ? `@${owner.public_username}` : null;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={({ pressed }) => [
          styles.container,
          containerStyle,
          { backgroundColor: colors.card, borderColor: colors.border },
          pressed && styles.pressed,
        ]}
        onPress={() => onPress(bookshelf)}
        onPressIn={() => animateScale(0.985)}
        onPressOut={() => animateScale(1)}
        accessibilityRole="button"
        accessibilityLabel={`${bookshelf.name} bookshelf with ${totalBooks} books`}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.shelfName, { color: colors.text }]} numberOfLines={1}>
              {bookshelf.name}
            </Text>
            <View style={[styles.countPill, { backgroundColor: colors.pill }]}>
              <Text style={[styles.countPillText, { color: colors.pillText }]}>
                {totalBooks}
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <View style={[styles.chevronCircle, { borderColor: colors.inputBorder }]}>
              <Ionicons name="chevron-forward" size={14} color="#a89275" />
            </View>
          </View>
        </View>

        <View
          style={[
            styles.shelfRow,
            shelfStyle === 'full' && {
              padding: PREVIEW_BORDER_WIDTH,
              borderWidth: PREVIEW_FRAME_EDGE_WIDTH,
              borderColor: shelfColors.frameEdge,
            },
          ]}
        >
          {/* Wood frame around the row, matching the bookshelf page cabinet */}
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

            <View style={[styles.booksRow, { minHeight: PREVIEW_BOOK_HEIGHT }]}>
              {firstRowBooks.length > 0 ? (
                firstRowBooks.map(({ book, width, height }) => (
                  <BookPreviewSpine key={book.id} book={book} width={width} height={height} />
                ))
              ) : (
                <View style={styles.emptyShelf}>
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    No books yet
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

        {owner && (
          <View style={styles.ownerRow}>
            <Text style={[styles.ownerName, { color: colors.text }]} numberOfLines={1}>
              {ownerName}
            </Text>
            {ownerHandle && (
              <Text style={[styles.ownerHandle, { color: colors.textLight }]} numberOfLines={1}>
                {ownerHandle}
              </Text>
            )}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

interface BookPreviewSpineProps {
  book: Book;
  width: number;
  height: number;
}

function BookPreviewSpine({ book, width, height }: BookPreviewSpineProps) {
  const spineImageUrl = useSpineImageUrl(book.image_url);
  const hasImage = !!spineImageUrl;
  const cloth = getSpineCloth(book.title);

  return (
    <View style={[styles.bookSpineShadow, { width, height }]}>
      <View style={styles.bookSpine}>
        {hasImage ? (
          <Image source={{ uri: spineImageUrl }} style={styles.bookImage} contentFit="contain" transition={220} />
        ) : (
          <View style={[styles.bookPlaceholder, { backgroundColor: cloth.color }]}>
            <LinearGradient
              colors={SPINE_SHEEN_COLORS}
              locations={SPINE_SHEEN_LOCATIONS}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={[styles.previewGiltBand, { top: 6, backgroundColor: cloth.bandColor }]} />
            <View style={[styles.previewGiltBand, { bottom: 7, backgroundColor: cloth.bandColor }]} />
            <Text
              style={[
                styles.previewPlaceholderTitle,
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.xxl,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    gap: Spacing.sm,
    ...Shadows.md,
  },
  pressed: {
    opacity: 0.96,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flex: 1,
    marginRight: Spacing.sm,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  chevronCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    zIndex: 1,
    flexWrap: 'nowrap',
  },
  plank: {
    height: PREVIEW_SHELF_THICKNESS,
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
  emptyShelf: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('medium'),
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  ownerName: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('bold'),
    flexShrink: 1,
  },
  ownerHandle: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('regular'),
    flexShrink: 1,
  },
  bookSpineShadow: {
    shadowColor: '#32190a',
    shadowOpacity: 0.45,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  bookSpine: {
    flex: 1,
    overflow: 'hidden',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 1,
  },
  bookImage: {
    width: '100%',
    height: '100%',
  },
  bookPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewGiltBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
  },
  previewPlaceholderTitle: {
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
});

export default BookshelfPreview;
