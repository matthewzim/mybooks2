/**
 * Root Layout
 *
 * The root layout for the app using Expo Router.
 * Sets up:
 * - Theme provider for app-wide theming
 * - Auth provider for global authentication state
 * - RevenueCat provider for in-app purchases & subscriptions
 * - Navigation structure
 * - Font loading
 * - Splash screen handling
 */

import React, { useEffect } from 'react';
import { Stack } from 'expo-router';

import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Platform } from 'react-native';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { RevenueCatProvider } from '@/contexts/RevenueCatContext';
import { getFontFamily } from '@/constants/theme';

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

/**
 * Inner layout component that uses theme context
 */
function RootLayoutContent() {
  const { colors, theme } = useTheme();

  return (
    <>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: colors.textInverse,
          headerTitleStyle: {
            fontFamily: getFontFamily('semibold'),
          },
          contentStyle: {
            backgroundColor: colors.background,
          },
        }}
      >
        {/* Main entry point - handles auth routing */}
        <Stack.Screen
          name="index"
          options={{
            headerShown: false,
          }}
        />

        {/* Main app tabs */}
        <Stack.Screen
          name="(tabs)"
          options={{
            title: 'Shelves',
            headerShown: false,
          }}
        />

        {/* Bookshelf screens */}
        <Stack.Screen
          name="bookshelf"
          options={{
            headerShown: false,
            presentation: 'card',
          }}
        />

        {/* User profile screen */}
        <Stack.Screen
          name="user/[id]"
          options={{
            title: 'User Profile',
            presentation: 'card',
          }}
        />

        {/* Book detail screen */}
        <Stack.Screen
          name="book/[id]"
          options={{
            title: 'Book Details',
            presentation: 'card',
          }}
        />

        {/* Camera/Scanner modal */}
        <Stack.Screen
          name="scan"
          options={{
            title: 'Scan Book',
            presentation: 'fullScreenModal',
            headerShown: false,
          }}
        />

        {/* Payment screen */}
        <Stack.Screen
          name="payment"
          options={{
            title: 'Premium',
            presentation: 'modal',
          }}
        />

        {/* Add book modal */}
        <Stack.Screen
          name="add-book"
          options={{
            title: 'Add Book',
            presentation: 'modal',
          }}
        />

        {/* Create bookshelf modal */}
        <Stack.Screen
          name="create-bookshelf"
          options={{
            title: 'New Bookshelf',
            presentation: 'modal',
          }}
        />

        {/* Onboarding flow */}
        <Stack.Screen
          name="onboarding"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            gestureEnabled: false,
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({});

  // Hide splash screen when fonts are loaded
  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }

    const linkDefinitions = [
      {
        id: 'plus-jakarta-preconnect',
        rel: 'preconnect',
        href: 'https://fonts.googleapis.com',
      },
      {
        id: 'plus-jakarta-preconnect-gstatic',
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        id: 'plus-jakarta-stylesheet',
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&display=swap',
      },
    ];

    linkDefinitions.forEach(({ id, ...attributes }) => {
      if (document.getElementById(id)) {
        return;
      }

      const link = document.createElement('link');
      link.id = id;

      Object.entries(attributes).forEach(([key, value]) => {
        link.setAttribute(key, value);
      });

      document.head.appendChild(link);
    });
  }, []);

  // Show nothing while fonts are loading
  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <RevenueCatProvider>
            <RootLayoutContent />
          </RevenueCatProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
