import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import type { Skill } from '../../learning/types.js'
import { CreateSkillSchema, UpdateSkillSchema } from '../../learning/schemas.js'

const adminSkillsRoutes: FastifyPluginAsync = async (fastify) => {
  /** GET /skills */
  fastify.get('/skills', wrapHandler('Failed to fetch skills', async (request, reply) => {
    const { data, error } = await request.supabase
      .from('skills')
      .select('*')
      .order('learner_count', { ascending: false })
    if (error) throw error
    return reply.send(formatResponse(data as Skill[]))
  }))

  /** POST /skills */
  fastify.post('/skills', async (request, reply) => {
    const parsed = CreateSkillSchema.safeParse(request.body)
    if (!parsed.success)
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

    return wrapHandler('Failed to create skill', async (req, rep) => {
      const { data, error } = await req.supabase
        .from('skills')
        .insert({ ...parsed.data, learner_count: 0, lesson_count: 0 })
        .select()
        .single()
      if (error) throw error
      return rep.code(201).send(formatResponse(data as Skill))
    })(request, reply)
  })

  /** PUT /skills/:id */
  fastify.put<{ Params: { id: string } }>('/skills/:id', async (request, reply) => {
    const parsed = UpdateSkillSchema.safeParse(request.body)
    if (!parsed.success)
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

    return wrapHandler('Failed to update skill', async (req, rep) => {
      const { id } = req.params as { id: string }
      const { data, error } = await req.supabase
        .from('skills')
        .update({ ...parsed.data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) {
        if (error.code === 'PGRST116') return rep.code(404).send(formatError('Skill not found'))
        throw error
      }
      return rep.send(formatResponse(data as Skill))
    })(request, reply)
  })

  /** DELETE /skills/:id */
  fastify.delete<{ Params: { id: string } }>('/skills/:id', wrapHandler('Failed to delete skill', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { error } = await request.supabase.from('skills').delete().eq('id', id)
    if (error) throw error
    return reply.send(formatResponse({ deleted: true }))
  }))
}

export default adminSkillsRoutes
