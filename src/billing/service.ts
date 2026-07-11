import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  PaymentProviderAdapter,
  Plan,
  BillingInterval,
  Subscription,
  WebhookEvent,
} from './types.js'
import { PLAN_HIERARCHY } from './types.js'

/**
 * Subscription service — orchestrates between the payment adapter and the database.
 * This is provider-agnostic; the adapter handles provider-specific logic.
 */
export class SubscriptionService {
  constructor(
    private adapter: PaymentProviderAdapter,
    private supabase: SupabaseClient
  ) {}

  /**
   * Get a user's current active subscription (or free default)
   */
  async getSubscription(userId: string): Promise<Subscription> {
    const { data, error } = await this.supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing', 'past_due'])
      .single()

    if (error || !data) {
      // No active subscription — user is on free plan
      return this.freeSubscription(userId)
    }

    return data as Subscription
  }

  /**
   * Check if a user has access to a given plan level
   */
  async hasAccess(userId: string, requiredPlan: Plan): Promise<boolean> {
    const sub = await this.getSubscription(userId)
    return PLAN_HIERARCHY[sub.plan] >= PLAN_HIERARCHY[requiredPlan]
  }

  /**
   * Create a checkout session for upgrading
   */
  async createCheckout(params: {
    userId: string
    email: string
    plan: Plan
    interval: BillingInterval
    successUrl: string
    cancelUrl: string
  }) {
    if (params.plan === 'free') {
      throw new Error('Cannot checkout for free plan')
    }

    const result = await this.adapter.createCheckout({
      user_id: params.userId,
      email: params.email,
      plan: params.plan,
      interval: params.interval,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: { user_id: params.userId },
    })

    return result
  }

  /**
   * Cancel the user's subscription
   */
  async cancelSubscription(userId: string, immediate = false): Promise<void> {
    const sub = await this.getSubscription(userId)

    if (sub.plan === 'free') {
      throw new Error('No active paid subscription to cancel')
    }

    if (sub.provider_subscription_id) {
      await this.adapter.cancelSubscription({
        provider_subscription_id: sub.provider_subscription_id,
        cancel_at_period_end: !immediate,
      })
    }

    // Update local record
    if (immediate) {
      await this.supabase
        .from('subscriptions')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', sub.id)
    } else {
      await this.supabase
        .from('subscriptions')
        .update({
          cancel_at_period_end: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sub.id)
    }

    // Update user profile plan
    if (immediate) {
      await this.supabase
        .from('users')
        .update({ plan: 'free', updated_at: new Date().toISOString() })
        .eq('id', userId)
    }
  }

  /**
   * Handle a normalized webhook event from the payment provider
   */
  async handleWebhookEvent(event: WebhookEvent): Promise<void> {
    switch (event.action) {
      case 'subscription.created':
        await this.onSubscriptionCreated(event)
        break
      case 'subscription.updated':
        await this.onSubscriptionUpdated(event)
        break
      case 'subscription.cancelled':
        await this.onSubscriptionCancelled(event)
        break
      case 'payment.failed':
        await this.onPaymentFailed(event)
        break
      default:
        break
    }
  }

  /**
   * Process incoming webhook (parse + handle)
   */
  async processWebhook(headers: Record<string, string>, body: string | Buffer): Promise<void> {
    const event = await this.adapter.parseWebhook(headers, body)
    await this.handleWebhookEvent(event)
  }

  // ── Private helpers ───────────────────────────────────────────────────

  private async onSubscriptionCreated(event: WebhookEvent) {
    if (!event.customer_id || !event.plan) return

    // Find user by provider customer ID or metadata
    const userId = await this.resolveUserId(event)
    if (!userId) return

    // Upsert subscription
    await this.supabase.from('subscriptions').upsert(
      {
        user_id: userId,
        plan: event.plan,
        status: event.status ?? 'active',
        provider: this.adapter.name,
        provider_customer_id: event.customer_id,
        provider_subscription_id: event.subscription_id,
        current_period_end: event.current_period_end,
        current_period_start: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

    // Sync plan to user profile
    await this.supabase
      .from('users')
      .update({ plan: event.plan, updated_at: new Date().toISOString() })
      .eq('id', userId)
  }

  private async onSubscriptionUpdated(event: WebhookEvent) {
    if (!event.subscription_id) return

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (event.status) updates.status = event.status
    if (event.plan) updates.plan = event.plan
    if (event.current_period_end) updates.current_period_end = event.current_period_end

    await this.supabase
      .from('subscriptions')
      .update(updates)
      .eq('provider_subscription_id', event.subscription_id)
  }

  private async onSubscriptionCancelled(event: WebhookEvent) {
    if (!event.subscription_id) return

    await this.supabase
      .from('subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('provider_subscription_id', event.subscription_id)

    // Downgrade user to free
    const { data } = await this.supabase
      .from('subscriptions')
      .select('user_id')
      .eq('provider_subscription_id', event.subscription_id)
      .single()

    if (data?.user_id) {
      await this.supabase
        .from('users')
        .update({ plan: 'free', updated_at: new Date().toISOString() })
        .eq('id', data.user_id)
    }
  }

  private async onPaymentFailed(event: WebhookEvent) {
    if (!event.subscription_id) return

    await this.supabase
      .from('subscriptions')
      .update({
        status: 'past_due',
        updated_at: new Date().toISOString(),
      })
      .eq('provider_subscription_id', event.subscription_id)
  }

  private async resolveUserId(event: WebhookEvent): Promise<string | null> {
    // Check raw metadata for user_id (set during checkout)
    const raw = event.raw as any
    const metaUserId =
      raw?.data?.object?.metadata?.user_id ??
      raw?.metadata?.user_id ??
      null

    if (metaUserId) return metaUserId

    // Look up by provider customer ID
    if (event.customer_id) {
      const { data } = await this.supabase
        .from('subscriptions')
        .select('user_id')
        .eq('provider_customer_id', event.customer_id)
        .limit(1)
        .single()

      return data?.user_id ?? null
    }

    return null
  }

  private freeSubscription(userId: string): Subscription {
    return {
      id: 'free',
      user_id: userId,
      plan: 'free',
      status: 'active',
      provider: null,
      provider_customer_id: null,
      provider_subscription_id: null,
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      cancelled_at: null,
      trial_start: null,
      trial_end: null,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }
}
