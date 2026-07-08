/**
 * WelcomeStep - Full-screen hook page
 *
 * "Build your dream shelf in thirty seconds"
 * with a Get Started button and a decorative hero shelf of bound spines.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Spacing, Typography, BorderRadius, Wood, BookshelfDimensions, getFontFamily, getSerifFontFamily } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useOnboarding } from './OnboardingContext';

// Warm literary cloth palette (mirrors the placeholder spine set)
const HERO_BOOKS = [
  { color: '#7c3b2e', height: 80 },
  { color: '#2d3a54', height: 95 },
  { color: '#c08a2d', height: 70 },
  { color: '#3f5641', height: 88 },
  { color: '#33261f', height: 75 },
  { color: '#d9c9a8', height: 92 },
  { color: '#4a2f45', height: 68 },
  { color: '#6b2f2a', height: 85 },
  { color: '#37514f', height: 78 },
  { color: '#5c3a1f', height: 90 },
];

const HERO_SHEEN_COLORS = [
  'rgba(255, 255, 255, 0.16)',
  'rgba(0, 0, 0, 0)',
  'rgba(0, 0, 0, 0.16)',
  'rgba(0, 0, 0, 0.34)',
] as const;
const HERO_SHEEN_LOCATIONS = [0, 0.24, 0.72, 1] as const;

// Cabinet frame thickness — same as the shelf preview cards on the home page
const HERO_BORDER_WIDTH = Math.round(BookshelfDimensions.shelfThickness * 0.75);
const HERO_FRAME_EDGE_WIDTH = 1;

export function WelcomeStep() {
  const { colors } = useTheme();
  const { setStep } = useOnboarding();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const shelfAnim = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 50,
          friction: 10,
          useNativeDriver: true,
        }),
      ]),
      Animated.spring(shelfAnim, {
        toValue: 1,
        tension: 40,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleGetStarted = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setStep('style'));
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#f6efe1', '#efe3cf']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Decorative hero shelf: bound spines on a plank inside a warm frame */}
        <Animated.View
          style={[
            styles.heroShelf,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              transform: [{ scale: shelfAnim }],
            },
          ]}
        >
          <View style={styles.heroShelfInner}>
            {/* Wood cabinet frame, matching the home page shelf previews */}
            <LinearGradient
              colors={[Wood.frameTop, Wood.frameBottom]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroInterior}>
              <LinearGradient
                colors={[Wood.backTop, Wood.backBottom]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.heroBooks}>
                {HERO_BOOKS.map((book, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.heroSpineShadow,
                      {
                        height: book.height,
                        opacity: shelfAnim,
                        transform: [{
                          translateY: shelfAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [30, 0],
                          }),
                        }],
                      },
                    ]}
                  >
                    <View style={[styles.heroSpine, { backgroundColor: book.color }]}>
                      <LinearGradient
                        colors={HERO_SHEEN_COLORS}
                        locations={HERO_SHEEN_LOCATIONS}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={[styles.heroGiltBand, { top: 7 }]} />
                      <View style={[styles.heroGiltBand, { bottom: 8 }]} />
                    </View>
                  </Animated.View>
                ))}
              </View>
            </View>
          </View>
        </Animated.View>

        <View style={styles.textContainer}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>
            TINYSHELVES
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            Build your dream shelf{'\n'}in thirty seconds
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          <Animated.View style={{ transform: [{ scale: buttonScale }], width: '100%' }}>
            <Pressable
              style={[styles.getStartedButton, { backgroundColor: colors.primary }]}
              onPress={handleGetStarted}
              onPressIn={() => Animated.spring(buttonScale, { toValue: 0.96, useNativeDriver: true }).start()}
              onPressOut={() => Animated.spring(buttonScale, { toValue: 1, useNativeDriver: true }).start()}
            >
              <Text style={styles.getStartedText}>Get started</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </Pressable>
          </Animated.View>

          <Pressable
            style={styles.skipButton}
            onPress={() => setStep('reveal')}
          >
            <Text style={[styles.skipText, { color: colors.textLight }]}>
              Skip setup
            </Text>
          </Pressable>
        </View>
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
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    gap: Spacing.xl,
  },
  heroShelf: {
    width: '100%',
    borderRadius: BorderRadius.xxl,
    padding: Spacing.md,
    borderWidth: 1,
  },
  heroShelfInner: {
    padding: HERO_BORDER_WIDTH,
    borderWidth: HERO_FRAME_EDGE_WIDTH,
    borderColor: Wood.frameEdge,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  heroInterior: {
    overflow: 'hidden',
  },
  heroBooks: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 2,
    minHeight: 100,
  },
  heroSpineShadow: {
    width: 24,
    shadowColor: '#32190a',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  heroSpine: {
    flex: 1,
    overflow: 'hidden',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 1,
  },
  heroGiltBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(201, 162, 90, 0.55)',
  },
  textContainer: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  eyebrow: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('semibold'),
    letterSpacing: 2.5,
  },
  title: {
    fontSize: 31,
    fontFamily: getSerifFontFamily('medium'),
    textAlign: 'center',
    lineHeight: 38,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.md,
  },
  getStartedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.xl,
    width: '100%',
    shadowColor: '#4a2f19',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 6,
  },
  getStartedText: {
    color: '#fff',
    fontSize: Typography.sizes.lg,
    fontFamily: getFontFamily('semibold'),
  },
  skipButton: {
    padding: Spacing.sm,
  },
  skipText: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('medium'),
  },
});
