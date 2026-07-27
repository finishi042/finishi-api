import { describe, it, expect } from 'vitest'
import {
  UpdateProgressSchema,
  SubmitQuizSchema,
  RecordLessonAttemptSchema,
  CreateSkillSchema,
  UpdateSkillSchema,
  CreateLessonSchema,
  UpdateLessonSchema,
  LessonQuerySchema,
  CreateCourseSchema,
  UpdateCourseSchema,
  CourseQuerySchema,
  CreateLearningPathSchema,
  UpdateLearningPathSchema,
  LearningPathQuerySchema,
} from '../../src/learning/schemas.js'

describe('UpdateProgressSchema', () => {
  it('accepts valid progress update', () => {
    const result = UpdateProgressSchema.safeParse({
      course_id: '550e8400-e29b-41d4-a716-446655440000',
      lesson_id: '550e8400-e29b-41d4-a716-446655440001',
      completed: true,
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid course_id (not UUID)', () => {
    const result = UpdateProgressSchema.safeParse({
      course_id: 'not-a-uuid',
      lesson_id: '550e8400-e29b-41d4-a716-446655440001',
      completed: true,
    })
    expect(result.success).toBe(false)
  })

  it('requires all fields', () => {
    const result = UpdateProgressSchema.safeParse({
      course_id: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(result.success).toBe(false)
  })
})

describe('SubmitQuizSchema', () => {
  it('accepts valid quiz submission', () => {
    const result = SubmitQuizSchema.safeParse({
      answers: [
        { question_id: 'q1', answer: 'A' },
        { question_id: 'q2', answer: 'B' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('requires at least one answer', () => {
    const result = SubmitQuizSchema.safeParse({
      answers: [],
    })
    expect(result.success).toBe(false)
  })

  it('requires answers array', () => {
    const result = SubmitQuizSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('RecordLessonAttemptSchema', () => {
  it('accepts minimal attempt', () => {
    const result = RecordLessonAttemptSchema.safeParse({
      lesson_id: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(result.success).toBe(true)
  })

  it('accepts full attempt data', () => {
    const result = RecordLessonAttemptSchema.safeParse({
      lesson_id: '550e8400-e29b-41d4-a716-446655440000',
      node_id: '550e8400-e29b-41d4-a716-446655440001',
      quiz_score: 85,
      time_spent_secs: 3600,
      hints_used: 2,
      reflection: 'Good lesson',
      completed: true,
    })
    expect(result.success).toBe(true)
  })

  it('rejects quiz_score over 100', () => {
    const result = RecordLessonAttemptSchema.safeParse({
      lesson_id: '550e8400-e29b-41d4-a716-446655440000',
      quiz_score: 101,
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative time_spent_secs', () => {
    const result = RecordLessonAttemptSchema.safeParse({
      lesson_id: '550e8400-e29b-41d4-a716-446655440000',
      time_spent_secs: -1,
    })
    expect(result.success).toBe(false)
  })

  it('rejects reflection over 2000 characters', () => {
    const result = RecordLessonAttemptSchema.safeParse({
      lesson_id: '550e8400-e29b-41d4-a716-446655440000',
      reflection: 'a'.repeat(2001),
    })
    expect(result.success).toBe(false)
  })
})

describe('CreateSkillSchema', () => {
  it('accepts valid skill', () => {
    const result = CreateSkillSchema.safeParse({
      name: 'JavaScript',
      color: '#FF5733',
    })
    expect(result.success).toBe(true)
  })

  it('accepts skill with description', () => {
    const result = CreateSkillSchema.safeParse({
      name: 'JavaScript',
      description: 'A programming language',
      color: '#FF5733',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = CreateSkillSchema.safeParse({
      name: '',
      color: '#FF5733',
    })
    expect(result.success).toBe(false)
  })

  it('rejects name over 80 characters', () => {
    const result = CreateSkillSchema.safeParse({
      name: 'a'.repeat(81),
      color: '#FF5733',
    })
    expect(result.success).toBe(false)
  })

  it('validates color format (hex)', () => {
    const invalidColors = ['red', '#FFF', 'FF5733', '#GG5733']
    for (const color of invalidColors) {
      const result = CreateSkillSchema.safeParse({ name: 'Test', color })
      expect(result.success).toBe(false)
    }
  })

  it('accepts valid hex colors', () => {
    const validColors = ['#FF5733', '#ff5733', '#000000', '#FFFFFF']
    for (const color of validColors) {
      const result = CreateSkillSchema.safeParse({ name: 'Test', color })
      expect(result.success).toBe(true)
    }
  })
})

describe('UpdateSkillSchema', () => {
  it('accepts partial update', () => {
    const result = UpdateSkillSchema.safeParse({ name: 'Updated' })
    expect(result.success).toBe(true)
  })

  it('accepts empty object', () => {
    const result = UpdateSkillSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})

describe('CreateLessonSchema', () => {
  const validLesson = {
    title: 'Introduction to Variables',
    skill_name: 'JavaScript',
    duration_mins: 30,
  }

  it('accepts minimal valid lesson', () => {
    const result = CreateLessonSchema.safeParse(validLesson)
    expect(result.success).toBe(true)
  })

  it('accepts full lesson data', () => {
    const result = CreateLessonSchema.safeParse({
      ...validLesson,
      course_id: '550e8400-e29b-41d4-a716-446655440000',
      description: 'Learn about variables',
      order_index: 1,
      status: 'published',
      content: 'Lesson content here',
      video_url: 'https://youtube.com/watch?v=123',
    })
    expect(result.success).toBe(true)
  })

  it('normalizes status to lowercase', () => {
    const result = CreateLessonSchema.safeParse({
      ...validLesson,
      status: 'PUBLISHED',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('published')
    }
  })

  it('defaults status to draft', () => {
    const result = CreateLessonSchema.safeParse(validLesson)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('draft')
    }
  })

  it('rejects duration under 1 minute', () => {
    const result = CreateLessonSchema.safeParse({ ...validLesson, duration_mins: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects duration over 480 minutes', () => {
    const result = CreateLessonSchema.safeParse({ ...validLesson, duration_mins: 481 })
    expect(result.success).toBe(false)
  })

  it('rejects empty title', () => {
    const result = CreateLessonSchema.safeParse({ ...validLesson, title: '' })
    expect(result.success).toBe(false)
  })
})

describe('UpdateLessonSchema', () => {
  it('accepts partial update', () => {
    const result = UpdateLessonSchema.safeParse({ title: 'Updated Title' })
    expect(result.success).toBe(true)
  })
})

describe('LessonQuerySchema', () => {
  it('accepts empty query', () => {
    const result = LessonQuerySchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts skill filter', () => {
    const result = LessonQuerySchema.safeParse({ skill: 'JavaScript' })
    expect(result.success).toBe(true)
  })

  it('accepts status filter', () => {
    const result = LessonQuerySchema.safeParse({ status: 'published' })
    expect(result.success).toBe(true)
  })

  it('accepts search parameter', () => {
    const result = LessonQuerySchema.safeParse({ search: 'variables' })
    expect(result.success).toBe(true)
  })

  it('rejects search over 100 characters', () => {
    const result = LessonQuerySchema.safeParse({ search: 'a'.repeat(101) })
    expect(result.success).toBe(false)
  })
})

describe('CreateCourseSchema', () => {
  const validCourse = {
    title: 'JavaScript Fundamentals',
    skill_name: 'JavaScript',
  }

  it('accepts minimal valid course', () => {
    const result = CreateCourseSchema.safeParse(validCourse)
    expect(result.success).toBe(true)
  })

  it('accepts all course levels', () => {
    const levels = ['beginner', 'intermediate', 'advanced'] as const
    for (const level of levels) {
      const result = CreateCourseSchema.safeParse({ ...validCourse, level })
      expect(result.success).toBe(true)
    }
  })

  it('defaults level to beginner', () => {
    const result = CreateCourseSchema.safeParse(validCourse)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.level).toBe('beginner')
    }
  })

  it('defaults published to false', () => {
    const result = CreateCourseSchema.safeParse(validCourse)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.published).toBe(false)
    }
  })
})

describe('UpdateCourseSchema', () => {
  it('accepts partial update', () => {
    const result = UpdateCourseSchema.safeParse({ title: 'Updated Course' })
    expect(result.success).toBe(true)
  })
})

describe('CourseQuerySchema', () => {
  it('accepts empty query', () => {
    const result = CourseQuerySchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts published filter as string', () => {
    const result = CourseQuerySchema.safeParse({ published: 'true' })
    expect(result.success).toBe(true)
  })
})

describe('CreateLearningPathSchema', () => {
  const validPath = {
    name: 'Full Stack Developer',
    skill_name: 'Web Development',
  }

  it('accepts minimal valid path', () => {
    const result = CreateLearningPathSchema.safeParse(validPath)
    expect(result.success).toBe(true)
  })

  it('normalizes status to lowercase', () => {
    const result = CreateLearningPathSchema.safeParse({
      ...validPath,
      status: 'ACTIVE',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('active')
    }
  })

  it('accepts all statuses', () => {
    const statuses = ['active', 'draft', 'archived'] as const
    for (const status of statuses) {
      const result = CreateLearningPathSchema.safeParse({ ...validPath, status })
      expect(result.success).toBe(true)
    }
  })

  it('defaults status to draft', () => {
    const result = CreateLearningPathSchema.safeParse(validPath)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('draft')
    }
  })
})

describe('UpdateLearningPathSchema', () => {
  it('accepts partial update', () => {
    const result = UpdateLearningPathSchema.safeParse({ name: 'Updated Path' })
    expect(result.success).toBe(true)
  })
})

describe('LearningPathQuerySchema', () => {
  it('accepts empty query', () => {
    const result = LearningPathQuerySchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts status filter', () => {
    const result = LearningPathQuerySchema.safeParse({ status: 'active' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid status', () => {
    const result = LearningPathQuerySchema.safeParse({ status: 'invalid' })
    expect(result.success).toBe(false)
  })
})
