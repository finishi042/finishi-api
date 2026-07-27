import { describe, it, expect } from 'vitest'
import {
  SubmitOnboardingSchema,
  SaveOnboardingProgressSchema,
  SKILL_OPTIONS,
  GOAL_OPTIONS,
  SKILL_LEVEL_OPTIONS,
  LEARNING_STYLE_OPTIONS,
  CHALLENGE_OPTIONS,
  REMINDER_TIME_OPTIONS,
  VOICE_OPTIONS,
  VOICE_SPEED_OPTIONS,
} from '../../src/onboarding/schemas.js'

describe('SubmitOnboardingSchema', () => {
  const validOnboarding = {
    selected_skills: ['Programming', 'Web Development'],
    learning_goal: 'Get a Job' as const,
    skill_level: 'Beginner' as const,
    learning_styles: ['Video Lessons'] as const[],
    challenges: ['I procrastinate'] as const[],
    daily_commitment_mins: 30,
    reminder_time: 'Morning' as const,
  }

  it('accepts valid onboarding data', () => {
    const result = SubmitOnboardingSchema.safeParse(validOnboarding)
    expect(result.success).toBe(true)
  })

  it('requires at least one skill', () => {
    const result = SubmitOnboardingSchema.safeParse({
      ...validOnboarding,
      selected_skills: [],
    })
    expect(result.success).toBe(false)
  })

  it('requires at least one learning style', () => {
    const result = SubmitOnboardingSchema.safeParse({
      ...validOnboarding,
      learning_styles: [],
    })
    expect(result.success).toBe(false)
  })

  it('requires at least one challenge', () => {
    const result = SubmitOnboardingSchema.safeParse({
      ...validOnboarding,
      challenges: [],
    })
    expect(result.success).toBe(false)
  })

  it('validates daily_commitment_mins range (5-120)', () => {
    const tooLow = SubmitOnboardingSchema.safeParse({
      ...validOnboarding,
      daily_commitment_mins: 4,
    })
    expect(tooLow.success).toBe(false)

    const tooHigh = SubmitOnboardingSchema.safeParse({
      ...validOnboarding,
      daily_commitment_mins: 121,
    })
    expect(tooHigh.success).toBe(false)

    const valid = SubmitOnboardingSchema.safeParse({
      ...validOnboarding,
      daily_commitment_mins: 60,
    })
    expect(valid.success).toBe(true)
  })

  it('validates learning_goal enum', () => {
    for (const goal of GOAL_OPTIONS) {
      const result = SubmitOnboardingSchema.safeParse({
        ...validOnboarding,
        learning_goal: goal,
      })
      expect(result.success).toBe(true)
    }
  })

  it('validates skill_level enum', () => {
    for (const level of SKILL_LEVEL_OPTIONS) {
      const result = SubmitOnboardingSchema.safeParse({
        ...validOnboarding,
        skill_level: level,
      })
      expect(result.success).toBe(true)
    }
  })

  it('validates reminder_time enum', () => {
    for (const time of REMINDER_TIME_OPTIONS) {
      const result = SubmitOnboardingSchema.safeParse({
        ...validOnboarding,
        reminder_time: time,
      })
      expect(result.success).toBe(true)
    }
  })

  it('validates voice options', () => {
    for (const voice of VOICE_OPTIONS) {
      const result = SubmitOnboardingSchema.safeParse({
        ...validOnboarding,
        ai_voice: voice,
      })
      expect(result.success).toBe(true)
    }
  })

  it('validates voice_speed options', () => {
    for (const speed of VOICE_SPEED_OPTIONS) {
      const result = SubmitOnboardingSchema.safeParse({
        ...validOnboarding,
        voice_speed: speed,
      })
      expect(result.success).toBe(true)
    }
  })

  it('defaults ai_voice to calm_female', () => {
    const result = SubmitOnboardingSchema.safeParse(validOnboarding)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.ai_voice).toBe('calm_female')
    }
  })

  it('defaults voice_speed to normal', () => {
    const result = SubmitOnboardingSchema.safeParse(validOnboarding)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.voice_speed).toBe('normal')
    }
  })

  it('defaults notification settings', () => {
    const result = SubmitOnboardingSchema.safeParse(validOnboarding)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.notif_daily_reminder).toBe(true)
      expect(result.data.notif_streak).toBe(true)
      expect(result.data.notif_achievements).toBe(false)
      expect(result.data.notif_suggestions).toBe(false)
      expect(result.data.notif_weekly_report).toBe(false)
    }
  })

  it('rejects unknown fields (strict mode)', () => {
    const result = SubmitOnboardingSchema.safeParse({
      ...validOnboarding,
      unknown_field: 'value',
    })
    expect(result.success).toBe(false)
  })
})

describe('SaveOnboardingProgressSchema', () => {
  it('accepts minimal progress (just step)', () => {
    const result = SaveOnboardingProgressSchema.safeParse({
      current_step: 1,
    })
    expect(result.success).toBe(true)
  })

  it('accepts partial data at any step', () => {
    const result = SaveOnboardingProgressSchema.safeParse({
      current_step: 3,
      selected_skills: ['Programming'],
      learning_goal: 'Get a Job',
    })
    expect(result.success).toBe(true)
  })

  it('validates current_step range (1-13)', () => {
    const tooLow = SaveOnboardingProgressSchema.safeParse({ current_step: 0 })
    expect(tooLow.success).toBe(false)

    const tooHigh = SaveOnboardingProgressSchema.safeParse({ current_step: 14 })
    expect(tooHigh.success).toBe(false)

    const valid = SaveOnboardingProgressSchema.safeParse({ current_step: 7 })
    expect(valid.success).toBe(true)
  })

  it('requires current_step', () => {
    const result = SaveOnboardingProgressSchema.safeParse({
      selected_skills: ['Programming'],
    })
    expect(result.success).toBe(false)
  })

  it('rejects unknown fields (strict mode)', () => {
    const result = SaveOnboardingProgressSchema.safeParse({
      current_step: 1,
      unknown_field: 'value',
    })
    expect(result.success).toBe(false)
  })
})

describe('Option constants', () => {
  it('SKILL_OPTIONS has expected values', () => {
    expect(SKILL_OPTIONS).toContain('Programming')
    expect(SKILL_OPTIONS).toContain('Web Development')
    expect(SKILL_OPTIONS).toContain('UI/UX Design')
    expect(SKILL_OPTIONS.length).toBeGreaterThan(10)
  })

  it('GOAL_OPTIONS has expected values', () => {
    expect(GOAL_OPTIONS).toContain('Get a Job')
    expect(GOAL_OPTIONS).toContain('Grow My Career')
    expect(GOAL_OPTIONS).toContain('Start a Business')
  })

  it('LEARNING_STYLE_OPTIONS has expected values', () => {
    expect(LEARNING_STYLE_OPTIONS).toContain('Video Lessons')
    expect(LEARNING_STYLE_OPTIONS).toContain('Reading')
    expect(LEARNING_STYLE_OPTIONS).toContain('Practice Quizzes')
  })

  it('CHALLENGE_OPTIONS has expected values', () => {
    expect(CHALLENGE_OPTIONS).toContain('I procrastinate')
    expect(CHALLENGE_OPTIONS).toContain('I get distracted')
    expect(CHALLENGE_OPTIONS).toContain('I lose motivation')
  })
})
