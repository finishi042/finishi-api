import fp from 'fastify-plugin'
import fastifyCors from '@fastify/cors'
import type { FastifyPluginAsync } from 'fastify'

/**
 * CORS plugin
 * Configures Cross-Origin Resource Sharing
 */
const corsPlugin: FastifyPluginAsync = async (fastify) => {
  const { ALLOWED_ORIGINS } = fastify.config

  // Parse allowed origins from comma-separated string
  const origins = ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())

  await fastify.register(fastifyCors, {
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400, // 24 hours
  })

  fastify.log.info({ origins }, 'CORS configured')
}

export default fp(corsPlugin, {
  name: 'cors',
})
