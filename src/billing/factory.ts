/**
 * Adapter factory — instantiates payment provider adapters from configuration.
 *
 * Single Responsibility: adapter creation logic only.
 * Does NOT handle config loading, caching, or singleton lifecycle.
 */
import type { PaymentProviderAdapter } from './types.js'
import type { ProviderConfig } from './gateway-router.js'
import { StubPaymentAdapter } from './adapters/stub.js'
import { StripePaymentAdapter } from './adapters/stripe.js'
import { PaddlePaymentAdapter } from './adapters/paddle.js'
import { PaystackPaymentAdapter } from './adapters/paystack.js'
import { FlutterwavePaymentAdapter } from './adapters/flutterwave.js'

/**
 * Create a payment adapter instance from a DB-loaded provider config row.
 * Used by the gateway router to instantiate adapters dynamically.
 */
export function createAdapterFromConfig(config: ProviderConfig): PaymentProviderAdapter {
  switch (config.provider) {
    case 'paddle':
      return new PaddlePaymentAdapter({
        apiKey: config.secret_key ?? '',
        webhookSecret: config.webhook_secret ?? '',
        environment: (config.extra_config?.environment as 'sandbox' | 'production') ?? 'sandbox',
        sellerId: config.extra_config?.seller_id as string | undefined,
        priceMap: (config.extra_config?.price_map as Record<string, string>) ?? {},
      })

    case 'paystack':
      return new PaystackPaymentAdapter({
        secretKey: config.secret_key ?? '',
        webhookSecret: config.webhook_secret ?? '',
        planMap: (config.extra_config?.plan_map as Record<string, string>) ?? {},
      })

    case 'flutterwave':
      return new FlutterwavePaymentAdapter({
        secretKey: config.secret_key ?? '',
        webhookHash: config.webhook_secret ?? '',
        planMap: (config.extra_config?.plan_map as Record<string, string>) ?? {},
      })

    case 'stripe':
      return new StripePaymentAdapter({
        secretKey: config.secret_key ?? '',
        webhookSecret: config.webhook_secret ?? '',
        priceMap: (config.extra_config?.price_map as Record<string, string>) ?? {},
      })

    default:
      return new StubPaymentAdapter()
  }
}

/**
 * Create a payment adapter from environment variables (legacy single-provider mode).
 *
 * Set PAYMENT_PROVIDER in .env to one of: stub, stripe, paddle, paystack, flutterwave
 * Default: 'stub' (no real payments, useful for dev)
 */
export function createAdapterFromEnv(): PaymentProviderAdapter {
  const provider = process.env.PAYMENT_PROVIDER ?? 'stub'

  switch (provider) {
    case 'stripe':
      return new StripePaymentAdapter({
        secretKey: process.env.STRIPE_SECRET_KEY ?? '',
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
        priceMap: JSON.parse(process.env.STRIPE_PRICE_MAP ?? '{}'),
      })

    case 'paddle':
      return new PaddlePaymentAdapter({
        apiKey: process.env.PADDLE_API_KEY ?? '',
        webhookSecret: process.env.PADDLE_WEBHOOK_SECRET ?? '',
        environment: (process.env.PADDLE_ENVIRONMENT as 'sandbox' | 'production') ?? 'sandbox',
        sellerId: process.env.PADDLE_SELLER_ID,
        priceMap: JSON.parse(process.env.PADDLE_PRICE_MAP ?? '{}'),
      })

    case 'paystack':
      return new PaystackPaymentAdapter({
        secretKey: process.env.PAYSTACK_SECRET_KEY ?? '',
        webhookSecret: process.env.PAYSTACK_SECRET_KEY ?? '', // Paystack uses secret key for HMAC
        planMap: JSON.parse(process.env.PAYSTACK_PLAN_MAP ?? '{}'),
      })

    case 'flutterwave':
      return new FlutterwavePaymentAdapter({
        secretKey: process.env.FLUTTERWAVE_SECRET_KEY ?? '',
        webhookHash: process.env.FLUTTERWAVE_WEBHOOK_HASH ?? '',
        planMap: JSON.parse(process.env.FLUTTERWAVE_PLAN_MAP ?? '{}'),
      })

    case 'stub':
    default:
      return new StubPaymentAdapter()
  }
}
