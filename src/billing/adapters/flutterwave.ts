import type {
  CreateCheckoutParams,
  CheckoutResult,
  CancelSubscriptionParams,
  WebhookEvent,
  Plan,
} from '../types.js'
import { BasePaymentAdapter } from './base.js'

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

export class FlutterwavePaymentAdapter extends BasePaymentAdapter {
  readonly name = 'flutterwave'
  protected readonly baseUrl = FLUTTERWAVE_API_BASE
  protected readonly secretKey: string

  private config: FlutterwaveConfig

  constructor(config: FlutterwaveConfig) {
    super('flutterwave')
    this.config = config
    this.secretKey = config.secretKey
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

    const data = await this.request<any>(
      'POST',
      '/payments',
      payload,
      (json, res) => res.ok && json.status !== 'error'
    )

    return {
      checkout_url: data.link,
      provider_session_id: txRef,
    }
  }

  async cancelSubscription(params: CancelSubscriptionParams): Promise<void> {
    // Flutterwave cancels subscriptions via PUT /subscriptions/:id/cancel
    await this.request(
      'PUT',
      `/subscriptions/${params.provider_subscription_id}/cancel`,
      {},
      (json, res) => res.ok && json.status !== 'error'
    )
  }

  async parseWebhook(headers: Record<string, string>, body: string | Buffer): Promise<WebhookEvent> {
    const rawBody = typeof body === 'string' ? body : body.toString('utf8')

    // Layer 1: Verify webhook hash (basic auth)
    this.verifyWebhookHash(headers)

    const payload = JSON.parse(rawBody)
    const data = payload.data ?? {}

    // Layer 2: Verify transaction with Flutterwave API (server-to-server confirmation)
    if (data.id && payload.event === 'charge.completed') {
      await this.verifyTransaction({
        url: `${FLUTTERWAVE_API_BASE}/transactions/${data.id}/verify`,
        authHeader: `Bearer ${this.config.secretKey}`,
        statusPath: 'data.status',
        successValue: 'successful',
        amountPath: 'data.amount',
        currencyPath: 'data.currency',
        expectedAmount: data.amount,
        expectedCurrency: data.currency,
        providerLabel: 'Flutterwave',
        transactionId: String(data.id),
      })
    }

    return this.normalizeEvent(payload)
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /**
   * Flutterwave webhook verification.
   * Flutterwave sends a `verif-hash` header that must match your configured webhook hash.
   * Uses timing-safe comparison to prevent timing attacks.
   */
  private verifyWebhookHash(headers: Record<string, string>): void {
    const hash = headers['verif-hash']
    if (!hash) {
      throw new Error('Missing verif-hash header')
    }

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
    const subscriptionId = data.id?.toString() ?? data.tx_ref ?? null

    // Determine current_period_end from plan details
    let currentPeriodEnd: string | null = null
    if (data.created_at) {
      const interval = meta.interval ?? 'monthly'
      currentPeriodEnd = this.calculatePeriodEnd(new Date(data.created_at), interval)
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
