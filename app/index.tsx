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
import { Colors, Typography, Spacing } from '@/constants/theme';

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading state while initialising anonymous session
  if (isLoading || !isAuthenticated) {
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
