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
  FIXED_GEOMETRY_MAX_FONT_SCALE,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useSpineImageUrl } from '@/hooks/useSpineImageUrl';
import { getShelfColors } from '@/utils/shelfColors';
import { getSpineCloth } from '@/utils/spineCloth';
import {
  getShelfAvailableWidth,
  getShelfHeight,
  getShelfSpineSize,
  scaleSpineSize,
} from '@/utils/shelfLayout';
import { getSpineImageUrl } from '@/services/storage';
import { SPINE_SHEEN_COLORS, SPINE_SHEEN_LOCATIONS } from '@/components/BookSpine';
import type { Bookshelf, Book } from '@/types';

/** Height of the tallest possible spine in a preview card */
const PREVIEW_BOOK_HEIGHT = 132;
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
  /**
   * True number of books on the shelf. Community surfaces fetch only a capped
   * slice of a stranger's shelf, so `books.length` would understate it on the
   * count badge; defaults to `books.length` when the caller has them all.
   */
  totalBooks?: number;
  /** When provided, renders an owner row (avatar + handle) under the shelf */
  owner?: BookshelfOwner;
}

export function BookshelfPreview({ bookshelf, books, onPress, containerStyle, totalBooks: totalBooksProp, owner }: BookshelfPreviewProps) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const scale = useRef(new Animated.Value(1)).current;
  const shelfStyle = bookshelf.shelf_style || 'full';
  const totalBooks = totalBooksProp ?? books.length;
  const shelfColors = getShelfColors(bookshelf.cover_color);

  const cardInnerWidth = screenWidth - Spacing.md * 4;
  const shelfInnerWidth =
    shelfStyle === 'full'
      ? cardInnerWidth - (PREVIEW_BORDER_WIDTH + PREVIEW_FRAME_EDGE_WIDTH) * 2
      : cardInnerWidth;

  const [imageDimensions, setImageDimensions] = useState<Record<string, { width: number; height: number }>>({});

  // Spines are sized exactly as the bookshelf page sizes them, then shrunk by a
  // single factor. Anything else (preview-only min/max ranges, clamping the
  // natural image height against the small preview height) resizes spines
  // relative to one another, so two books that stand equally tall on the shelf
  // come out different heights here — and a box that clamps out of the image's
  // aspect ratio gets its artwork cropped by `cover`.
  const shelfHeight = getShelfHeight(getShelfAvailableWidth(screenWidth, shelfStyle));
  const previewScale = PREVIEW_BOOK_HEIGHT / shelfHeight;

  const getSpineSize = (book: Book): { width: number; height: number } =>
    scaleSpineSize(getShelfSpineSize(book, imageDimensions[book.id], shelfHeight), previewScale);

  // Fill the row by accumulated spine width so books never spill past the
  // right shelf border.
  const firstRowBooks = useMemo(() => {
    const row: { book: Book; width: number; height: number; measured: boolean }[] = [];
    let usedWidth = 0;

    for (const book of books) {
      const size = getSpineSize(book);
      if (usedWidth + size.width > shelfInnerWidth && row.length > 0) break;
      row.push({ book, ...size, measured: !!imageDimensions[book.id] });
      usedWidth += size.width;
    }

    return row;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books, imageDimensions, shelfInnerWidth]);

  // Books whose natural size has already been requested. A ref rather than
  // effect state because measuring a book updates `imageDimensions`, which
  // re-runs this effect: keying off state alone re-requested every book that
  // hadn't resolved yet on each measurement, so an N-book row issued O(N²)
  // URL resolutions and RNImage.getSize calls.
  const measureRequestedRef = useRef(new Set<string>());

  // Measurements outlive the effect run that started them. Cancelling them per
  // run — the obvious cleanup — dropped every request still in flight the
  // moment the first one landed, because resolving one book re-runs this effect
  // through `firstRowBooks`. The `measureRequestedRef` guard then stopped those
  // books from ever being asked again, so all but one spine on a card kept its
  // fallback (placeholder-shaped) box and had its artwork cropped to fit.
  const isMountedRef = useRef(true);

  useEffect(() => {
    // Re-armed on mount, not just cleared on unmount: React re-runs mount
    // effects (StrictMode in development, and on fast refresh), and a flag that
    // only ever goes false would silence every measurement after the first pass.
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    firstRowBooks.forEach(({ book }) => {
      if (!book.image_url || measureRequestedRef.current.has(book.id)) return;
      measureRequestedRef.current.add(book.id);

      getSpineImageUrl(book.image_url).then((url) => {
        if (!url || !isMountedRef.current) return;

        RNImage.getSize(
          url,
          (width, height) => {
            if (!isMountedRef.current) return;
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
  }, [firstRowBooks]);

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
                firstRowBooks.map(({ book, width, height, measured }) => (
                  <BookPreviewSpine
                    key={book.id}
                    book={book}
                    width={width}
                    height={height}
                    measured={measured}
                  />
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
  /** True once the spine image's natural size is known, so the box carries its ratio */
  measured: boolean;
}

function BookPreviewSpine({ book, width, height, measured }: BookPreviewSpineProps) {
  const spineImageUrl = useSpineImageUrl(book.image_url);
  const hasImage = !!spineImageUrl;
  const cloth = getSpineCloth(book.title);

  return (
    <View style={[styles.bookSpineShadow, { width, height }]}>
      <View style={styles.bookSpine}>
        {hasImage ? (
          // Once measured the box carries the image's own ratio, so `cover`
          // only absorbs the sub-pixel rounding remainder — which `contain`
          // would turn into a transparent sliver beside the spine. Until then
          // the box is a fallback shape the artwork never fits, and `cover`
          // there means a zoomed, cropped spine; `contain` shows all of it.
          <Image
            source={{ uri: spineImageUrl }}
            style={styles.bookImage}
            contentFit={measured ? 'cover' : 'contain'}
            transition={220}
          />
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
              maxFontSizeMultiplier={FIXED_GEOMETRY_MAX_FONT_SCALE}
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
