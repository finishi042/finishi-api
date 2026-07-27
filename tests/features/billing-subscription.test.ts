/**
 * Feature Test: Billing Subscription Flow
 *
 * Tests the complete subscription lifecycle from checkout to cancellation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock adapters to avoid real API calls
vi.mock('../../src/billing/adapters/stub.js', () => ({
  StubPaymentAdapter: class {
    name = 'stub'
    async createCheckoutSession() {
      return { url: 'https://checkout.example.com/session123' }
    }
    async cancelSubscription() {
      return { success: true }
    }
    async getSubscription() {
      return { status: 'active', plan: 'pro_monthly' }
    }
  },
}))

vi.mock('../../src/billing/adapters/stripe.js', () => ({
  StripePaymentAdapter: class {
    name = 'stripe'
    constructor(public config: any) {}
    async createCheckoutSession() {
      return { url: 'https://checkout.stripe.com/session' }
    }
  },
}))

vi.mock('../../src/billing/adapters/paystack.js', () => ({
  PaystackPaymentAdapter: class {
    name = 'paystack'
    constructor(public config: any) {}
    async createCheckoutSession() {
      return { url: 'https://checkout.paystack.com/session' }
    }
  },
}))

describe('Feature: Billing Subscription Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset env vars
    delete process.env.PAYMENT_PROVIDER
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.PAYSTACK_SECRET_KEY
  })

  describe('Payment Provider Selection', () => {
    it('should use stub adapter when no provider is configured', async () => {
      const { createAdapterFromEnv } = await import('../../src/billing/factory.js')
      const adapter = createAdapterFromEnv()
      expect(adapter.name).toBe('stub')
    })

    it('should use stripe adapter when configured', async () => {
      process.env.PAYMENT_PROVIDER = 'stripe'
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'

      // Need to re-import to pick up new env vars
      vi.resetModules()
      const { createAdapterFromEnv } = await import('../../src/billing/factory.js')
      const adapter = createAdapterFromEnv()
      expect(adapter.name).toBe('stripe')
    })

    it('should use paystack adapter when configured', async () => {
      process.env.PAYMENT_PROVIDER = 'paystack'
      process.env.PAYSTACK_SECRET_KEY = 'sk_test_paystack'

      vi.resetModules()
      const { createAdapterFromEnv } = await import('../../src/billing/factory.js')
      const adapter = createAdapterFromEnv()
      expect(adapter.name).toBe('paystack')
    })
  })

  describe('Checkout Session Creation', () => {
    it('should create checkout session with stub adapter', async () => {
      const { createAdapterFromEnv } = await import('../../src/billing/factory.js')
      const adapter = createAdapterFromEnv()

      const session = await adapter.createCheckoutSession({
        userId: 'user_123',
        email: 'test@example.com',
        plan: 'pro_monthly',
        successUrl: 'https://app.example.com/success',
        cancelUrl: 'https://app.example.com/cancel',
      })

      expect(session.url).toBeDefined()
      expect(session.url).toContain('checkout')
    })
  })

  describe('Subscription Cancellation', () => {
    it('should cancel subscription successfully', async () => {
      const { createAdapterFromEnv } = await import('../../src/billing/factory.js')
      const adapter = createAdapterFromEnv()

      const result = await adapter.cancelSubscription({
        subscriptionId: 'sub_123',
        userId: 'user_123',
      })

      expect(result.success).toBe(true)
    })
  })

  describe('Subscription Status', () => {
    it('should retrieve subscription status', async () => {
      const { createAdapterFromEnv } = await import('../../src/billing/factory.js')
      const adapter = createAdapterFromEnv()

      const subscription = await adapter.getSubscription({
        userId: 'user_123',
      })

      expect(subscription.status).toBe('active')
      expect(subscription.plan).toBe('pro_monthly')
    })
  })
})
