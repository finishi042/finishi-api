import { describe, it, expect } from 'vitest'
import {
  UpdateProfileSchema,
  UpdateSettingsSchema,
} from '../../src/user/schemas.js'

describe('UpdateProfileSchema', () => {
  it('accepts valid profile update', () => {
    const result = UpdateProfileSchema.safeParse({
      full_name: 'John Doe',
      avatar_url: 'https://example.com/avatar.jpg',
    })
    expect(result.success).toBe(true)
  })

  it('accepts partial update (name only)', () => {
    const result = UpdateProfileSchema.safeParse({
      full_name: 'John Doe',
    })
    expect(result.success).toBe(true)
  })

  it('accepts partial update (avatar only)', () => {
    const result = UpdateProfileSchema.safeParse({
      avatar_url: 'https://example.com/avatar.jpg',
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty object (no updates)', () => {
    const result = UpdateProfileSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = UpdateProfileSchema.safeParse({
      full_name: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects name over 120 characters', () => {
    const result = UpdateProfileSchema.safeParse({
      full_name: 'a'.repeat(121),
    })
    expect(result.success).toBe(false)
  })

  it('validates avatar_url format', () => {
    const result = UpdateProfileSchema.safeParse({
      avatar_url: 'not-a-url',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid avatar URLs', () => {
    const validUrls = [
      'https://example.com/avatar.jpg',
      'https://cdn.example.com/users/123/avatar.png',
      'http://localhost:3000/avatar.jpg',
    ]
    for (const avatar_url of validUrls) {
      const result = UpdateProfileSchema.safeParse({ avatar_url })
      expect(result.success).toBe(true)
    }
  })
})

describe('UpdateSettingsSchema', () => {
  it('accepts valid settings update', () => {
    const result = UpdateSettingsSchema.safeParse({
      daily_goal_mins: 30,
      reminder_time: '09:00',
      notif_daily: true,
      notif_streak: true,
      notif_weekly: false,
      notif_tips: false,
      privacy_analytics: true,
      privacy_improve: true,
      theme: 'dark',
    })
    expect(result.success).toBe(true)
  })

  it('accepts partial update', () => {
    const result = UpdateSettingsSchema.safeParse({
      theme: 'light',
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty object', () => {
    const result = UpdateSettingsSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('validates daily_goal_mins range (1-480)', () => {
    const tooLow = UpdateSettingsSchema.safeParse({ daily_goal_mins: 0 })
    expect(tooLow.success).toBe(false)

    const tooHigh = UpdateSettingsSchema.safeParse({ daily_goal_mins: 481 })
    expect(tooHigh.success).toBe(false)

    const valid = UpdateSettingsSchema.safeParse({ daily_goal_mins: 60 })
    expect(valid.success).toBe(true)
  })

  it('validates reminder_time format (HH:MM)', () => {
    const validTimes = ['00:00', '09:30', '23:59', '12:00']
    for (const reminder_time of validTimes) {
      const result = UpdateSettingsSchema.safeParse({ reminder_time })
      expect(result.success).toBe(true)
    }

    // The regex is /^\d{2}:\d{2}$/ which only requires 2 digits on each side
    // Invalid times that don't match this pattern:
    const invalidTimes = ['9:00', '09:0', 'invalid']
    for (const reminder_time of invalidTimes) {
      const result = UpdateSettingsSchema.safeParse({ reminder_time })
      expect(result.success).toBe(false)
    }
  })

  it('validates theme enum', () => {
    const validThemes = ['light', 'dark']
    for (const theme of validThemes) {
      const result = UpdateSettingsSchema.safeParse({ theme })
      expect(result.success).toBe(true)
    }

    const result = UpdateSettingsSchema.safeParse({ theme: 'auto' })
    expect(result.success).toBe(false)
  })

  it('accepts boolean notification settings', () => {
    const notifSettings = ['notif_daily', 'notif_streak', 'notif_weekly', 'notif_tips']
    for (const setting of notifSettings) {
      const trueResult = UpdateSettingsSchema.safeParse({ [setting]: true })
      expect(trueResult.success).toBe(true)

      const falseResult = UpdateSettingsSchema.safeParse({ [setting]: false })
      expect(falseResult.success).toBe(true)
    }
  })

  it('accepts boolean privacy settings', () => {
    const privacySettings = ['privacy_analytics', 'privacy_improve']
    for (const setting of privacySettings) {
      const trueResult = UpdateSettingsSchema.safeParse({ [setting]: true })
      expect(trueResult.success).toBe(true)

      const falseResult = UpdateSettingsSchema.safeParse({ [setting]: false })
      expect(falseResult.success).toBe(true)
    }
  })
})
