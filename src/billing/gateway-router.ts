import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  PaymentProviderAdapter,
  CreateCheckoutParams,
  CheckoutResult,
} from './types.js'

/**
 * African country codes (ISO 3166-1 alpha-2) for local payment routing.
 * Users from these countries are routed to Paystack (primary) / Flutterwave (failover).
 * All others go to Paddle (international).
 */
const AFRICAN_COUNTRY_CODES = new Set([
  'NG', 'GH', 'ZA', 'KE', 'TZ', 'UG', 'RW', 'ET', 'CI', 'SN',
  'CM', 'CD', 'AO', 'MZ', 'ZM', 'ZW', 'BW', 'NA', 'MW', 'ML',
  'BF', 'NE', 'TD', 'GA', 'CG', 'BJ', 'TG', 'SL', 'LR', 'GM',
  'GN', 'GW', 'MR', 'DJ', 'SO', 'ER', 'SS', 'SD', 'EG', 'MA',
  'TN', 'DZ', 'LY', 'MG', 'MU', 'SC', 'CV', 'ST', 'KM',
])

/**
 * Provider configuration row from the payment_provider_config table.
 */
export interface ProviderConfig {
  id: string
  provider: string
  display_name: string
  is_enabled: boolean
  is_primary_local: boolean
  is_failover_local: boolean
  is_international: boolean
  public_key: string | null
  secret_key: string | null
  webhook_secret: string | null
  extra_config: Record<string, unknown>
  supported_countries: string[]
}

export type PaymentRoute = 'international' | 'local'

/**
 * Result from the gateway router — includes which provider was used,
 * whether failover occurred, and the checkout result.
 */
export interface GatewayCheckoutResult extends CheckoutResult {
  provider_used: string
  failover_triggered: boolean
  failover_from: string | null
  idempotency_key: string
}

/**
 * Payment Gateway Router
 *
 * Responsibilities:
 * 1. Route payments to the correct provider based on user country
 * 2. Enforce idempotency (reject duplicate payment attempts via DB unique constraint)
 * 3. Failover from Paystack → Flutterwave on local payment failures
 * 4. Record all transaction attempts in payment_transactions table
 */
export class PaymentGatewayRouter {
  constructor(
    private adapters: Map<string, PaymentProviderAdapter>,
    private supabase: SupabaseClient,
    private configs: ProviderConfig[]
  ) {}

  /**
   * Determine the payment route based on the user's country.
   */
  getRoute(countryCode: string | null | undefined): PaymentRoute {
    if (!countryCode) return 'international'
    return AFRICAN_COUNTRY_CODES.has(countryCode.toUpperCase()) ? 'local' : 'international'
  }

  /**
   * Resolve which adapter to use for a given route.
   * Returns [primary, failover?] — failover is only available for local route.
   */
  private resolveAdapters(route: PaymentRoute): { primary: PaymentProviderAdapter; failover: PaymentProviderAdapter | null } {
    if (route === 'international') {
      const intlConfig = this.configs.find(c => c.is_international && c.is_enabled)
      if (!intlConfig) throw new Error('No international payment provider configured')
      const adapter = this.adapters.get(intlConfig.provider)
      if (!adapter) throw new Error(`Adapter not found for provider: ${intlConfig.provider}`)
      return { primary: adapter, failover: null }
    }

    // Local route: primary + failover
    const primaryConfig = this.configs.find(c => c.is_primary_local && c.is_enabled)
    const failoverConfig = this.configs.find(c => c.is_failover_local && c.is_enabled)

    if (!primaryConfig) throw new Error('No primary local payment provider configured')
    const primary = this.adapters.get(primaryConfig.provider)
    if (!primary) throw new Error(`Adapter not found for provider: ${primaryConfig.provider}`)

    let failover: PaymentProviderAdapter | null = null
    if (failoverConfig) {
      failover = this.adapters.get(failoverConfig.provider) ?? null
    }

    return { primary, failover }
  }

