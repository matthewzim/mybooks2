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
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import {
  Newsreader_400Regular,
  Newsreader_400Regular_Italic,
  Newsreader_500Medium,
  Newsreader_500Medium_Italic,
  Newsreader_600SemiBold,
} from '@expo-google-fonts/newsreader';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Platform } from 'react-native';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { RevenueCatProvider } from '@/contexts/RevenueCatContext';
import { Colors, getSerifFontFamily } from '@/constants/theme';

/**
 * Header options for screens that render their content on the static light
 * palette: no coloured bar, no title, dark tint so the native back/close
 * controls stay legible against the page background.
 */
const plainHeaderOptions = {
  title: '',
  headerStyle: { backgroundColor: Colors.background },
  headerTintColor: Colors.text,
  headerShadowVisible: false,
  // Bare arrow: without this iOS falls back to labelling it with the previous
  // screen's title, which puts text back in a header meant to be empty.
  headerBackButtonDisplayMode: 'minimal' as const,
};

// Prevent splash screen from auto-hiding. This rejects if the splash screen
// has already gone (fast reload, or the module initialising twice); an
// unhandled rejection here is fatal in release builds on iOS.
SplashScreen.preventAutoHideAsync().catch(() => {});

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
            fontFamily: getSerifFontFamily('semibold'),
            fontSize: 18,
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
            ...plainHeaderOptions,
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

        {/* Payment screen. No header bar at all: the paywall and the premium
            status screen both fill the modal edge to edge and render their own
            floating close button. */}
        <Stack.Screen
          name="payment"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
          }}
        />

        {/* Customer Center screen */}
        <Stack.Screen
          name="customer-center"
          options={{
            ...plainHeaderOptions,
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

        {/* Shelf photo scan modal */}
        <Stack.Screen
          name="shelf-scan"
          options={{
            title: 'Scan Shelf',
            presentation: 'modal',
          }}
        />

        {/* Create bookshelf modal */}
        <Stack.Screen
          name="create-bookshelf"
          options={{
            title: '',
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
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    Newsreader_400Regular,
    Newsreader_400Regular_Italic,
    Newsreader_500Medium,
    Newsreader_500Medium_Italic,
    Newsreader_600SemiBold,
  });

  // A font that fails to load must not leave the app on the splash screen
  // forever. `getFontFamily` falls back to the system face when a family is
  // missing, so rendering unstyled beats never rendering at all.
  const fontsReady = fontsLoaded || Boolean(fontError);

  useEffect(() => {
    if (fontError) {
      console.warn('Font loading failed; falling back to system fonts:', fontError);
    }
  }, [fontError]);

  // Hide splash screen once fonts have resolved one way or the other
  useEffect(() => {
    if (fontsReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsReady]);

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
      {
        id: 'newsreader-stylesheet',
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..600;1,6..72,400..600&display=swap',
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
  if (!fontsReady) {
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
