/**
 * Subscription billing types.
 * Provider-agnostic — any payment provider implements the PaymentProviderAdapter interface.
 */

// ── Plans ─────────────────────────────────────────────────────────────────

export type Plan = 'free' | 'pro' | 'enterprise'

export const PLAN_HIERARCHY: Record<Plan, number> = {
  free: 0,
  pro: 1,
  enterprise: 2,
}

export interface PlanConfig {
  id: Plan
  name: string
  price_monthly: number // in smallest currency unit (cents, kobo, etc.)
  price_yearly: number
  currency: string
  features: string[]
}

export const PLANS: Record<Plan, PlanConfig> = {
  free: {
    id: 'free',
    name: 'Free',
    price_monthly: 0,
    price_yearly: 0,
    currency: 'usd',
    features: [
      '5 lessons per month',
      'Basic focus timer',
      'Community events access',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price_monthly: 999, // $9.99
    price_yearly: 9990, // $99.90
    currency: 'usd',
    features: [
      'Unlimited lessons',
      'Advanced focus sessions with stats',
      'Priority event registration',
      'Quiz attempts history',
      'AI learning insights',
    ],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price_monthly: 4999, // $49.99
    price_yearly: 49990,
    currency: 'usd',
    features: [
      'Everything in Pro',
      'Team management',
      'Custom learning paths',
      'Dedicated support',
      'API access',
    ],
  },
}

// ── Subscription ──────────────────────────────────────────────────────────

export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'expired' | 'trialing'

export interface Subscription {
  id: string
  user_id: string
  plan: Plan
  status: SubscriptionStatus
  provider: string | null
  provider_customer_id: string | null
  provider_subscription_id: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  cancelled_at: string | null
  trial_start: string | null
  trial_end: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ── Adapter Interface ─────────────────────────────────────────────────────

export type BillingInterval = 'monthly' | 'yearly'

export interface CreateCheckoutParams {
  user_id: string
  email: string
  plan: Plan
  interval: BillingInterval
  success_url: string
  cancel_url: string
  metadata?: Record<string, string>
}

export interface CheckoutResult {
  /** URL to redirect the user to for payment */
  checkout_url: string
  /** Provider's session/reference ID */
  provider_session_id: string
}

export interface CancelSubscriptionParams {
  provider_subscription_id: string
  cancel_at_period_end?: boolean // true = cancel at end of billing period
}

export interface WebhookEvent {
  /** The raw event type from the provider (e.g., 'invoice.paid', 'charge.success') */
  type: string
  /** Normalized event action */
  action: 'subscription.created' | 'subscription.updated' | 'subscription.cancelled' | 'payment.succeeded' | 'payment.failed' | 'unknown'
  /** Provider's customer ID */
  customer_id: string | null
  /** Provider's subscription ID */
  subscription_id: string | null
  /** Plan the event relates to */
  plan: Plan | null
  /** New status to apply */
  status: SubscriptionStatus | null
  /** Period end date */
  current_period_end: string | null
  /** Raw provider payload */
  raw: unknown
}

/**
 * Payment provider adapter interface.
 * Implement this for Stripe, Paystack, Flutterwave, etc.
 */
export interface PaymentProviderAdapter {
  /** Unique provider name (e.g., 'stripe', 'paystack') */
  readonly name: string

  /** Create a checkout session and return the payment URL */
  createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult>

  /** Cancel a subscription */
  cancelSubscription(params: CancelSubscriptionParams): Promise<void>

  /** Parse and verify an incoming webhook, returning a normalized event */
  parseWebhook(headers: Record<string, string>, body: string | Buffer): Promise<WebhookEvent>
}
