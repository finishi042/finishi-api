import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all adapter modules to avoid real imports pulling in tracked-fetch etc.
vi.mock('../../src/billing/adapters/stub.js', () => ({
  StubPaymentAdapter: class { name = 'stub' },
}))
vi.mock('../../src/billing/adapters/stripe.js', () => ({
  StripePaymentAdapter: class {
    name = 'stripe'
    constructor(public config: any) {}
  },
}))
vi.mock('../../src/billing/adapters/paddle.js', () => ({
  PaddlePaymentAdapter: class {
    name = 'paddle'
    constructor(public config: any) {}
  },
}))
vi.mock('../../src/billing/adapters/paystack.js', () => ({
  PaystackPaymentAdapter: class {
    name = 'paystack'
    constructor(public config: any) {}
  },
}))
vi.mock('../../src/billing/adapters/flutterwave.js', () => ({
  FlutterwavePaymentAdapter: class {
    name = 'flutterwave'
    constructor(public config: any) {}
  },
}))

const { createAdapterFromConfig, createAdapterFromEnv } = await import('../../src/billing/factory.js')

function makeProviderConfig(provider: string, overrides: any = {}) {
  return {
    id: 'cfg_1',
    provider,
    display_name: provider,
    is_enabled: true,
    is_primary_local: false,
    is_failover_local: false,
    is_international: false,
    public_key: null,
    secret_key: 'sk_test',
    webhook_secret: 'whsec_test',
    extra_config: {},
    supported_countries: [],
    ...overrides,
  }
}

describe('createAdapterFromConfig', () => {
  it('creates a PaystackPaymentAdapter for provider "paystack"', () => {
    const config = makeProviderConfig('paystack', {
      extra_config: { plan_map: { pro_monthly: 'PLN_xxx' } },
    })
    const adapter = createAdapterFromConfig(config)
    expect(adapter.name).toBe('paystack')
  })

  it('creates a FlutterwavePaymentAdapter for provider "flutterwave"', () => {
    const config = makeProviderConfig('flutterwave', {
      extra_config: { plan_map: { pro_monthly: 'FLW_xxx' } },
    })
    const adapter = createAdapterFromConfig(config)
    expect(adapter.name).toBe('flutterwave')
  })

  it('creates a StripePaymentAdapter for provider "stripe"', () => {
    const config = makeProviderConfig('stripe', {
      extra_config: { price_map: { pro_monthly: 'price_xxx' } },
    })
    const adapter = createAdapterFromConfig(config)
    expect(adapter.name).toBe('stripe')
  })

  it('creates a PaddlePaymentAdapter for provider "paddle"', () => {
    const config = makeProviderConfig('paddle', {
      extra_config: { environment: 'sandbox', price_map: {} },
    })
    const adapter = createAdapterFromConfig(config)
    expect(adapter.name).toBe('paddle')
  })

  it('defaults to StubPaymentAdapter for unknown providers', () => {
    const config = makeProviderConfig('unknown_provider')
    const adapter = createAdapterFromConfig(config)
    expect(adapter.name).toBe('stub')
  })

  it('handles null secret_key gracefully', () => {
    const config = makeProviderConfig('paystack', { secret_key: null })
    const adapter = createAdapterFromConfig(config)
    expect(adapter.name).toBe('paystack')
  })
})

describe('createAdapterFromEnv', () => {
  beforeEach(() => {
    // Clear env vars between tests
    delete process.env.PAYMENT_PROVIDER
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.PAYSTACK_SECRET_KEY
  })

  it('defaults to stub when PAYMENT_PROVIDER is not set', () => {
    const adapter = createAdapterFromEnv()
    expect(adapter.name).toBe('stub')
  })

  it('returns stub adapter for explicit "stub" value', () => {
    process.env.PAYMENT_PROVIDER = 'stub'
    const adapter = createAdapterFromEnv()
    expect(adapter.name).toBe('stub')
  })

  it('creates stripe adapter from env', () => {
    process.env.PAYMENT_PROVIDER = 'stripe'
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx'
    const adapter = createAdapterFromEnv()
    expect(adapter.name).toBe('stripe')
  })

  it('creates paystack adapter from env', () => {
    process.env.PAYMENT_PROVIDER = 'paystack'
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_yyy'
    const adapter = createAdapterFromEnv()
    expect(adapter.name).toBe('paystack')
  })

  it('creates flutterwave adapter from env', () => {
    process.env.PAYMENT_PROVIDER = 'flutterwave'
    const adapter = createAdapterFromEnv()
    expect(adapter.name).toBe('flutterwave')
  })

  it('falls back to stub for unknown PAYMENT_PROVIDER', () => {
    process.env.PAYMENT_PROVIDER = 'nonexistent'
    const adapter = createAdapterFromEnv()
    expect(adapter.name).toBe('stub')
  })
})
