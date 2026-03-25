/**
 * App Entry Point
 *
 * Shows a loading state while the anonymous auth session is being
 * created or restored, then routes to onboarding (first launch)
 * or the main app (returning user).
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Typography, Spacing, getFontFamily } from '@/constants/theme';

const ONBOARDING_COMPLETE_KEY = 'onboarding_complete';

export default function Index() {
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
      <View style={styles.container}>
        <View style={styles.heroCard}>
          <View style={styles.logoContainer}>
            <Text style={styles.eyebrow}>Welcome back</Text>
            <Text style={styles.logoText}>Virtual Library</Text>
            <Text style={styles.tagline}>
              Curate, scan, and revisit every shelf with a calmer, more polished reading home.
            </Text>
          </View>

          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color={Colors.accent} />
            <Text style={styles.statusText}>Setting up your library</Text>
          </View>
        </View>
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
  eyebrow: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('semibold'),
    color: Colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: 12,
    backgroundColor: Colors.background,
  },
  statusText: {
    fontSize: Typography.sizes.sm,
    fontFamily: getFontFamily('medium'),
    color: Colors.textSecondary,
  },
  retryLink: {
    textAlign: 'center',
    fontSize: Typography.sizes.sm,
    color: Colors.accent,
    fontFamily: getFontFamily('semibold'),
  },
});
