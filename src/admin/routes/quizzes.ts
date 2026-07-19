import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import { z } from 'zod'

const QuizQuestionSchema = z.object({
  id: z.string(),
  question: z.string().min(1),
  options: z.array(z.object({
    id: z.string(),
    text: z.string().min(1),
  })).min(2).max(6),
  correct_option_id: z.string().min(1),
  explanation: z.string().optional(),
})

const CreateQuizSchema = z.object({
  title: z.string().min(1).max(200),
  questions: z.array(QuizQuestionSchema).min(1),
  passing_score: z.number().int().min(0).max(100).default(70),
})

const UpdateQuizSchema = CreateQuizSchema.partial()

const adminQuizzesRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /lessons/:lessonId/quiz
   * Fetch the quiz for a specific lesson (admin view — includes correct answers).
   */
  fastify.get<{ Params: { lessonId: string } }>(
    '/lessons/:lessonId/quiz',
    wrapHandler('Failed to fetch quiz', async (request, reply) => {
      const { lessonId } = request.params as { lessonId: string }

      const { data, error } = await request.supabase
        .from('quizzes')
        .select('*')
        .eq('lesson_id', lessonId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') return reply.code(404).send(formatError('No quiz found for this lesson', 'NOT_FOUND'))
        throw error
      }

      return reply.send(formatResponse(data))
    })
  )

  /**
   * POST /lessons/:lessonId/quiz
   * Create a quiz for a lesson.
   */
  fastify.post<{ Params: { lessonId: string } }>(
    '/lessons/:lessonId/quiz',
    async (request, reply) => {
      const parsed = CreateQuizSchema.safeParse(request.body)
      if (!parsed.success)
        return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

      return wrapHandler('Failed to create quiz', async (req, rep) => {
        const { lessonId } = req.params as { lessonId: string }

        // Check lesson exists
        const { data: lesson } = await req.supabase
          .from('lessons')
          .select('id')
          .eq('id', lessonId)
          .single()

        if (!lesson) {
          return rep.code(404).send(formatError('Lesson not found', 'NOT_FOUND'))
        }

        // Check if quiz already exists
        const { data: existing } = await req.supabase
          .from('quizzes')
          .select('id')
          .eq('lesson_id', lessonId)
          .single()

        if (existing) {
          return rep.code(409).send(formatError('Quiz already exists for this lesson. Use PUT to update.', 'ALREADY_EXISTS'))
        }

        const { data, error } = await req.supabase
          .from('quizzes')
          .insert({
            lesson_id: lessonId,
            title: parsed.data.title,
            questions: parsed.data.questions,
            passing_score: parsed.data.passing_score,
          })
          .select()
          .single()

        if (error) throw error
        return rep.code(201).send(formatResponse(data))
      })(request, reply)
    }
  )

  /**
   * PUT /lessons/:lessonId/quiz
   * Update the quiz for a lesson.
   */
  fastify.put<{ Params: { lessonId: string } }>(
    '/lessons/:lessonId/quiz',
    async (request, reply) => {
      const parsed = UpdateQuizSchema.safeParse(request.body)
      if (!parsed.success)
        return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

      return wrapHandler('Failed to update quiz', async (req, rep) => {
        const { lessonId } = req.params as { lessonId: string }

        const { data, error } = await req.supabase
          .from('quizzes')
          .update({
            ...parsed.data,
            updated_at: new Date().toISOString(),
          })
          .eq('lesson_id', lessonId)
          .select()
          .single()

        if (error) {
          if (error.code === 'PGRST116') return rep.code(404).send(formatError('Quiz not found', 'NOT_FOUND'))
          throw error
        }
        return rep.send(formatResponse(data))
      })(request, reply)
    }
  )

  /**
   * DELETE /lessons/:lessonId/quiz
   * Delete the quiz for a lesson.
   */
  fastify.delete<{ Params: { lessonId: string } }>(
    '/lessons/:lessonId/quiz',
    wrapHandler('Failed to delete quiz', async (request, reply) => {
      const { lessonId } = request.params as { lessonId: string }

      const { error } = await request.supabase
        .from('quizzes')
        .delete()
        .eq('lesson_id', lessonId)

      if (error) throw error
      return reply.send(formatResponse({ deleted: true }))
    })
  )
}

export default adminQuizzesRoutes
