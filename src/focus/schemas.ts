import { z } from 'zod'

export const CreateFocusSessionSchema = z.object({
  duration_mins: z.number().int().min(1).max(480),
  type: z.enum(['pomodoro', 'deep-work', 'short-break', 'custom']).optional(),
  lesson_id: z.string().uuid().optional(),
  completed: z.boolean().optional(),
})

export type CreateFocusSessionInput = z.infer<typeof CreateFocusSessionSchema>
