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
import { BorderRadius, Colors, Spacing, Typography, ThemeColors, getFontFamily } from '@/constants/theme';
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
    <View style={[styles.container, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
      <View style={[styles.iconWrap, { backgroundColor: themeColors.backgroundDark }]}>
        <Ionicons name={icon} size={32} color={themeColors.primary} />
      </View>
      <Text style={[styles.title, { color: themeColors.text }]}>{title}</Text>
      {description && <Text style={[styles.description, { color: themeColors.textSecondary }]}>{description}</Text>}
      {actionLabel && onAction && (
        <View style={styles.buttonContainer}>
          <Button title={actionLabel} onPress={onAction} colors={themeColors} fullWidth />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    marginHorizontal: Spacing.md,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    gap: Spacing.md,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: Typography.sizes.xl,
    fontFamily: getFontFamily('semibold'),
    textAlign: 'center',
  },
  description: {
    fontSize: Typography.sizes.md,
    fontFamily: getFontFamily('regular'),
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  buttonContainer: {
    marginTop: Spacing.xs,
    width: '100%',
  },
});

export default EmptyState;
