/**
 * App Entry Point
 *
 * Shows a loading state while the anonymous auth session is being
 * created or restored, then routes to onboarding (first launch)
 * or the main app (returning user).
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SleepingCat } from '@/components/SleepingCat';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Colors, Typography, Spacing, getFontFamily, getSerifFontFamily } from '@/constants/theme';

const ONBOARDING_COMPLETE_KEY = 'onboarding_complete';

export default function Index() {
  const { colors } = useTheme();
  const { isAuthenticated, isLoading, authError, restartAnonymousSession } = useAuth();
  const [isRetryingAuth, setIsRetryingAuth] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY).then((value) => {
      setHasCompletedOnboarding(value === 'true');
      setOnboardingChecked(true);
    });
  }, []);

  const handleRetryAuth = async () => {
    setIsRetryingAuth(true);
    await restartAnonymousSession();
    setIsRetryingAuth(false);
  };

  // Show loading state while initialising anonymous session or checking onboarding
  if (isLoading || !onboardingChecked || (isRetryingAuth && !isAuthenticated)) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <SleepingCat size={240} color={colors.textSecondary} />
        {/* Absolutely positioned so the cat keeps the exact centre of the screen */}
        <Text style={[styles.appName, { color: colors.text }]}>TinyShelves</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.heroCard}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>Couldn't start your session</Text>
            <Text style={styles.tagline}>
              {authError || 'Anonymous sign-in failed. Check your Supabase Auth trigger and users table migration.'}
            </Text>
          </View>

          <Text onPress={handleRetryAuth} style={styles.retryLink}>
            {isRetryingAuth ? 'Retrying…' : 'Tap to retry anonymous sign-in'}
          </Text>
        </View>
      </View>
    );
  }

  if (!hasCompletedOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appName: {
    position: 'absolute',
    bottom: '18%',
    left: 0,
    right: 0,
    fontSize: 34,
    fontFamily: getSerifFontFamily('medium'),
    textAlign: 'center',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    padding: Spacing.xl,
  },
  heroCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 16,
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  logoContainer: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  logoText: {
    fontSize: Typography.sizes.xxxl,
    fontFamily: getFontFamily('bold'),
    color: Colors.text,
    textAlign: 'center',
  },
  tagline: {
    fontSize: Typography.sizes.lg,
    fontFamily: getFontFamily('regular'),
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  retryLink: {
    textAlign: 'center',
    fontSize: Typography.sizes.sm,
    color: Colors.accent,
    fontFamily: getFontFamily('semibold'),
  },
});
