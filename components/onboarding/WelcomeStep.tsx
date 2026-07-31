/**
 * WelcomeStep - Full-screen hook page
 *
 * "Build your dream shelf in thirty seconds"
 * with a Get Started button and the sleeping-cat hero mark.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Spacing, Typography, BorderRadius, getFontFamily, getSerifFontFamily } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { SleepingCat } from '@/components/SleepingCat';
import { useOnboarding } from './OnboardingContext';

export function WelcomeStep() {
  const { colors } = useTheme();
  const { setStep } = useOnboarding();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const catAnim = useRef(new Animated.Value(0)).current;
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
      Animated.spring(catAnim, {
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
        {/* Hero mark: the cat asleep on a stack of books, dreaming in z's */}
        <Animated.View
          style={[
            styles.hero,
            {
              opacity: catAnim,
              transform: [{ scale: catAnim }],
            },
          ]}
        >
          <SleepingCat size={220} color={colors.textLight} />
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
  hero: {
    alignItems: 'center',
    justifyContent: 'center',
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
