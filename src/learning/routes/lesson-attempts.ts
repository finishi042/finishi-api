import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import { RecordLessonAttemptSchema } from '../schemas.js'

/**
 * Lesson Attempts — Behavioral instrumentation (collected from day one).
 * Tracks time_spent, hints_used, reflection, quiz performance per lesson attempt.
 */
const lessonAttemptsRoutes: FastifyPluginAsync = async (fastify) => {
  /** POST /lesson-attempts — Record a lesson attempt */
  fastify.post('/lesson-attempts', async (request, reply) => {
    const parsed = RecordLessonAttemptSchema.safeParse(request.body)
    if (!parsed.success)
      {return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))}

    return wrapHandler('Failed to record lesson attempt', async (req, rep) => {
      const userId = req.user!.id
      const { lesson_id, node_id, quiz_score, time_spent_secs, hints_used, reflection, completed } = parsed.data

      const { data, error } = await req.supabase
        .from('lesson_attempts')
        .insert({
          user_id: userId,
          lesson_id,
          node_id: node_id ?? null,
          quiz_score: quiz_score ?? null,
          time_spent_secs: time_spent_secs ?? 0,
          hints_used: hints_used ?? 0,
          reflection: reflection ?? null,
          completed: completed ?? false,
        })
        .select()
        .single()

      if (error) throw error

      // If completed, also update mastery status for the concept node
      if (completed && node_id) {
        await req.supabase
          .from('mastery')
          .upsert({
            user_id: userId,
            node_id,
            status: 'in_progress',
            last_reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,node_id' })
      }

      req.log.info({ userId, lesson_id, time_spent_secs, completed }, 'Lesson attempt recorded')
      return rep.send(formatResponse(data))
    })(request, reply)
  })

  /** GET /lesson-attempts — Get user's lesson attempt history */
  fastify.get('/lesson-attempts', wrapHandler('Failed to fetch lesson attempts', async (request, reply) => {
    const userId = request.user!.id
    const { lesson_id, limit } = request.query as { lesson_id?: string; limit?: string }

    let query = request.supabase
      .from('lesson_attempts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (lesson_id) query = query.eq('lesson_id', lesson_id)
    if (limit) query = query.limit(parseInt(limit, 10))

    const { data, error } = await query
    if (error) throw error
    return reply.send(formatResponse(data))
  }))

  /** GET /lesson-attempts/stats — Aggregated stats for the user */
  fastify.get('/lesson-attempts/stats', wrapHandler('Failed to fetch attempt stats', async (request, reply) => {
    const userId = request.user!.id

    const { data, error } = await request.supabase
      .from('lesson_attempts')
      .select('time_spent_secs, completed, quiz_score')
      .eq('user_id', userId)

    if (error) throw error

    const attempts = data || []
    const totalTime = attempts.reduce((sum, a) => sum + (a.time_spent_secs || 0), 0)
    const completedCount = attempts.filter((a) => a.completed).length
    const avgQuizScore = attempts.filter((a) => a.quiz_score !== null).length > 0
      ? Math.round(attempts.filter((a) => a.quiz_score !== null).reduce((sum, a) => sum + a.quiz_score!, 0) / attempts.filter((a) => a.quiz_score !== null).length)
      : null

    return reply.send(formatResponse({
      total_attempts: attempts.length,
      completed_count: completedCount,
      total_time_mins: Math.round(totalTime / 60),
      avg_quiz_score: avgQuizScore,
    }))
  }))
}

export default lessonAttemptsRoutes
