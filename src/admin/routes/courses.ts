import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import type { Course } from '../../learning/types.js'
import { CreateCourseSchema, UpdateCourseSchema, CourseQuerySchema } from '../../learning/schemas.js'

const adminCoursesRoutes: FastifyPluginAsync = async (fastify) => {
  /** GET /courses */
  fastify.get('/courses', wrapHandler('Failed to fetch courses', async (request, reply) => {
    const q = CourseQuerySchema.safeParse(request.query)

    let query = request.supabase
      .from('courses')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (q.success) {
      if (q.data.skill) query = query.eq('skill_name', q.data.skill)
      if (q.data.published === 'true') query = query.eq('published', true)
      if (q.data.published === 'false') query = query.eq('published', false)
      if (q.data.search) query = query.ilike('title', `%${q.data.search}%`)
    }

    const { data, error, count } = await query
    if (error) throw error

    // Calculate real lesson counts
    const courses = (data ?? []) as Course[]
    if (courses.length > 0) {
      const courseIds = courses.map(c => c.id)
      const { data: lessonCounts } = await request.supabase
        .from('lessons')
        .select('course_id')
        .in('course_id', courseIds)

      const countMap: Record<string, number> = {}
      for (const row of lessonCounts ?? []) {
        if (row.course_id) countMap[row.course_id] = (countMap[row.course_id] ?? 0) + 1
      }
      for (const course of courses) {
        course.lesson_count = countMap[course.id] ?? 0
      }
    }

    return reply.send({ ...formatResponse(courses), meta: { total: count ?? 0 } })
  }))

  /** GET /courses/:id */
  fastify.get<{ Params: { id: string } }>('/courses/:id', wrapHandler('Failed to fetch course', async (request, reply) => {
    const { id } = request.params as { id: string }

    const { data: course, error } = await request.supabase
      .from('courses')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return reply.code(404).send(formatError('Course not found'))
      throw error
    }

    // Fetch lessons for this course
    const { data: lessons } = await request.supabase
      .from('lessons')
      .select('*')
      .eq('course_id', id)
      .order('order_index', { ascending: true })

    return reply.send(formatResponse({ ...course, lessons: lessons ?? [] }))
  }))

  /** POST /courses */
  fastify.post('/courses', async (request, reply) => {
    const parsed = CreateCourseSchema.safeParse(request.body)
    if (!parsed.success)
      {return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))}

    return wrapHandler('Failed to create course', async (req, rep) => {
      // Validate skill exists
      const { data: skill } = await req.supabase
        .from('skills')
        .select('id, name')
        .eq('name', parsed.data.skill_name)
        .single()

      if (!skill) {
        return rep.code(400).send(formatError(`Skill "${parsed.data.skill_name}" does not exist.`, 'SKILL_NOT_FOUND'))
      }

      const { data, error } = await req.supabase
        .from('courses')
        .insert({
          title: parsed.data.title,
          description: parsed.data.description,
          skill_id: skill.id,
          skill_name: parsed.data.skill_name,
          level: parsed.data.level,
          published: parsed.data.published,
          order_index: parsed.data.order_index ?? 0,
          lesson_count: 0,
        })
        .select()
        .single()

      if (error) throw error
      return rep.code(201).send(formatResponse(data as Course))
    })(request, reply)
  })

  /** PUT /courses/:id */
  fastify.put<{ Params: { id: string } }>('/courses/:id', async (request, reply) => {
    const parsed = UpdateCourseSchema.safeParse(request.body)
    if (!parsed.success)
      {return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))}

    return wrapHandler('Failed to update course', async (req, rep) => {
      const { id } = req.params as { id: string }

      // If skill_name is being changed, validate it
      if (parsed.data.skill_name) {
        const { data: skill } = await req.supabase
          .from('skills')
          .select('id')
          .eq('name', parsed.data.skill_name)
          .single()
        if (!skill) {
          return rep.code(400).send(formatError(`Skill "${parsed.data.skill_name}" does not exist.`, 'SKILL_NOT_FOUND'))
        }
      }

      const { data, error } = await req.supabase
        .from('courses')
        .update({ ...parsed.data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        if (error.code === 'PGRST116') return rep.code(404).send(formatError('Course not found'))
        throw error
      }
      return rep.send(formatResponse(data as Course))
    })(request, reply)
  })

  /** DELETE /courses/:id */
  fastify.delete<{ Params: { id: string } }>('/courses/:id', wrapHandler('Failed to delete course', async (request, reply) => {
    const { id } = request.params as { id: string }

    const { data: existing } = await request.supabase
      .from('courses')
      .select('id')
      .eq('id', id)
      .single()

    if (!existing) {
      return reply.code(404).send(formatError('Course not found', 'NOT_FOUND'))
    }

    // Unlink lessons from this course (set course_id to null)
    await request.supabase
      .from('lessons')
      .update({ course_id: null })
      .eq('course_id', id)

    const { error } = await request.supabase.from('courses').delete().eq('id', id)
    if (error) {
      request.log.error({ error, id }, 'Failed to delete course')
      if (error.code === '23503') {
        return reply.code(409).send(formatError('Cannot delete course — it has dependent records.', 'FK_CONSTRAINT'))
      }
      throw error
    }
    return reply.send(formatResponse({ deleted: true }))
  }))

  /** POST /courses/:id/lessons — assign a lesson to this course */
  fastify.post<{ Params: { id: string } }>('/courses/:id/lessons', async (request, reply) => {
    const { lesson_id, order_index } = request.body as { lesson_id?: string; order_index?: number }
    if (!lesson_id) return reply.code(400).send(formatError('lesson_id is required', 'VALIDATION_ERROR'))

    return wrapHandler('Failed to assign lesson to course', async (req, rep) => {
      const { id } = req.params as { id: string }

      const { error } = await req.supabase
        .from('lessons')
        .update({ course_id: id, order_index: order_index ?? 0 })
        .eq('id', lesson_id)

      if (error) throw error
      return rep.send(formatResponse({ assigned: true }))
    })(request, reply)
  })

  /** DELETE /courses/:id/lessons/:lessonId — unassign a lesson from this course */
  fastify.delete<{ Params: { id: string; lessonId: string } }>('/courses/:id/lessons/:lessonId', wrapHandler('Failed to unassign lesson', async (request, reply) => {
    const { lessonId } = request.params as { id: string; lessonId: string }

    await request.supabase
      .from('lessons')
      .update({ course_id: null })
      .eq('id', lessonId)

    return reply.send(formatResponse({ unassigned: true }))
  }))
}

export default adminCoursesRoutes
