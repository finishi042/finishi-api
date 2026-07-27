import type { FastifyPluginAsync } from 'fastify'
import { formatResponse } from '../supabase.js'

/**
 * Health check routes
 */
const healthRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Root endpoint
   * Returns API info
   */
  fastify.get('/', async (_request, reply) => {
    return reply.send(
      formatResponse({
        name: 'Finishi API',
        version: '1.0.0',
        status: 'ok',
        docs: '/api/v1',
      })
    )
  })

  /**
   * Health check endpoint
   * Public endpoint to verify API is running
   */
  fastify.get('/health', async (_request, reply) => {
    return reply.send(
      formatResponse({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
      })
    )
  })

  /**
   * Readiness check endpoint
   * Verifies database connection
   */
  fastify.get('/ready', async (request, reply) => {
    try {
      // Test Supabase connection
      const { data: _data, error } = await request.supabase
        .from('users')
        .select('count')
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "not found" which is acceptable
        throw error
      }

      return reply.send(
        formatResponse({
          status: 'ready',
          database: 'connected',
          timestamp: new Date().toISOString(),
        })
      )
    } catch (error) {
      request.log.error({ error }, 'Readiness check failed')

      return reply.code(503).send(
        formatResponse(
          {
            status: 'not ready',
            database: 'disconnected',
            timestamp: new Date().toISOString(),
          },
          false
        )
      )
    }
  })
}

export default healthRoutes
