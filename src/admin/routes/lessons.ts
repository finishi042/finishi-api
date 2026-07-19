import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import type { Lesson } from '../../learning/types.js'
import { CreateLessonSchema, UpdateLessonSchema, LessonQuerySchema } from '../../learning/schemas.js'

const adminLessonsRoutes: FastifyPluginAsync = async (fastify) => {
  /** GET /lessons */
  fastify.get('/lessons', wrapHandler('Failed to fetch lessons', async (request, reply) => {
    const q = LessonQuerySchema.safeParse(request.query)

    let query = request.supabase
      .from('lessons')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (q.success) {
      if (q.data.skill) query = query.eq('skill_name', q.data.skill)
      if (q.data.course_id) query = query.eq('course_id', q.data.course_id)
      if (q.data.status) query = query.eq('status', q.data.status)
      if (q.data.search) query = query.ilike('title', `%${q.data.search}%`)
    }

    const { data, error, count } = await query
    if (error) throw error
    return reply.send({ ...formatResponse(data as Lesson[]), meta: { total: count ?? 0 } })
  }))

  /** GET /lessons/:id */
  fastify.get<{ Params: { id: string } }>('/lessons/:id', wrapHandler('Failed to fetch lesson', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { data, error } = await request.supabase
      .from('lessons')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return reply.code(404).send(formatError('Lesson not found'))
      throw error
    }
    return reply.send(formatResponse(data as Lesson))
  }))

  /** POST /lessons */
  fastify.post('/lessons', async (request, reply) => {
    const parsed = CreateLessonSchema.safeParse(request.body)
    if (!parsed.success)
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

    return wrapHandler('Failed to create lesson', async (req, rep) => {
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
        .from('lessons')
        .insert({ ...parsed.data, skill_id: skill.id, view_count: 0 })
        .select()
        .single()
      if (error) throw error

      // Increment the skill's lesson_count
      const { data: currentSkill } = await req.supabase
        .from('skills')
        .select('lesson_count')
        .eq('id', skill.id)
        .single()
      await req.supabase
        .from('skills')
        .update({ lesson_count: ((currentSkill as any)?.lesson_count ?? 0) + 1 })
        .eq('id', skill.id)

      return rep.code(201).send(formatResponse(data as Lesson))
    })(request, reply)
  })

  /** PUT /lessons/:id */
  fastify.put<{ Params: { id: string } }>('/lessons/:id', async (request, reply) => {
    const parsed = UpdateLessonSchema.safeParse(request.body)
    if (!parsed.success)
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

    return wrapHandler('Failed to update lesson', async (req, rep) => {
      const { id } = req.params as { id: string }
      const { data, error } = await req.supabase
        .from('lessons')
        .update({ ...parsed.data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) {
        if (error.code === 'PGRST116') return rep.code(404).send(formatError('Lesson not found'))
        throw error
      }
      return rep.send(formatResponse(data as Lesson))
    })(request, reply)
  })

  /** DELETE /lessons/:id */
  fastify.delete<{ Params: { id: string } }>('/lessons/:id', wrapHandler('Failed to delete lesson', async (request, reply) => {
    const { id } = request.params as { id: string }

    // Get the lesson's skill_name before deleting
    const { data: lesson } = await request.supabase
      .from('lessons')
      .select('skill_name')
      .eq('id', id)
      .single()

    if (!lesson) {
      return reply.code(404).send(formatError('Lesson not found', 'NOT_FOUND'))
    }

    const { error } = await request.supabase.from('lessons').delete().eq('id', id)
    if (error) {
      request.log.error({ error, id }, 'Failed to delete lesson')
      if (error.code === '23503') {
        return reply.code(409).send(formatError('Cannot delete lesson — it is referenced by other records.', 'FK_CONSTRAINT'))
      }
      throw error
    }

    // Decrement the skill's lesson_count
    if (lesson.skill_name) {
      const { data: skill } = await request.supabase
        .from('skills')
        .select('id, lesson_count')
        .eq('name', lesson.skill_name)
        .single()
      if (skill) {
        await request.supabase
          .from('skills')
          .update({ lesson_count: Math.max(0, (skill.lesson_count ?? 1) - 1) })
          .eq('id', skill.id)
      }
    }

    return reply.send(formatResponse({ deleted: true }))
  }))
}

export default adminLessonsRoutes
