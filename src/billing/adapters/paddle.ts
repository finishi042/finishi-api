import type {
  PaymentProviderAdapter,
  CreateCheckoutParams,
  CheckoutResult,
  CancelSubscriptionParams,
  WebhookEvent,
  Plan,
} from '../types.js'

/**
 * Paddle adapter — merchant of record for international payments.
 *
 * Paddle handles VAT/tax globally, so pricing shown to users is net;
 * Paddle adds applicable taxes at checkout.
 *
 * Uses Paddle Billing API (v2) — the modern transaction-based API.
 *
 * To use:
 *   1. Set PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET in .env (or via admin config)
 *   2. Configure price IDs in extra_config.price_map (e.g., { "pro_monthly": "pri_xxx" })
 *   3. Set PADDLE_ENVIRONMENT to 'sandbox' or 'production'
 */

interface PaddleConfig {
  apiKey: string
  webhookSecret: string
  environment: 'sandbox' | 'production'
  sellerId?: string
  priceMap: Record<string, string> // e.g., 'pro_monthly' → 'pri_xxx'
}

const PADDLE_API_BASE = {
  sandbox: 'https://sandbox-api.paddle.com',
  production: 'https://api.paddle.com',
} as const

export class PaddlePaymentAdapter implements PaymentProviderAdapter {
  readonly name = 'paddle'
  private config: PaddleConfig

  constructor(config: PaddleConfig) {
    this.config = config
  }

  private get baseUrl(): string {
    return PADDLE_API_BASE[this.config.environment]
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    const json: any = await res.json()

    if (!res.ok) {
      const errMsg = json?.error?.detail ?? json?.error?.type ?? `Paddle API ${res.status}`
      throw new Error(`Paddle error: ${errMsg}`)
    }

    return json.data as T
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    const priceKey = `${params.plan}_${params.interval}`
    const priceId = this.config.priceMap[priceKey]

    if (!priceId) {
      throw new Error(`No Paddle price configured for ${priceKey}`)
    }

    // Create a transaction (Paddle Billing v2 approach)
    const transaction = await this.request<any>('POST', '/transactions', {
      items: [{ price_id: priceId, quantity: 1 }],
      customer_id: undefined, // Paddle creates/matches customer by email
      checkout: {
        url: params.success_url,
      },
      custom_data: {
        user_id: params.user_id,
        plan: params.plan,
        ...params.metadata,
      },
      // Paddle uses the customer's email to match or create a customer
      customer: {
        email: params.email,
      },
    })

    return {
      checkout_url: transaction.checkout?.url ?? transaction.checkout_url ?? '',
      provider_session_id: transaction.id,
    }
  }

  async cancelSubscription(params: CancelSubscriptionParams): Promise<void> {
    const effectiveFrom = params.cancel_at_period_end ? 'next_billing_period' : 'immediately'

    await this.request('POST', `/subscriptions/${params.provider_subscription_id}/cancel`, {
      effective_from: effectiveFrom,
    })
  }

  async parseWebhook(headers: Record<string, string>, body: string | Buffer): Promise<WebhookEvent> {
    const rawBody = typeof body === 'string' ? body : body.toString('utf8')

    // Verify webhook signature (Paddle uses ts + h1 scheme)
    await this.verifySignature(headers, rawBody)

    const payload = JSON.parse(rawBody)
    return this.normalizeEvent(payload)
  }

  /**
   * Paddle webhook signature verification.
   * Header format: ts=<timestamp>;h1=<hmac_sha256_hex>
   */
  private async verifySignature(headers: Record<string, string>, body: string): Promise<void> {
    const signature = headers['paddle-signature'] ?? headers['Paddle-Signature']
    if (!signature) {
      throw new Error('Missing Paddle-Signature header')
    }

    const parts = Object.fromEntries(
      signature.split(';').map(part => {
        const [key, ...val] = part.split('=')
        return [key, val.join('=')]
      })
    )

    const ts = parts['ts']
    const h1 = parts['h1']

    if (!ts || !h1) {
      throw new Error('Invalid Paddle-Signature format')
    }

    // Build signed payload: ts:body
    const signedPayload = `${ts}:${body}`

    // Use Node.js crypto for HMAC-SHA256 verification
    const { createHmac } = await import('node:crypto')
    const expectedSig = createHmac('sha256', this.config.webhookSecret)
      .update(signedPayload)
      .digest('hex')

    if (expectedSig !== h1) {
      throw new Error('Invalid Paddle webhook signature')
    }

    // Optional: reject stale webhooks (> 5 minutes old)
    const timestamp = parseInt(ts, 10)
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - timestamp) > 300) {
      throw new Error('Paddle webhook timestamp too old')
    }
  }

  private normalizeEvent(payload: any): WebhookEvent {
    const eventType = payload.event_type ?? payload.type ?? ''
    const data = payload.data ?? {}

    const actionMap: Record<string, WebhookEvent['action']> = {
      'subscription.created': 'subscription.created',
      'subscription.activated': 'subscription.created',
      'subscription.updated': 'subscription.updated',
      'subscription.canceled': 'subscription.cancelled',
      'subscription.cancelled': 'subscription.cancelled',
      'transaction.completed': 'payment.succeeded',
      'transaction.payment_failed': 'payment.failed',
    }

    const statusMap: Record<string, WebhookEvent['status']> = {
      active: 'active',
      past_due: 'past_due',
      canceled: 'cancelled',
      cancelled: 'cancelled',
      trialing: 'trialing',
      paused: 'expired',
    }

    // Extract plan from custom_data
    let plan: Plan | null = null
    const customData = data.custom_data ?? {}
    if (customData.plan) {
      plan = customData.plan as Plan
    }

    return {
      type: eventType,
      action: actionMap[eventType] ?? 'unknown',
      customer_id: data.customer_id ?? null,
      subscription_id: data.id ?? data.subscription_id ?? null,
      plan,
      status: statusMap[data.status] ?? null,
      current_period_end: data.current_billing_period?.ends_at ?? null,
      raw: payload,
    }
  }
}
