/**
 * Tabs Layout
 *
 * Main tab navigation for the authenticated app.
 */

import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { BorderRadius, Spacing, Typography, getFontFamily, getSerifFontFamily } from '@/constants/theme';

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
        tabBarLabelStyle: {
          fontFamily: getFontFamily('semibold'),
          fontSize: Typography.sizes.xs,
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
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="library-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="community"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: '',
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
