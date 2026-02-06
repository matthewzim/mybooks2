/**
 * DraggableBookSpine Component
 *
 * A draggable wrapper around BookSpine for edit mode.
 * Supports drag-and-drop reordering and rotation to stack books flat.
 *
 * Features:
 * - Drag gesture handling with visual feedback (requires 10px movement to activate)
 * - Long-press (500ms) to toggle rotation/stack state
 * - Rotate button for quick stack toggle
 * - Animated position updates
 * - Stacked (horizontal) display mode
 * - Position-based drop target calculation for variable-width books
 */

import React, { useCallback } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { BookSpine as BookSpineConstants, Shadows } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useSpineImageUrl } from '@/hooks/useSpineImageUrl';
import type { Book } from '@/types';
import type { BookPosition } from './EditableBookshelfGrid';

interface DraggableBookSpineProps {
  book: Book;
  index: number;
  width: number;
  height: number;
  isEditing: boolean;
  onDragStart: (index: number) => void;
  onDragEnd: (fromIndex: number, toIndex: number) => void;
  onDragMove: (index: number, translationX: number, translationY: number) => void;
  onToggleStack: (book: Book) => void;
  bookPositions: BookPosition[];
  totalBooks: number;
}

/**
 * Get a consistent color for a book based on its title
 */
