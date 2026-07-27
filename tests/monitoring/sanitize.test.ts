import { describe, it, expect } from 'vitest'
import { sanitizeHeaders, sanitizeFetchHeaders } from '../../src/monitoring/sanitize.js'

describe('sanitizeHeaders', () => {
  it('redacts authorization header', () => {
    const headers = { authorization: 'Bearer token123' }
    const result = sanitizeHeaders(headers)
    expect(result.authorization).toBe('[REDACTED]')
  })

  it('redacts cookie header', () => {
    const headers = { cookie: 'session=abc123' }
    const result = sanitizeHeaders(headers)
    expect(result.cookie).toBe('[REDACTED]')
  })

  it('redacts set-cookie header', () => {
    const headers = { 'set-cookie': 'session=abc123; HttpOnly' }
    const result = sanitizeHeaders(headers)
    expect(result['set-cookie']).toBe('[REDACTED]')
  })

  it('redacts api key headers', () => {
    const headers = {
      'x-api-key': 'secret-key',
      'api-key': 'another-secret',
      'x-goog-api-key': 'google-key',
    }
    const result = sanitizeHeaders(headers)
    expect(result['x-api-key']).toBe('[REDACTED]')
    expect(result['api-key']).toBe('[REDACTED]')
    expect(result['x-goog-api-key']).toBe('[REDACTED]')
  })

  it('redacts paystack signature', () => {
    const headers = { 'x-paystack-signature': 'signature123' }
    const result = sanitizeHeaders(headers)
    expect(result['x-paystack-signature']).toBe('[REDACTED]')
  })

  it('preserves safe headers', () => {
    const headers = {
      'content-type': 'application/json',
      'user-agent': 'Mozilla/5.0',
      accept: 'application/json',
      host: 'api.example.com',
    }
    const result = sanitizeHeaders(headers)
    expect(result['content-type']).toBe('application/json')
    expect(result['user-agent']).toBe('Mozilla/5.0')
    expect(result.accept).toBe('application/json')
    expect(result.host).toBe('api.example.com')
  })

  it('handles case-insensitive header names', () => {
    const headers = { Authorization: 'Bearer token', COOKIE: 'session=abc' }
    const result = sanitizeHeaders(headers)
    expect(result.Authorization).toBe('[REDACTED]')
    expect(result.COOKIE).toBe('[REDACTED]')
  })

  it('handles empty headers object', () => {
    const result = sanitizeHeaders({})
    expect(result).toEqual({})
  })
})

describe('sanitizeFetchHeaders', () => {
  it('returns undefined for null/undefined', () => {
    expect(sanitizeFetchHeaders(null)).toBeUndefined()
    expect(sanitizeFetchHeaders(undefined)).toBeUndefined()
  })

  it('sanitizes plain object headers', () => {
    const headers = { authorization: 'Bearer token', 'content-type': 'application/json' }
    const result = sanitizeFetchHeaders(headers)
    expect(result?.authorization).toBe('[REDACTED]')
    expect(result?.['content-type']).toBe('application/json')
  })

  it('sanitizes array headers', () => {
    const headers: [string, string][] = [
      ['authorization', 'Bearer token'],
      ['content-type', 'application/json'],
    ]
    const result = sanitizeFetchHeaders(headers)
    expect(result?.authorization).toBe('[REDACTED]')
    expect(result?.['content-type']).toBe('application/json')
  })

  it('sanitizes Headers object', () => {
    const headers = new Headers()
    headers.set('authorization', 'Bearer token')
    headers.set('content-type', 'application/json')
    const result = sanitizeFetchHeaders(headers)
    expect(result?.authorization).toBe('[REDACTED]')
    expect(result?.['content-type']).toBe('application/json')
  })
})
