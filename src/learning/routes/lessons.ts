import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import type { Lesson } from '../types.js'

const learningLessonsRoutes: FastifyPluginAsync = async (fastify) => {
  /** GET /lessons/:id — Get lesson content for a published lesson */
  fastify.get<{ Params: { id: string } }>('/lessons/:id', wrapHandler('Failed to fetch lesson', async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = request.user!.id

    const { data, error } = await request.supabase
      .from('lessons')
      .select('*')
      .eq('id', id)
      .eq('status', 'published')
      .single()

    if (error) {
      if (error.code === 'PGRST116') return reply.code(404).send(formatError('Lesson not found'))
      throw error
    }

    // Increment view count (fire-and-forget)
    request.supabase
      .from('lessons')
      .update({ view_count: (data.view_count ?? 0) + 1 })
      .eq('id', id)
      .then(() => {})

    // Get user's progress for this lesson
    const { data: progress } = await request.supabase
      .from('progress')
      .select('completed_lessons, last_accessed')
      .eq('user_id', userId)
      .contains('completed_lessons', [id])
      .single()

    return reply.send(
      formatResponse({
        ...(data as Lesson),
        is_completed: !!progress,
      })
    )
  }))

  /** GET /lessons/:id/quiz — Get quiz questions for a lesson */
  fastify.get<{ Params: { id: string } }>('/lessons/:id/quiz', wrapHandler('Failed to fetch quiz', async (request, reply) => {
    const { id: lessonId } = request.params as { id: string }

    const { data, error } = await request.supabase
      .from('quizzes')
      .select('id, lesson_id, title, questions, passing_score')
      .eq('lesson_id', lessonId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return reply.code(404).send(formatError('No quiz found for this lesson'))
      throw error
    }
    return reply.send(formatResponse(data))
  }))
}

export default learningLessonsRoutes
