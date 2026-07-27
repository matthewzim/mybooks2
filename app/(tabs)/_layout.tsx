/**
 * Tabs Layout
 *
 * Main tab navigation for the authenticated app.
 */

import React from 'react';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import {
  BorderRadius,
  Spacing,
  Typography,
  getFontFamily,
  getSerifFontFamily,
  CHROME_MAX_FONT_SCALE,
} from '@/constants/theme';

/**
 * Tab labels are rendered explicitly so the Dynamic Type multiplier can be
 * capped. The tab bar has a fixed height, and at iOS's largest accessibility
 * text sizes an uncapped 10pt label grows past 30pt and pushes the icon out
 * of the bar entirely.
 */
function TabLabel({ color, children }: { color: string; children: string }) {
  return (
    <Text
      numberOfLines={1}
      maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
      style={{
        color,
        fontFamily: getFontFamily('semibold'),
        fontSize: Typography.sizes.xs,
      }}
    >
      {children}
    </Text>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textLight,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          elevation: 0,
          shadowOpacity: 0,
          // Extend the bar through the bottom safe area so there is no gap
          // between the tab bar and the bottom edge of the screen.
          height: 64 + insets.bottom,
          paddingTop: Spacing.xs,
          paddingBottom: Math.max(insets.bottom, Spacing.xs),
        },
        tabBarItemStyle: {
          borderRadius: BorderRadius.lg,
        },
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerTitleStyle: {
          fontFamily: getSerifFontFamily('medium'),
          fontSize: 22,
          color: colors.text,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '',
          tabBarLabel: ({ color }: { color: string }) => <TabLabel color={color}>Home</TabLabel>,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="library-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="community"
        options={{
          title: '',
          tabBarLabel: ({ color }: { color: string }) => <TabLabel color={color}>Explore</TabLabel>,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: '',
          tabBarLabel: ({ color }: { color: string }) => <TabLabel color={color}>Settings</TabLabel>,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
