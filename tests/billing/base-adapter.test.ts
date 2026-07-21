import { describe, it, expect, vi, beforeEach } from 'vitest'
import type {
  CreateCheckoutParams,
  CheckoutResult,
  CancelSubscriptionParams,
  WebhookEvent,
} from '../../src/billing/types.js'

// We need to mock the tracked-fetch module before importing BasePaymentAdapter
vi.mock('../../src/monitoring/tracked-fetch.js', () => ({
  createProviderFetch: (_name: string) => vi.fn(),
}))

const { BasePaymentAdapter } = await import('../../src/billing/adapters/base.js')

/**
 * Concrete test adapter that exposes protected methods for testing.
 */
class TestAdapter extends BasePaymentAdapter {
  readonly name = 'test'
  protected readonly baseUrl = 'https://api.test.com'
  protected readonly secretKey = 'sk_test_123'

  // Expose protected methods for testing
  public testCalculatePeriodEnd(baseDate: Date, interval: string) {
    return this.calculatePeriodEnd(baseDate, interval)
  }

  public async testRequest<T>(method: string, path: string, body?: unknown, isSuccess?: (json: any, res: Response) => boolean) {
    return this.request<T>(method, path, body, isSuccess)
  }

  public async testVerifyTransaction(opts: any) {
    return this.verifyTransaction(opts)
  }

  // Required abstract implementations (not under test here)
  async createCheckout(_params: CreateCheckoutParams): Promise<CheckoutResult> {
    return { checkout_url: '', provider_session_id: '' }
  }
  async cancelSubscription(_params: CancelSubscriptionParams): Promise<void> {}
  async parseWebhook(_headers: Record<string, string>, _body: string | Buffer): Promise<WebhookEvent> {
    return { type: '', action: 'unknown', customer_id: null, subscription_id: null, plan: null, status: null, current_period_end: null, raw: {} }
  }
}

