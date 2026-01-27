/**
 * Root Layout
 *
 * The root layout for the app using Expo Router.
 * Sets up:
 * - Auth provider for global authentication state
 * - Stripe provider for payments
 * - Navigation structure
 * - Font loading
 * - Splash screen handling
 */

import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { StripeProvider } from '@stripe/stripe-react-native';
import { AuthProvider } from '@/contexts/AuthContext';
import { stripeService } from '@/services/stripe';
import { Colors } from '@/constants/theme';

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Load custom fonts (optional - using system fonts by default)
  const [fontsLoaded] = useFonts({
    // Add custom fonts here if needed
    // 'CustomFont-Regular': require('@/assets/fonts/CustomFont-Regular.ttf'),
  });

  // Hide splash screen when fonts are loaded
  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  // Show nothing while fonts are loading
  if (!fontsLoaded) {
    return null;
  }

  return (
    <StripeProvider
      publishableKey={stripeService.getPublishableKey()}
      merchantIdentifier="merchant.com.yourcompany.virtuallibrary"
    >
      <AuthProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: Colors.primary,
            },
            headerTintColor: Colors.textInverse,
            headerTitleStyle: {
              fontWeight: '600',
            },
            contentStyle: {
              backgroundColor: Colors.background,
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

          {/* Auth screens group */}
          <Stack.Screen
            name="(auth)"
            options={{
              headerShown: false,
            }}
          />

          {/* Main app tabs */}
          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: false,
            }}
          />

          {/* Bookshelf detail screen */}
          <Stack.Screen
            name="bookshelf/[id]"
            options={{
              title: 'Bookshelf',
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
        </Stack>
      </AuthProvider>
    </StripeProvider>
  );
}
