import type {
  PaymentProviderAdapter,
  CreateCheckoutParams,
  CheckoutResult,
  CancelSubscriptionParams,
  WebhookEvent,
  Plan,
} from '../types.js'
import { createProviderFetch } from '../../monitoring/tracked-fetch.js'

/**
 * Flutterwave adapter — failover provider for local (African) payments.
 *
 * Activated automatically when Paystack is unavailable (5xx / timeout).
 * Supports card, bank transfer, mobile money, USSD across African markets.
 *
 * Uses Flutterwave v3 API (https://developer.flutterwave.com/docs).
 *
 * To use:
 *   1. Set FLUTTERWAVE_SECRET_KEY, FLUTTERWAVE_WEBHOOK_HASH in .env (or via admin config)
 *   2. Configure plan IDs in extra_config.plan_map (e.g., { "pro_monthly": "FLW_PLN_xxx" })
 */

interface FlutterwaveConfig {
  secretKey: string
  webhookHash: string // Flutterwave uses a static hash for webhook verification
  planMap: Record<string, string> // e.g., 'pro_monthly' → Flutterwave plan ID
}

const FLUTTERWAVE_API_BASE = 'https://api.flutterwave.com/v3'

export class FlutterwavePaymentAdapter implements PaymentProviderAdapter {
  readonly name = 'flutterwave'
  private config: FlutterwaveConfig
  private trackedFetch: ReturnType<typeof createProviderFetch>

  constructor(config: FlutterwaveConfig) {
    this.config = config
    this.trackedFetch = createProviderFetch('flutterwave')
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.trackedFetch(`${FLUTTERWAVE_API_BASE}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.config.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    const json: any = await res.json()

    if (!res.ok || json.status === 'error') {
      const errMsg = json?.message ?? `Flutterwave API ${res.status}`
      throw new Error(`Flutterwave error: ${errMsg}`)
    }

    return json.data as T
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    const planId = this.config.planMap[`${params.plan}_${params.interval}`]

    // Generate a unique transaction reference for idempotency on Flutterwave's side
    const txRef = `flw_${params.user_id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    const payload: Record<string, unknown> = {
      tx_ref: txRef,
      redirect_url: params.success_url,
      customer: {
        email: params.email,
      },
      meta: {
        user_id: params.user_id,
        plan: params.plan,
        interval: params.interval,
        cancel_url: params.cancel_url,
        ...params.metadata,
      },
      customizations: {
        title: 'Finishi Subscription',
        description: `${params.plan} plan (${params.interval})`,
      },
    }

    if (planId) {
      // Subscription payment via payment plan
      payload.payment_plan = planId
    } else {
      throw new Error(`No Flutterwave plan configured for ${params.plan}_${params.interval}`)
    }

    const data = await this.request<any>('POST', '/payments', payload)

    return {
      checkout_url: data.link,
      provider_session_id: txRef,
    }
  }

  async cancelSubscription(params: CancelSubscriptionParams): Promise<void> {
    // Flutterwave cancels subscriptions via PUT /subscriptions/:id/cancel
    await this.request('PUT', `/subscriptions/${params.provider_subscription_id}/cancel`, {})
  }

  async parseWebhook(headers: Record<string, string>, body: string | Buffer): Promise<WebhookEvent> {
    const rawBody = typeof body === 'string' ? body : body.toString('utf8')

    // Layer 1: Verify webhook hash (basic auth)
    this.verifySignature(headers)

    const payload = JSON.parse(rawBody)
    const data = payload.data ?? {}

    // Layer 2: Verify transaction with Flutterwave API (server-to-server confirmation)
    // This ensures the event is genuine even if the hash leaks
    if (data.id && payload.event === 'charge.completed') {
      await this.verifyTransaction(data.id, data.amount, data.currency)
    }

    return this.normalizeEvent(payload)
  }

  /**
   * Server-to-server transaction verification.
   * Calls Flutterwave's /transactions/:id/verify endpoint to confirm:
   *   1. The transaction actually exists on Flutterwave's side
   *   2. The amount and currency match what we expect
   *   3. The status is truly "successful"
   *
   * This is the recommended security approach from Flutterwave's docs:
   * https://developer.flutterwave.com/docs/integration-guides/verify-transactions
   */
  private async verifyTransaction(transactionId: number | string, expectedAmount?: number, expectedCurrency?: string): Promise<void> {
    const res = await fetch(`${FLUTTERWAVE_API_BASE}/transactions/${transactionId}/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.secretKey}`,
      },
    })

    if (!res.ok) {
      throw new Error(`Flutterwave transaction verification failed: HTTP ${res.status}`)
    }

    const json: any = await res.json()

    if (json.status !== 'success' || json.data?.status !== 'successful') {
      throw new Error(`Flutterwave transaction ${transactionId} is not successful (status: ${json.data?.status ?? 'unknown'})`)
    }

    // Verify amount matches (prevents amount tampering)
    if (expectedAmount !== undefined && json.data.amount !== expectedAmount) {
      throw new Error(`Flutterwave amount mismatch: expected ${expectedAmount}, got ${json.data.amount}`)
    }

    // Verify currency matches
    if (expectedCurrency && json.data.currency !== expectedCurrency.toUpperCase()) {
      throw new Error(`Flutterwave currency mismatch: expected ${expectedCurrency}, got ${json.data.currency}`)
    }
  }

