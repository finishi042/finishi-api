import type { PaymentProviderAdapter } from './types.js'
import { StubPaymentAdapter } from './adapters/stub.js'
import { StripePaymentAdapter } from './adapters/stripe.js'
import { SubscriptionService } from './service.js'
import { getSupabase } from '../shared/supabase.js'

/**
 * Factory that returns the configured payment adapter based on env vars.
 *
 * Set PAYMENT_PROVIDER in .env to one of: stub, stripe, paystack, flutterwave
 * Default: 'stub' (no real payments, useful for dev)
 *
 * To add a new provider:
 *   1. Create src/billing/adapters/<name>.ts implementing PaymentProviderAdapter
 *   2. Add a case here
 *   3. Set PAYMENT_PROVIDER=<name> in .env
 */
export function getPaymentAdapter(): PaymentProviderAdapter {
  const provider = process.env.PAYMENT_PROVIDER ?? 'stub'

  switch (provider) {
    case 'stripe':
      return new StripePaymentAdapter({
        secretKey: process.env.STRIPE_SECRET_KEY ?? '',
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
        priceMap: JSON.parse(process.env.STRIPE_PRICE_MAP ?? '{}'),
      })

    case 'stub':
    default:
      return new StubPaymentAdapter()
  }
}

// ── Singleton SubscriptionService ─────────────────────────────────────────

let subscriptionServiceInstance: SubscriptionService | null = null

/**
 * Returns a shared SubscriptionService instance.
 * Avoids re-creating the service + adapter on every request (require-plan, routes, webhooks).
 * The instance is lazily created on first call (after Supabase has been initialised).
 */
export function getSubscriptionService(): SubscriptionService {
  if (!subscriptionServiceInstance) {
    subscriptionServiceInstance = new SubscriptionService(getPaymentAdapter(), getSupabase())
  }
  return subscriptionServiceInstance
}
