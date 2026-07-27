import { describe, it, expect } from 'vitest'
import {
  CreateEventSchema,
  UpdateEventSchema,
  EventQuerySchema,
} from '../../src/events/schemas.js'

describe('CreateEventSchema', () => {
  const validEvent = {
    title: 'Introduction to React',
    type: 'webinar',
    skill_name: 'Web Development',
    event_date: '2024-06-15',
    event_time: '14:00',
    duration_mins: 60,
    host_name: 'John Doe',
    capacity: 100,
    platform: 'Zoom',
    location: 'Online',
  }

  it('accepts valid event data', () => {
    const result = CreateEventSchema.safeParse(validEvent)
    expect(result.success).toBe(true)
  })

  it('accepts all event types', () => {
    const types = ['webinar', 'workshop', 'live-session', 'bootcamp'] as const
    for (const type of types) {
      const result = CreateEventSchema.safeParse({ ...validEvent, type })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid event type', () => {
    const result = CreateEventSchema.safeParse({ ...validEvent, type: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('rejects empty title', () => {
    const result = CreateEventSchema.safeParse({ ...validEvent, title: '' })
    expect(result.success).toBe(false)
  })

  it('rejects title over 200 characters', () => {
    const result = CreateEventSchema.safeParse({ ...validEvent, title: 'a'.repeat(201) })
    expect(result.success).toBe(false)
  })

  it('validates date format (YYYY-MM-DD)', () => {
    const invalidDates = ['2024/06/15', '15-06-2024', '06-15-2024', 'invalid']
    for (const date of invalidDates) {
      const result = CreateEventSchema.safeParse({ ...validEvent, event_date: date })
      expect(result.success).toBe(false)
    }
  })

  it('validates time format (HH:MM)', () => {
    const invalidTimes = ['2:00', '14:0', '14:00:00', 'invalid']
    for (const time of invalidTimes) {
      const result = CreateEventSchema.safeParse({ ...validEvent, event_time: time })
      expect(result.success).toBe(false)
    }
  })

  it('rejects duration under 15 minutes', () => {
    const result = CreateEventSchema.safeParse({ ...validEvent, duration_mins: 10 })
    expect(result.success).toBe(false)
  })

  it('rejects duration over 1440 minutes (24 hours)', () => {
    const result = CreateEventSchema.safeParse({ ...validEvent, duration_mins: 1441 })
    expect(result.success).toBe(false)
  })

  it('rejects capacity under 1', () => {
    const result = CreateEventSchema.safeParse({ ...validEvent, capacity: 0 })
    expect(result.success).toBe(false)
  })

  it('accepts optional fields', () => {
    const withOptional = {
      ...validEvent,
      host_title: 'Senior Developer',
      host_avatar: 'https://example.com/avatar.jpg',
      description: 'Learn React basics',
      cover_image: 'https://example.com/cover.jpg',
    }
    const result = CreateEventSchema.safeParse(withOptional)
    expect(result.success).toBe(true)
  })

  it('validates URL format for optional URLs', () => {
    const result = CreateEventSchema.safeParse({
      ...validEvent,
      host_avatar: 'not-a-url',
    })
    expect(result.success).toBe(false)
  })
})

describe('UpdateEventSchema', () => {
  it('accepts partial updates', () => {
    const result = UpdateEventSchema.safeParse({ title: 'Updated Title' })
    expect(result.success).toBe(true)
  })

  it('accepts status updates', () => {
    const statuses = ['upcoming', 'live', 'completed', 'cancelled'] as const
    for (const status of statuses) {
      const result = UpdateEventSchema.safeParse({ status })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid status', () => {
    const result = UpdateEventSchema.safeParse({ status: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('accepts empty object (no updates)', () => {
    const result = UpdateEventSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})

describe('EventQuerySchema', () => {
  it('accepts empty query (defaults)', () => {
    const result = EventQuerySchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts valid status filter', () => {
    const statuses = ['upcoming', 'live', 'completed', 'cancelled', 'all'] as const
    for (const status of statuses) {
      const result = EventQuerySchema.safeParse({ status })
      expect(result.success).toBe(true)
    }
  })

  it('accepts valid type filter', () => {
    const types = ['webinar', 'workshop', 'live-session', 'bootcamp', 'all'] as const
    for (const type of types) {
      const result = EventQuerySchema.safeParse({ type })
      expect(result.success).toBe(true)
    }
  })

  it('accepts search parameter', () => {
    const result = EventQuerySchema.safeParse({ search: 'react' })
    expect(result.success).toBe(true)
  })

  it('rejects search over 100 characters', () => {
    const result = EventQuerySchema.safeParse({ search: 'a'.repeat(101) })
    expect(result.success).toBe(false)
  })
})
