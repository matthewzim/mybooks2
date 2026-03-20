/**
 * LoadingView Component
 *
 * Full-screen loading indicator with optional message.
 * Supports theme-aware colors via the colors prop.
 */

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { BorderRadius, Colors, Spacing, Typography, ThemeColors, getFontFamily } from '@/constants/theme';

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
      <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
        <ActivityIndicator size="large" color={themeColors.primary} />
        {message && <Text style={[styles.message, { color: themeColors.textSecondary }]}>{message}</Text>}
      </View>
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
  card: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    gap: Spacing.md,
  },
  message: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('regular'),
    textAlign: 'center',
  },
});

export default LoadingView;
