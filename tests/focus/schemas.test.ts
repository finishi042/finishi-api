import { describe, it, expect } from 'vitest'
import { CreateFocusSessionSchema } from '../../src/focus/schemas.js'

describe('CreateFocusSessionSchema', () => {
  it('accepts valid focus session with required fields only', () => {
    const result = CreateFocusSessionSchema.safeParse({
      duration_mins: 25,
    })
    expect(result.success).toBe(true)
  })

  it('accepts all session types', () => {
    const types = ['pomodoro', 'deep-work', 'short-break', 'custom'] as const
    for (const type of types) {
      const result = CreateFocusSessionSchema.safeParse({
        duration_mins: 25,
        type,
      })
      expect(result.success).toBe(true)
    }
  })

  it('accepts optional lesson_id as UUID', () => {
    const result = CreateFocusSessionSchema.safeParse({
      duration_mins: 25,
      lesson_id: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid lesson_id (not UUID)', () => {
    const result = CreateFocusSessionSchema.safeParse({
      duration_mins: 25,
      lesson_id: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })

  it('accepts completed flag', () => {
    const result = CreateFocusSessionSchema.safeParse({
      duration_mins: 25,
      completed: true,
    })
    expect(result.success).toBe(true)
  })

  it('rejects duration under 1 minute', () => {
    const result = CreateFocusSessionSchema.safeParse({
      duration_mins: 0,
    })
    expect(result.success).toBe(false)
  })

  it('rejects duration over 480 minutes (8 hours)', () => {
    const result = CreateFocusSessionSchema.safeParse({
      duration_mins: 481,
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-integer duration', () => {
    const result = CreateFocusSessionSchema.safeParse({
      duration_mins: 25.5,
    })
    expect(result.success).toBe(false)
  })

  it('requires duration_mins', () => {
    const result = CreateFocusSessionSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('accepts full valid session', () => {
    const result = CreateFocusSessionSchema.safeParse({
      duration_mins: 50,
      type: 'deep-work',
      lesson_id: '550e8400-e29b-41d4-a716-446655440000',
      completed: false,
    })
    expect(result.success).toBe(true)
  })
})