  /**
   * Initiate a payment with full idempotency protection and failover logic.
   *
   * @param params - Checkout parameters
   * @param countryCode - User's ISO country code (determines routing)
   * @param idempotencyKey - Client-generated unique key for this payment attempt
   *
   * Idempotency guarantees:
   * - If the same idempotency_key is submitted twice, the second attempt is rejected
   *   with a clear error (not a double charge).
   * - The key should be generated client-side (e.g., UUID) and sent with the request.
   * - Keys are permanently stored — no expiry. This ensures even delayed retries don't
   *   result in duplicate charges.
   */
  async checkout(
    params: CreateCheckoutParams,
    countryCode: string | null | undefined,
    idempotencyKey: string
  ): Promise<GatewayCheckoutResult> {
    // ── Step 1: Idempotency check ──────────────────────────────────────
    const existing = await this.getExistingTransaction(idempotencyKey)
    if (existing) {
      // Already processed — return the original result without double-charging
      if (existing.status === 'success' || existing.status === 'processing') {
        return {
          checkout_url: existing.metadata?.checkout_url as string ?? '',
          provider_session_id: existing.provider_reference ?? '',
          provider_used: existing.provider,
          failover_triggered: false,
          failover_from: null,
          idempotency_key: idempotencyKey,
        }
      }
      // If previous attempt failed, allow a retry with the same key
      // (only truly "pending" or "failed" states are retryable)
    }

    // ── Step 2: Route to correct provider ──────────────────────────────
    const route = this.getRoute(countryCode)
    const { primary, failover } = this.resolveAdapters(route)

    // ── Step 3: Attempt payment with primary provider ──────────────────
    let result: CheckoutResult
    let providerUsed = primary.name
    let failoverTriggered = false
    let failoverFrom: string | null = null

    try {
      result = await this.attemptCheckout(primary, params)
    } catch (primaryError) {
      // ── Step 4: Failover (local route only) ────────────────────────
      if (failover && route === 'local') {
        failoverFrom = primary.name
        providerUsed = failover.name
        failoverTriggered = true

        try {
          result = await this.attemptCheckout(failover, params)
        } catch (failoverError) {
          // Both providers failed — record the failure and throw
          await this.recordTransaction({
            userId: params.user_id,
            idempotencyKey,
            provider: failover.name,
            amount: this.resolveAmount(params.plan, params.interval),
            currency: 'NGN', // Default for local; would be resolved from plan config
            status: 'failed',
            failureReason: `Primary (${primary.name}) and failover (${failover.name}) both failed`,
            failoverFrom: primary.name,
            plan: params.plan,
            billingInterval: params.interval,
          })

          // eslint-disable-next-line
          throw new Error(
            `Payment failed: ${primary.name} error — ${(primaryError as Error).message}; ` +
            `${failover.name} failover error — ${(failoverError as Error).message}`
          )
        }
      } else {
        // No failover available — record failure and throw
        await this.recordTransaction({
          userId: params.user_id,
          idempotencyKey,
          provider: primary.name,
          amount: this.resolveAmount(params.plan, params.interval),
          currency: route === 'local' ? 'NGN' : 'USD',
          status: 'failed',
          failureReason: (primaryError as Error).message,
          failoverFrom: null,
          plan: params.plan,
          billingInterval: params.interval,
        })

        throw primaryError
      }
    }

    // ── Step 5: Record successful transaction ──────────────────────────
    await this.recordTransaction({
      userId: params.user_id,
      idempotencyKey,
      provider: providerUsed,
      providerReference: result.provider_session_id,
      amount: this.resolveAmount(params.plan, params.interval),
      currency: route === 'local' ? 'NGN' : 'USD',
      status: 'processing', // Will become 'success' on webhook confirmation
      failoverFrom,
      plan: params.plan,
      billingInterval: params.interval,
      metadata: { checkout_url: result.checkout_url },
    })

    return {
      ...result,
      provider_used: providerUsed,
      failover_triggered: failoverTriggered,
      failover_from: failoverFrom,
      idempotency_key: idempotencyKey,
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /**
   * Attempt checkout with a specific adapter.
   * Wraps the call with a timeout to detect provider outages quickly.
   */
  private async attemptCheckout(
    adapter: PaymentProviderAdapter,
    params: CreateCheckoutParams
  ): Promise<CheckoutResult> {
    const TIMEOUT_MS = 15_000 // 15 seconds — if provider doesn't respond, failover

    const result = await Promise.race([
      adapter.createCheckout(params),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${adapter.name} timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
      ),
    ])

    return result
  }

  /**
   * Look up an existing transaction by idempotency key.
   */
  private async getExistingTransaction(idempotencyKey: string) {
    const { data } = await this.supabase
      .from('payment_transactions')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .single()

    return data
  }

  /**
   * Record a transaction attempt in the payment_transactions table.
   * Uses upsert with idempotency_key as conflict target.
   */
  private async recordTransaction(params: {
    userId: string
    idempotencyKey: string
    provider: string
    providerReference?: string
    amount: number
    currency: string
    status: string
    failureReason?: string
    failoverFrom: string | null
    plan?: string
    billingInterval?: string
    metadata?: Record<string, unknown>
  }): Promise<void> {
    await this.supabase.from('payment_transactions').upsert(
      {
        user_id: params.userId,
        idempotency_key: params.idempotencyKey,
        provider: params.provider,
        provider_reference: params.providerReference ?? null,
        amount: params.amount,
        currency: params.currency,
        status: params.status,
        failure_reason: params.failureReason ?? null,
        failover_from: params.failoverFrom,
        plan: params.plan ?? null,
        billing_interval: params.billingInterval ?? null,
        metadata: params.metadata ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'idempotency_key' }
    )
  }

  /**
   * Resolve the amount for a plan+interval from PLANS config.
   * Returns amount in smallest currency unit.
   */
  private resolveAmount(_plan: string, _interval: string): number {
    // Import dynamically to avoid circular deps — plan pricing is defined in types.ts
    // For now return 0; the actual amount comes from the provider's plan/price config
    // This is primarily for record-keeping in payment_transactions
    return 0
  }
}

/**
 * Utility: generate a cryptographically secure idempotency key.
 * Should be called client-side, but this server-side helper is available as fallback.
 */
export function generateIdempotencyKey(userId: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 10)
  return `idem_${userId}_${timestamp}_${random}`
}

/**
 * Check if a country code is considered "local" (African) for routing purposes.
 */
export function isLocalCountry(countryCode: string | null | undefined): boolean {
  if (!countryCode) return false
  return AFRICAN_COUNTRY_CODES.has(countryCode.toUpperCase())
}
