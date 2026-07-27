import { describe, it, expect } from 'vitest'
import { shouldSkip, shouldSample } from '../../src/monitoring/filters.js'

describe('shouldSkip', () => {
  it('returns true for /health', () => {
    expect(shouldSkip('/health')).toBe(true)
  })

  it('returns true for /healthz', () => {
    expect(shouldSkip('/healthz')).toBe(true)
  })

  it('returns true for /ready', () => {
    expect(shouldSkip('/ready')).toBe(true)
  })

  it('returns true for /favicon.ico', () => {
    expect(shouldSkip('/favicon.ico')).toBe(true)
  })

  it('returns true for paths starting with skip patterns', () => {
    expect(shouldSkip('/health/live')).toBe(true)
    expect(shouldSkip('/healthz/ready')).toBe(true)
  })

  it('returns false for normal API paths', () => {
    expect(shouldSkip('/api/v1/users')).toBe(false)
    expect(shouldSkip('/api/v1/auth/login')).toBe(false)
  })

  it('returns false for root path', () => {
    expect(shouldSkip('/')).toBe(false)
  })
})

describe('shouldSample', () => {
  it('returns true for /api/v1/public paths', () => {
    expect(shouldSample('/api/v1/public')).toBe(true)
    expect(shouldSample('/api/v1/public/events')).toBe(true)
  })

  it('returns false for normal API paths', () => {
    expect(shouldSample('/api/v1/users')).toBe(false)
    expect(shouldSample('/api/v1/auth/login')).toBe(false)
  })

  it('returns false for paths not starting with sample patterns', () => {
    expect(shouldSample('/public')).toBe(false)
    expect(shouldSample('/api/v2/public')).toBe(false)
  })
})
