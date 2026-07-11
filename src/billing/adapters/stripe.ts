import type {
  PaymentProviderAdapter,
  CreateCheckoutParams,
  CheckoutResult,
  CancelSubscriptionParams,
  WebhookEvent,
  Plan,
} from '../types.js'

/**
 * Stripe adapter — reference implementation.
 *
 * To use:
 *   1. npm install stripe
 *   2. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in .env
 *   3. Configure price IDs in STRIPE_PRICE_MAP
 *
 * This file imports 'stripe' dynamically so the app doesn't crash
 * if stripe isn't installed (e.g., when using a different provider).
 */

interface StripeConfig {
  secretKey: string
  webhookSecret: string
  priceMap: Record<string, string> // e.g., 'pro_monthly' → 'price_xxx'
}

export class StripePaymentAdapter implements PaymentProviderAdapter {
  readonly name = 'stripe'
  private config: StripeConfig
  private _stripe: any = null

  constructor(config: StripeConfig) {
    this.config = config
  }

  private async getStripe() {
    if (!this._stripe) {
      // @ts-ignore — stripe is an optional dependency
      const { default: Stripe } = await import('stripe')
      this._stripe = new Stripe(this.config.secretKey)
    }
    return this._stripe
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    const stripe = await this.getStripe()
    const priceKey = `${params.plan}_${params.interval}`
    const priceId = this.config.priceMap[priceKey]

    if (!priceId) {
      throw new Error(`No Stripe price configured for ${priceKey}`)
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: params.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: params.success_url,
      cancel_url: params.cancel_url,
      metadata: {
        user_id: params.user_id,
        plan: params.plan,
        ...params.metadata,
      },
    })

    return {
      checkout_url: session.url!,
      provider_session_id: session.id,
    }
  }

  async cancelSubscription(params: CancelSubscriptionParams): Promise<void> {
    const stripe = await this.getStripe()

    if (params.cancel_at_period_end) {
      await stripe.subscriptions.update(params.provider_subscription_id, {
        cancel_at_period_end: true,
      })
    } else {
      await stripe.subscriptions.cancel(params.provider_subscription_id)
    }
  }

  async parseWebhook(headers: Record<string, string>, body: string | Buffer): Promise<WebhookEvent> {
    const stripe = await this.getStripe()
    const sig = headers['stripe-signature']

    const event = stripe.webhooks.constructEvent(
      body,
      sig,
      this.config.webhookSecret
    )

    return this.normalizeEvent(event)
  }

  private normalizeEvent(event: any): WebhookEvent {
    const obj = event.data?.object ?? {}

    const actionMap: Record<string, WebhookEvent['action']> = {
      'checkout.session.completed': 'subscription.created',
      'customer.subscription.updated': 'subscription.updated',
      'customer.subscription.deleted': 'subscription.cancelled',
      'invoice.paid': 'payment.succeeded',
      'invoice.payment_failed': 'payment.failed',
    }

    const statusMap: Record<string, WebhookEvent['status']> = {
      active: 'active',
      past_due: 'past_due',
      canceled: 'cancelled',
      trialing: 'trialing',
      unpaid: 'past_due',
    }

    // Extract plan from metadata or price
    let plan: Plan | null = null
    if (obj.metadata?.plan) {
      plan = obj.metadata.plan as Plan
    }

    return {
      type: event.type,
      action: actionMap[event.type] ?? 'unknown',
      customer_id: obj.customer ?? null,
      subscription_id: obj.subscription ?? obj.id ?? null,
      plan,
      status: statusMap[obj.status] ?? null,
      current_period_end: obj.current_period_end
        ? new Date(obj.current_period_end * 1000).toISOString()
        : null,
      raw: event,
    }
  }
}
