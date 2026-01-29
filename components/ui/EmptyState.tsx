/**
 * EmptyState Component
 *
 * Display when there's no content to show.
 * Includes icon, title, description, and optional action button.
 * Supports theme-aware colors via the colors prop.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, ThemeColors } from '@/constants/theme';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  colors?: ThemeColors;
}

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  description,
  actionLabel,
  onAction,
  colors,
}: EmptyStateProps) {
  const themeColors = colors || Colors;

  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={64} color={themeColors.textLight} />
      <Text style={[styles.title, { color: themeColors.text }]}>{title}</Text>
      {description && <Text style={[styles.description, { color: themeColors.textSecondary }]}>{description}</Text>}
      {actionLabel && onAction && (
        <View style={styles.buttonContainer}>
          <Button title={actionLabel} onPress={onAction} colors={themeColors} />
        </View>
      )}
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
  title: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.semibold,
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
  description: {
    fontSize: Typography.sizes.md,
    marginTop: Spacing.sm,
    textAlign: 'center',
    maxWidth: 280,
  },
  buttonContainer: {
    marginTop: Spacing.xl,
  },
});

export default EmptyState;
