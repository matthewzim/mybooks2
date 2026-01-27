/**
 * Stripe Payment Service
 *
 * Handles payment operations for premium features:
 * - Create payment intents
 * - Process subscriptions
 * - Manage customer data
 *
 * Setup Requirements:
 * 1. Create a Stripe account at https://stripe.com
 * 2. Add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to your .env
 * 3. Set up a backend endpoint to create payment intents (for security)
 *
 * Note: For production, payment intent creation should happen on your backend
 * to keep your secret key secure. This service demonstrates the client-side flow.
 *
 * Usage:
 * import { stripeService } from '@/services/stripe';
 * await stripeService.initializePaymentSheet(amount);
 */

import { Alert } from 'react-native';
import {
  initPaymentSheet,
  presentPaymentSheet,
  confirmPaymentSheetPayment,
  StripeProvider,
} from '@stripe/stripe-react-native';
import { supabase, handleSupabaseError } from './supabase';
import type {
  ApiResponse,
  PaymentIntent,
  SubscriptionPlan,
  UserSubscription,
} from '@/types';

// Stripe publishable key from environment
const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

/**
 * Premium subscription plans
 * In production, these would come from your backend/Stripe
 */
export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'plan_monthly',
    name: 'Premium Monthly',
    price: 499, // $4.99 in cents
    currency: 'usd',
    interval: 'month',
    features: [
      'Unlimited bookshelves',
      'Community access',
      'Priority book scanning',
      'No ads',
    ],
  },
  {
    id: 'plan_yearly',
    name: 'Premium Yearly',
    price: 3999, // $39.99 in cents (save ~33%)
    currency: 'usd',
    interval: 'year',
    features: [
      'Unlimited bookshelves',
      'Community access',
      'Priority book scanning',
      'No ads',
      '2 months free',
    ],
  },
];

/**
 * Free tier limits
 */
export const FREE_TIER_LIMITS = {
  MAX_BOOKSHELVES: 3,
  MAX_BOOKS_PER_SHELF: 20,
  CAN_ACCESS_COMMUNITY: false,
};

/**
 * Stripe Payment Service Class
 */
class StripeService {
  /**
   * Your backend API URL for creating payment intents
   * In production, replace with your actual backend URL
   */
  private apiUrl = 'https://your-backend.com/api';

