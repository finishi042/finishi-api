import { z } from 'zod'

export const UpdateProfileSchema = z.object({
  full_name: z.string().min(1).max(120).optional(),
  avatar_url: z.string().url().optional(),
})

export const UpdateSettingsSchema = z.object({
  daily_goal_mins: z.number().int().min(1).max(480).optional(),
  reminder_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  notif_daily: z.boolean().optional(),
  notif_streak: z.boolean().optional(),
  notif_weekly: z.boolean().optional(),
  notif_tips: z.boolean().optional(),
  privacy_analytics: z.boolean().optional(),
  privacy_improve: z.boolean().optional(),
  theme: z.enum(['light', 'dark']).optional(),
})

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>
