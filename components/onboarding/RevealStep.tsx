/**
 * RevealStep - Cinematic final reveal
 *
 * "Here's your shelf" with celebration animation,
 * then persists the bookshelf to Supabase and navigates to the main app.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, BookshelfDimensions, getFontFamily } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useOnboarding, type PreviewBook } from './OnboardingContext';

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

const SPINE_WIDTH = 20;
const SPINE_HEIGHT = 132;
const REVEAL_SHELF_THICKNESS = 12;
const REVEAL_BORDER_WIDTH = 5;

function darkenColor(hex: string, factor: number = 0.7): string {
  const c = hex.replace('#', '');
  const r = Math.round(parseInt(c.substring(0, 2), 16) * factor);
  const g = Math.round(parseInt(c.substring(2, 4), 16) * factor);
  const b = Math.round(parseInt(c.substring(4, 6), 16) * factor);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function RevealShelf({ books, shelfStyle, shelfColor }: { books: PreviewBook[]; shelfStyle: string; shelfColor: string }) {
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 1,
      tension: 40,
      friction: 8,
      delay: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const visibleBooks = books.slice(0, 16);

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
          styles.shelfFrame,
          shelfStyle === 'full' && {
            borderWidth: REVEAL_BORDER_WIDTH,
            borderColor: shelfColor,
          },
        ]}
      >
        {shelfStyle === 'full' && (
          <View style={[styles.shelfBack, { backgroundColor: darkenColor(shelfColor) }]} />
        )}
        <View style={styles.revealBooks}>
          {visibleBooks.length > 0 ? (
            visibleBooks.map((book) => (
              <Animated.View
                key={book.id}
                style={[
                  styles.revealSpine,
                  {
                    backgroundColor: book.image_url ? 'transparent' : book.color,
                    opacity: slideAnim,
                    transform: [{
                      translateY: slideAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [40, 0],
                      }),
                    }],
                  },
                ]}
              >
                {book.image_url && (
                  <Image
                    source={{ uri: book.image_url }}
                    style={styles.revealSpineImage}
                    resizeMode="cover"
                  />
                )}
              </Animated.View>
            ))
          ) : (
            <View style={styles.emptyReveal}>
              <Text style={styles.emptyRevealText}>Your shelf is ready!</Text>
            </View>
          )}
        </View>
        {shelfStyle === 'bottom' && (
          <View style={[styles.revealShelfBar, { backgroundColor: shelfColor }]} />
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
    maxWidth: 360,
  },
  shelfFrame: {
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
  revealBooks: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    minHeight: SPINE_HEIGHT,
    zIndex: 1,
    flexWrap: 'nowrap',
  },
  revealSpine: {
    width: SPINE_WIDTH,
    height: SPINE_HEIGHT,
    overflow: 'hidden',
  },
  revealSpineImage: {
    width: '100%',
    height: '100%',
  },
  revealShelfBar: {
    height: REVEAL_SHELF_THICKNESS,
    borderRadius: BorderRadius.sm,
    marginTop: -1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyReveal: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyRevealText: {
    color: 'rgba(255,255,255,0.7)',
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
