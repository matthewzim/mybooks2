/**
 * Payment Screen
 *
 * Premium subscription purchase screen.
 * Features:
 * - Plan selection
 * - Feature comparison
 * - Stripe payment integration
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Pressable,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { stripeService, SUBSCRIPTION_PLANS, FREE_TIER_LIMITS } from '@/services/stripe';
import { Button } from '@/components/ui';
import {
  Colors,
  Spacing,
  BorderRadius,
  Typography,
  Shadows,
} from '@/constants/theme';
import type { SubscriptionPlan } from '@/types';

export default function PaymentScreen() {
  const { user, refreshUser } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>(
    SUBSCRIPTION_PLANS[0]
  );
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Handle plan purchase
   */
  const handlePurchase = async () => {
    setIsLoading(true);

    try {
      const result = await stripeService.purchasePlan(selectedPlan);

      if (result.error) {
        if (result.error.code === 'canceled') {
          // User canceled - do nothing
          return;
        }
        Alert.alert('Payment Failed', result.error.message);
      } else {
        // Payment successful
        await refreshUser();
        Alert.alert(
          'Welcome to Premium!',
          'Thank you for your purchase. You now have access to all premium features.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
    } catch (error) {
      Alert.alert(
        'Payment Error',
        'Unable to process payment. Please check your payment setup or try again later.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Format price for display
   */
  const formatPrice = (cents: number): string => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  // If user is already premium, show status
  if (user?.is_premium) {
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
              {SUBSCRIPTION_PLANS[0].features.map((feature, index) => (
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
              onPress={() => {
                Alert.alert(
                  'Manage Subscription',
                  'To manage your subscription, please visit your App Store account settings.'
                );
              }}
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

          {/* Plan Cards */}
          <View style={styles.plansContainer}>
            {SUBSCRIPTION_PLANS.map((plan) => (
              <Pressable
                key={plan.id}
                style={[
                  styles.planCard,
                  selectedPlan.id === plan.id && styles.planCardSelected,
                ]}
                onPress={() => setSelectedPlan(plan)}
              >
                {plan.interval === 'year' && (
                  <View style={styles.saveBadge}>
                    <Text style={styles.saveBadgeText}>Best Value</Text>
                  </View>
                )}

                <View style={styles.planHeader}>
                  <View style={styles.radioOuter}>
                    {selectedPlan.id === plan.id && (
                      <View style={styles.radioInner} />
                    )}
                  </View>
                  <View style={styles.planInfo}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planPrice}>
                      {formatPrice(plan.price)}/{plan.interval}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ))}
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

          {/* Purchase Button */}
          <View style={styles.purchaseContainer}>
            <Button
              title={`Subscribe for ${formatPrice(selectedPlan.price)}/${selectedPlan.interval}`}
              onPress={handlePurchase}
              loading={isLoading}
              fullWidth
              size="lg"
            />
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
  plansContainer: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  planCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  planCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}10`,
  },
  saveBadge: {
    position: 'absolute',
    top: -10,
    right: Spacing.md,
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  saveBadgeText: {
    color: Colors.textInverse,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    color: Colors.text,
  },
  planPrice: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
    marginTop: 2,
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
