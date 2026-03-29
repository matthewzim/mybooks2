/**
 * Customer Center Screen
 *
 * Displays RevenueCat's Customer Center for managing subscriptions.
 * Uses the inline CustomerCenterView component to avoid modal-on-modal issues.
 */

import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import RevenueCatUI from 'react-native-purchases-ui';
import { Colors, Spacing } from '@/constants/theme';

export default function CustomerCenterScreen() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Manage Subscription',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={styles.headerButton}>
              <Ionicons name="chevron-back" size={24} color={Colors.textInverse} />
            </Pressable>
          ),
        }}
      />

      <View style={styles.container}>
        <RevenueCatUI.CustomerCenterView />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerButton: {
    padding: Spacing.xs,
  },
});
