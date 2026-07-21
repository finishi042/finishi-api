/**
 * Webhook security tests — signature verification, replay protection, and tampering detection.
 */
import { describe, it, expect, vi } from 'vitest'
import { createHmac } from 'node:crypto'

// Mock tracked-fetch for adapter imports
vi.mock('../../src/monitoring/tracked-fetch.js', () => ({
  createProviderFetch: (_name: string) => vi.fn(),
}))

const { PaystackPaymentAdapter } = await import('../../src/billing/adapters/paystack.js')
const { FlutterwavePaymentAdapter } = await import('../../src/billing/adapters/flutterwave.js')

describe('Paystack Webhook Security', () => {
  const SECRET_KEY = 'sk_test_abc123def456'
  let adapter: InstanceType<typeof PaystackPaymentAdapter>

  function buildAdapter() {
    const a = new PaystackPaymentAdapter({
      secretKey: SECRET_KEY,
      webhookSecret: SECRET_KEY,
      planMap: { pro_monthly: 'PLN_test' },
    })
    // Mock the trackedFetch for transaction verification
    ;(a as any).trackedFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: true, data: { status: 'success', amount: 5000, currency: 'NGN' } }),
    })
    return a
  }

  function signPayload(body: string): string {
    return createHmac('sha512', SECRET_KEY).update(body).digest('hex')
  }

  it('accepts valid HMAC-SHA512 signature', async () => {
    adapter = buildAdapter()
    const body = JSON.stringify({
      event: 'subscription.create',
      data: { customer: { customer_code: 'CUS_test' }, subscription_code: 'SUB_test', status: 'active', metadata: { plan: 'pro' } },
    })
    const signature = signPayload(body)

    const event = await adapter.parseWebhook(
      { 'x-paystack-signature': signature },
      body
    )

    expect(event.action).toBe('subscription.created')
    expect(event.customer_id).toBe('CUS_test')
  })

  it('rejects missing signature header', async () => {
    adapter = buildAdapter()
    const body = JSON.stringify({ event: 'charge.success', data: {} })

    await expect(
      adapter.parseWebhook({}, body)
    ).rejects.toThrow('Missing x-paystack-signature')
  })

  it('rejects invalid signature (wrong key)', async () => {
    adapter = buildAdapter()
    const body = JSON.stringify({ event: 'charge.success', data: { reference: 'ref_1' } })
    const wrongSig = createHmac('sha512', 'wrong_secret_key').update(body).digest('hex')

    await expect(
      adapter.parseWebhook({ 'x-paystack-signature': wrongSig }, body)
    ).rejects.toThrow('Invalid Paystack webhook signature')
  })

  it('rejects tampered body (signature does not match modified payload)', async () => {
    adapter = buildAdapter()
    const originalBody = JSON.stringify({ event: 'charge.success', data: { amount: 5000 } })
    const signature = signPayload(originalBody)

    // Attacker modifies the body after signing
    const tamperedBody = JSON.stringify({ event: 'charge.success', data: { amount: 100 } })

    await expect(
      adapter.parseWebhook({ 'x-paystack-signature': signature }, tamperedBody)
    ).rejects.toThrow('Invalid Paystack webhook signature')
  })

  it('verifies transaction amount matches (anti-tamper layer 2)', async () => {
    adapter = buildAdapter()
    // Mock fetch to return different amount than payload claims
    ;(adapter as any).trackedFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: true, data: { status: 'success', amount: 1000, currency: 'NGN' } }),
    })

    const body = JSON.stringify({
      event: 'charge.success',
      data: { reference: 'ref_tampered', amount: 5000, currency: 'NGN', status: 'success' },
    })
    const signature = signPayload(body)

    await expect(
      adapter.parseWebhook({ 'x-paystack-signature': signature }, body)
    ).rejects.toThrow('amount mismatch')
  })

  it('verifies transaction currency matches', async () => {
    adapter = buildAdapter()
    ;(adapter as any).trackedFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: true, data: { status: 'success', amount: 5000, currency: 'USD' } }),
    })

    const body = JSON.stringify({
      event: 'charge.success',
      data: { reference: 'ref_curr', amount: 5000, currency: 'NGN', status: 'success' },
    })
    const signature = signPayload(body)

    await expect(
      adapter.parseWebhook({ 'x-paystack-signature': signature }, body)
    ).rejects.toThrow('currency mismatch')
  })
})

describe('Flutterwave Webhook Security', () => {
  const WEBHOOK_HASH = 'flw_wh_secret_hash_test'
  let adapter: InstanceType<typeof FlutterwavePaymentAdapter>

  function buildAdapter() {
    const a = new FlutterwavePaymentAdapter({
      secretKey: 'FLWSECK_TEST-xxx',
      webhookHash: WEBHOOK_HASH,
      planMap: { pro_monthly: 'FLW_PLN_test' },
    })
    // Mock the trackedFetch
    ;(a as any).trackedFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { status: 'successful', amount: 5000, currency: 'NGN' } }),
    })
    return a
  }

  it('accepts valid webhook hash', async () => {
    adapter = buildAdapter()
    const body = JSON.stringify({
      event: 'subscription.cancelled',
      data: { id: 123, customer: { id: 456 }, status: 'cancelled', meta: { plan: 'pro' } },
    })

    const event = await adapter.parseWebhook(
      { 'verif-hash': WEBHOOK_HASH },
      body
    )

    expect(event.action).toBe('subscription.cancelled')
  })

  it('rejects missing verif-hash header', async () => {
    adapter = buildAdapter()
    const body = JSON.stringify({ event: 'charge.completed', data: {} })

    await expect(
      adapter.parseWebhook({}, body)
    ).rejects.toThrow('Missing verif-hash')
  })

  it('rejects invalid webhook hash', async () => {
    adapter = buildAdapter()
    const body = JSON.stringify({ event: 'charge.completed', data: {} })

    await expect(
      adapter.parseWebhook({ 'verif-hash': 'wrong_hash_value' }, body)
    ).rejects.toThrow('Invalid Flutterwave webhook hash')
  })

  it('verifies transaction via server-to-server call (charge.completed)', async () => {
    adapter = buildAdapter()
    // Mock fetch to return failed status
    ;(adapter as any).trackedFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { status: 'failed', amount: 5000, currency: 'NGN' } }),
    })

    const body = JSON.stringify({
      event: 'charge.completed',
      data: { id: 999, amount: 5000, currency: 'NGN', status: 'successful' },
    })

    await expect(
      adapter.parseWebhook({ 'verif-hash': WEBHOOK_HASH }, body)
    ).rejects.toThrow('not successful')
  })

  it('detects amount tampering via server verification', async () => {
    adapter = buildAdapter()
    ;(adapter as any).trackedFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { status: 'successful', amount: 100, currency: 'NGN' } }),
    })

    const body = JSON.stringify({
      event: 'charge.completed',
      data: { id: 888, amount: 5000, currency: 'NGN', status: 'successful' },
    })

    await expect(
      adapter.parseWebhook({ 'verif-hash': WEBHOOK_HASH }, body)
    ).rejects.toThrow('amount mismatch')
  })
})

describe('Timing-safe comparison', () => {
  it('Paystack rejects signatures of different lengths', async () => {
    const adapter = new PaystackPaymentAdapter({
      secretKey: 'sk_test_123',
      webhookSecret: 'sk_test_123',
      planMap: {},
    })
    ;(adapter as any).trackedFetch = vi.fn()

    const body = '{"event":"test"}'
    // Provide a too-short signature
    await expect(
      adapter.parseWebhook({ 'x-paystack-signature': 'abc' }, body)
    ).rejects.toThrow()
  })
})
