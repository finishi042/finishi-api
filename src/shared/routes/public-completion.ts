import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError } from '../supabase.js'

/**
 * Public completion share endpoint — no auth required.
 * Allows anyone with the share URL to view a completion summary.
 */
const publicCompletionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { slug: string } }>('/completion/share/:slug', async (request, reply) => {
    try {
      const { slug } = request.params

      const { data, error } = await request.supabase
        .from('completion_summaries')
        .select('*, skill:skills(name, description, category)')
        .eq('share_url', slug)
        .single()

      if (error) {
        if (error.code === 'PGRST116') return reply.code(404).send(formatError('Summary not found'))
        throw error
      }

      // Get user's display name (no sensitive data)
      const { data: user } = await request.supabase
        .from('users')
        .select('full_name, avatar_url')
        .eq('id', data.user_id)
        .single()

      return reply.send(formatResponse({
        ...data,
        user_name: user?.full_name || 'A Finishi Learner',
        user_avatar: user?.avatar_url || null,
      }))
    } catch (err) {
      request.log.error({ err }, 'Failed to fetch shared completion')
      return reply.code(500).send(formatError('Internal server error'))
    }
  })
}

export default publicCompletionRoutes
