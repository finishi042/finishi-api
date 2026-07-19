import type { PaymentProviderAdapter } from './types.js'
import type { ProviderConfig } from './gateway-router.js'
import { StubPaymentAdapter } from './adapters/stub.js'
import { StripePaymentAdapter } from './adapters/stripe.js'
import { PaddlePaymentAdapter } from './adapters/paddle.js'
import { PaystackPaymentAdapter } from './adapters/paystack.js'
import { FlutterwavePaymentAdapter } from './adapters/flutterwave.js'
import { PaymentGatewayRouter } from './gateway-router.js'
import { SubscriptionService } from './service.js'
import { getSupabase } from '../shared/supabase.js'
import { decryptSecret, isEncrypted } from './encryption.js'

/**
 * Safely decrypt a secret field. If not encrypted (legacy plaintext), return as-is.
 */
function safeDecrypt(value: string | null): string | null {
  if (!value) return null
  try {
    return isEncrypted(value) ? decryptSecret(value) : value
  } catch {
    // If decryption fails, return null rather than crash
    console.warn('Failed to decrypt payment secret — returning null')
    return null
  }
}

/**
 * Factory that returns a payment adapter by name, configured from the given config row.
 * Used internally by the gateway router to instantiate adapters dynamically.
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
 * Load provider configurations from the payment_provider_config table.
 * Returns all enabled providers.
 */
export async function loadProviderConfigs(): Promise<ProviderConfig[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('payment_provider_config')
    .select('*')
    .eq('is_enabled', true)

  if (error) {
    throw new Error(`Failed to load payment provider configs: ${error.message}`)
  }

  // Decrypt secrets for runtime use
  return (data ?? []).map((config: any) => ({
    ...config,
    secret_key: safeDecrypt(config.secret_key),
    webhook_secret: safeDecrypt(config.webhook_secret),
  })) as ProviderConfig[]
}

/**
 * Load ALL provider configurations (including disabled), for admin management.
 */
export async function loadAllProviderConfigs(): Promise<ProviderConfig[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('payment_provider_config')
    .select('*')
    .order('provider', { ascending: true })

  if (error) {
    throw new Error(`Failed to load payment provider configs: ${error.message}`)
  }

  return (data ?? []) as ProviderConfig[]
}

// ── Gateway Router (singleton, refreshable) ────────────────────────────────

let gatewayRouterInstance: PaymentGatewayRouter | null = null
let gatewayConfigLastLoaded = 0
const CONFIG_TTL_MS = 60_000 // Refresh config from DB every 60 seconds

/**
 * Returns the Payment Gateway Router instance.
 * Configs are loaded from the DB and cached for CONFIG_TTL_MS.
 * Call refreshGatewayRouter() to force a reload (e.g., after admin updates config).
 */
export async function getGatewayRouter(): Promise<PaymentGatewayRouter> {
  const now = Date.now()

  if (!gatewayRouterInstance || now - gatewayConfigLastLoaded > CONFIG_TTL_MS) {
    await refreshGatewayRouter()
  }

  return gatewayRouterInstance!
}

/**
 * Force-reload the gateway router with fresh config from the database.
 * Call this after admin updates provider settings.
 */
export async function refreshGatewayRouter(): Promise<void> {
  const configs = await loadProviderConfigs()
  const supabase = getSupabase()

  // Build adapter map from enabled configs
  const adapters = new Map<string, PaymentProviderAdapter>()
  for (const config of configs) {
    adapters.set(config.provider, createAdapterFromConfig(config))
  }

  gatewayRouterInstance = new PaymentGatewayRouter(adapters, supabase, configs)
  gatewayConfigLastLoaded = Date.now()
}

// ── Legacy: single-provider mode (env-based, for backward compat) ──────────

/**
 * Factory that returns the configured payment adapter based on env vars.
 * This is the legacy approach — use getGatewayRouter() for multi-provider routing.
 *
 * Set PAYMENT_PROVIDER in .env to one of: stub, stripe, paddle, paystack, flutterwave
 * Default: 'stub' (no real payments, useful for dev)
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
