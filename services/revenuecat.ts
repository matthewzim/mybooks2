/**
 * RevenueCat Service
 *
 * Handles in-app purchases and subscription management via RevenueCat SDK.
 * Replaces the previous Stripe-based payment flow with native IAP support.
 *
 * Features:
 * - SDK configuration and initialization
 * - Entitlement checking for "Virtual Library Pro"
 * - Customer info retrieval
 * - Purchase and restore functionality
 * - Product/offering management
 *
 * Usage:
 * import { revenueCatService, FREE_TIER_LIMITS } from '@/services/revenuecat';
 * await revenueCatService.initialize();
 */

import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PurchasesOffering,
  PurchasesPackage,
  CustomerInfo,
  PurchasesEntitlementInfo,
} from 'react-native-purchases';
import { supabase } from './supabase';

// ============================================
// Constants
// ============================================

/**
 * RevenueCat public SDK key.
 *
 * Read from the environment so production builds can ship a real store key
 * (`appl_...` for the App Store) without a code change. The checked-in
 * fallback is a RevenueCat *test store* key and will not process real
 * purchases — it exists only so development builds work out of the box.
 */
const REVENUECAT_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ||
  'test_JICfTmnFPOhNQTrUxXCLhXNIqTO';

/**
 * The entitlement identifier configured in RevenueCat dashboard.
 *
 * NOTE: this predates the app's rename to TinyShelves. RevenueCat entitlement
 * identifiers are internal (never shown to users) and cannot be renamed in the
 * dashboard, so this stays 'Virtual Library Pro' unless a new entitlement is
 * created in RevenueCat and this constant is updated to match.
 */
export const ENTITLEMENT_ID = 'Virtual Library Pro';

/** Product identifiers matching RevenueCat dashboard */
export const PRODUCT_IDS = {
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
} as const;

/**
 * Free tier limits enforced when the user does not have an active entitlement.
 */
export const FREE_TIER_LIMITS = {
  MAX_BOOKSHELVES: 3,
  MAX_BOOKS_PER_SHELF: 50,
  CAN_ACCESS_COMMUNITY: true,
  CAN_USE_WIDGET: false,
};

/**
 * Premium features unlocked by the "Virtual Library Pro" entitlement.
 */
export const PREMIUM_FEATURES = [
  'Unlimited bookshelves',
  'Home Screen Widget',
  'Priority book scanning',
  'No ads',
];

// ============================================
// RevenueCat Service
// ============================================

class RevenueCatService {
  private isInitialized = false;

  /**
   * Initialize the RevenueCat SDK.
   * Must be called once at app startup before any other SDK methods.
   *
   * @param appUserID - Optional Supabase user ID to identify the customer.
   *                    If omitted, RevenueCat generates an anonymous ID.
   */
  async initialize(appUserID?: string): Promise<void> {
    if (this.isInitialized) return;

    // react-native-purchases only supports native platforms.
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      console.warn('RevenueCat is not supported on this platform; skipping initialization.');
      return;
    }

    if (!REVENUECAT_API_KEY.startsWith('appl_') && !__DEV__) {
      console.warn(
        'RevenueCat is using a test store API key. Set EXPO_PUBLIC_REVENUECAT_IOS_API_KEY to your production key before release.'
      );
    }

