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

    // Calculate real lesson counts from the lessons table
    const skills = data as Skill[]
    if (skills.length > 0) {
      const { data: counts } = await request.supabase
        .from('lessons')
        .select('skill_name')

      const countMap: Record<string, number> = {}
      for (const row of counts ?? []) {
        countMap[row.skill_name] = (countMap[row.skill_name] ?? 0) + 1
      }

      for (const skill of skills) {
        (skill as any).lesson_count = countMap[skill.name] ?? 0
      }
    }

    return reply.send(formatResponse(skills))
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

    // First check if the skill exists
    const { data: existing } = await request.supabase
      .from('skills')
      .select('id')
      .eq('id', id)
      .single()

    if (!existing) {
      return reply.code(404).send(formatError('Skill not found', 'NOT_FOUND'))
    }

    const { error } = await request.supabase.from('skills').delete().eq('id', id)
    if (error) {
      request.log.error({ error, id }, 'Failed to delete skill')
      if (error.code === '23503') {
        return reply.code(409).send(formatError('Cannot delete skill — it has dependent records. Remove related lessons and learning paths first.', 'FK_CONSTRAINT'))
      }
      throw error
    }
    return reply.send(formatResponse({ deleted: true }))
  }))
}

export default adminSkillsRoutes
