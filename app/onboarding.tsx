/**
 * Onboarding Screen
 *
 * Multi-step onboarding flow that guides users from landing
 * to a fully generated bookshelf in under 30 seconds.
 *
 * Steps: Welcome → Style → Populate → Layout → Name → Reveal
 *
 * On completion, creates a real bookshelf in Supabase
 * with any books added during onboarding.
 */

import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { bookshelvesService } from '@/services/bookshelves';
import { booksService } from '@/services/books';
import {
  OnboardingProvider,
  useOnboarding,
  WelcomeStep,
  StyleStep,
  PopulateStep,
  LayoutStep,
  NameStep,
  RevealStep,
} from '@/components/onboarding';

const ONBOARDING_COMPLETE_KEY = 'onboarding_complete';

function OnboardingFlow() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const onboarding = useOnboarding();
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [isSaving, setIsSaving] = useState(false);

  const transitionTo = useCallback((nextStep: Parameters<typeof onboarding.setStep>[0]) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      onboarding.setStep(nextStep);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    });
  }, [onboarding.setStep, fadeAnim]);

  const handleComplete = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      // Create the bookshelf in Supabase
      const shelfName = onboarding.shelfName || 'My Bookshelf';
      const result = await bookshelvesService.createBookshelf({
        name: shelfName,
        cover_color: onboarding.shelfColor,
        shelf_style: onboarding.shelfStyle,
      });

      if (result.data && onboarding.books.length > 0) {
        // Add books to the shelf
        const shelfId = result.data.id;
        await Promise.all(
          onboarding.books.map((book, index) =>
            booksService.createBook({
              title: book.title,
              author: book.author,
              shelf_id: shelfId,
              position: index,
              image_url: book.source_image_url || undefined,
            })
          )
        );
      }

      // Mark onboarding as complete
      await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');

      // Navigate to the main app
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Failed to save onboarding shelf:', error);
      // Still mark onboarding complete and navigate
      await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
      router.replace('/(tabs)');
    }
  }, [isSaving, onboarding]);

  const handleSkipAll = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    router.replace('/(tabs)');
  }, []);

  const renderStep = () => {
    switch (onboarding.step) {
      case 'welcome':
        return <WelcomeStep />;
      case 'style':
        return (
          <StyleStep
            onNext={() => transitionTo('populate')}
            onSkip={handleSkipAll}
          />
        );
      case 'populate':
        return (
          <PopulateStep
            onNext={() => transitionTo('layout')}
            onSkip={handleSkipAll}
          />
        );
      case 'layout':
        return (
          <LayoutStep
            onNext={() => transitionTo('name')}
            onSkip={handleSkipAll}
          />
        );
      case 'name':
        return (
          <NameStep
            onNext={() => transitionTo('reveal')}
            onSkip={handleSkipAll}
          />
        );
      case 'reveal':
        return <RevealStep onComplete={handleComplete} />;
      default:
        return <WelcomeStep />;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.View style={[styles.stepContainer, { opacity: fadeAnim }]}>
        {renderStep()}
      </Animated.View>

      {/* Progress bar */}
      {onboarding.step !== 'welcome' && onboarding.step !== 'reveal' && (
        <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.accent,
                width: `${((onboarding.stepIndex) / (onboarding.totalSteps - 1)) * 100}%`,
              },
            ]}
          />
        </View>
      )}
    </View>
  );
}

export default function OnboardingScreen() {
  return (
    <OnboardingProvider>
      <OnboardingFlow />
    </OnboardingProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  stepContainer: {
    flex: 1,
  },
  progressBar: {
    height: 3,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  progressFill: {
    height: '100%',
    borderRadius: 1.5,
  },
});