    try {
      if (__DEV__) {
        Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      }

      Purchases.configure({
        apiKey: REVENUECAT_API_KEY,
        appUserID: appUserID ?? undefined,
      });

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize RevenueCat:', error);
      throw error;
    }
  }

  /**
   * Log in a known user (e.g. after Supabase auth resolves).
   * This merges any anonymous purchase history into the identified user.
   */
  async logIn(appUserID: string): Promise<CustomerInfo> {
    const { customerInfo } = await Purchases.logIn(appUserID);
    return customerInfo;
  }

  /**
   * Log out the current user and reset to an anonymous ID.
   */
  async logOut(): Promise<void> {
    await Purchases.logOut();
  }

  // ------------------------------------------
  // Customer Info & Entitlements
  // ------------------------------------------

  /**
   * Fetch the latest customer info from RevenueCat.
   */
  async getCustomerInfo(): Promise<CustomerInfo> {
    return Purchases.getCustomerInfo();
  }

  /**
   * Check whether the user has the "Virtual Library Pro" entitlement.
   */
  async checkProEntitlement(): Promise<{
    isActive: boolean;
    entitlement: PurchasesEntitlementInfo | null;
  }> {
    const customerInfo = await this.getCustomerInfo();
    return this.extractProEntitlement(customerInfo);
  }

  /**
   * Extract the pro entitlement from a CustomerInfo object (no network call).
   */
  extractProEntitlement(customerInfo: CustomerInfo): {
    isActive: boolean;
    entitlement: PurchasesEntitlementInfo | null;
  } {
    const entitlement =
      customerInfo.entitlements.active[ENTITLEMENT_ID] ?? null;
    return {
      isActive: !!entitlement,
      entitlement,
    };
  }

  // ------------------------------------------
  // Offerings & Packages
  // ------------------------------------------

  /**
   * Fetch current offerings from RevenueCat.
   * Offerings contain the packages (products) configured in your dashboard.
   */
  async getOfferings(): Promise<PurchasesOffering | null> {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  }

  /**
   * Convenience: get the monthly and yearly packages from the current offering.
   */
  async getPackages(): Promise<{
    monthly: PurchasesPackage | null;
    yearly: PurchasesPackage | null;
    all: PurchasesPackage[];
  }> {
    const offering = await this.getOfferings();

    if (!offering) {
      return { monthly: null, yearly: null, all: [] };
    }

    return {
      monthly: offering.monthly,
      yearly: offering.annual,
      all: offering.availablePackages,
    };
  }

  // ------------------------------------------
  // Purchases
  // ------------------------------------------

  /**
   * Purchase a specific package.
   *
   * @returns Updated CustomerInfo after purchase, or null if the user cancelled.
   */
  async purchasePackage(
    pkg: PurchasesPackage
  ): Promise<{ customerInfo: CustomerInfo; cancelled: boolean }> {
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      // Sync premium status to Supabase after successful purchase
      const { isActive } = this.extractProEntitlement(customerInfo);
      await this.syncPremiumStatus(isActive);
      return { customerInfo, cancelled: false };
    } catch (error: any) {
      if (error.userCancelled) {
        return {
          customerInfo: await this.getCustomerInfo(),
          cancelled: true,
        };
      }
      throw error;
    }
  }

  /**
   * Restore previous purchases (e.g. after reinstall or device switch).
   */
  async restorePurchases(): Promise<CustomerInfo> {
    const customerInfo = await Purchases.restorePurchases();
    const { isActive } = this.extractProEntitlement(customerInfo);
    await this.syncPremiumStatus(isActive);
    return customerInfo;
  }

  // ------------------------------------------
  // Supabase Sync
  // ------------------------------------------

  /**
   * Keep the Supabase `users.is_premium` flag in sync with RevenueCat state.
   */
  async syncPremiumStatus(isPremium: boolean): Promise<void> {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) return;

      await (supabase
        .from('users') as any)
        .update({
          is_premium: isPremium,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.session.user.id);
    } catch (error) {
      console.error('Failed to sync premium status to Supabase:', error);
    }
  }

  // ------------------------------------------
  // Listener
  // ------------------------------------------

  /**
   * Register a listener for real-time customer info updates.
   * Useful for detecting subscription changes while the app is running.
   *
   * @returns An unsubscribe function.
   */
  onCustomerInfoUpdated(
    listener: (info: CustomerInfo) => void
  ): () => void {
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }
}

// Export singleton
export const revenueCatService = new RevenueCatService();
export default revenueCatService;
