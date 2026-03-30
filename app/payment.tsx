/**
 * Payment Screen
 *
 * Premium subscription purchase screen powered by RevenueCat.
 * Features:
 * - RevenueCat Paywall component displayed inline
 * - Customer Center for managing subscriptions
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Pressable,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import RevenueCatUI from 'react-native-purchases-ui';
import { useAuth } from '@/contexts/AuthContext';
import { useRevenueCat } from '@/contexts/RevenueCatContext';
import { PREMIUM_FEATURES } from '@/services/revenuecat';
import { Button } from '@/components/ui';
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
} from '@/constants/theme';

export default function PaymentScreen() {
  const { refreshUser } = useAuth();
  const { isPro, refresh } = useRevenueCat();

  /**
   * Navigate to the Customer Center screen for subscription management.
   * Uses a dedicated screen with inline CustomerCenterView to avoid
   * modal-on-modal issues with presentCustomerCenter().
   */
  const handleManageSubscription = () => {
    router.replace('/customer-center');
  };

  // If user is already premium, show status + Customer Center
  // Use isPro (RevenueCat) as the source of truth, not the cached Supabase value
  if (isPro) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Premium',
            headerLeft: () => (
              <Pressable onPress={() => router.back()} style={styles.headerButton}>
                <Ionicons name="close" size={24} color={Colors.textInverse} />
              </Pressable>
            ),
          }}
        />

        <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
          <View style={styles.premiumStatus}>
            <View style={styles.premiumBadge}>
              <Ionicons name="star" size={48} color={Colors.starFilled} />
            </View>
            <Text style={styles.premiumTitle}>You're a Premium Member!</Text>
            <Text style={styles.premiumDescription}>
              Thank you for supporting Virtual Library. You have access to all
              premium features.
            </Text>

            <View style={styles.featuresContainer}>
              <Text style={styles.featuresTitle}>Your Benefits:</Text>
              {PREMIUM_FEATURES.map((feature, index) => (
                <View key={index} style={styles.featureRow}>
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={Colors.success}
                  />
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>

            <Button
              title="Manage Subscription"
              variant="outline"
              onPress={handleManageSubscription}
              fullWidth
              style={styles.manageButton}
            />
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Non-premium: show RevenueCat Paywall inline
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Go Premium',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={styles.headerButton}>
              <Ionicons name="close" size={24} color={Colors.textInverse} />
            </Pressable>
          ),
        }}
      />

      <View style={styles.paywallContainer}>
        <RevenueCatUI.Paywall
          options={{
            displayCloseButton: false,
          }}
          onPurchaseCompleted={async () => {
            await refreshUser();
            await refresh();
            Alert.alert(
              'Welcome to Premium!',
              'Thank you for your purchase. You now have access to all premium features.',
              [{ text: 'OK', onPress: () => router.back() }]
            );
          }}
          onRestoreCompleted={async () => {
            await refreshUser();
            await refresh();
            Alert.alert(
              'Purchases Restored',
              'Your premium subscription has been restored.',
              [{ text: 'OK', onPress: () => router.back() }]
            );
          }}
          onDismiss={() => router.back()}
          style={styles.paywall}
        />
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
  paywallContainer: {
    flex: 1,
  },
  paywall: {
    flex: 1,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  featureText: {
    fontSize: Typography.sizes.sm,
    color: Colors.text,
    flex: 1,
  },
  premiumStatus: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  premiumBadge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  premiumTitle: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  premiumDescription: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  featuresContainer: {
    width: '100%',
    backgroundColor: Colors.backgroundDark,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  featuresTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  manageButton: {
    marginTop: Spacing.md,
  },
});
