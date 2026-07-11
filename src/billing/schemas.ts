import { z } from 'zod'

/**
 * Validates that a URL is a proper https (or localhost http for dev) URL.
 * Prevents open-redirect and javascript: URI injection.
 */
const safeUrl = z.string().url().refine(
  (url) => {
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'https:' || parsed.hostname === 'localhost'
    } catch {
      return false
    }
  },
  { message: 'URL must use https (or http://localhost for development)' }
)

export const CheckoutSchema = z.object({
  plan: z.enum(['pro', 'enterprise']),
  interval: z.enum(['monthly', 'yearly']).optional().default('monthly'),
  success_url: safeUrl,
  cancel_url: safeUrl,
}).strict()

export const CancelSubscriptionSchema = z.object({
  immediate: z.boolean().optional().default(false),
}).strict()

export type CheckoutInput = z.infer<typeof CheckoutSchema>
export type CancelSubscriptionInput = z.infer<typeof CancelSubscriptionSchema>
