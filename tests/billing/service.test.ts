import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PaymentProviderAdapter, WebhookEvent, Subscription } from '../../src/billing/types.js'
import { SubscriptionService } from '../../src/billing/service.js'

// ── Mock helpers ──────────────────────────────────────────────────────────────

function createMockAdapter(overrides: Partial<PaymentProviderAdapter> = {}): PaymentProviderAdapter {
  return {
    name: 'mock',
    createCheckout: vi.fn().mockResolvedValue({ checkout_url: 'https://pay.test/checkout', provider_session_id: 'sess_1' }),
    cancelSubscription: vi.fn().mockResolvedValue(undefined),
    parseWebhook: vi.fn().mockResolvedValue({
      type: 'charge.success',
      action: 'subscription.created',
      customer_id: 'cust_1',
      subscription_id: 'sub_1',
      plan: 'pro',
      status: 'active',
      current_period_end: '2025-01-01T00:00:00Z',
      raw: {},
    }),
    ...overrides,
  }
}

function createMockSupabase() {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  }

  return {
    from: vi.fn(() => mockChain),
    _chain: mockChain,
  } as any
}

function makeProSubscription(userId: string): Subscription {
  return {
    id: 'sub_1',
    user_id: userId,
    plan: 'pro',
    status: 'active',
    provider: 'mock',
    provider_customer_id: 'cust_1',
    provider_subscription_id: 'provider_sub_1',
    current_period_start: '2024-01-01T00:00:00Z',
    current_period_end: '2024-02-01T00:00:00Z',
    cancel_at_period_end: false,
    cancelled_at: null,
    trial_start: null,
    trial_end: null,
    metadata: {},
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }
}

