/**
 * LoadingView Component
 *
 * Full-screen loading indicator with optional message.
 * Supports theme-aware colors via the colors prop.
 */

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors, Spacing, Typography, ThemeColors } from '@/constants/theme';

interface LoadingViewProps {
  message?: string;
  fullScreen?: boolean;
  colors?: ThemeColors;
}

export function LoadingView({
  message = 'Loading...',
  fullScreen = true,
  colors,
}: LoadingViewProps) {
  const themeColors = colors || Colors;

  return (
    <View style={[styles.container, fullScreen && [styles.fullScreen, { backgroundColor: themeColors.background }]]}>
      <ActivityIndicator size="large" color={themeColors.primary} />
      {message && <Text style={[styles.message, { color: themeColors.textSecondary }]}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  fullScreen: {
    flex: 1,
  },
  message: {
    marginTop: Spacing.md,
    fontSize: Typography.sizes.md,
    textAlign: 'center',
  },
});

export default LoadingView;
