/**
 * Schema validation tests — boundary cases, strict mode, and edge cases for all Zod schemas.
 */
import { describe, it, expect } from 'vitest'
import { SignupSchema, LoginSchema } from '../../src/auth/schemas.js'
import { CheckoutSchema, CancelSubscriptionSchema } from '../../src/billing/schemas.js'
import {
  WaitlistStatusSchema,
  WaitlistInviteSchema,
  WaitlistQuerySchema,
  AnalyticsQuerySchema,
} from '../../src/admin/schemas.js'

describe('Auth Schemas', () => {
  describe('SignupSchema', () => {
    it('passes with valid data', () => {
      const result = SignupSchema.safeParse({
        email: 'test@example.com',
        password: 'securepass',
        full_name: 'Test User',
      })
      expect(result.success).toBe(true)
    })

    it('allows optional full_name', () => {
      const result = SignupSchema.safeParse({
        email: 'test@example.com',
        password: 'securepass',
      })
      expect(result.success).toBe(true)
    })

    it('rejects email exceeding 254 characters', () => {
      const longEmail = 'a'.repeat(250) + '@test.com'
      const result = SignupSchema.safeParse({
        email: longEmail,
        password: 'securepass',
      })
      expect(result.success).toBe(false)
    })

    it('rejects password under 8 characters', () => {
      const result = SignupSchema.safeParse({
        email: 'test@test.com',
        password: '1234567', // 7 chars
      })
      expect(result.success).toBe(false)
      expect(result.error!.issues[0].message).toContain('8 characters')
    })

    it('rejects password over 128 characters', () => {
      const result = SignupSchema.safeParse({
        email: 'test@test.com',
        password: 'a'.repeat(129),
      })
      expect(result.success).toBe(false)
    })

    it('accepts password exactly 8 characters', () => {
      const result = SignupSchema.safeParse({
        email: 'test@test.com',
        password: '12345678',
      })
      expect(result.success).toBe(true)
    })

    it('accepts password exactly 128 characters', () => {
      const result = SignupSchema.safeParse({
        email: 'test@test.com',
        password: 'a'.repeat(128),
      })
      expect(result.success).toBe(true)
    })

    it('rejects extra fields (strict mode)', () => {
      const result = SignupSchema.safeParse({
        email: 'test@test.com',
        password: 'securepass',
        isAdmin: true,
      })
      expect(result.success).toBe(false)
    })

    it('trims full_name whitespace', () => {
      const result = SignupSchema.safeParse({
        email: 'test@test.com',
        password: 'securepass',
        full_name: '  Test User  ',
      })
      expect(result.success).toBe(true)
      expect(result.data!.full_name).toBe('Test User')
    })

    it('rejects full_name exceeding 120 characters', () => {
      const result = SignupSchema.safeParse({
        email: 'test@test.com',
        password: 'securepass',
        full_name: 'A'.repeat(121),
      })
      expect(result.success).toBe(false)
    })

    it('rejects invalid email formats', () => {
      const invalidEmails = ['notanemail', '@missing.com', 'spaces @test.com', 'test@', '']
      for (const email of invalidEmails) {
        const result = SignupSchema.safeParse({ email, password: 'securepass' })
        expect(result.success).toBe(false)
      }
    })
  })

  describe('LoginSchema', () => {
    it('passes with valid credentials', () => {
      const result = LoginSchema.safeParse({
        email: 'test@test.com',
        password: 'anypassword',
      })
      expect(result.success).toBe(true)
    })

    it('rejects empty password', () => {
      const result = LoginSchema.safeParse({
        email: 'test@test.com',
        password: '',
      })
      expect(result.success).toBe(false)
    })

    it('rejects extra fields (strict)', () => {
      const result = LoginSchema.safeParse({
        email: 'test@test.com',
        password: 'pass',
        remember_me: true,
      })
      expect(result.success).toBe(false)
    })

    it('does not enforce minimum length (login allows short passwords to return proper 401)', () => {
      // Login has min(1) not min(8) — we don't want to leak "password too short" on login
      const result = LoginSchema.safeParse({
        email: 'test@test.com',
        password: 'x',
      })
      expect(result.success).toBe(true)
    })
  })
})

