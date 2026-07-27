import { z } from 'zod'

export const WaitlistStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']),
})

export const WaitlistInviteSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(500),
  message: z.string().max(2000).optional(),
  subject: z.string().max(200).optional(),
  skill: z.string().max(100).optional(),
})

export const WaitlistQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'all']).optional(),
  search: z.string().max(100).optional(),
})

export const AnalyticsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

/** Generic admin email — send to any list of recipients */
export const SendEmailSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(500),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  template: z.enum(['general', 'invite', 'welcome']).default('general'),
  cta_label: z.string().max(80).optional(),
  cta_url: z.string().url().optional(),
  skill: z.string().max(100).optional(),
})
