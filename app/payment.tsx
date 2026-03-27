/**
 * Payment Screen
 *
 * Premium subscription purchase screen powered by RevenueCat.
 * Features:
 * - RevenueCat native Paywall presentation
 * - Manual plan selection fallback
 * - Customer Center for managing subscriptions
 * - Restore purchases
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { PurchasesPackage } from 'react-native-purchases';
import { useAuth } from '@/contexts/AuthContext';
import { useRevenueCat } from '@/contexts/RevenueCatContext';
import { FREE_TIER_LIMITS, PREMIUM_FEATURES } from '@/services/revenuecat';
import { Button } from '@/components/ui';
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  Shadows,
} from '@/constants/theme';

export default function PaymentScreen() {
  const { user, refreshUser } = useAuth();
  const {
    isPro,
    currentOffering,
    purchasePackage,
    restorePurchases,
    refresh,
  } = useRevenueCat();
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoringPurchases, setIsRestoringPurchases] = useState(false);

  /**
   * Present the RevenueCat native Paywall.
   * This uses the paywall configured in the RevenueCat dashboard.
   */
  const handlePresentPaywall = async () => {
    try {
      const result = await RevenueCatUI.presentPaywall();

      if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
        await refreshUser();
        await refresh();
        Alert.alert(
          'Welcome to Premium!',
          'Thank you for your purchase. You now have access to all premium features.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
      // PAYWALL_RESULT.CANCELLED and PAYWALL_RESULT.ERROR are handled silently
    } catch (error) {
      console.error('Paywall presentation error:', error);
      Alert.alert(
        'Error',
        'Unable to display the subscription options. Please try again.'
      );
    }
  };

  /**
   * Present the RevenueCat Customer Center for subscription management.
   */
  const handlePresentCustomerCenter = async () => {
    try {
      await RevenueCatUI.presentCustomerCenter();
    } catch (error) {
      console.error('Customer Center error:', error);
      Alert.alert(
        'Manage Subscription',
        'To manage your subscription, visit your App Store or Google Play account settings.'
      );
    }
  };

  /**
   * Fallback: purchase a specific package manually (if paywall is unavailable).
   */
  const handlePurchasePackage = async (pkg: PurchasesPackage) => {
    setIsLoading(true);
    try {
      const purchased = await purchasePackage(pkg);
      if (purchased) {
        await refreshUser();
        Alert.alert(
          'Welcome to Premium!',
          'Thank you for your purchase. You now have access to all premium features.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
    } catch (error: any) {
      Alert.alert(
        'Purchase Failed',
        error?.message || 'Unable to complete purchase. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Restore previous purchases.
   */
  const handleRestorePurchases = async () => {
    setIsRestoringPurchases(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        await refreshUser();
        Alert.alert(
          'Purchases Restored',
          'Your premium subscription has been restored.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        Alert.alert(
          'No Purchases Found',
          'We could not find any previous purchases to restore.'
        );
      }
    } catch (error) {
      Alert.alert(
        'Restore Failed',
        'Unable to restore purchases. Please try again later.'
      );
    } finally {
      setIsRestoringPurchases(false);
    }
  };

  // If user is already premium, show status + Customer Center
  if (isPro || user?.is_premium) {
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
              onPress={handlePresentCustomerCenter}
              fullWidth
              style={styles.manageButton}
            />
          </View>
        </SafeAreaView>
      </>
    );
  }

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

      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Ionicons name="star" size={56} color={Colors.starFilled} />
            <Text style={styles.title}>Unlock Premium</Text>
            <Text style={styles.subtitle}>
              Get unlimited access to all features
            </Text>
          </View>

          {/* Features Comparison */}
          <View style={styles.comparisonContainer}>
            <Text style={styles.comparisonTitle}>What you get:</Text>

            <View style={styles.comparisonTable}>
              {/* Free tier */}
              <View style={styles.comparisonColumn}>
                <Text style={styles.comparisonHeader}>Free</Text>
                <FeatureRow
                  text={`${FREE_TIER_LIMITS.MAX_BOOKSHELVES} Bookshelves`}
                  included
                />
                <FeatureRow
                  text={`${FREE_TIER_LIMITS.MAX_BOOKS_PER_SHELF} Books/Shelf`}
                  included
                />
                <FeatureRow text="Community Access" included />
                <FeatureRow text="Home Screen Widget" included={false} />
              </View>

              {/* Premium tier */}
              <View style={[styles.comparisonColumn, styles.premiumColumn]}>
                <Text style={[styles.comparisonHeader, styles.premiumHeader]}>
                  Premium
                </Text>
                <FeatureRow text="Unlimited" included premium />
                <FeatureRow text="Unlimited" included premium />
                <FeatureRow text="Full Access" included premium />
                <FeatureRow text="Widget Access" included premium />
              </View>
            </View>
          </View>

          {/* RevenueCat Paywall Button */}
          <View style={styles.purchaseContainer}>
            <Button
              title="View Subscription Options"
              onPress={handlePresentPaywall}
              loading={isLoading}
              fullWidth
              size="lg"
            />

            {/* Manual Package Selection (fallback if paywall display isn't desired) */}
            {currentOffering?.availablePackages &&
              currentOffering.availablePackages.length > 0 && (
                <View style={styles.packagesContainer}>
                  <Text style={styles.packagesTitle}>Or choose a plan:</Text>
                  {currentOffering.availablePackages.map((pkg) => (
                    <Pressable
                      key={pkg.identifier}
                      style={styles.packageCard}
                      onPress={() => handlePurchasePackage(pkg)}
                      disabled={isLoading}
                    >
                      <View style={styles.packageInfo}>
                        <Text style={styles.packageName}>
                          {pkg.product.title}
                        </Text>
                        <Text style={styles.packageDescription}>
                          {pkg.product.description}
                        </Text>
                      </View>
                      <Text style={styles.packagePrice}>
                        {pkg.product.priceString}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

            {/* Restore Purchases */}
            <Pressable
              style={styles.restoreButton}
              onPress={handleRestorePurchases}
              disabled={isRestoringPurchases}
            >
              {isRestoringPurchases ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Text style={styles.restoreText}>Restore Purchases</Text>
              )}
            </Pressable>

            <Text style={styles.termsText}>
              Subscription will auto-renew. Cancel anytime in App Store settings.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

/**
 * Feature Row Component
 */
interface FeatureRowProps {
  text: string;
  included: boolean;
  premium?: boolean;
}

function FeatureRow({ text, included, premium }: FeatureRowProps) {
  return (
    <View style={styles.featureRow}>
      <Ionicons
        name={included ? 'checkmark-circle' : 'close-circle'}
        size={18}
        color={
          included
            ? premium
              ? Colors.starFilled
              : Colors.success
            : Colors.textLight
        }
      />
      <Text
        style={[
          styles.featureText,
          !included && styles.featureTextDisabled,
          premium && styles.featureTextPremium,
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xxl,
  },
  headerButton: {
    padding: Spacing.xs,
  },
  header: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    backgroundColor: Colors.primaryLight,
  },
  title: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.textInverse,
    marginTop: Spacing.md,
  },
  subtitle: {
    fontSize: Typography.sizes.md,
    color: Colors.textInverse,
    opacity: 0.8,
    marginTop: Spacing.xs,
  },
  comparisonContainer: {
    padding: Spacing.lg,
  },
  comparisonTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  comparisonTable: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  comparisonColumn: {
    flex: 1,
    backgroundColor: Colors.backgroundDark,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  premiumColumn: {
    backgroundColor: Colors.primaryLight,
  },
  comparisonHeader: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  premiumHeader: {
    color: Colors.textInverse,
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
  featureTextDisabled: {
    color: Colors.textLight,
  },
  featureTextPremium: {
    color: Colors.textInverse,
  },
  purchaseContainer: {
    padding: Spacing.lg,
  },
  packagesContainer: {
    marginTop: Spacing.lg,
  },
  packagesTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  packageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  packageInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  packageName: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
  },
  packageDescription: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  packagePrice: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    color: Colors.primary,
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginTop: Spacing.md,
  },
  restoreText: {
    fontSize: Typography.sizes.sm,
    color: Colors.primary,
    fontWeight: Typography.weights.medium,
  },
  termsText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.md,
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
