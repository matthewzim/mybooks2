/**
 * BookshelfPreview Component
 *
 * Displays a compact preview of a bookshelf on the My Library page.
 * Shows the first row of books with the chosen shelf layout style.
 */

import React, { useRef, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, useWindowDimensions, Animated, ViewStyle, Image as RNImage } from 'react-native';
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
  getFontFamily,
  getSerifFontFamily,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useSpineImageUrl } from '@/hooks/useSpineImageUrl';
import { getShelfColors } from '@/utils/shelfColors';
import { getSpineCloth, getClothColor } from '@/utils/spineCloth';
import { getPlaceholderSpineSize, getImageSpineHeightFactor } from '@/utils/placeholderSpine';
import { getSpineImageUrl } from '@/services/storage';
import { SPINE_SHEEN_COLORS, SPINE_SHEEN_LOCATIONS } from '@/components/BookSpine';
import type { Bookshelf, Book } from '@/types';

const PREVIEW_DEFAULT_BOOK_WIDTH = 20;
const PREVIEW_BOOK_HEIGHT = 132;
const PREVIEW_MIN_BOOK_HEIGHT = 90;
const PREVIEW_MIN_BOOK_WIDTH = 14;
const PREVIEW_MAX_BOOK_WIDTH = 32;
const PREVIEW_SHELF_THICKNESS = 12;
const PREVIEW_BORDER_WIDTH = 4;

interface BookshelfOwner {
  name: string | null;
  public_username: string | null;
}

interface BookshelfPreviewProps {
  bookshelf: Bookshelf;
  books: Book[];
  onPress: (bookshelf: Bookshelf) => void;
  onDelete?: (bookshelf: Bookshelf) => void;
  containerStyle?: ViewStyle;
  /** When provided, renders an owner row (avatar + handle) under the shelf */
  owner?: BookshelfOwner;
}