describe('BasePaymentAdapter', () => {
  let adapter: TestAdapter

  beforeEach(() => {
    adapter = new TestAdapter('test')
  })

  describe('calculatePeriodEnd', () => {
    it('adds 1 month for monthly interval', () => {
      const base = new Date('2024-03-15T10:00:00Z')
      const result = adapter.testCalculatePeriodEnd(base, 'monthly')
      expect(result).toBe(new Date('2024-04-15T10:00:00Z').toISOString())
    })

    it('adds 1 year for yearly interval', () => {
      const base = new Date('2024-03-15T10:00:00Z')
      const result = adapter.testCalculatePeriodEnd(base, 'yearly')
      expect(result).toBe(new Date('2025-03-15T10:00:00Z').toISOString())
    })

    it('handles month overflow (Jan 31 → Feb 28)', () => {
      const base = new Date('2024-01-31T00:00:00Z')
      const result = adapter.testCalculatePeriodEnd(base, 'monthly')
      // JS Date rolls over: Jan 31 + 1 month = Mar 2 (2024 is leap year)
      const expected = new Date('2024-01-31T00:00:00Z')
      expected.setMonth(expected.getMonth() + 1)
      expect(result).toBe(expected.toISOString())
    })

    it('defaults to monthly for unknown intervals', () => {
      const base = new Date('2024-06-01T00:00:00Z')
      const result = adapter.testCalculatePeriodEnd(base, 'weekly')
      // Non-yearly falls into else branch — adds 1 month
      expect(result).toBe(new Date('2024-07-01T00:00:00Z').toISOString())
    })

    it('does not mutate the original date', () => {
      const base = new Date('2024-03-15T10:00:00Z')
      const originalTime = base.getTime()
      adapter.testCalculatePeriodEnd(base, 'monthly')
      expect(base.getTime()).toBe(originalTime)
    })
  })

  describe('request', () => {
    it('throws an error with provider name when response is not ok', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Server error' }),
      })

      // Replace the tracked fetch with our mock
      ;(adapter as any).trackedFetch = mockFetch

      await expect(adapter.testRequest('GET', '/test'))
        .rejects.toThrow('test error: Server error')
    })

    it('returns json.data on success', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: 'txn_1' } }),
      })

      ;(adapter as any).trackedFetch = mockFetch

      const result = await adapter.testRequest('GET', '/test')
      expect(result).toEqual({ id: 'txn_1' })
    })

    it('sends correct auth header and content-type', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      })

      ;(adapter as any).trackedFetch = mockFetch

      await adapter.testRequest('POST', '/payments', { amount: 100 })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/payments',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer sk_test_123',
            'Content-Type': 'application/json',
          },
          body: '{"amount":100}',
        })
      )
    })

    it('uses custom isSuccess callback when provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: false, data: null, message: 'Paystack says no' }),
      })

      ;(adapter as any).trackedFetch = mockFetch

      // Custom check that also requires json.status !== false
      await expect(
        adapter.testRequest('GET', '/test', undefined, (json, res) => res.ok && json.status !== false)
      ).rejects.toThrow('test error: Paystack says no')
    })
  })

  describe('verifyTransaction', () => {
    it('throws on non-OK HTTP response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })

      ;(adapter as any).trackedFetch = mockFetch

      await expect(adapter.testVerifyTransaction({
        url: 'https://api.test.com/verify/txn_1',
        authHeader: 'Bearer sk_test',
        statusPath: 'data.status',
        successValue: 'success',
        amountPath: 'data.amount',
        currencyPath: 'data.currency',
        providerLabel: 'Test',
        transactionId: 'txn_1',
      })).rejects.toThrow('Test transaction verification failed: HTTP 404')
    })

    it('throws when status does not match success value', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { status: 'failed', amount: 1000, currency: 'NGN' } }),
      })

      ;(adapter as any).trackedFetch = mockFetch

      await expect(adapter.testVerifyTransaction({
        url: 'https://api.test.com/verify/txn_1',
        authHeader: 'Bearer sk_test',
        statusPath: 'data.status',
        successValue: 'success',
        amountPath: 'data.amount',
        currencyPath: 'data.currency',
        providerLabel: 'Test',
        transactionId: 'txn_1',
      })).rejects.toThrow('Test transaction txn_1 not successful (status: failed)')
    })

    it('throws on amount mismatch', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { status: 'success', amount: 500, currency: 'NGN' } }),
      })

      ;(adapter as any).trackedFetch = mockFetch

      await expect(adapter.testVerifyTransaction({
        url: 'https://api.test.com/verify/txn_1',
        authHeader: 'Bearer sk_test',
        statusPath: 'data.status',
        successValue: 'success',
        amountPath: 'data.amount',
        currencyPath: 'data.currency',
        expectedAmount: 1000,
        providerLabel: 'Test',
        transactionId: 'txn_1',
      })).rejects.toThrow('Test amount mismatch: expected 1000, got 500')
    })

    it('throws on currency mismatch', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { status: 'success', amount: 1000, currency: 'USD' } }),
      })

      ;(adapter as any).trackedFetch = mockFetch

      await expect(adapter.testVerifyTransaction({
        url: 'https://api.test.com/verify/txn_1',
        authHeader: 'Bearer sk_test',
        statusPath: 'data.status',
        successValue: 'success',
        amountPath: 'data.amount',
        currencyPath: 'data.currency',
        expectedAmount: 1000,
        expectedCurrency: 'NGN',
        providerLabel: 'Test',
        transactionId: 'txn_1',
      })).rejects.toThrow('Test currency mismatch: expected NGN, got USD')
    })

    it('passes when all checks match', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { status: 'success', amount: 1000, currency: 'NGN' } }),
      })

      ;(adapter as any).trackedFetch = mockFetch

      await expect(adapter.testVerifyTransaction({
        url: 'https://api.test.com/verify/txn_1',
        authHeader: 'Bearer sk_test',
        statusPath: 'data.status',
        successValue: 'success',
        amountPath: 'data.amount',
        currencyPath: 'data.currency',
        expectedAmount: 1000,
        expectedCurrency: 'NGN',
        providerLabel: 'Test',
        transactionId: 'txn_1',
      })).resolves.toBeUndefined()
    })
  })
})
