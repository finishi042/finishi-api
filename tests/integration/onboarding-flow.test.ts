/**
 * Integration Test: Onboarding Flow
 *
 * Tests the complete onboarding process from start to finish.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildApp, fakeUser, createMockSupabaseChain } from '../helpers/build-app.js'
import {
  SubmitOnboardingSchema,
  SaveOnboardingProgressSchema,
} from '../../src/onboarding/schemas.js'

describe('Integration: Onboarding Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Schema Validation', () => {
    it('validates complete onboarding submission', () => {
      const validData = {
        selected_skills: ['Programming', 'Web Development'],
        learning_goal: 'Get a Job',
        skill_level: 'Beginner',
        learning_styles: ['Video Lessons', 'Practice Quizzes'],
        challenges: ['I procrastinate', 'I get distracted'],
        daily_commitment_mins: 30,
        reminder_time: 'Morning',
      }

      const result = SubmitOnboardingSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('rejects incomplete onboarding data', () => {
      const incompleteData = {
        selected_skills: ['Programming'],
        // Missing required fields
      }

      const result = SubmitOnboardingSchema.safeParse(incompleteData)
      expect(result.success).toBe(false)
    })

    it('validates step-by-step progress saving', () => {
      // Step 1: Just skills
      const step1 = SaveOnboardingProgressSchema.safeParse({
        current_step: 1,
        selected_skills: ['Programming'],
      })
      expect(step1.success).toBe(true)

      // Step 2: Add goal
      const step2 = SaveOnboardingProgressSchema.safeParse({
        current_step: 2,
        selected_skills: ['Programming'],
        learning_goal: 'Get a Job',
      })
      expect(step2.success).toBe(true)

      // Step 3: Add skill level
      const step3 = SaveOnboardingProgressSchema.safeParse({
        current_step: 3,
        selected_skills: ['Programming'],
        learning_goal: 'Get a Job',
        skill_level: 'Beginner',
      })
      expect(step3.success).toBe(true)
    })

    it('validates all supported skills', () => {
      const allSkills = [
        'UI/UX Design', 'Programming', 'Artificial Intelligence', 'Data Science',
        'Cloud Computing', 'Cybersecurity', 'Marketing', 'Business', 'Finance',
        'Mobile Dev', 'Web Development', 'Content Creation', 'Photography',
        'Video Editing', 'Music', 'Languages', 'Other',
      ]

      for (const skill of allSkills) {
        const result = SaveOnboardingProgressSchema.safeParse({
          current_step: 1,
          selected_skills: [skill],
        })
        expect(result.success).toBe(true)
      }
    })

    it('validates all learning goals', () => {
      const goals = [
        'Get a Job', 'Grow My Career', 'Start a Business', 'School',
        'Earn a Certificate', 'Personal Growth', 'Freelancing', 'Become an Expert',
      ]

      for (const goal of goals) {
        const result = SaveOnboardingProgressSchema.safeParse({
          current_step: 2,
          learning_goal: goal,
        })
        expect(result.success).toBe(true)
      }
    })
  })

  describe('Data Defaults', () => {
    it('applies default values for optional fields', () => {
      const minimalData = {
        selected_skills: ['Programming'],
        learning_goal: 'Get a Job',
        skill_level: 'Beginner',
        learning_styles: ['Video Lessons'],
        challenges: ['I procrastinate'],
        daily_commitment_mins: 30,
        reminder_time: 'Morning',
      }

      const result = SubmitOnboardingSchema.safeParse(minimalData)
      expect(result.success).toBe(true)

      if (result.success) {
        // Check defaults
        expect(result.data.ai_voice).toBe('calm_female')
        expect(result.data.voice_speed).toBe('normal')
        expect(result.data.voice_read_responses).toBe(true)
        expect(result.data.notif_daily_reminder).toBe(true)
        expect(result.data.notif_streak).toBe(true)
        expect(result.data.notif_achievements).toBe(false)
      }
    })
  })

  describe('Validation Constraints', () => {
    it('enforces daily commitment range (5-120 mins)', () => {
      const base = {
        selected_skills: ['Programming'],
        learning_goal: 'Get a Job',
        skill_level: 'Beginner',
        learning_styles: ['Video Lessons'],
        challenges: ['I procrastinate'],
        reminder_time: 'Morning',
      }

      const tooLow = SubmitOnboardingSchema.safeParse({
        ...base,
        daily_commitment_mins: 4,
      })
      expect(tooLow.success).toBe(false)

      const tooHigh = SubmitOnboardingSchema.safeParse({
        ...base,
        daily_commitment_mins: 121,
      })
      expect(tooHigh.success).toBe(false)

      const valid = SubmitOnboardingSchema.safeParse({
        ...base,
        daily_commitment_mins: 60,
      })
      expect(valid.success).toBe(true)
    })

    it('enforces current_step range (1-13)', () => {
      const tooLow = SaveOnboardingProgressSchema.safeParse({ current_step: 0 })
      expect(tooLow.success).toBe(false)

      const tooHigh = SaveOnboardingProgressSchema.safeParse({ current_step: 14 })
      expect(tooHigh.success).toBe(false)

      const validStart = SaveOnboardingProgressSchema.safeParse({ current_step: 1 })
      expect(validStart.success).toBe(true)

      const validEnd = SaveOnboardingProgressSchema.safeParse({ current_step: 13 })
      expect(validEnd.success).toBe(true)
    })
  })
})