export function BookshelfPreview({ bookshelf, books, onPress, onDelete, containerStyle, owner }: BookshelfPreviewProps) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const scale = useRef(new Animated.Value(1)).current;
  const shelfStyle = bookshelf.shelf_style || 'full';
  const totalBooks = books.length;
  const shelfColors = getShelfColors(bookshelf.cover_color);

  const cardInnerWidth = screenWidth - Spacing.md * 4;
  const shelfInnerWidth = shelfStyle === 'full' ? cardInnerWidth - PREVIEW_BORDER_WIDTH * 2 : cardInnerWidth;
  const booksPerRow = Math.max(1, Math.floor(shelfInnerWidth / PREVIEW_DEFAULT_BOOK_WIDTH));
  const firstRowBooks = books.slice(0, booksPerRow);

  const [imageDimensions, setImageDimensions] = useState<Record<string, { width: number; height: number }>>({});

  useEffect(() => {
    let cancelled = false;

    firstRowBooks.forEach((book) => {
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

  const PREVIEW_MIN_DISPLAY_HEIGHT = Math.round(PREVIEW_BOOK_HEIGHT * 0.6);

  const animateScale = (toValue: number) => {
    Animated.timing(scale, {
      toValue,
      duration: Animations.fast,
      useNativeDriver: true,
    }).start();
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Bookshelf',
      `Are you sure you want to delete "${bookshelf.name}"? This will also delete all books on this shelf.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete?.(bookshelf) },
      ]
    );
  };

  const ownerHandle = owner
    ? owner.public_username
      ? `@${owner.public_username}`
      : owner.name || 'Anonymous reader'
    : null;
  const ownerInitial = (owner?.name || owner?.public_username || 'R').charAt(0).toUpperCase();

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
        onLongPress={onDelete ? handleDelete : undefined}
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
                {totalBooks} {totalBooks === 1 ? 'book' : 'books'}
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            {onDelete && (
              <Pressable
                style={styles.iconButton}
                onPress={handleDelete}
                hitSlop={8}
                accessibilityLabel="Delete bookshelf"
              >
                <Ionicons name="trash-outline" size={16} color={colors.textLight} />
              </Pressable>
            )}
            <View style={[styles.chevronCircle, { borderColor: colors.inputBorder }]}>
              <Ionicons name="chevron-forward" size={14} color="#a89275" />
            </View>
          </View>
        </View>

        <View
          style={[
            styles.shelfRow,
            shelfStyle === 'full' && {
              borderWidth: PREVIEW_BORDER_WIDTH,
              borderColor: shelfColors.frameEdge,
            },
          ]}
        >
          {shelfStyle === 'full' && (
            <LinearGradient
              colors={[...shelfColors.backGradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.shelfBack}
            />
          )}

          <View style={[styles.booksRow, { minHeight: PREVIEW_BOOK_HEIGHT }]}>
            {firstRowBooks.length > 0 ? (
              firstRowBooks.map((book) => (
                <BookPreviewSpine
                  key={book.id}
                  book={book}
                  dimensions={imageDimensions[book.id]}
                  minDisplayHeight={PREVIEW_MIN_DISPLAY_HEIGHT}
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

          <View style={styles.plank}>
            <LinearGradient
              colors={[...shelfColors.plankGradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.plankHighlight} />
          </View>
        </View>

        {owner && (
          <View style={styles.ownerRow}>
            <View style={[styles.ownerAvatar, { backgroundColor: getClothColor(owner.name || owner.public_username) }]}>
              <Text style={styles.ownerInitial}>{ownerInitial}</Text>
            </View>
            <Text style={[styles.ownerHandle, { color: colors.textLight }]} numberOfLines={1}>
              {ownerHandle} · {totalBooks} {totalBooks === 1 ? 'book' : 'books'}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

interface BookPreviewSpineProps {
  book: Book;
  dimensions?: {
    width: number;
    height: number;
  };
  minDisplayHeight: number;
}

function BookPreviewSpine({ book, dimensions, minDisplayHeight }: BookPreviewSpineProps) {
  const spineImageUrl = useSpineImageUrl(book.image_url);
  const hasImage = !!spineImageUrl;
  const imageHeightFactor = getImageSpineHeightFactor(book);
  const cloth = getSpineCloth(book.title);

  const placeholderSize = getPlaceholderSpineSize(
    book,
    { min: PREVIEW_MIN_BOOK_WIDTH, max: PREVIEW_MAX_BOOK_WIDTH },
    { min: PREVIEW_MIN_BOOK_HEIGHT, max: PREVIEW_BOOK_HEIGHT }
  );

  // Absolute clamping: cap at PREVIEW_BOOK_HEIGHT, floor at minDisplayHeight
  let computedHeight: number | undefined;
  if (dimensions) {
    if (dimensions.height >= PREVIEW_BOOK_HEIGHT) {
      computedHeight = PREVIEW_BOOK_HEIGHT;
    } else if (dimensions.height < minDisplayHeight) {
      computedHeight = minDisplayHeight;
    } else {
      computedHeight = dimensions.height;
    }
  }

  const imageHeight = hasImage ? (computedHeight || PREVIEW_BOOK_HEIGHT) : undefined;
  const scaledImageHeight = imageHeight ? Math.max(minDisplayHeight, Math.round(imageHeight * imageHeightFactor)) : undefined;
  const spineHeight = hasImage ? (scaledImageHeight || PREVIEW_BOOK_HEIGHT) : placeholderSize.height;
  const computedWidth = dimensions
    ? Math.max(PREVIEW_MIN_BOOK_WIDTH, Math.min(PREVIEW_MAX_BOOK_WIDTH, Math.round((dimensions.width / dimensions.height) * spineHeight)))
    : undefined;
  const spineWidth = hasImage ? (computedWidth || PREVIEW_DEFAULT_BOOK_WIDTH) : placeholderSize.width;

  return (
    <View style={[styles.bookSpineShadow, { width: spineWidth, height: spineHeight }]}>
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
                { color: cloth.titleColor, width: Math.max(30, spineHeight - 26) },
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
  iconButton: {
    padding: Spacing.xs,
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
  ownerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerInitial: {
    fontSize: 13,
    fontFamily: getSerifFontFamily('medium'),
    color: '#f7efe0',
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
