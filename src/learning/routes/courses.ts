import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import { parsePagination } from '../../shared/schemas.js'
import type { Course } from '../types.js'

const learningCoursesRoutes: FastifyPluginAsync = async (fastify) => {
  /** GET /courses — List available courses */
  fastify.get<{
    Querystring: { page?: string; limit?: string; level?: string }
  }>('/courses', wrapHandler('Failed to fetch courses', async (request, reply) => {
    const query = request.query as { page?: string; limit?: string; level?: string }
    const { page, limit, offset } = parsePagination(query)
    const level = query.level

    let dbQuery = request.supabase
      .from('courses')
      .select('*', { count: 'exact' })
      .eq('published', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (level && ['beginner', 'intermediate', 'advanced'].includes(level)) {
      dbQuery = dbQuery.eq('level', level)
    }

    const { data, error, count } = await dbQuery
    if (error) throw error

    return reply.send({
      ...formatResponse(data as Course[]),
      meta: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) },
    })
  }))

  /** GET /courses/enrolled — Get user's enrolled courses */
  fastify.get('/courses/enrolled', wrapHandler('Failed to fetch enrolled courses', async (request, reply) => {
    const userId = request.user?.id
    if (!userId) return reply.code(401).send(formatError('User not authenticated'))

    const { data, error } = await request.supabase
      .from('enrollments')
      .select(`*, course:courses(*)`)
      .eq('user_id', userId)
      .order('enrolled_at', { ascending: false })

    if (error) throw error
    return reply.send(formatResponse(data))
  }))

  /** GET /courses/:id — Get course details */
  fastify.get<{ Params: { id: string } }>('/courses/:id', wrapHandler('Failed to fetch course', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { data, error } = await request.supabase
      .from('courses')
      .select('*')
      .eq('id', id)
      .eq('published', true)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return reply.code(404).send(formatError('Course not found'))
      throw error
    }
    return reply.send(formatResponse(data as Course))
  }))

  /** POST /courses/:id/enroll — Enroll in a course */
  fastify.post<{ Params: { id: string } }>('/courses/:id/enroll', wrapHandler('Failed to enroll in course', async (request, reply) => {
    const userId = request.user?.id
    const { id: courseId } = request.params as { id: string }

    if (!userId) return reply.code(401).send(formatError('User not authenticated'))

    // Check if course exists
    const { data: _course, error: courseError } = await request.supabase
      .from('courses')
      .select('id')
      .eq('id', courseId)
      .eq('published', true)
      .single()

    if (courseError) {
      if (courseError.code === 'PGRST116') return reply.code(404).send(formatError('Course not found'))
      throw courseError
    }

    // Check if already enrolled
    const { data: existing } = await request.supabase
      .from('enrollments')
      .select('id')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .single()

    if (existing) return reply.code(409).send(formatError('Already enrolled in this course'))

    // Create enrollment
    const { data, error } = await request.supabase
      .from('enrollments')
      .insert({ user_id: userId, course_id: courseId, enrolled_at: new Date().toISOString() })
      .select()
      .single()

    if (error) throw error
    request.log.info({ userId, courseId }, 'User enrolled in course')
    return reply.code(201).send(formatResponse(data))
  }))
}

export default learningCoursesRoutes
