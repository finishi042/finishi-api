import { describe, it, expect } from 'vitest'
import {
  WaitlistStatusSchema,
  WaitlistInviteSchema,
  WaitlistQuerySchema,
  AnalyticsQuerySchema,
  SendEmailSchema,
} from '../../src/admin/schemas.js'

describe('WaitlistStatusSchema', () => {
  it('accepts valid statuses', () => {
    const statuses = ['pending', 'approved', 'rejected'] as const
    for (const status of statuses) {
      const result = WaitlistStatusSchema.safeParse({ status })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid status', () => {
    const result = WaitlistStatusSchema.safeParse({ status: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('requires status field', () => {
    const result = WaitlistStatusSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('WaitlistInviteSchema', () => {
  it('accepts valid invite with emails', () => {
    const result = WaitlistInviteSchema.safeParse({
      emails: ['test@example.com', 'user@example.com'],
    })
    expect(result.success).toBe(true)
  })

  it('accepts invite with optional fields', () => {
    const result = WaitlistInviteSchema.safeParse({
      emails: ['test@example.com'],
      message: 'Welcome to Finishi!',
      subject: 'You are invited',
      skill: 'Programming',
    })
    expect(result.success).toBe(true)
  })

  it('requires at least one email', () => {
    const result = WaitlistInviteSchema.safeParse({ emails: [] })
    expect(result.success).toBe(false)
  })

  it('rejects more than 500 emails', () => {
    const emails = Array.from({ length: 501 }, (_, i) => `user${i}@example.com`)
    const result = WaitlistInviteSchema.safeParse({ emails })
    expect(result.success).toBe(false)
  })

  it('validates email format', () => {
    const result = WaitlistInviteSchema.safeParse({
      emails: ['not-an-email'],
    })
    expect(result.success).toBe(false)
  })
})


describe('WaitlistQuerySchema', () => {
  it('accepts empty query', () => {
    const result = WaitlistQuerySchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts valid status filter', () => {
    const statuses = ['pending', 'approved', 'rejected', 'all'] as const
    for (const status of statuses) {
      const result = WaitlistQuerySchema.safeParse({ status })
      expect(result.success).toBe(true)
    }
  })

  it('accepts search parameter', () => {
    const result = WaitlistQuerySchema.safeParse({ search: 'john' })
    expect(result.success).toBe(true)
  })

  it('rejects search over 100 characters', () => {
    const result = WaitlistQuerySchema.safeParse({ search: 'a'.repeat(101) })
    expect(result.success).toBe(false)
  })
})

describe('AnalyticsQuerySchema', () => {
  it('accepts empty query', () => {
    const result = AnalyticsQuerySchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts valid date range', () => {
    const result = AnalyticsQuerySchema.safeParse({
      from: '2024-01-01',
      to: '2024-12-31',
    })
    expect(result.success).toBe(true)
  })

  it('validates date format (YYYY-MM-DD)', () => {
    const invalidDates = ['01-01-2024', '2024/01/01', 'invalid']
    for (const date of invalidDates) {
      const result = AnalyticsQuerySchema.safeParse({ from: date })
      expect(result.success).toBe(false)
    }
  })
})

describe('SendEmailSchema', () => {
  const validEmail = {
    emails: ['test@example.com'],
    subject: 'Test Subject',
    message: 'Test message content',
  }

  it('accepts valid email data', () => {
    const result = SendEmailSchema.safeParse(validEmail)
    expect(result.success).toBe(true)
  })

  it('accepts all template types', () => {
    const templates = ['general', 'invite', 'welcome'] as const
    for (const template of templates) {
      const result = SendEmailSchema.safeParse({ ...validEmail, template })
      expect(result.success).toBe(true)
    }
  })

  it('defaults template to general', () => {
    const result = SendEmailSchema.safeParse(validEmail)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.template).toBe('general')
    }
  })

  it('accepts optional CTA fields', () => {
    const result = SendEmailSchema.safeParse({
      ...validEmail,
      cta_label: 'Click Here',
      cta_url: 'https://example.com',
    })
    expect(result.success).toBe(true)
  })

  it('validates cta_url format', () => {
    const result = SendEmailSchema.safeParse({
      ...validEmail,
      cta_url: 'not-a-url',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty subject', () => {
    const result = SendEmailSchema.safeParse({
      ...validEmail,
      subject: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects subject over 200 characters', () => {
    const result = SendEmailSchema.safeParse({
      ...validEmail,
      subject: 'a'.repeat(201),
    })
    expect(result.success).toBe(false)
  })

  it('rejects message over 5000 characters', () => {
    const result = SendEmailSchema.safeParse({
      ...validEmail,
      message: 'a'.repeat(5001),
    })
    expect(result.success).toBe(false)
  })
})
