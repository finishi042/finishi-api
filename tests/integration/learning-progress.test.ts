/**
 * Integration Test: Learning Progress Tracking
 *
 * Tests the learning module including courses, lessons, and progress tracking.
 */

import { describe, it, expect } from 'vitest'
import {
  UpdateProgressSchema,
  SubmitQuizSchema,
  RecordLessonAttemptSchema,
  CreateCourseSchema,
  CreateLessonSchema,
  CreateSkillSchema,
} from '../../src/learning/schemas.js'

describe('Integration: Learning Progress', () => {
  const validUUID = '550e8400-e29b-41d4-a716-446655440000'

  describe('Course Management', () => {
    it('creates a complete course structure', () => {
      // Create skill
      const skill = CreateSkillSchema.safeParse({
        name: 'JavaScript',
        description: 'A programming language for the web',
        color: '#F7DF1E',
      })
      expect(skill.success).toBe(true)

      // Create course
      const course = CreateCourseSchema.safeParse({
        title: 'JavaScript Fundamentals',
        description: 'Learn the basics of JavaScript',
        skill_name: 'JavaScript',
        level: 'beginner',
        published: false,
      })
      expect(course.success).toBe(true)

      // Create lessons
      const lessons = [
        { title: 'Variables and Data Types', duration_mins: 30, order_index: 0 },
        { title: 'Functions', duration_mins: 45, order_index: 1 },
        { title: 'Control Flow', duration_mins: 40, order_index: 2 },
      ]

      for (const lesson of lessons) {
        const result = CreateLessonSchema.safeParse({
          ...lesson,
          skill_name: 'JavaScript',
          course_id: validUUID,
        })
        expect(result.success).toBe(true)
      }
    })

    it('validates course levels', () => {
      const levels = ['beginner', 'intermediate', 'advanced'] as const

      for (const level of levels) {
        const result = CreateCourseSchema.safeParse({
          title: 'Test Course',
          skill_name: 'Test',
          level,
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.level).toBe(level)
        }
      }
    })
  })

  describe('Progress Tracking', () => {
    it('records lesson completion', () => {
      const result = UpdateProgressSchema.safeParse({
        course_id: validUUID,
        lesson_id: '550e8400-e29b-41d4-a716-446655440001',
        completed: true,
      })
      expect(result.success).toBe(true)
    })

    it('records lesson attempt with full data', () => {
      const result = RecordLessonAttemptSchema.safeParse({
        lesson_id: validUUID,
        node_id: '550e8400-e29b-41d4-a716-446655440001',
        quiz_score: 85,
        time_spent_secs: 1800,
        hints_used: 2,
        reflection: 'This lesson helped me understand closures better.',
        completed: true,
      })
      expect(result.success).toBe(true)
    })

    it('validates quiz score range (0-100)', () => {
      const tooLow = RecordLessonAttemptSchema.safeParse({
        lesson_id: validUUID,
        quiz_score: -1,
      })
      expect(tooLow.success).toBe(false)

      const tooHigh = RecordLessonAttemptSchema.safeParse({
        lesson_id: validUUID,
        quiz_score: 101,
      })
      expect(tooHigh.success).toBe(false)

      const valid = RecordLessonAttemptSchema.safeParse({
        lesson_id: validUUID,
        quiz_score: 100,
      })
      expect(valid.success).toBe(true)
    })
  })

  describe('Quiz Submission', () => {
    it('submits quiz with multiple answers', () => {
      const result = SubmitQuizSchema.safeParse({
        answers: [
          { question_id: 'q1', answer: 'A' },
          { question_id: 'q2', answer: 'B' },
          { question_id: 'q3', answer: 'D' },
          { question_id: 'q4', answer: 'C' },
        ],
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.answers).toHaveLength(4)
      }
    })

    it('requires at least one answer', () => {
      const result = SubmitQuizSchema.safeParse({
        answers: [],
      })
      expect(result.success).toBe(false)
    })
  })

  describe('Lesson Status', () => {
    it('normalizes status to lowercase', () => {
      const statuses = ['PUBLISHED', 'Published', 'DRAFT', 'Draft']

      for (const status of statuses) {
        const result = CreateLessonSchema.safeParse({
          title: 'Test Lesson',
          skill_name: 'Test',
          duration_mins: 30,
          status,
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.status).toBe(status.toLowerCase())
        }
      }
    })

    it('defaults status to draft', () => {
      const result = CreateLessonSchema.safeParse({
        title: 'Test Lesson',
        skill_name: 'Test',
        duration_mins: 30,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe('draft')
      }
    })
  })

  describe('Content Validation', () => {
    it('accepts lesson with video URL', () => {
      const result = CreateLessonSchema.safeParse({
        title: 'Video Lesson',
        skill_name: 'Test',
        duration_mins: 30,
        video_url: 'https://youtube.com/watch?v=abc123',
        content: '# Lesson Content\n\nThis is the lesson content.',
      })
      expect(result.success).toBe(true)
    })

    it('validates video URL format', () => {
      const result = CreateLessonSchema.safeParse({
        title: 'Video Lesson',
        skill_name: 'Test',
        duration_mins: 30,
        video_url: 'not-a-valid-url',
      })
      expect(result.success).toBe(false)
    })

    it('limits reflection text to 2000 characters', () => {
      const tooLong = RecordLessonAttemptSchema.safeParse({
        lesson_id: validUUID,
        reflection: 'a'.repeat(2001),
      })
      expect(tooLong.success).toBe(false)

      const valid = RecordLessonAttemptSchema.safeParse({
        lesson_id: validUUID,
        reflection: 'a'.repeat(2000),
      })
      expect(valid.success).toBe(true)
    })
  })
})
