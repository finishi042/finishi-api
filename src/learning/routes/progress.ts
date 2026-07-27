import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import type { Progress } from '../types.js'
import { UpdateProgressSchema } from '../schemas.js'

const learningProgressRoutes: FastifyPluginAsync = async (fastify) => {
  /** GET /progress — Get all user's learning progress */
  fastify.get('/progress', wrapHandler('Failed to fetch progress', async (request, reply) => {
    const userId = request.user?.id
    if (!userId) return reply.code(401).send(formatError('User not authenticated'))

    const { data, error } = await request.supabase
      .from('progress')
      .select('*')
      .eq('user_id', userId)
      .order('last_accessed', { ascending: false })

    if (error) throw error
    return reply.send(formatResponse(data as Progress[]))
  }))

  /** GET /progress/:courseId — Get progress for specific course */
  fastify.get<{ Params: { courseId: string } }>('/progress/:courseId', wrapHandler('Failed to fetch progress', async (request, reply) => {
    const userId = request.user?.id
    const { courseId } = request.params as { courseId: string }
    if (!userId) return reply.code(401).send(formatError('User not authenticated'))

    const { data, error } = await request.supabase
      .from('progress')
      .select('*')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return reply.code(404).send(formatError('Progress not found'))
      throw error
    }
    return reply.send(formatResponse(data as Progress))
  }))

  /** POST /progress — Update learning progress */
  fastify.post('/progress', async (request, reply) => {
    const parsed = UpdateProgressSchema.safeParse(request.body)
    if (!parsed.success)
      {return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))}

    return wrapHandler('Failed to update progress', async (req, rep) => {
      const userId = req.user?.id
      if (!userId) return rep.code(401).send(formatError('User not authenticated'))

      const { course_id, lesson_id, completed } = parsed.data

      const { data: existing } = await req.supabase
        .from('progress').select('*').eq('user_id', userId).eq('course_id', course_id).single()

      let completedLessons: string[] = existing?.completed_lessons || []
      if (completed && !completedLessons.includes(lesson_id)) {
        completedLessons.push(lesson_id)
      } else if (!completed) {
        completedLessons = completedLessons.filter((id: string) => id !== lesson_id)
      }

      const updates = {
        user_id: userId,
        course_id,
        completed_lessons: completedLessons,
        progress_percentage: Math.min(completedLessons.length * 10, 100),
        last_accessed: new Date().toISOString(),
      }

      const result = existing
        ? await req.supabase.from('progress').update(updates).eq('id', existing.id).select().single()
        : await req.supabase.from('progress').insert(updates).select().single()

      if (result.error) throw result.error
      return rep.send(formatResponse(result.data as Progress))
    })(request, reply)
  })
}

export default learningProgressRoutes
