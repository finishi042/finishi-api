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
      if (q.data.status) query = query.eq('status', q.data.status)
      if (q.data.search) query = query.ilike('title', `%${q.data.search}%`)
    }

    const { data, error, count } = await query
    if (error) throw error
    return reply.send({ ...formatResponse(data as Lesson[]), meta: { total: count ?? 0 } })
  }))

  /** POST /lessons */
  fastify.post('/lessons', async (request, reply) => {
    const parsed = CreateLessonSchema.safeParse(request.body)
    if (!parsed.success)
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

    return wrapHandler('Failed to create lesson', async (req, rep) => {
      const { data, error } = await req.supabase
        .from('lessons')
        .insert({ ...parsed.data, view_count: 0 })
        .select()
        .single()
      if (error) throw error
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
    const { error } = await request.supabase.from('lessons').delete().eq('id', id)
    if (error) throw error
    return reply.send(formatResponse({ deleted: true }))
  }))
}

export default adminLessonsRoutes