function getBookColor(title: string): string {
  const colors = BookSpineConstants.colors;
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function DraggableBookSpine({
  book,
  index,
  width,
  height,
  isEditing,
  onDragStart,
  onDragEnd,
  onDragMove,
  onToggleStack,
  bookPositions,
  totalBooks,
}: DraggableBookSpineProps) {
  const { colors } = useTheme();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const zIndex = useSharedValue(0);
  const isDragging = useSharedValue(false);

  // Calculate target index based on drag position using actual book positions
  const findDropTarget = useCallback(
    (tx: number, ty: number): number => {
      if (bookPositions.length === 0 || index >= bookPositions.length) {
        return index;
      }

      const myPos = bookPositions[index];
      if (!myPos) return index;

      const draggedCenterX = myPos.x + tx + width / 2;
      const draggedCenterY = myPos.y + ty;

      let bestIndex = index;
      let bestDistance = Infinity;

      bookPositions.forEach((pos, i) => {
        const centerX = pos.x + pos.width / 2;
        const centerY = pos.y;
        // Weight vertical distance more heavily since rows are separated
        const dx = draggedCenterX - centerX;
        const dy = (draggedCenterY - centerY) * 1.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDistance) {
          bestDistance = dist;
          bestIndex = i;
        }
      });

      return Math.max(0, Math.min(bestIndex, totalBooks - 1));
    },
    [bookPositions, index, width, totalBooks]
  );

  // JS-thread handler that computes drop target and calls onDragEnd
  const handleDragEndJS = useCallback(
    (tx: number, ty: number) => {
      const targetIndex = findDropTarget(tx, ty);
      onDragEnd(index, targetIndex);
    },
    [findDropTarget, onDragEnd, index]
  );

  const dragGesture = Gesture.Pan()
    .enabled(isEditing)
    .minDistance(10)
    .onStart(() => {
      isDragging.value = true;
      scale.value = withSpring(1.1);
      zIndex.value = 1000;
      runOnJS(onDragStart)(index);
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
      runOnJS(onDragMove)(index, event.translationX, event.translationY);
    })
    .onEnd(() => {
      // Capture translation values before animating back
      const tx = translateX.value;
      const ty = translateY.value;

      isDragging.value = false;
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      scale.value = withSpring(1);
      zIndex.value = 0;

      runOnJS(handleDragEndJS)(tx, ty);
    });

  const longPressGesture = Gesture.LongPress()
    .enabled(isEditing)
    .minDuration(500)
    .onEnd((_, success) => {
      if (success) {
        runOnJS(onToggleStack)(book);
      }
    });

  const composedGesture = Gesture.Race(dragGesture, longPressGesture);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
      zIndex: zIndex.value,
    };
  });

  // Get the book spine image URL from the book-spines bucket
  const spineImageUrl = useSpineImageUrl(book.image_url);
  const hasValidUrl = Boolean(spineImageUrl);
  const backgroundColor = getBookColor(book.title);

  // Dimensions for stacked (horizontal) books
  const stackedWidth = height;
  const stackedHeight = width;

  const renderBookContent = () => {
    if (book.is_stacked) {
      // Stacked (horizontal) view - book laying flat
      return (
        <View
          style={[
            styles.stackedContainer,
            {
              width: stackedWidth,
              height: stackedHeight,
              backgroundColor: colors.backgroundDark,
            },
          ]}
        >
          {hasValidUrl ? (
            <View style={styles.stackedImageWrapper}>
              <Image
                source={{ uri: spineImageUrl! }}
                style={{
                  width: stackedHeight,
                  height: stackedWidth,
                  transform: [{ rotate: '-90deg' }],
                }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            </View>
          ) : (
            <View style={[styles.stackedPlaceholder, { backgroundColor }]}>
              <Text
                style={[styles.stackedTitle, { color: colors.textOnDark }]}
                numberOfLines={1}
              >
                {book.title}
              </Text>
            </View>
          )}
          {/* Top edge effect for stacked book */}
          <View
            style={[
              styles.stackedEdge,
              { backgroundColor: colors.overlayLight },
            ]}
          />
        </View>
      );
    }

    // Regular upright spine view - book spine image from book-spines bucket
    return (
      <View style={[styles.spineContainer, { width, height }]}>
        {hasValidUrl ? (
          <Image
            source={{ uri: spineImageUrl! }}
            style={styles.image}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.placeholder, { backgroundColor }]}>
            <Text
              style={[styles.placeholderTitle, { color: colors.textOnDark }]}
              numberOfLines={3}
            >
              {book.title}
            </Text>
            <Text
              style={[
                styles.placeholderAuthor,
                { color: colors.textOnDarkMuted },
              ]}
              numberOfLines={2}
            >
              {book.author}
            </Text>
          </View>
        )}
        {/* Book spine edge effect */}
        <View
          style={[styles.spineEdge, { backgroundColor: colors.overlayLight }]}
        />
      </View>
    );
  };

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[
          styles.container,
          book.is_stacked
            ? { width: stackedWidth, height: stackedHeight }
            : { width, height },
          animatedStyle,
        ]}
      >
        {renderBookContent()}

        {/* Edit mode indicator */}
        {isEditing && (
          <View
            style={[styles.editOverlay, { backgroundColor: colors.overlay }]}
          >
            <View
              style={[
                styles.dragHandle,
                { backgroundColor: colors.overlayDark },
              ]}
            >
              <Ionicons name="move" size={16} color={colors.textOnDark} />
            </View>
            <Pressable
              style={[styles.rotateButton, { backgroundColor: colors.primary }]}
              onPress={() => onToggleStack(book)}
              hitSlop={8}
            >
              <Ionicons
                name={book.is_stacked ? 'arrow-up' : 'arrow-forward'}
                size={14}
                color={colors.textInverse}
              />
            </Pressable>
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 2,
    overflow: 'visible',
    ...Shadows.md,
  },
  spineContainer: {
    borderRadius: 2,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderTitle: {
    fontSize: 8,
    fontWeight: '600',
    textAlign: 'center',
    writingDirection: 'ltr',
    transform: [{ rotate: '-90deg' }],
    width: 160,
    position: 'absolute',
  },
  placeholderAuthor: {
    fontSize: 6,
    textAlign: 'center',
    position: 'absolute',
    bottom: 8,
  },
  spineEdge: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  // Stacked (horizontal) book styles
  stackedContainer: {
    borderRadius: 2,
    overflow: 'hidden',
  },
  stackedImageWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stackedPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  stackedTitle: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  stackedEdge: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 3,
  },
  // Edit mode overlay
  editOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 2,
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 4,
  },
  dragHandle: {
    borderRadius: 4,
    padding: 4,
  },
  rotateButton: {
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default DraggableBookSpine;