  /**
   * Flutterwave webhook verification.
   * Flutterwave sends a `verif-hash` header that must match your configured webhook hash.
   * Uses timing-safe comparison to prevent timing attacks.
   */
  private verifySignature(headers: Record<string, string>): void {
    const hash = headers['verif-hash']
    if (!hash) {
      throw new Error('Missing verif-hash header')
    }

    // Timing-safe comparison
    const { timingSafeEqual } = require('node:crypto')
    const hashBuffer = Buffer.from(hash)
    const expectedBuffer = Buffer.from(this.config.webhookHash)

    if (hashBuffer.length !== expectedBuffer.length || !timingSafeEqual(hashBuffer, expectedBuffer)) {
      throw new Error('Invalid Flutterwave webhook hash')
    }
  }

  private normalizeEvent(payload: any): WebhookEvent {
    const eventType: string = payload.event ?? ''
    const data = payload.data ?? {}

    const actionMap: Record<string, WebhookEvent['action']> = {
      'charge.completed': 'payment.succeeded',
      'subscription.cancelled': 'subscription.cancelled',
      'transfer.completed': 'payment.succeeded',
      'payment.failed': 'payment.failed',
    }

    const statusMap: Record<string, WebhookEvent['status']> = {
      successful: 'active',
      active: 'active',
      cancelled: 'cancelled',
      failed: 'past_due',
    }

    // Extract plan from meta
    let plan: Plan | null = null
    const meta = data.meta ?? {}
    if (meta.plan) {
      plan = meta.plan as Plan
    }

    // Determine subscription ID
    // For charge.completed, it might be in data.plan_id or data.tx_ref
    const subscriptionId = data.id?.toString() ?? data.tx_ref ?? null

    // Determine current_period_end from plan details
    let currentPeriodEnd: string | null = null
    if (data.created_at) {
      const createdAt = new Date(data.created_at)
      const interval = meta.interval ?? 'monthly'
      if (interval === 'yearly') {
        createdAt.setFullYear(createdAt.getFullYear() + 1)
      } else {
        createdAt.setMonth(createdAt.getMonth() + 1)
      }
      currentPeriodEnd = createdAt.toISOString()
    }

    // For charge.completed, infer subscription.created if it has a payment_plan
    let action = actionMap[eventType] ?? 'unknown'
    if (eventType === 'charge.completed' && data.payment_plan) {
      action = 'subscription.created'
    }

    return {
      type: eventType,
      action,
      customer_id: data.customer?.id?.toString() ?? data.customer_email ?? null,
      subscription_id: subscriptionId,
      plan,
      status: statusMap[data.status] ?? null,
      current_period_end: currentPeriodEnd,
      raw: payload,
    }
  }
}
