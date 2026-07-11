import { z } from 'zod'

export const WaitlistStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']),
})

export const WaitlistInviteSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(500),
})

export const WaitlistQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'all']).optional(),
  search: z.string().max(100).optional(),
})

export const AnalyticsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})
