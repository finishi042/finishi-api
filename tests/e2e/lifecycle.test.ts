/**
 * E2E lifecycle tests — full user journey flows with mocked Supabase.
 * Tests the integration between multiple modules working together.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'
import type { WebhookEvent } from '../../src/billing/types.js'
import { SubscriptionService } from '../../src/billing/service.js'

// ── Mock Supabase for lifecycle tests ─────────────────────────────────────────

function createLifecycleSupabase() {
  // In-memory store to simulate DB state across calls
  const users: Record<string, any> = {}
  const subscriptions: Record<string, any> = {}

  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockImplementation(function (this: any, data: any) {
      // Simulate insert: store the data
      if (this._table === 'subscriptions') {
        subscriptions[data.user_id] = { ...data, id: 'sub_' + data.user_id }
      }
      if (this._table === 'users') {
        users[data.id] = data
      }
      return this
    }),
    update: vi.fn().mockImplementation(function (this: any, data: any) {
      this._updateData = data
      return this
    }),
    upsert: vi.fn().mockImplementation(function (this: any, data: any) {
      if (this._table === 'subscriptions') {
        subscriptions[data.user_id] = { ...subscriptions[data.user_id], ...data }
      }
      return this
    }),
    eq: vi.fn().mockImplementation(function (this: any, col: string, val: any) {
      this._eqCol = col
      this._eqVal = val
      // Apply update if pending
      if (this._updateData && this._table === 'users') {
        if (users[val]) Object.assign(users[val], this._updateData)
      }
      if (this._updateData && this._table === 'subscriptions') {
        const sub = Object.values(subscriptions).find((s: any) => s[col] === val)
        if (sub) Object.assign(sub, this._updateData)
      }
      return this
    }),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(function (this: any) {
      if (this._table === 'subscriptions') {
        const sub = Object.values(subscriptions).find(
          (s: any) => s[this._eqCol] === this._eqVal
        )
        return Promise.resolve({ data: sub || null, error: sub ? null : { message: 'not found' } })
      }
      if (this._table === 'users') {
        const user = users[this._eqVal]
        return Promise.resolve({ data: user || null, error: user ? null : { message: 'not found' } })
      }
      return Promise.resolve({ data: null, error: null })
    }),
    _table: '',
    _updateData: null as any,
    _eqCol: '',
    _eqVal: '',
  }

  const supabase = {
    from: vi.fn((table: string) => {
      chain._table = table
      chain._updateData = null
      chain._eqCol = ''
      chain._eqVal = ''
      return chain
    }),
    _chain: chain,
    _users: users,
    _subscriptions: subscriptions,
  }

  return supabase
}

// ── Mock adapter ──────────────────────────────────────────────────────────────

function createMockAdapter() {
  return {
    name: 'mock',
    createCheckout: vi.fn().mockResolvedValue({
      checkout_url: 'https://pay.test/checkout/sess_123',
      provider_session_id: 'sess_123',
    }),
    cancelSubscription: vi.fn().mockResolvedValue(undefined),
    parseWebhook: vi.fn(),
  }
}

describe('E2E: Signup → Access Check → Upgrade via Webhook', () => {
  let supabase: ReturnType<typeof createLifecycleSupabase>
  let adapter: ReturnType<typeof createMockAdapter>
  let service: SubscriptionService

  beforeEach(() => {
    supabase = createLifecycleSupabase()
    adapter = createMockAdapter()
    service = new SubscriptionService(adapter as any, supabase as any)
  })

  it('new user starts on free plan', async () => {
    const sub = await service.getSubscription('user_new')
    expect(sub.plan).toBe('free')
    expect(sub.status).toBe('active')
  })

  it('free user does not have access to pro features', async () => {
    const hasAccess = await service.hasAccess('user_free', 'pro')
    expect(hasAccess).toBe(false)
  })

  it('free user has access to free features', async () => {
    const hasAccess = await service.hasAccess('user_free', 'free')
    expect(hasAccess).toBe(true)
  })

  it('user can initiate checkout for pro plan', async () => {
    const result = await service.createCheckout({
      userId: 'user_1',
      email: 'user1@test.com',
      plan: 'pro',
      interval: 'monthly',
      successUrl: 'https://app.test/success',
      cancelUrl: 'https://app.test/cancel',
    })

    expect(result.checkout_url).toContain('https://pay.test')
    expect(adapter.createCheckout).toHaveBeenCalled()
  })

  it('cannot checkout for free plan', async () => {
    await expect(
      service.createCheckout({
        userId: 'user_1',
        email: 'user1@test.com',
        plan: 'free',
        interval: 'monthly',
        successUrl: 'https://app.test/success',
        cancelUrl: 'https://app.test/cancel',
      })
    ).rejects.toThrow('Cannot checkout for free plan')
  })

  it('webhook subscription.created upgrades user to pro', async () => {
    // Simulate: user pays → webhook arrives
    const event: WebhookEvent = {
      type: 'subscription.create',
      action: 'subscription.created',
      customer_id: 'cust_user1',
      subscription_id: 'sub_provider_1',
      plan: 'pro',
      status: 'active',
      current_period_end: '2025-02-01T00:00:00Z',
      raw: { metadata: { user_id: 'user_1' } },
    }

    await service.handleWebhookEvent(event)

    // Verify subscription was created in "DB"
    expect(supabase._subscriptions['user_1']).toBeDefined()
    expect(supabase._subscriptions['user_1'].plan).toBe('pro')
    expect(supabase._subscriptions['user_1'].status).toBe('active')
  })

  it('webhook payment.failed sets subscription to past_due', async () => {
    // Pre-populate a subscription
    supabase._subscriptions['user_2'] = {
      user_id: 'user_2',
      plan: 'pro',
      status: 'active',
      provider_subscription_id: 'sub_p_2',
    }

    const event: WebhookEvent = {
      type: 'charge.failed',
      action: 'payment.failed',
      customer_id: 'cust_2',
      subscription_id: 'sub_p_2',
      plan: null,
      status: 'past_due',
      current_period_end: null,
      raw: {},
    }

    await service.handleWebhookEvent(event)

    expect(supabase._subscriptions['user_2'].status).toBe('past_due')
  })

  it('webhook subscription.cancelled downgrades user to free', async () => {
    // Pre-populate subscription
    supabase._subscriptions['user_3'] = {
      user_id: 'user_3',
      plan: 'pro',
      status: 'active',
      provider_subscription_id: 'sub_p_3',
    }

    const event: WebhookEvent = {
      type: 'subscription.disable',
      action: 'subscription.cancelled',
      customer_id: 'cust_3',
      subscription_id: 'sub_p_3',
      plan: 'pro',
      status: 'cancelled',
      current_period_end: null,
      raw: {},
    }

    await service.handleWebhookEvent(event)

    expect(supabase._subscriptions['user_3'].status).toBe('cancelled')
  })
})

describe('E2E: Full Subscription Lifecycle', () => {
  let supabase: ReturnType<typeof createLifecycleSupabase>
  let adapter: ReturnType<typeof createMockAdapter>
  let service: SubscriptionService

  beforeEach(() => {
    supabase = createLifecycleSupabase()
    adapter = createMockAdapter()
    service = new SubscriptionService(adapter as any, supabase as any)
  })

  it('complete flow: free → checkout → webhook confirms → cancel', async () => {
    const userId = 'lifecycle_user'

    // Step 1: User is on free plan
    const freeSub = await service.getSubscription(userId)
    expect(freeSub.plan).toBe('free')

    // Step 2: User initiates checkout
    const checkout = await service.createCheckout({
      userId,
      email: 'lifecycle@test.com',
      plan: 'pro',
      interval: 'yearly',
      successUrl: 'https://app.test/success',
      cancelUrl: 'https://app.test/cancel',
    })
    expect(checkout.checkout_url).toBeTruthy()

    // Step 3: Payment succeeds, webhook arrives
    await service.handleWebhookEvent({
      type: 'subscription.create',
      action: 'subscription.created',
      customer_id: 'cust_lifecycle',
      subscription_id: 'sub_lifecycle',
      plan: 'pro',
      status: 'active',
      current_period_end: '2026-01-01T00:00:00Z',
      raw: { metadata: { user_id: userId } },
    })

    // Step 4: Verify user is now on pro plan
    expect(supabase._subscriptions[userId].plan).toBe('pro')

    // Step 5: User cancels subscription
    // First make the getSubscription find the active sub
    supabase._chain.single.mockImplementationOnce(function (this: any) {
      return Promise.resolve({
        data: {
          id: 'sub_lifecycle',
          user_id: userId,
          plan: 'pro',
          status: 'active',
          provider_subscription_id: 'sub_lifecycle',
        },
        error: null,
      })
    })

    await service.cancelSubscription(userId, false)

    expect(adapter.cancelSubscription).toHaveBeenCalledWith({
      provider_subscription_id: 'sub_lifecycle',
      cancel_at_period_end: true,
    })

    // Step 6: Eventually webhook confirms cancellation
    await service.handleWebhookEvent({
      type: 'subscription.disable',
      action: 'subscription.cancelled',
      customer_id: 'cust_lifecycle',
      subscription_id: 'sub_lifecycle',
      plan: 'pro',
      status: 'cancelled',
      current_period_end: null,
      raw: {},
    })

    expect(supabase._subscriptions[userId].status).toBe('cancelled')
  })
})