describe('Billing Schemas', () => {
  describe('CheckoutSchema', () => {
    it('passes with valid checkout data', () => {
      const result = CheckoutSchema.safeParse({
        plan: 'pro',
        interval: 'monthly',
        success_url: 'https://user.finishi.org/success',
        cancel_url: 'https://user.finishi.org/cancel',
      })
      expect(result.success).toBe(true)
    })

    it('defaults interval to "monthly"', () => {
      const result = CheckoutSchema.safeParse({
        plan: 'pro',
        success_url: 'https://app.test/success',
        cancel_url: 'https://app.test/cancel',
      })
      expect(result.success).toBe(true)
      expect(result.data!.interval).toBe('monthly')
    })

    it('accepts "yearly" interval', () => {
      const result = CheckoutSchema.safeParse({
        plan: 'enterprise',
        interval: 'yearly',
        success_url: 'https://app.test/success',
        cancel_url: 'https://app.test/cancel',
      })
      expect(result.success).toBe(true)
    })

    it('rejects invalid interval values', () => {
      const result = CheckoutSchema.safeParse({
        plan: 'pro',
        interval: 'weekly',
        success_url: 'https://app.test/success',
        cancel_url: 'https://app.test/cancel',
      })
      expect(result.success).toBe(false)
    })

    it('rejects non-HTTPS URLs (security)', () => {
      const result = CheckoutSchema.safeParse({
        plan: 'pro',
        success_url: 'http://evil.com/phish',
        cancel_url: 'https://app.test/cancel',
      })
      expect(result.success).toBe(false)
    })

    it('allows http://localhost for dev', () => {
      const result = CheckoutSchema.safeParse({
        plan: 'pro',
        success_url: 'http://localhost:5173/success',
        cancel_url: 'http://localhost:3000/cancel',
      })
      expect(result.success).toBe(true)
    })

    it('rejects javascript: URIs', () => {
      const result = CheckoutSchema.safeParse({
        plan: 'pro',
        success_url: 'javascript:alert(1)',
        cancel_url: 'https://app.test/cancel',
      })
      expect(result.success).toBe(false)
    })

    it('rejects empty plan', () => {
      const result = CheckoutSchema.safeParse({
        plan: '',
        success_url: 'https://app.test/success',
        cancel_url: 'https://app.test/cancel',
      })
      expect(result.success).toBe(false)
    })

    it('rejects extra fields (strict)', () => {
      const result = CheckoutSchema.safeParse({
        plan: 'pro',
        success_url: 'https://app.test/success',
        cancel_url: 'https://app.test/cancel',
        discount_code: 'HACK',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('CancelSubscriptionSchema', () => {
    it('passes with empty object (defaults immediate to false)', () => {
      const result = CancelSubscriptionSchema.safeParse({})
      expect(result.success).toBe(true)
      expect(result.data!.immediate).toBe(false)
    })

    it('accepts explicit immediate: true', () => {
      const result = CancelSubscriptionSchema.safeParse({ immediate: true })
      expect(result.success).toBe(true)
      expect(result.data!.immediate).toBe(true)
    })

    it('rejects extra fields (strict)', () => {
      const result = CancelSubscriptionSchema.safeParse({ immediate: false, reason: 'too expensive' })
      expect(result.success).toBe(false)
    })
  })
})

describe('Admin Schemas', () => {
  describe('WaitlistStatusSchema', () => {
    it('accepts valid statuses', () => {
      for (const status of ['pending', 'approved', 'rejected']) {
        expect(WaitlistStatusSchema.safeParse({ status }).success).toBe(true)
      }
    })

    it('rejects invalid status', () => {
      expect(WaitlistStatusSchema.safeParse({ status: 'banned' }).success).toBe(false)
    })
  })

  describe('WaitlistInviteSchema', () => {
    it('accepts array of valid emails', () => {
      const result = WaitlistInviteSchema.safeParse({
        emails: ['a@test.com', 'b@test.com'],
      })
      expect(result.success).toBe(true)
    })

    it('rejects empty array', () => {
      const result = WaitlistInviteSchema.safeParse({ emails: [] })
      expect(result.success).toBe(false)
    })

    it('rejects array with invalid emails', () => {
      const result = WaitlistInviteSchema.safeParse({
        emails: ['valid@test.com', 'not-an-email'],
      })
      expect(result.success).toBe(false)
    })

    it('rejects more than 500 emails', () => {
      const emails = Array.from({ length: 501 }, (_, i) => `user${i}@test.com`)
      const result = WaitlistInviteSchema.safeParse({ emails })
      expect(result.success).toBe(false)
    })

    it('accepts exactly 500 emails', () => {
      const emails = Array.from({ length: 500 }, (_, i) => `user${i}@test.com`)
      const result = WaitlistInviteSchema.safeParse({ emails })
      expect(result.success).toBe(true)
    })
  })

  describe('WaitlistQuerySchema', () => {
    it('accepts all valid status values including "all"', () => {
      for (const status of ['pending', 'approved', 'rejected', 'all']) {
        expect(WaitlistQuerySchema.safeParse({ status }).success).toBe(true)
      }
    })

    it('accepts empty object (all fields optional)', () => {
      expect(WaitlistQuerySchema.safeParse({}).success).toBe(true)
    })

    it('rejects search over 100 chars', () => {
      const result = WaitlistQuerySchema.safeParse({ search: 'a'.repeat(101) })
      expect(result.success).toBe(false)
    })
  })

  describe('AnalyticsQuerySchema', () => {
    it('accepts valid date format YYYY-MM-DD', () => {
      const result = AnalyticsQuerySchema.safeParse({ from: '2024-01-01', to: '2024-12-31' })
      expect(result.success).toBe(true)
    })

    it('rejects invalid date formats', () => {
      const result = AnalyticsQuerySchema.safeParse({ from: '01-01-2024' })
      expect(result.success).toBe(false)
    })

    it('accepts empty object', () => {
      expect(AnalyticsQuerySchema.safeParse({}).success).toBe(true)
    })
  })
})