describe('SubscriptionService', () => {
  let adapter: PaymentProviderAdapter
  let supabase: ReturnType<typeof createMockSupabase>
  let service: SubscriptionService

  beforeEach(() => {
    adapter = createMockAdapter()
    supabase = createMockSupabase()
    service = new SubscriptionService(adapter, supabase)
  })

  describe('getSubscription', () => {
    it('returns the active subscription from the database', async () => {
      const sub = makeProSubscription('user_1')
      supabase._chain.single.mockResolvedValue({ data: sub, error: null })

      const result = await service.getSubscription('user_1')
      expect(result.plan).toBe('pro')
      expect(result.status).toBe('active')
    })

    it('returns a free subscription when no active sub exists', async () => {
      supabase._chain.single.mockResolvedValue({ data: null, error: { message: 'not found' } })

      const result = await service.getSubscription('user_2')
      expect(result.plan).toBe('free')
      expect(result.status).toBe('active')
      expect(result.user_id).toBe('user_2')
    })
  })

  describe('hasAccess', () => {
    it('returns true when user plan >= required plan', async () => {
      const sub = makeProSubscription('user_1')
      supabase._chain.single.mockResolvedValue({ data: sub, error: null })

      expect(await service.hasAccess('user_1', 'free')).toBe(true)
      expect(await service.hasAccess('user_1', 'pro')).toBe(true)
    })

    it('returns false when user plan < required plan', async () => {
      supabase._chain.single.mockResolvedValue({ data: null, error: { message: 'not found' } })

      // User is on free plan (no active sub)
      expect(await service.hasAccess('user_1', 'pro')).toBe(false)
      expect(await service.hasAccess('user_1', 'enterprise')).toBe(false)
    })

    it('free user has access to free plan', async () => {
      supabase._chain.single.mockResolvedValue({ data: null, error: { message: 'not found' } })

      expect(await service.hasAccess('user_1', 'free')).toBe(true)
    })
  })

  describe('createCheckout', () => {
    it('throws when plan is free', async () => {
      await expect(
        service.createCheckout({
          userId: 'user_1',
          email: 'test@test.com',
          plan: 'free',
          interval: 'monthly',
          successUrl: 'https://app.test/success',
          cancelUrl: 'https://app.test/cancel',
        })
      ).rejects.toThrow('Cannot checkout for free plan')
    })

    it('calls adapter.createCheckout with correct params', async () => {
      const result = await service.createCheckout({
        userId: 'user_1',
        email: 'test@test.com',
        plan: 'pro',
        interval: 'monthly',
        successUrl: 'https://app.test/success',
        cancelUrl: 'https://app.test/cancel',
      })

      expect(adapter.createCheckout).toHaveBeenCalledWith({
        user_id: 'user_1',
        email: 'test@test.com',
        plan: 'pro',
        interval: 'monthly',
        success_url: 'https://app.test/success',
        cancel_url: 'https://app.test/cancel',
        metadata: { user_id: 'user_1' },
      })

      expect(result.checkout_url).toBe('https://pay.test/checkout')
    })
  })

  describe('cancelSubscription', () => {
    it('throws when user is on free plan', async () => {
      supabase._chain.single.mockResolvedValue({ data: null, error: { message: 'not found' } })

      await expect(service.cancelSubscription('user_1'))
        .rejects.toThrow('No active paid subscription to cancel')
    })

    it('calls adapter.cancelSubscription for paid users', async () => {
      const sub = makeProSubscription('user_1')
      supabase._chain.single.mockResolvedValue({ data: sub, error: null })

      await service.cancelSubscription('user_1')

      expect(adapter.cancelSubscription).toHaveBeenCalledWith({
        provider_subscription_id: 'provider_sub_1',
        cancel_at_period_end: true,
      })
    })

    it('passes cancel_at_period_end=false for immediate cancel', async () => {
      const sub = makeProSubscription('user_1')
      supabase._chain.single.mockResolvedValue({ data: sub, error: null })

      await service.cancelSubscription('user_1', true)

      expect(adapter.cancelSubscription).toHaveBeenCalledWith({
        provider_subscription_id: 'provider_sub_1',
        cancel_at_period_end: false,
      })
    })
  })

  describe('handleWebhookEvent', () => {
    it('handles subscription.created events', async () => {
      // Mock resolveUserId to find user via metadata
      const event: WebhookEvent = {
        type: 'subscription.create',
        action: 'subscription.created',
        customer_id: 'cust_1',
        subscription_id: 'sub_1',
        plan: 'pro',
        status: 'active',
        current_period_end: '2025-02-01T00:00:00Z',
        raw: { metadata: { user_id: 'user_1' } },
      }

      supabase._chain.single.mockResolvedValue({ data: null, error: null })

      await service.handleWebhookEvent(event)

      // Should have called from('subscriptions').upsert(...)
      expect(supabase.from).toHaveBeenCalledWith('subscriptions')
    })

    it('handles subscription.cancelled events', async () => {
      const event: WebhookEvent = {
        type: 'subscription.disable',
        action: 'subscription.cancelled',
        customer_id: 'cust_1',
        subscription_id: 'sub_1',
        plan: 'pro',
        status: 'cancelled',
        current_period_end: null,
        raw: {},
      }

      supabase._chain.single.mockResolvedValue({ data: { user_id: 'user_1' }, error: null })

      await service.handleWebhookEvent(event)

      expect(supabase.from).toHaveBeenCalledWith('subscriptions')
      expect(supabase.from).toHaveBeenCalledWith('users')
    })

    it('handles payment.failed events', async () => {
      const event: WebhookEvent = {
        type: 'charge.failed',
        action: 'payment.failed',
        customer_id: 'cust_1',
        subscription_id: 'sub_1',
        plan: null,
        status: 'past_due',
        current_period_end: null,
        raw: {},
      }

      await service.handleWebhookEvent(event)

      expect(supabase.from).toHaveBeenCalledWith('subscriptions')
    })

    it('ignores unknown event actions', async () => {
      const event: WebhookEvent = {
        type: 'unknown.event',
        action: 'unknown',
        customer_id: null,
        subscription_id: null,
        plan: null,
        status: null,
        current_period_end: null,
        raw: {},
      }

      // Should not throw
      await expect(service.handleWebhookEvent(event)).resolves.toBeUndefined()
    })
  })

  describe('processWebhook', () => {
    it('delegates to adapter.parseWebhook then handleWebhookEvent', async () => {
      supabase._chain.single.mockResolvedValue({ data: null, error: null })

      await service.processWebhook({ 'x-paystack-signature': 'abc' }, '{}')

      expect(adapter.parseWebhook).toHaveBeenCalledWith({ 'x-paystack-signature': 'abc' }, '{}')
    })
  })
})
