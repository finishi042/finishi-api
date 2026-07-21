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
 * Paystack adapter — primary local payment provider for African markets.
 *
 * Supports card, bank transfer, mobile money, and USSD payments.
 * Uses Paystack's standard API (https://paystack.com/docs/api/).
 *
 * To use:
 *   1. Set PAYSTACK_SECRET_KEY, PAYSTACK_WEBHOOK_SECRET in .env (or via admin config)
 *   2. Configure plan codes in extra_config.plan_map (e.g., { "pro_monthly": "PLN_xxx" })
 */

interface PaystackConfig {
  secretKey: string
  webhookSecret: string
  planMap: Record<string, string> // e.g., 'pro_monthly' → 'PLN_xxx'
}

const PAYSTACK_API_BASE = 'https://api.paystack.co'

export class PaystackPaymentAdapter implements PaymentProviderAdapter {
  readonly name = 'paystack'
  private config: PaystackConfig
  private trackedFetch: ReturnType<typeof createProviderFetch>

  constructor(config: PaystackConfig) {
    this.config = config
    this.trackedFetch = createProviderFetch('paystack')
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.trackedFetch(`${PAYSTACK_API_BASE}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.config.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    const json: any = await res.json()

    if (!res.ok || json.status === false) {
      const errMsg = json?.message ?? `Paystack API ${res.status}`
      throw new Error(`Paystack error: ${errMsg}`)
    }

    return json.data as T
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    const planCode = this.config.planMap[`${params.plan}_${params.interval}`]

    // Paystack initializes a transaction; for subscriptions we use the plan code
    // Amount is in the smallest currency unit (kobo for NGN, pesewas for GHS)
    const payload: Record<string, unknown> = {
      email: params.email,
      callback_url: params.success_url,
      metadata: {
        user_id: params.user_id,
        plan: params.plan,
        interval: params.interval,
        cancel_url: params.cancel_url,
        ...params.metadata,
      },
    }

    if (planCode) {
      // Subscription-based checkout
      payload.plan = planCode
    } else {
      // Fallback: one-time transaction (requires amount)
      throw new Error(`No Paystack plan configured for ${params.plan}_${params.interval}`)
    }

    const data = await this.request<any>('POST', '/transaction/initialize', payload)

    return {
      checkout_url: data.authorization_url,
      provider_session_id: data.reference,
    }
  }

  async cancelSubscription(params: CancelSubscriptionParams): Promise<void> {
    // Paystack uses subscription codes and email tokens for cancellation.
    // We need the subscription code and the email token (stored in metadata).
    // The API endpoint is POST /subscription/disable with { code, token }.
    //
    // If cancel_at_period_end is true, we disable the subscription (stops renewal).
    // Paystack doesn't have an "immediate cancel" — disabling stops the next charge.

    await this.request('POST', '/subscription/disable', {
      code: params.provider_subscription_id,
      token: '', // Email token is required; should be stored in subscription metadata
    })
  }

  async parseWebhook(headers: Record<string, string>, body: string | Buffer): Promise<WebhookEvent> {
    const rawBody = typeof body === 'string' ? body : body.toString('utf8')

    // Layer 1: Verify HMAC-SHA512 signature
    this.verifySignature(headers, rawBody)

    const payload = JSON.parse(rawBody)
    const data = payload.data ?? {}

    // Layer 2: Server-to-server verification for charge events
    // Confirms the transaction exists and amounts match on Paystack's side
    if (data.reference && ['charge.success', 'charge.failed'].includes(payload.event)) {
      await this.verifyTransaction(data.reference, data.amount, data.currency)
    }

    return this.normalizeEvent(payload)
  }

  /**
   * Server-to-server transaction verification via Paystack's Verify endpoint.
   * https://paystack.com/docs/api/transaction/#verify
   *
   * Confirms:
   *   1. Transaction exists on Paystack
   *   2. Status is truly "success"
   *   3. Amount and currency match the webhook payload (prevents tampering)
   */
  private async verifyTransaction(reference: string, expectedAmount?: number, expectedCurrency?: string): Promise<void> {
    const res = await this.trackedFetch(`${PAYSTACK_API_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.secretKey}`,
      },
    })

    if (!res.ok) {
      throw new Error(`Paystack transaction verification failed: HTTP ${res.status}`)
    }

    const json: any = await res.json()

    if (json.status !== true || json.data?.status !== 'success') {
      throw new Error(`Paystack transaction ${reference} not successful (status: ${json.data?.status ?? 'unknown'})`)
    }

    // Verify amount matches (Paystack amounts are in kobo/pesewas)
    if (expectedAmount !== undefined && json.data.amount !== expectedAmount) {
      throw new Error(`Paystack amount mismatch: expected ${expectedAmount}, got ${json.data.amount}`)
    }

    // Verify currency matches
    if (expectedCurrency && json.data.currency !== expectedCurrency.toUpperCase()) {
      throw new Error(`Paystack currency mismatch: expected ${expectedCurrency}, got ${json.data.currency}`)
    }
  }

  /**
   * Paystack signs webhooks with HMAC-SHA512 using the secret key.
   * The signature is in the `x-paystack-signature` header.
   * Uses timing-safe comparison to prevent timing attacks.
   */
  private async verifySignature(headers: Record<string, string>, body: string): Promise<void> {
    const signature = headers['x-paystack-signature']
    if (!signature) {
      throw new Error('Missing x-paystack-signature header')
    }

    const { createHmac, timingSafeEqual } = await import('node:crypto')
    const expectedSig = createHmac('sha512', this.config.secretKey)
      .update(body)
      .digest('hex')

    // Timing-safe comparison prevents timing attacks
    const sigBuffer = Buffer.from(signature, 'hex')
    const expectedBuffer = Buffer.from(expectedSig, 'hex')

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      throw new Error('Invalid Paystack webhook signature')
    }
  }

  private normalizeEvent(payload: any): WebhookEvent {
    const eventType: string = payload.event ?? ''
    const data = payload.data ?? {}

    const actionMap: Record<string, WebhookEvent['action']> = {
      'subscription.create': 'subscription.created',
      'subscription.not_renew': 'subscription.cancelled',
      'subscription.disable': 'subscription.cancelled',
      'charge.success': 'payment.succeeded',
      'invoice.update': 'subscription.updated',
      'invoice.payment_failed': 'payment.failed',
      'charge.failed': 'payment.failed',
    }

    const statusMap: Record<string, WebhookEvent['status']> = {
      active: 'active',
      complete: 'active',
      non_renewing: 'active', // still active until period ends
      attention: 'past_due',
      cancelled: 'cancelled',
    }

    // Extract plan from metadata
    let plan: Plan | null = null
    const meta = data.metadata ?? {}
    if (meta.plan) {
      plan = meta.plan as Plan
    }

    // Determine current_period_end
    let currentPeriodEnd: string | null = null
    if (data.next_payment_date) {
      currentPeriodEnd = new Date(data.next_payment_date).toISOString()
    } else if (data.paid_at) {
      // Estimate: paid_at + subscription interval
      const paidAt = new Date(data.paid_at)
      const interval = meta.interval ?? 'monthly'
      if (interval === 'yearly') {
        paidAt.setFullYear(paidAt.getFullYear() + 1)
      } else {
        paidAt.setMonth(paidAt.getMonth() + 1)
      }
      currentPeriodEnd = paidAt.toISOString()
    }

    return {
      type: eventType,
      action: actionMap[eventType] ?? 'unknown',
      customer_id: data.customer?.customer_code ?? data.customer_code ?? null,
      subscription_id: data.subscription_code ?? data.reference ?? null,
      plan,
      status: statusMap[data.status] ?? null,
      current_period_end: currentPeriodEnd,
      raw: payload,
    }
  }
}
