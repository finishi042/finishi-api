/**
 * Route integration tests for billing/subscription endpoints.
 * Uses Fastify inject() with mocked services.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import { fakeUser } from '../helpers/build-app.js'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockService = {
  getSubscription: vi.fn().mockResolvedValue({ plan: 'free', status: 'active' }),
  hasAccess: vi.fn().mockResolvedValue(true),
  createCheckout: vi.fn().mockResolvedValue({ checkout_url: 'https://pay.test/session', provider_session_id: 'sess_1' }),
  cancelSubscription: vi.fn().mockResolvedValue(undefined),
}

const testUser = fakeUser()

// Mock the authenticate middleware to always inject our test user
vi.mock('../../src/shared/middleware/auth.js', () => ({
  authenticate: async (request: any, _reply: any) => {
    request.user = testUser
  },
}))

// Mock RBAC middleware to pass through
vi.mock('../../src/shared/middleware/rbac.js', () => ({
  requireUser: async () => {},
  requireAdmin: async () => {},
  requireSuperAdmin: async () => {},
  requireRole: () => async () => {},
}))

vi.mock('../../src/billing/provider.js', () => ({
  getSubscriptionService: () => mockService,
  getPaymentAdapter: () => ({ name: 'stub' }),
  getGatewayRouter: vi.fn(),
  refreshGatewayRouter: vi.fn(),
  createAdapterFromEnv: () => ({ name: 'stub' }),
  loadProviderConfigs: vi.fn(),
  loadAllProviderConfigs: vi.fn(),
}))

vi.mock('../../src/billing/plans.js', () => ({
  getPlans: vi.fn().mockResolvedValue([
    { slug: 'free', name: 'Free', price_monthly: 0, price_yearly: 0 },
    { slug: 'pro', name: 'Pro', price_monthly: 999, price_yearly: 9990 },
    { slug: 'enterprise', name: 'Enterprise', price_monthly: 4999, price_yearly: 49990 },
  ]),
}))

vi.mock('../../src/shared/supabase.js', () => ({
  getSupabase: () => ({}),
  initSupabase: () => ({}),
  formatResponse: (data: any, success = true) => ({ success, data }),
  formatError: (message: string, code?: string) => ({ success: false, error: { message, code } }),
}))

vi.mock('../../src/shared/response.js', () => ({
  formatResponse: (data: any, success = true) => ({ success, data }),
  formatError: (message: string, code?: string) => ({ success: false, error: { message, code } }),
}))

const { default: billingRoutes } = await import('../../src/billing/routes.js')

async function buildBillingApp() {
  const app = Fastify({ logger: false })
  await app.register(fastifyCookie)
  app.decorateRequest('user', null)
  await app.register(billingRoutes, { prefix: '/api/v1/user' })
  await app.ready()
  return app
}

describe('Billing Routes', () => {
  let app: Awaited<ReturnType<typeof buildBillingApp>>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await buildBillingApp()
  })

  describe('GET /api/v1/user/subscription', () => {
    it('returns current subscription and plans', async () => {
      mockService.getSubscription.mockResolvedValueOnce({ plan: 'pro', status: 'active' })

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/user/subscription',
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
      expect(res.json().data.subscription.plan).toBe('pro')
      expect(res.json().data.plans).toBeDefined()
    })

    it('returns free subscription when user has no paid plan', async () => {
      mockService.getSubscription.mockResolvedValueOnce({ plan: 'free', status: 'active' })

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/user/subscription',
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data.subscription.plan).toBe('free')
    })
  })

  describe('GET /api/v1/user/subscription/plans', () => {
    it('returns available plans', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/user/subscription/plans',
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
      const plans = res.json().data
      expect(plans).toHaveLength(3)
    })
  })

  describe('POST /api/v1/user/subscription/checkout', () => {
    it('returns 400 for missing plan', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/user/subscription/checkout',
        payload: { success_url: 'https://app.test/success', cancel_url: 'https://app.test/cancel' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 for invalid success_url (non-https)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/user/subscription/checkout',
        payload: {
          plan: 'pro',
          interval: 'monthly',
          success_url: 'http://evil.com/steal',
          cancel_url: 'https://app.test/cancel',
        },
      })

      expect(res.statusCode).toBe(400)
    })

    it('allows localhost URLs for development', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/user/subscription/checkout',
        payload: {
          plan: 'pro',
          interval: 'monthly',
          success_url: 'http://localhost:5173/success',
          cancel_url: 'http://localhost:3000/cancel',
        },
      })

      // Should pass validation (200 from successful checkout)
      expect(res.statusCode).toBe(200)
    })

    it('returns 400 for invalid plan slug', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/user/subscription/checkout',
        payload: {
          plan: 'nonexistent_plan',
          interval: 'monthly',
          success_url: 'https://app.test/success',
          cancel_url: 'https://app.test/cancel',
        },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('INVALID_PLAN')
    })

    it('returns 400 when trying to checkout for free plan', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/user/subscription/checkout',
        payload: {
          plan: 'free',
          interval: 'monthly',
          success_url: 'https://app.test/success',
          cancel_url: 'https://app.test/cancel',
        },
      })

      expect(res.statusCode).toBe(400)
    })

    it('returns checkout URL on success', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/user/subscription/checkout',
        payload: {
          plan: 'pro',
          interval: 'yearly',
          success_url: 'https://app.test/success',
          cancel_url: 'https://app.test/cancel',
        },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
      expect(res.json().data.checkout_url).toBe('https://pay.test/session')
    })

    it('defaults interval to monthly when not provided', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/user/subscription/checkout',
        payload: {
          plan: 'pro',
          success_url: 'https://app.test/success',
          cancel_url: 'https://app.test/cancel',
        },
      })

      expect(mockService.createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ interval: 'monthly' })
      )
    })
  })

  describe('POST /api/v1/user/subscription/cancel', () => {
    it('cancels subscription at period end by default', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/user/subscription/cancel',
        payload: {},
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data.cancelled).toBe(true)
      expect(mockService.cancelSubscription).toHaveBeenCalledWith(
        testUser.id, false
      )
    })

    it('supports immediate cancellation', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/user/subscription/cancel',
        payload: { immediate: true },
      })

      expect(res.statusCode).toBe(200)
      expect(mockService.cancelSubscription).toHaveBeenCalledWith(
        testUser.id, true
      )
    })

    it('returns 400 for extra fields (strict mode)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/user/subscription/cancel',
        payload: { immediate: false, hack: true },
      })

      expect(res.statusCode).toBe(400)
    })
  })
})