  /**
   * Initialize the Stripe Payment Sheet
   * This prepares the payment UI before showing it to the user
   *
   * @param amount - Amount in cents (e.g., 499 for $4.99)
   * @param currency - Currency code (default 'usd')
   * @returns Success status or error
   */
  async initializePaymentSheet(
    amount: number,
    currency: string = 'usd'
  ): Promise<ApiResponse<{ clientSecret: string }>> {
    try {
      // Get current user for customer association
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) {
        throw new Error('Not authenticated');
      }

      // IMPORTANT: In production, this should call your backend API
      // to create the payment intent securely
      const paymentIntentData = await this.createPaymentIntentOnBackend(
        amount,
        currency,
        session.session.user.id
      );

      if (!paymentIntentData.clientSecret) {
        throw new Error('Failed to get payment intent');
      }

      // Initialize the payment sheet
      const { error } = await initPaymentSheet({
        paymentIntentClientSecret: paymentIntentData.clientSecret,
        merchantDisplayName: 'Virtual Library',
        // Enable Apple Pay
        applePay: {
          merchantCountryCode: 'US',
        },
        // Customize appearance
        appearance: {
          colors: {
            primary: '#1a1a2e',
            background: '#ffffff',
            componentBackground: '#f5f5f5',
            componentText: '#000000',
          },
          shapes: {
            borderRadius: 8,
          },
        },
        // Return URL for 3D Secure and other redirects
        returnURL: 'virtuallibrary://payment-complete',
      });

      if (error) {
        throw new Error(error.message);
      }

      return { data: { clientSecret: paymentIntentData.clientSecret }, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Present the payment sheet to the user
   * Call this after initializePaymentSheet succeeds
   *
   * @returns Success status or error
   */
  async presentPaymentSheet(): Promise<ApiResponse<null>> {
    try {
      const { error } = await presentPaymentSheet();

      if (error) {
        if (error.code === 'Canceled') {
          // User canceled the payment
          return {
            data: null,
            error: { message: 'Payment canceled', code: 'canceled' },
          };
        }
        throw new Error(error.message);
      }

      return { data: null, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Complete payment flow: initialize and present sheet
   *
   * @param plan - Subscription plan to purchase
   * @returns Success status
   */
  async purchasePlan(plan: SubscriptionPlan): Promise<ApiResponse<null>> {
    try {
      // Initialize payment sheet
      const initResult = await this.initializePaymentSheet(
        plan.price,
        plan.currency
      );

      if (initResult.error) {
        throw new Error(initResult.error.message);
      }

      // Present payment sheet
      const paymentResult = await this.presentPaymentSheet();

      if (paymentResult.error) {
        if (paymentResult.error.code === 'canceled') {
          return paymentResult; // Return canceled status
        }
        throw new Error(paymentResult.error.message);
      }

      // Payment successful - update user's premium status
      await this.updateUserPremiumStatus(true, plan.id);

      return { data: null, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Create a payment intent on your backend
   *
   * IMPORTANT: This is a placeholder. In production, you MUST:
   * 1. Create an API endpoint on your backend
   * 2. Use your Stripe secret key on the backend (never expose it client-side)
   * 3. Create the payment intent on the backend
   * 4. Return only the client secret to the app
   *
   * @param amount - Amount in cents
   * @param currency - Currency code
   * @param userId - User ID for customer association
   */
  private async createPaymentIntentOnBackend(
    amount: number,
    currency: string,
    userId: string
  ): Promise<{ clientSecret: string }> {
    // PLACEHOLDER: Replace with your actual backend call
    //
    // Example implementation for your backend (Node.js/Express):
    //
    // app.post('/api/create-payment-intent', async (req, res) => {
    //   const { amount, currency, userId } = req.body;
    //
    //   // Get or create Stripe customer
    //   let customer = await getStripeCustomer(userId);
    //   if (!customer) {
    //     customer = await stripe.customers.create({
    //       metadata: { supabaseUserId: userId }
    //     });
    //   }
    //
    //   const paymentIntent = await stripe.paymentIntents.create({
    //     amount,
    //     currency,
    //     customer: customer.id,
    //     automatic_payment_methods: { enabled: true },
    //   });
    //
    //   res.json({ clientSecret: paymentIntent.client_secret });
    // });

    // For demo purposes, throw an error indicating backend setup is needed
    console.warn(
      'Payment backend not configured. Please set up your backend API to create payment intents.'
    );

    // In development, you might want to use Stripe's test mode
    // This is just a placeholder - remove in production
    throw new Error(
      'Payment backend not configured. See services/stripe.ts for setup instructions.'
    );

    // Uncomment and modify for actual implementation:
    // const response = await fetch(`${this.apiUrl}/create-payment-intent`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({ amount, currency, userId }),
    // });
    //
    // if (!response.ok) {
    //   throw new Error('Failed to create payment intent');
    // }
    //
    // return response.json();
  }

  /**
   * Update user's premium status after successful payment
   *
   * @param isPremium - Whether user is now premium
   * @param planId - Subscription plan ID
   */
  private async updateUserPremiumStatus(
    isPremium: boolean,
    planId: string
  ): Promise<void> {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.user) return;

    // Update user's premium status
    await supabase
      .from('users')
      .update({
        is_premium: isPremium,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.session.user.id);

    // Create or update subscription record
    await supabase.from('subscriptions').upsert({
      user_id: session.session.user.id,
      plan_id: planId,
      status: 'active',
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Check if user has an active subscription
   */
  async checkSubscriptionStatus(): Promise<ApiResponse<UserSubscription | null>> {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) {
        return { data: null, error: null };
      }

      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', session.session.user.id)
        .eq('status', 'active')
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows returned
        throw error;
      }

      return { data: data as UserSubscription | null, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Cancel subscription
   * In production, this should also cancel the Stripe subscription
   */
  async cancelSubscription(): Promise<ApiResponse<null>> {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) {
        throw new Error('Not authenticated');
      }

      // Update subscription status
      await supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', session.session.user.id);

      // Update user premium status
      await supabase
        .from('users')
        .update({
          is_premium: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.session.user.id);

      // TODO: Cancel Stripe subscription via backend API

      return { data: null, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: handleSupabaseError(error) },
      };
    }
  }

  /**
   * Get Stripe publishable key for StripeProvider
   */
  getPublishableKey(): string {
    return STRIPE_PUBLISHABLE_KEY;
  }
}

// Export a singleton instance
export const stripeService = new StripeService();

export default stripeService;
