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
    return reply.send(formatResponse(data as LearningPath[]))
  }))

  /** GET /learning-paths/:id */
  fastify.get<{ Params: { id: string } }>('/learning-paths/:id', wrapHandler('Failed to fetch learning path', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { data, error } = await request.supabase
      .from('learning_paths')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return reply.code(404).send(formatError('Learning path not found'))
      throw error
    }
    return reply.send(formatResponse(data as LearningPath))
  }))

  /** POST /learning-paths */
  fastify.post('/learning-paths', async (request, reply) => {
    const parsed = CreateLearningPathSchema.safeParse(request.body)
    if (!parsed.success)
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

    return wrapHandler('Failed to create learning path', async (req, rep) => {
      const { data, error } = await req.supabase
        .from('learning_paths')
        .insert({ ...parsed.data, enrolled_count: 0, completion_rate: 0 })
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
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

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
    const { error } = await request.supabase.from('learning_paths').delete().eq('id', id)
    if (error) throw error
    return reply.send(formatResponse({ deleted: true }))
  }))
}

export default adminLearningPathsRoutes
