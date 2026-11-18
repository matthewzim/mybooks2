/**
 * BookSpine Component
 *
 * Displays a single book spine with its cover image or a cloth-bound
 * placeholder. Used in the bookshelf grid to show books vertically.
 *
 * Features:
 * - Displays book spine image if available
 * - Falls back to a cloth-bound spine: warm cloth color, sheen, gilt bands,
 *   and a serif vertical title
 * - Supports custom dimensions
 * - Handles loading and error states
 * - Casts a warm shadow onto the shelf plank (image and placeholder alike)
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  BookSpine as BookSpineConstants,
  getSerifFontFamily,
  FIXED_GEOMETRY_MAX_FONT_SCALE,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useSpineImageUrl } from '@/hooks/useSpineImageUrl';
import { getSpineCloth } from '@/utils/spineCloth';
import type { Book } from '@/types';
import { getSpineImageRef } from '@/utils/placeholderSpine';
import { measureBookOrigin, type BookOrigin } from '@/utils/bookOrigin';

interface BookSpineProps {
  book: Book;
  /** Called with where the spine sits on screen, for the 3D lift-out */
  onPress: (book: Book, origin?: BookOrigin) => void;
  width?: number;
  height?: number;
  /** Hide the spine while the book is lifted off the shelf */
  hidden?: boolean;
}

/** Horizontal sheen over the cloth so the spine reads as a rounded surface */
export const SPINE_SHEEN_COLORS = [
  'rgba(255, 255, 255, 0.16)',
  'rgba(0, 0, 0, 0)',
  'rgba(0, 0, 0, 0.16)',
  'rgba(0, 0, 0, 0.34)',
] as const;
export const SPINE_SHEEN_LOCATIONS = [0, 0.24, 0.72, 1] as const;

function BookSpineComponent({
  book,
  onPress,
  width = BookSpineConstants.width,
  height = BookSpineConstants.height,
  hidden = false,
}: BookSpineProps) {
  const pressableRef = useRef<View>(null);
  const displayTitle = book.title?.trim() || 'Untitled';
  const displayAuthor = book.author?.trim() || 'Unknown Author';

  return (
    <Pressable
      ref={pressableRef}
      style={({ pressed }) => [
        styles.container,
        { width, height },
        pressed && styles.pressed,
        hidden && styles.hidden,
      ]}
      onPress={() =>
        measureBookOrigin(pressableRef.current, false, (origin) => onPress(book, origin))
      }
      accessibilityRole="button"
      accessibilityLabel={`${displayTitle} by ${displayAuthor}`}
    >
      <View style={styles.spineBody}>
        <SpineArt book={book} height={height} />
      </View>
    </Pressable>
  );
}

interface SpineArtProps {
  book: Book;
  /** Spine height, used to size the rotated placeholder title */
  height: number;
  /** Show a spinner while the spine photo loads */
  showLoading?: boolean;
  /** Called once the art is drawn: the photo has loaded, or there is none */
  onReady?: () => void;
}

/**
 * The spine's artwork: the spine photo (or AI spine) when the book has one,
 * otherwise a cloth-bound placeholder. Fills its parent. Shared by the shelf
 * spine and the spine face of the 3D book viewer so the two always match.
 */
export function SpineArt({ book, height, showLoading = true, onReady }: SpineArtProps) {
  const { colors } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const spineImageRef = getSpineImageRef(book);
  const spineImageUrl = useSpineImageUrl(spineImageRef);

  // A book with no spine photo is drawn as cloth straight away
  useEffect(() => {
    if (!spineImageRef) onReady?.();
  }, [spineImageRef, onReady]);
  const hasImage = Boolean(spineImageUrl) && !hasError;
  const cloth = getSpineCloth(book.title);
  const displayTitle = book.title?.trim() || 'Untitled';

  // Rotated title runs along the spine height; leave breathing room at the ends
  const titleLength = Math.max(40, height - 44);

  if (hasImage) {
    // Book spine image from book-spines bucket
    return (
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: spineImageUrl! }}
          style={styles.image}
          // `cover`, not `contain`: the spine's box already carries the
          // image's aspect ratio, so this only absorbs the sub-pixel
          // remainder rather than letterboxing it into a gap between books.
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => {
            setIsLoading(false);
            onReady?.();
          }}
          onError={(error) => {
            console.warn('BookSpine image load error:', book.title, error);
            setHasError(true);
            setIsLoading(false);
          }}
        />
        {showLoading && isLoading && (
          <View style={[styles.loadingOverlay, { backgroundColor: colors.overlay }]}>
            <ActivityIndicator size="small" color={colors.textOnDark} />
          </View>
        )}
      </View>
    );
  }

  // Cloth-bound placeholder spine
  return (
    <View style={[styles.placeholder, { backgroundColor: cloth.color }]}>
      <LinearGradient
        colors={SPINE_SHEEN_COLORS}
        locations={SPINE_SHEEN_LOCATIONS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[styles.giltBand, { top: 10, backgroundColor: cloth.bandColor }]} />
      <View style={[styles.giltBand, { top: 14, backgroundColor: cloth.bandColor }]} />
      <View style={[styles.giltBand, { bottom: 12, backgroundColor: cloth.bandColor }]} />
      <Text
        style={[
          styles.placeholderTitle,
          { color: cloth.titleColor, width: titleLength },
          cloth.isLight && styles.placeholderTitleOnLight,
        ]}
        numberOfLines={2}
        ellipsizeMode="tail"
        maxFontSizeMultiplier={FIXED_GEOMETRY_MAX_FONT_SCALE}
      >
        {displayTitle}
      </Text>
    </View>
  );
}

/**
 * Memoised on the fields that affect what is drawn.
 *
 * The grid measures every spine image asynchronously and stores the result in
 * state, so a shelf of N books re-renders N times while loading. Without this
 * that is O(N²) spine renders — each one re-running the image-URL effect and
 * re-decoding into `expo-image` — which is what makes a large shelf stutter
 * on an iPhone as it opens.
 */
export const BookSpine = React.memo(
  BookSpineComponent,
  (prev, next) =>
    prev.width === next.width &&
    prev.height === next.height &&
    prev.hidden === next.hidden &&
    prev.onPress === next.onPress &&
    prev.book.id === next.book.id &&
    prev.book.image_url === next.book.image_url &&
    prev.book.ai_spine_url === next.book.ai_spine_url &&
    prev.book.use_ai_spine === next.book.use_ai_spine &&
    prev.book.title === next.book.title &&
    prev.book.author === next.book.author
);

BookSpine.displayName = 'BookSpine';

const styles = StyleSheet.create({
  container: {
    // Warm cast shadow so the book sits on the plank (both branches)
    shadowColor: '#32190a',
    shadowOpacity: 0.5,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 12 },
    elevation: 7,
  },
  spineBody: {
    flex: 1,
    overflow: 'hidden',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 1,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  hidden: {
    opacity: 0,
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    flex: 1,
    padding: 4,
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
    fontSize: 11,
    fontFamily: getSerifFontFamily('medium'),
    letterSpacing: 0.4,
    textAlign: 'center',
    writingDirection: 'ltr',
    // Rotate text bottom-to-top for spine effect
    transform: [{ rotate: '-90deg' }],
    position: 'absolute',
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  placeholderTitleOnLight: {
    textShadowColor: 'rgba(255, 255, 255, 0.35)',
  },
});

export default BookSpine;
