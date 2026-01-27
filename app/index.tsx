/**
 * App Entry Point
 *
 * This is the initial screen that users see when opening the app.
 * It handles routing based on authentication state:
 * - If authenticated: redirect to main app (tabs)
 * - If not authenticated: redirect to login screen
 *
 * Also shows a loading state while checking auth status.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Typography, Spacing } from '@/constants/theme';

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>Virtual Library</Text>
          <Text style={styles.tagline}>Your personal bookshelf</Text>
        </View>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  // Redirect based on auth state
  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    padding: Spacing.xl,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  logoText: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    color: Colors.textInverse,
    marginBottom: Spacing.sm,
  },
  tagline: {
    fontSize: Typography.sizes.lg,
    color: Colors.textInverse,
    opacity: 0.8,
  },
});
