/**
 * App Entry Point
 *
 * Shows a loading state while the anonymous auth session is being
 * created or restored, then redirects to the main app.
 */

import React from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Typography, Spacing, getFontFamily } from '@/constants/theme';

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading state while initialising anonymous session
  if (isLoading || !isAuthenticated) {
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
});
