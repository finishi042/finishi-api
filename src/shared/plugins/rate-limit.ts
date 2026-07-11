import fp from 'fastify-plugin'
import rateLimit from '@fastify/rate-limit'
import type { FastifyPluginAsync } from 'fastify'

const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(rateLimit, {
    max: 100, // 100 requests per window
    timeWindow: '1 minute',
    allowList: [], // no IPs bypass
    keyGenerator: (request) => {
      // Use authenticated user ID if available, otherwise IP
      const user = request.user
      return user?.id ?? request.ip
    },
    errorResponseBuilder: (_request, context) => ({
      success: false,
      error: {
        message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
        code: 'RATE_LIMIT_EXCEEDED',
      },
    }),
  })

  fastify.log.info('Rate limiting configured (100 req/min)')
}

export default fp(rateLimitPlugin, {
  name: 'rate-limit',
})
