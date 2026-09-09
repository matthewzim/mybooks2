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
  const currentUserIdRef = useRef(user?.id);
  currentUserIdRef.current = user?.id;
  const prevIsProRef = useRef<boolean | null>(null);

  /**
   * Process a CustomerInfo object and update local state.
   * Syncs premium status to widget, Supabase, and refreshes the auth user
   * so all UI surfaces reflect the current subscription state.
   */
  const processCustomerInfo = useCallback((info: CustomerInfo) => {
    if (!user?.id || currentUserIdRef.current !== user.id) return;
    setCustomerInfo(info);
    const { isActive } = revenueCatService.extractProEntitlement(info);
    setIsPro(isActive);
    // Keep the widget in sync with premium status
    widgetManager.syncPremiumStatus(isActive);
    // Keep Supabase and auth context in sync
    if (prevIsProRef.current !== isActive) {
      prevIsProRef.current = isActive;
      revenueCatService.syncPremiumStatus().then(() => refreshUser()).catch(() => {
        prevIsProRef.current = null;
        console.warn('Premium sync pending; it will retry on refresh');
      });
    }
  }, [refreshUser, user?.id]);

  /**
   * Initialize RevenueCat and fetch initial data.
   */
  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    setIsReady(false);
    setIsPro(false);
    setCustomerInfo(null);
    setCurrentOffering(null);
    prevIsProRef.current = null;
    void widgetManager.syncPremiumStatus(false);
    if (!user?.id) return;
    const id = user.id;
    const init = async () => {
      try {
        await revenueCatService.initialize(id);
        const info = await revenueCatService.logIn(id);
        if (disposed) return;
        processCustomerInfo(info);
        unsubscribe = revenueCatService.onCustomerInfoUpdated(processCustomerInfo);
        const offering = await revenueCatService.getOfferings();
        if (!disposed) {
          setCurrentOffering(offering);
          setIsReady(true);
        }
      } catch (error) {
        // Do not use customer info from a previous identity after login fails.
        console.error('RevenueCat initialization failed:', error);
      }
    };
    void init();
    return () => { disposed = true; unsubscribe?.(); };
  }, [user?.id, processCustomerInfo]);

  /**
   * Purchase a package.
   */
  const handlePurchase = useCallback(
    async (pkg: PurchasesPackage): Promise<boolean> => {
      try {
        if (!isReady || !user?.id) throw new Error('Purchases are not ready. Please retry.');
        const { customerInfo: info, cancelled } =
          await revenueCatService.purchasePackage(pkg);
        processCustomerInfo(info);
        return !cancelled && revenueCatService.extractProEntitlement(info).isActive;
      } catch (error) {
        console.error('Purchase failed:', error);
        throw error;
      }
    },
    [processCustomerInfo, isReady, user?.id]
  );

  /**
   * Restore purchases.
   */
  const handleRestore = useCallback(async (): Promise<boolean> => {
    try {
      if (!isReady || !user?.id) throw new Error('Purchases are not ready. Please retry.');
      const info = await revenueCatService.restorePurchases();
      processCustomerInfo(info);
      const { isActive } = revenueCatService.extractProEntitlement(info);
      return isActive;
    } catch (error) {
      console.error('Restore failed:', error);
      throw error;
    }
  }, [processCustomerInfo, isReady, user?.id]);

  /**
   * Refresh all data from RevenueCat.
   */
  const refresh = useCallback(async () => {
    if (!isReady || !user?.id) return;
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
  }, [processCustomerInfo, isReady, user?.id]);

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
