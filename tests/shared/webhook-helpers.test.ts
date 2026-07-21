import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  checkIpWhitelist,
  deduplicateEvent,
  extractEventId,
  detectProviderFromHeaders,
} from '../../src/shared/routes/webhook-helpers.js'

// ── Mock request factory ──────────────────────────────────────────────────────

function makeRequest(ip?: string, headers: Record<string, string> = {}) {
  return {
    ip,
    headers,
  } as any
}

describe('checkIpWhitelist', () => {
  const originalEnv = process.env.WEBHOOK_IP_WHITELIST_ENABLED

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.WEBHOOK_IP_WHITELIST_ENABLED
    } else {
      process.env.WEBHOOK_IP_WHITELIST_ENABLED = originalEnv
    }
  })

  it('allows all requests when WEBHOOK_IP_WHITELIST_ENABLED is not "true"', () => {
    delete process.env.WEBHOOK_IP_WHITELIST_ENABLED
    const request = makeRequest('1.2.3.4')
    const result = checkIpWhitelist('paystack', request)
    expect(result.allowed).toBe(true)
  })

  it('allows all requests for providers with empty IP lists (flutterwave)', () => {
    process.env.WEBHOOK_IP_WHITELIST_ENABLED = 'true'
    const request = makeRequest('99.99.99.99')
    const result = checkIpWhitelist('flutterwave', request)
    expect(result.allowed).toBe(true)
  })

  it('allows whitelisted IPs for paystack', () => {
    process.env.WEBHOOK_IP_WHITELIST_ENABLED = 'true'
    const request = makeRequest('52.31.139.75')
    const result = checkIpWhitelist('paystack', request)
    expect(result.allowed).toBe(true)
  })

  it('rejects non-whitelisted IPs for paystack', () => {
    process.env.WEBHOOK_IP_WHITELIST_ENABLED = 'true'
    const request = makeRequest('1.2.3.4')
    const result = checkIpWhitelist('paystack', request)
    expect(result.allowed).toBe(false)
    expect(result.clientIp).toBe('1.2.3.4')
  })

  it('falls back to x-forwarded-for header', () => {
    process.env.WEBHOOK_IP_WHITELIST_ENABLED = 'true'
    const request = makeRequest(undefined, { 'x-forwarded-for': '52.49.173.169, 10.0.0.1' })
    const result = checkIpWhitelist('paystack', request)
    expect(result.allowed).toBe(true)
  })

  it('rejects when both ip and forwarded header are missing', () => {
    process.env.WEBHOOK_IP_WHITELIST_ENABLED = 'true'
    const request = makeRequest(undefined, {})
    const result = checkIpWhitelist('paystack', request)
    expect(result.allowed).toBe(false)
  })

  it('allows unknown providers (no whitelist defined)', () => {
    process.env.WEBHOOK_IP_WHITELIST_ENABLED = 'true'
    const request = makeRequest('99.99.99.99')
    const result = checkIpWhitelist('unknown_provider', request)
    expect(result.allowed).toBe(true)
  })
})

describe('deduplicateEvent', () => {
  function makeMockSupabase(existing: boolean) {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: existing ? { id: 'txn_1' } : null }),
    }
    return { from: vi.fn(() => chain), _chain: chain } as any
  }

  it('returns false when eventId is null', async () => {
    const supabase = makeMockSupabase(false)
    const result = await deduplicateEvent(supabase, 'paystack', null)
    expect(result).toBe(false)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('returns true when event already exists in DB', async () => {
    const supabase = makeMockSupabase(true)
    const result = await deduplicateEvent(supabase, 'paystack', 'evt_123')
    expect(result).toBe(true)
  })

  it('returns false when event does not exist in DB', async () => {
    const supabase = makeMockSupabase(false)
    const result = await deduplicateEvent(supabase, 'paystack', 'evt_new')
    expect(result).toBe(false)
  })

  it('queries the correct table and columns', async () => {
    const supabase = makeMockSupabase(false)
    await deduplicateEvent(supabase, 'flutterwave', 'evt_456')

    expect(supabase.from).toHaveBeenCalledWith('payment_transactions')
    expect(supabase._chain.eq).toHaveBeenCalledWith('provider_reference', 'evt_456')
    expect(supabase._chain.eq).toHaveBeenCalledWith('provider', 'flutterwave')
  })
})

describe('extractEventId', () => {
  describe('paystack', () => {
    it('extracts data.id', () => {
      const body = JSON.stringify({ data: { id: 12345 } })
      expect(extractEventId('paystack', body)).toBe('12345')
    })

    it('falls back to data.reference', () => {
      const body = JSON.stringify({ data: { reference: 'ref_abc' } })
      expect(extractEventId('paystack', body)).toBe('ref_abc')
    })

    it('returns null when neither exists', () => {
      const body = JSON.stringify({ data: {} })
      expect(extractEventId('paystack', body)).toBeNull()
    })
  })

  describe('flutterwave', () => {
    it('extracts data.id', () => {
      const body = JSON.stringify({ data: { id: 67890 } })
      expect(extractEventId('flutterwave', body)).toBe('67890')
    })

    it('falls back to data.tx_ref', () => {
      const body = JSON.stringify({ data: { tx_ref: 'flw_user_123' } })
      expect(extractEventId('flutterwave', body)).toBe('flw_user_123')
    })
  })

  describe('paddle', () => {
    it('extracts event_id', () => {
      const body = JSON.stringify({ event_id: 'evt_pad_001' })
      expect(extractEventId('paddle', body)).toBe('evt_pad_001')
    })
  })

  describe('unknown provider', () => {
    it('returns null', () => {
      const body = JSON.stringify({ data: { id: 123 } })
      expect(extractEventId('unknown', body)).toBeNull()
    })
  })

  describe('invalid JSON', () => {
    it('returns null for malformed body', () => {
      expect(extractEventId('paystack', 'not json')).toBeNull()
    })
  })
})

describe('detectProviderFromHeaders', () => {
  it('detects flutterwave from verif-hash header', () => {
    expect(detectProviderFromHeaders({ 'verif-hash': 'abc123' })).toBe('flutterwave')
  })

  it('detects paddle from paddle-signature header', () => {
    expect(detectProviderFromHeaders({ 'paddle-signature': 'sig' })).toBe('paddle')
  })

  it('detects paystack from x-paystack-signature header', () => {
    expect(detectProviderFromHeaders({ 'x-paystack-signature': 'hmac' })).toBe('paystack')
  })

  it('defaults to paystack when no recognizable header', () => {
    expect(detectProviderFromHeaders({})).toBe('paystack')
  })

  it('prioritizes verif-hash over others (flutterwave first)', () => {
    expect(detectProviderFromHeaders({
      'verif-hash': 'abc',
      'x-paystack-signature': 'def',
    })).toBe('flutterwave')
  })
})
