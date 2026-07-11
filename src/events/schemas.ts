import { z } from 'zod'

export const CreateEventSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(['webinar', 'workshop', 'live-session', 'bootcamp']),
  skill_name: z.string().min(1).max(80),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  event_time: z.string().regex(/^\d{2}:\d{2}$/),
  duration_mins: z.number().int().min(15).max(1440),
  host_name: z.string().min(1).max(120),
  host_title: z.string().max(120).optional(),
  host_avatar: z.string().url().optional(),
  capacity: z.number().int().min(1).max(100000),
  description: z.string().max(2000).optional(),
  platform: z.string().min(1).max(80),
  location: z.string().min(1).max(200),
  cover_image: z.string().url().optional(),
})

export const UpdateEventSchema = CreateEventSchema.partial().extend({
  status: z.enum(['upcoming', 'live', 'completed', 'cancelled']).optional(),
})

export const EventQuerySchema = z.object({
  status: z.enum(['upcoming', 'live', 'completed', 'cancelled', 'all']).optional(),
  type: z.enum(['webinar', 'workshop', 'live-session', 'bootcamp', 'all']).optional(),
  search: z.string().max(100).optional(),
})
