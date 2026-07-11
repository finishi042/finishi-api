import type {
  PaymentProviderAdapter,
  CreateCheckoutParams,
  CheckoutResult,
  CancelSubscriptionParams,
  WebhookEvent,
  Plan,
} from '../types.js'

/**
 * Stub adapter for development and testing.
 * Immediately "completes" checkout without real payment.
 * Useful for local dev and automated tests.
 */
export class StubPaymentAdapter implements PaymentProviderAdapter {
  readonly name = 'stub'

  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    // Simulate a checkout — return the success URL directly
    const sessionId = `stub_session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    return {
      checkout_url: `${params.success_url}?session_id=${sessionId}&plan=${params.plan}`,
      provider_session_id: sessionId,
    }
  }

  async cancelSubscription(_params: CancelSubscriptionParams): Promise<void> {
    // No-op for stub
  }

  async parseWebhook(_headers: Record<string, string>, body: string | Buffer): Promise<WebhookEvent> {
    // Parse the body as JSON and normalize it
    const payload = typeof body === 'string' ? JSON.parse(body) : JSON.parse(body.toString())

    return {
      type: payload.type ?? 'stub.event',
      action: payload.action ?? 'subscription.created',
      customer_id: payload.customer_id ?? null,
      subscription_id: payload.subscription_id ?? null,
      plan: (payload.plan as Plan) ?? 'pro',
      status: payload.status ?? 'active',
      current_period_end: payload.current_period_end ?? new Date(Date.now() + 30 * 86400000).toISOString(),
      raw: payload,
    }
  }
}
