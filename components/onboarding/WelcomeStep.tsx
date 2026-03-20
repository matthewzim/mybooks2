/**
 * WelcomeStep - Full-screen hook page
 *
 * "Create your dream bookshelf in 30 seconds"
 * with a Get Started button and visual placeholder.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Typography, BorderRadius, getFontFamily, BookSpine as BookSpineConstants } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useOnboarding } from './OnboardingContext';

const HERO_BOOKS = [
  { color: '#8B0000', height: 80 },
  { color: '#00008B', height: 95 },
  { color: '#006400', height: 70 },
  { color: '#4B0082', height: 88 },
  { color: '#8B4513', height: 75 },
  { color: '#2F4F4F', height: 92 },
  { color: '#483D8B', height: 68 },
  { color: '#556B2F', height: 85 },
  { color: '#800000', height: 78 },
  { color: '#191970', height: 90 },
];

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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Visual placeholder - decorative mini shelf */}
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
            <View style={styles.heroBack} />
            <View style={styles.heroBooks}>
              {HERO_BOOKS.map((book, i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.heroSpine,
                    {
                      backgroundColor: book.color,
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
                />
              ))}
            </View>
            <View style={styles.heroShelfBar} />
          </View>
        </Animated.View>

        <View style={styles.textContainer}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>
            VIRTUAL LIBRARY
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            Create your dream{'\n'}bookshelf in 30 seconds
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            No forms. No typing. Just tap your way to a beautiful, personalized shelf.
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          <Animated.View style={{ transform: [{ scale: buttonScale }], width: '100%' }}>
            <Pressable
              style={[styles.getStartedButton, { backgroundColor: colors.accent }]}
              onPress={handleGetStarted}
              onPressIn={() => Animated.spring(buttonScale, { toValue: 0.96, useNativeDriver: true }).start()}
              onPressOut={() => Animated.spring(buttonScale, { toValue: 1, useNativeDriver: true }).start()}
            >
              <Text style={styles.getStartedText}>Get Started</Text>
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
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    borderWidth: 1,
  },
  heroShelfInner: {
    borderWidth: 4,
    borderColor: '#8B4513',
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  heroBack: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#654321',
  },
  heroBooks: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 2,
    minHeight: 100,
  },
  heroSpine: {
    width: 24,
    borderRadius: 1,
  },
  heroShelfBar: {
    height: 6,
    backgroundColor: '#8B4513',
    marginTop: -1,
  },
  textContainer: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  eyebrow: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('semibold'),
    letterSpacing: 2,
  },
  title: {
    fontSize: 28,
    fontFamily: getFontFamily('bold'),
    textAlign: 'center',
    lineHeight: 36,
  },
  subtitle: {
    fontSize: Typography.sizes.lg,
    fontFamily: getFontFamily('regular'),
    textAlign: 'center',
    lineHeight: 24,
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
    borderRadius: BorderRadius.lg,
    width: '100%',
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
