/**
 * User-facing skills routes — browse available skills, lessons, and learning paths.
 */
import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, wrapHandler } from '../../shared/handler.js'
import { parsePagination } from '../../shared/schemas.js'

const learningSkillsRoutes: FastifyPluginAsync = async (fastify) => {
  /** GET /skills — List all available skills */
  fastify.get('/skills', wrapHandler('Failed to fetch skills', async (request, reply) => {
    const { data, error } = await request.supabase
      .from('skills')
      .select('*')
      .order('learner_count', { ascending: false })

    if (error) throw error
    return reply.send(formatResponse(data))
  }))

  /** GET /skills/:name/lessons — List published lessons for a skill */
  fastify.get<{ Params: { name: string } }>('/skills/:name/lessons', wrapHandler('Failed to fetch lessons for skill', async (request, reply) => {
    const { name } = request.params as { name: string }
    const query = request.query as { page?: string; limit?: string }
    const { page, limit, offset } = parsePagination(query)

    const { data, error, count } = await request.supabase
      .from('lessons')
      .select('id, title, skill_name, description, duration_mins, status, view_count, created_at', { count: 'exact' })
      .eq('skill_name', decodeURIComponent(name))
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error
    return reply.send({
      ...formatResponse(data),
      meta: { page, limit, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / limit) },
    })
  }))

  /** GET /skills/:name/learning-paths — List active learning paths for a skill */
  fastify.get<{ Params: { name: string } }>('/skills/:name/learning-paths', wrapHandler('Failed to fetch learning paths for skill', async (request, reply) => {
    const { name } = request.params as { name: string }

    const { data, error } = await request.supabase
      .from('learning_paths')
      .select('*')
      .eq('skill_name', decodeURIComponent(name))
      .in('status', ['active', 'draft'])
      .order('enrolled_count', { ascending: false })

    if (error) throw error
    return reply.send(formatResponse(data))
  }))
}

export default learningSkillsRoutes
