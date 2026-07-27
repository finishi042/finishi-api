import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import type { LearningPath } from '../../learning/types.js'
import { CreateLearningPathSchema, UpdateLearningPathSchema, LearningPathQuerySchema } from '../../learning/schemas.js'

const adminLearningPathsRoutes: FastifyPluginAsync = async (fastify) => {
  /** GET /learning-paths */
  fastify.get('/learning-paths', wrapHandler('Failed to fetch learning paths', async (request, reply) => {
    const q = LearningPathQuerySchema.safeParse(request.query)

    let query = request.supabase
      .from('learning_paths')
      .select('*')
      .order('created_at', { ascending: false })

    if (q.success && q.data.status) query = query.eq('status', q.data.status)

    const { data, error } = await query
    if (error) throw error

    const paths = data as LearningPath[]

    // Calculate total lessons per path (sum of lessons across all courses in the path)
    if (paths.length > 0) {
      const pathIds = paths.map(p => p.id)
      const { data: pathCourses } = await request.supabase
        .from('learning_path_courses')
        .select('learning_path_id, course_id')
        .in('learning_path_id', pathIds)

      // Get unique course IDs
      const courseIds = [...new Set((pathCourses ?? []).map((pc: any) => pc.course_id))]

      // Count lessons per course
      const courseLessonCounts: Record<string, number> = {}
      if (courseIds.length > 0) {
        const { data: lessonRows } = await request.supabase
          .from('lessons')
          .select('course_id')
          .in('course_id', courseIds)

        for (const row of lessonRows ?? []) {
          if (row.course_id) courseLessonCounts[row.course_id] = (courseLessonCounts[row.course_id] ?? 0) + 1
        }
      }

      // Build path → course mapping and sum lessons
      const pathLessonCounts: Record<string, number> = {}
      for (const pc of pathCourses ?? []) {
        const lessons = courseLessonCounts[(pc as any).course_id] ?? 0
        pathLessonCounts[(pc as any).learning_path_id] = (pathLessonCounts[(pc as any).learning_path_id] ?? 0) + lessons
      }

      // Also count courses per path
      const pathCourseCounts: Record<string, number> = {}
      for (const pc of pathCourses ?? []) {
        pathCourseCounts[(pc as any).learning_path_id] = (pathCourseCounts[(pc as any).learning_path_id] ?? 0) + 1
      }

      // Attach counts to each path
      for (const path of paths) {
        (path as any).lesson_count = pathLessonCounts[path.id] ?? 0;
        (path as any).course_count = pathCourseCounts[path.id] ?? 0
      }
    }

    return reply.send(formatResponse(paths))
  }))

  /** GET /learning-paths/:id */
  fastify.get<{ Params: { id: string } }>('/learning-paths/:id', wrapHandler('Failed to fetch learning path', async (request, reply) => {
    const { id } = request.params as { id: string }

    const { data: path, error } = await request.supabase
      .from('learning_paths')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return reply.code(404).send(formatError('Learning path not found'))
      throw error
    }

    // Fetch courses in this path with their lessons
    const { data: pathCourses } = await request.supabase
      .from('learning_path_courses')
      .select(`
        id, learning_path_id, course_id, order_index,
        courses:course_id ( id, title, description, skill_name, level, published, duration_minutes )
      `)
      .eq('learning_path_id', id)
      .order('order_index', { ascending: true })

    // Calculate real lesson counts per course
    const courseIds = (pathCourses ?? []).map((lpc: any) => lpc.course_id)
    const courseLessonCounts: Record<string, number> = {}
    if (courseIds.length > 0) {
      const { data: lessonRows } = await request.supabase
        .from('lessons')
        .select('course_id')
        .in('course_id', courseIds)

      for (const row of lessonRows ?? []) {
        if (row.course_id) courseLessonCounts[row.course_id] = (courseLessonCounts[row.course_id] ?? 0) + 1
      }
    }

    const courses = (pathCourses ?? []).map((lpc: any) => ({
      id: lpc.id,
      course_id: lpc.course_id,
      order_index: lpc.order_index,
      course: lpc.courses ? { ...lpc.courses, lesson_count: courseLessonCounts[lpc.course_id] ?? 0 } : null,
    }))

    return reply.send(formatResponse({ ...path, courses }))
  }))

  /** POST /learning-paths */
  fastify.post('/learning-paths', async (request, reply) => {
    const parsed = CreateLearningPathSchema.safeParse(request.body)
    if (!parsed.success)
      {return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))}

    return wrapHandler('Failed to create learning path', async (req, rep) => {
      // Validate that the skill exists
      const { data: skill } = await req.supabase
        .from('skills')
        .select('id, name')
        .eq('name', parsed.data.skill_name)
        .single()

      if (!skill) {
        return rep.code(400).send(formatError(`Skill "${parsed.data.skill_name}" does not exist. Create it first.`, 'SKILL_NOT_FOUND'))
      }

      const { data, error } = await req.supabase
        .from('learning_paths')
        .insert({ ...parsed.data, skill_id: skill.id, enrolled_count: 0, completion_rate: 0 })
        .select()
        .single()
      if (error) throw error
      return rep.code(201).send(formatResponse(data as LearningPath))
    })(request, reply)
  })

  /** PUT /learning-paths/:id */
  fastify.put<{ Params: { id: string } }>('/learning-paths/:id', async (request, reply) => {
    const parsed = UpdateLearningPathSchema.safeParse(request.body)
    if (!parsed.success)
      {return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))}

    return wrapHandler('Failed to update learning path', async (req, rep) => {
      const { id } = req.params as { id: string }
      const { data, error } = await req.supabase
        .from('learning_paths')
        .update({ ...parsed.data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) {
        if (error.code === 'PGRST116') return rep.code(404).send(formatError('Learning path not found'))
        throw error
      }
      return rep.send(formatResponse(data as LearningPath))
    })(request, reply)
  })

  /** DELETE /learning-paths/:id */
  fastify.delete<{ Params: { id: string } }>('/learning-paths/:id', wrapHandler('Failed to delete learning path', async (request, reply) => {
    const { id } = request.params as { id: string }

    // First check if the path exists
    const { data: existing } = await request.supabase
      .from('learning_paths')
      .select('id')
      .eq('id', id)
      .single()

    if (!existing) {
      return reply.code(404).send(formatError('Learning path not found', 'NOT_FOUND'))
    }

    const { error } = await request.supabase.from('learning_paths').delete().eq('id', id)
    if (error) {
      request.log.error({ error, id }, 'Failed to delete learning path')
      if (error.code === '23503') {
        return reply.code(409).send(formatError('Cannot delete learning path — it has dependent records.', 'FK_CONSTRAINT'))
      }
      throw error
    }
    return reply.send(formatResponse({ deleted: true }))
  }))
}

export default adminLearningPathsRoutes
