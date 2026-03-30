/**
 * RevenueCat Context
 *
 * Provides subscription state and purchase methods throughout the app.
 * Wraps the RevenueCat SDK and keeps the UI reactive to entitlement changes.
 *
 * Usage:
 * import { useRevenueCat } from '@/contexts/RevenueCatContext';
 *
 * function MyComponent() {
 *   const { isPro, customerInfo, purchasePackage } = useRevenueCat();
 * }
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import {
  CustomerInfo,
  PurchasesPackage,
  PurchasesOffering,
} from 'react-native-purchases';
import {
  revenueCatService,
  ENTITLEMENT_ID,
  FREE_TIER_LIMITS,
  PREMIUM_FEATURES,
} from '@/services/revenuecat';
import { useAuth } from '@/contexts/AuthContext';
import { widgetManager } from '@/utils/widget';

// ============================================
// Types
// ============================================

interface RevenueCatContextType {
  /** Whether the SDK has finished its initial load */
  isReady: boolean;
  /** Whether the user holds the "Virtual Library Pro" entitlement */
  isPro: boolean;
  /** Full customer info from RevenueCat (null until first fetch) */
  customerInfo: CustomerInfo | null;
  /** Current offering with available packages */
  currentOffering: PurchasesOffering | null;
  /** Purchase a package and return success status */
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  /** Restore previous purchases */
  restorePurchases: () => Promise<boolean>;
  /** Refresh customer info and offerings from the server */
  refresh: () => Promise<void>;
}

const RevenueCatContext = createContext<RevenueCatContextType | undefined>(
  undefined
);

// ============================================
// Provider
// ============================================

export function RevenueCatProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, refreshUser } = useAuth();

  const [isReady, setIsReady] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [currentOffering, setCurrentOffering] =
    useState<PurchasesOffering | null>(null);

  // Track previous isPro to avoid redundant syncs
  const prevIsProRef = useRef<boolean | null>(null);

  /**
   * Process a CustomerInfo object and update local state.
   * Syncs premium status to widget, Supabase, and refreshes the auth user
   * so all UI surfaces reflect the current subscription state.
   */
  const processCustomerInfo = useCallback((info: CustomerInfo) => {
    setCustomerInfo(info);
    const { isActive } = revenueCatService.extractProEntitlement(info);
    setIsPro(isActive);
    // Keep the widget in sync with premium status
    widgetManager.syncPremiumStatus(isActive);
    // Keep Supabase and auth context in sync
    if (prevIsProRef.current !== isActive) {
      prevIsProRef.current = isActive;
      revenueCatService.syncPremiumStatus(isActive).then(() => refreshUser());
    }
  }, [refreshUser]);

  /**
   * Initialize RevenueCat and fetch initial data.
   */
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const init = async () => {
      try {
        // Initialize SDK with the Supabase user ID if available
        await revenueCatService.initialize(user?.id);

        // If we have a user ID, log in so purchases are tied to this user
        if (user?.id) {
          try {
            const info = await revenueCatService.logIn(user.id);
            processCustomerInfo(info);
          } catch {
            // logIn can fail if already logged in with same ID — fall back to getCustomerInfo
            const info = await revenueCatService.getCustomerInfo();
            processCustomerInfo(info);
          }
        } else {
          const info = await revenueCatService.getCustomerInfo();
          processCustomerInfo(info);
        }

        // Fetch offerings
        const offering = await revenueCatService.getOfferings();
        setCurrentOffering(offering);

        // Listen for real-time updates (e.g. subscription renewal, expiry)
        unsubscribe = revenueCatService.onCustomerInfoUpdated((info) => {
          processCustomerInfo(info);
        });

        setIsReady(true);
      } catch (error) {
        console.error('RevenueCat initialization failed:', error);
        setIsReady(true); // Mark ready even on error so the app doesn't hang
      }
    };

    init();

    return () => {
      unsubscribe?.();
    };
  }, [user?.id, processCustomerInfo]);

  /**
   * Purchase a package.
   */
  const handlePurchase = useCallback(
    async (pkg: PurchasesPackage): Promise<boolean> => {
      try {
        const { customerInfo: info, cancelled } =
          await revenueCatService.purchasePackage(pkg);
        processCustomerInfo(info);
        return !cancelled;
      } catch (error) {
        console.error('Purchase failed:', error);
        throw error;
      }
    },
    [processCustomerInfo]
  );

  /**
   * Restore purchases.
   */
  const handleRestore = useCallback(async (): Promise<boolean> => {
    try {
      const info = await revenueCatService.restorePurchases();
      processCustomerInfo(info);
      const { isActive } = revenueCatService.extractProEntitlement(info);
      return isActive;
    } catch (error) {
      console.error('Restore failed:', error);
      throw error;
    }
  }, [processCustomerInfo]);

  /**
   * Refresh all data from RevenueCat.
   */
  const refresh = useCallback(async () => {
    try {
      const [info, offering] = await Promise.all([
        revenueCatService.getCustomerInfo(),
        revenueCatService.getOfferings(),
      ]);
      processCustomerInfo(info);
      setCurrentOffering(offering);
    } catch (error) {
      console.error('RevenueCat refresh failed:', error);
    }
  }, [processCustomerInfo]);

  const contextValue = useMemo<RevenueCatContextType>(
    () => ({
      isReady,
      isPro,
      customerInfo,
      currentOffering,
      purchasePackage: handlePurchase,
      restorePurchases: handleRestore,
      refresh,
    }),
    [
      isReady,
      isPro,
      customerInfo,
      currentOffering,
      handlePurchase,
      handleRestore,
      refresh,
    ]
  );

  return (
    <RevenueCatContext.Provider value={contextValue}>
      {children}
    </RevenueCatContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

export function useRevenueCat(): RevenueCatContextType {
  const context = useContext(RevenueCatContext);
  if (context === undefined) {
    throw new Error('useRevenueCat must be used within a RevenueCatProvider');
  }
  return context;
}

export default RevenueCatContext;
