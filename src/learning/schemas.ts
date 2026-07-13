import { z } from 'zod'

export const UpdateProgressSchema = z.object({
  course_id: z.string().uuid(),
  lesson_id: z.string().uuid(),
  completed: z.boolean(),
})

export const SubmitQuizSchema = z.object({
  answers: z.array(
    z.object({
      question_id: z.string(),
      answer: z.string(),
    })
  ).min(1),
})

export const CreateSkillSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional().default(''),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
})

export const UpdateSkillSchema = CreateSkillSchema.partial()

export const CreateLessonSchema = z.object({
  title: z.string().min(1).max(200),
  skill_name: z.string().min(1).max(80),
  description: z.string().max(1000).optional().default(''),
  duration_mins: z.number().int().min(1).max(480),
  status: z.preprocess(
    (v) => typeof v === 'string' ? v.toLowerCase() : v,
    z.enum(['published', 'draft']).default('draft')
  ),
  content: z.string().optional(),
  video_url: z.string().url().optional(),
})

export const UpdateLessonSchema = CreateLessonSchema.partial()

export const LessonQuerySchema = z.object({
  skill: z.string().optional(),
  status: z.enum(['published', 'draft']).optional(),
  search: z.string().max(100).optional(),
})

export const CreateLearningPathSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().default(''),
  skill_name: z.string().min(1).max(80),
  status: z.preprocess(
    (v) => typeof v === 'string' ? v.toLowerCase() : v,
    z.enum(['active', 'draft', 'archived']).default('draft')
  ),
})

export const UpdateLearningPathSchema = CreateLearningPathSchema.partial()

export const LearningPathQuerySchema = z.object({
  status: z.enum(['active', 'draft', 'archived']).optional(),
})

export type UpdateProgressInput = z.infer<typeof UpdateProgressSchema>
export type SubmitQuizInput = z.infer<typeof SubmitQuizSchema>
