/**
 * RevealStep - Cinematic final reveal
 *
 * "Here's your shelf" with celebration animation,
 * then persists the bookshelf to Supabase and navigates to the main app.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Spacing, BorderRadius, Typography, BookshelfDimensions, Wood, getFontFamily } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { getShelfColors } from '@/utils/shelfColors';
import { useOnboarding, type PreviewBook } from './OnboardingContext';
import { MiniSpine, getSpineSize } from './LivePreview';

const CONFETTI_COLORS = ['#6366f1', '#f59e0b', '#22c55e', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

function ConfettiPiece({ index }: { index: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const startX = Math.random() * 300 - 150;
  const endX = startX + (Math.random() * 100 - 50);
  const size = Math.random() * 8 + 4;
  const duration = 1500 + Math.random() * 1000;
  const delay = Math.random() * 400;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size * 1.5,
        borderRadius: 2,
        backgroundColor: color,
        opacity: anim.interpolate({
          inputRange: [0, 0.2, 0.8, 1],
          outputRange: [0, 1, 1, 0],
        }),
        transform: [
          {
            translateX: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [startX, endX],
            }),
          },
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [-20, 300],
            }),
          },
          {
            rotate: anim.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', `${Math.random() * 720 - 360}deg`],
            }),
          },
        ],
      }}
    />
  );
}

// Frame and spine metrics mirror LivePreview / BookshelfPreview
const SPINE_HEIGHT = 132;
const SHELF_THICKNESS = BookshelfDimensions.shelfThickness;
const SHELF_BORDER_WIDTH = Math.round(BookshelfDimensions.shelfThickness * 0.75);
const FRAME_EDGE_WIDTH = 1;
const REVEAL_MAX_WIDTH = 360;

function RevealShelf({ books, shelfStyle, shelfColor }: { books: PreviewBook[]; shelfStyle: string; shelfColor: string }) {
  const { colors } = useTheme();
  const slideAnim = useRef(new Animated.Value(0)).current;
  const { width: screenWidth } = useWindowDimensions();
  const shelfColors = getShelfColors(shelfColor);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 1,
      tension: 40,
      friction: 8,
      delay: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  // Fill the row by accumulated spine width so books never spill past the
  // right shelf border (same logic as LivePreview).
  const shelfOuterWidth = Math.min(screenWidth - Spacing.xl * 2, REVEAL_MAX_WIDTH);
  const shelfInnerWidth =
    shelfStyle === 'full'
      ? shelfOuterWidth - (SHELF_BORDER_WIDTH + FRAME_EDGE_WIDTH) * 2
      : shelfOuterWidth;

  const visibleBooks: { book: PreviewBook; width: number; height: number }[] = [];
  let usedWidth = 0;
  for (const book of books) {
    const size = getSpineSize(book);
    if (usedWidth + size.width > shelfInnerWidth && visibleBooks.length > 0) break;
    visibleBooks.push({ book, ...size });
    usedWidth += size.width;
  }

  return (
    <Animated.View
      style={[
        styles.revealShelf,
        {
          opacity: slideAnim,
          transform: [{
            scale: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.8, 1],
            }),
          }],
        },
      ]}
    >
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
        {/* Wood frame around the row, matching the shelf previews */}
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

          <View style={[styles.revealBooks, { minHeight: SPINE_HEIGHT }]}>
            {visibleBooks.length > 0 ? (
              visibleBooks.map(({ book, width, height }, i) => (
                <MiniSpine key={book.id} book={book} width={width} height={height} index={i} />
              ))
            ) : (
              <View style={styles.emptyReveal}>
                <Text style={[styles.emptyRevealText, { color: colors.textSecondary }]}>
                  Your shelf is ready!
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
    </Animated.View>
  );
}

export function RevealStep({ onComplete }: { onComplete: () => void }) {
  const { colors } = useTheme();
  const { shelfName, books, shelfStyle, shelfColor } = useOnboarding();

  const titleAnim = useRef(new Animated.Value(0)).current;
  const subtitleAnim = useRef(new Animated.Value(0)).current;
  const buttonAnim = useRef(new Animated.Value(0)).current;
  const [showConfetti, setShowConfetti] = useState(true);

  const displayName = shelfName || 'My Bookshelf';

  useEffect(() => {
    Animated.stagger(300, [
      Animated.spring(titleAnim, { toValue: 1, tension: 50, friction: 10, useNativeDriver: true }),
      Animated.spring(subtitleAnim, { toValue: 1, tension: 50, friction: 10, useNativeDriver: true }),
      Animated.spring(buttonAnim, { toValue: 1, tension: 50, friction: 10, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Confetti layer */}
      {showConfetti && (
        <View style={styles.confettiContainer} pointerEvents="none">
          {Array.from({ length: 30 }).map((_, i) => (
            <ConfettiPiece key={i} index={i} />
          ))}
        </View>
      )}

      <Animated.View
        style={[
          styles.titleContainer,
          {
            opacity: titleAnim,
            transform: [{
              translateY: titleAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [30, 0],
              }),
            }],
          },
        ]}
      >
        <Text style={[styles.eyebrow, { color: colors.accent }]}>HERE'S YOUR SHELF</Text>
        <Text style={[styles.shelfTitle, { color: colors.text }]}>{displayName}</Text>
      </Animated.View>

      <RevealShelf books={books} shelfStyle={shelfStyle} shelfColor={shelfColor} />

      <Animated.View
        style={[
          styles.statsRow,
          {
            opacity: subtitleAnim,
            transform: [{
              translateY: subtitleAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [20, 0],
              }),
            }],
          },
        ]}
      >
        <View style={[styles.statBadge, { backgroundColor: colors.backgroundDark }]}>
          <Ionicons name="book" size={16} color={colors.accent} />
          <Text style={[styles.statText, { color: colors.text }]}>
            {books.length} {books.length === 1 ? 'book' : 'books'}
          </Text>
        </View>
      </Animated.View>

      <Animated.View
        style={[
          styles.bottomActions,
          {
            opacity: buttonAnim,
            transform: [{
              translateY: buttonAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [30, 0],
              }),
            }],
          },
        ]}
      >
        <Pressable
          style={[styles.goButton, { backgroundColor: colors.accent }]}
          onPress={onComplete}
        >
          <Text style={styles.goButtonText}>Go to My Library</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  confettiContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 80,
    overflow: 'hidden',
  },
  titleContainer: {
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  eyebrow: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('semibold'),
    letterSpacing: 2,
  },
  shelfTitle: {
    fontSize: 30,
    fontFamily: getFontFamily('bold'),
    textAlign: 'center',
  },
  revealShelf: {
    width: '100%',
    maxWidth: REVEAL_MAX_WIDTH,
  },
  shelfRow: {
    overflow: 'hidden',
    borderRadius: BorderRadius.md,
  },
  shelfInterior: {
    overflow: 'hidden',
  },
  revealBooks: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    zIndex: 1,
    flexWrap: 'nowrap',
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
  emptyReveal: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyRevealText: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('medium'),
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  statText: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('medium'),
  },
  bottomActions: {
    width: '100%',
    maxWidth: 360,
    marginTop: Spacing.xl,
  },
  goButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    width: '100%',
  },
  goButtonText: {
    color: '#fff',
    fontSize: Typography.sizes.lg,
    fontFamily: getFontFamily('semibold'),
  },
});
