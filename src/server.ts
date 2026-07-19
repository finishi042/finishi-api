import Fastify, { type FastifyError } from 'fastify'
import fastifyEnv from '@fastify/env'
import fastifyCookie from '@fastify/cookie'

// Type augmentations
import './types/request.js'

// Shared plugins
import { corsPlugin, supabasePlugin, authPlugin, rateLimitPlugin } from './shared/plugins/index.js'
import aiPlugin from './ai/plugin.js'

// Shared routes
import healthRoutes from './shared/routes/health.js'
import webhookRoutes from './shared/routes/webhooks.js'
import publicCompletionRoutes from './shared/routes/public-completion.js'

// Auth module (public — signup, login, logout, refresh)
import { authRoutes, adminAuthRoutes, googleAuthRoutes } from './auth/index.js'

// Domain modules
import { userRoutes } from './user/index.js'
import { learningRoutes } from './learning/index.js'
import { eventsRoutes } from './events/index.js'
import { notificationsRoutes } from './notifications/index.js'
import { focusRoutes } from './focus/index.js'
import { adminRoutes } from './admin/index.js'

// Billing (subscription routes registered under /user)
import userSubscriptionRoutes from './billing/routes.js'

// Environment schema
const envSchema = {
  type: 'object',
  required: [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_JWT_SECRET',
  ],
  properties: {
    PORT: { type: 'string', default: '3000' },
    NODE_ENV: { type: 'string', default: 'development' },
    LOG_LEVEL: { type: 'string', default: 'info' },
    SUPABASE_URL: { type: 'string' },
    SUPABASE_ANON_KEY: { type: 'string' },
    SUPABASE_SERVICE_ROLE_KEY: { type: 'string' },
    SUPABASE_JWT_SECRET: { type: 'string' },
    ALLOWED_ORIGINS: { type: 'string', default: 'http://localhost:5173,http://localhost:5174' },
    GOOGLE_REDIRECT_URL: { type: 'string', default: '' },
    FRONTEND_URL: { type: 'string', default: 'http://localhost:5173' },
    PAYMENT_ENCRYPTION_KEY: { type: 'string', default: '' },
    AI_PROVIDER: { type: 'string', default: 'mock' },
    AI_API_KEY: { type: 'string', default: '' },
    AI_MODEL: { type: 'string', default: '' },
    AI_BASE_URL: { type: 'string', default: '' },
    AI_MAX_TOKENS: { type: 'string', default: '2048' },
    AI_TEMPERATURE: { type: 'string', default: '0.7' },
  },
}

// Create Fastify instance
const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport:
      process.env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
          }
        : undefined,
  },
  requestIdHeader: 'x-request-id',
  bodyLimit: 1_048_576,
})

// Declare config types
declare module 'fastify' {
  interface FastifyInstance {
    config: {
      PORT: string
      NODE_ENV: string
      LOG_LEVEL: string
      SUPABASE_URL: string
      SUPABASE_ANON_KEY: string
      SUPABASE_SERVICE_ROLE_KEY: string
      SUPABASE_JWT_SECRET: string
      ALLOWED_ORIGINS: string
      GOOGLE_REDIRECT_URL: string
      FRONTEND_URL: string
      PAYMENT_ENCRYPTION_KEY: string
      AI_PROVIDER: string
      AI_API_KEY: string
      AI_MODEL: string
      AI_BASE_URL: string
      AI_MAX_TOKENS: string
      AI_TEMPERATURE: string
    }
  }
}

async function start() {
  try {
    // Environment
    await fastify.register(fastifyEnv, { schema: envSchema, dotenv: true })

    fastify.log.info(
      { nodeEnv: fastify.config.NODE_ENV, port: fastify.config.PORT },
      'Starting Finishi API'
    )

    // Core plugins
    await fastify.register(corsPlugin)
    await fastify.register(rateLimitPlugin)
    await fastify.register(fastifyCookie)
    await fastify.register(supabasePlugin)
    await fastify.register(authPlugin)
    await fastify.register(aiPlugin)

    // ── Routes ──────────────────────────────────────────────────────────

    // Public / shared
    await fastify.register(healthRoutes)
    await fastify.register(webhookRoutes, { prefix: '/api/v1' })
    await fastify.register(publicCompletionRoutes, { prefix: '/api/v1/public' })

    // Auth routes (public — no authenticate middleware)
    await fastify.register(authRoutes, { prefix: '/api/v1/auth' })
    await fastify.register(adminAuthRoutes, { prefix: '/api/v1/auth' })
    await fastify.register(googleAuthRoutes, { prefix: '/api/v1/auth' })

    // User-facing domain routes
    await fastify.register(userRoutes, { prefix: '/api/v1/user' })
    await fastify.register(learningRoutes, { prefix: '/api/v1/user' })
    await fastify.register(eventsRoutes, { prefix: '/api/v1/user' })
    await fastify.register(notificationsRoutes, { prefix: '/api/v1/user' })
    await fastify.register(focusRoutes, { prefix: '/api/v1/user' })
    await fastify.register(userSubscriptionRoutes, { prefix: '/api/v1/user' })

    // Admin routes
    await fastify.register(adminRoutes, { prefix: '/api/v1/admin' })

    // ── Error handling ──────────────────────────────────────────────────

    fastify.setErrorHandler((error: FastifyError, request, reply) => {
      request.log.error({ error, url: request.url }, 'Request error')

      if (error.validation) {
        return reply.code(400).send({
          success: false,
          error: { message: 'Validation error', code: 'VALIDATION_ERROR', details: error.validation },
        })
      }

      if (error.statusCode) {
        return reply.code(error.statusCode).send({
          success: false,
          error: { message: error.message, code: error.code || 'ERROR' },
        })
      }

      return reply.code(500).send({
        success: false,
        error: { message: 'Internal server error', code: 'INTERNAL_ERROR' },
      })
    })

    fastify.setNotFoundHandler((_request, reply) => {
      reply.code(404).send({
        success: false,
        error: { message: 'Route not found', code: 'NOT_FOUND' },
      })
    })

    // Start listening
    const port = parseInt(fastify.config.PORT, 10)
    await fastify.listen({ port, host: '0.0.0.0' })
    fastify.log.info(`Server listening on http://0.0.0.0:${port}`)
  } catch (error) {
    fastify.log.error(error)
    process.exit(1)
  }
}

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  fastify.log.info(`${signal} received, shutting down gracefully`)
  try {
    await fastify.close()
    process.exit(0)
  } catch (error) {
    fastify.log.error({ error }, 'Error during shutdown')
    process.exit(1)
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('uncaughtException', (error) => { fastify.log.error({ error }, 'Uncaught exception'); process.exit(1) })
process.on('unhandledRejection', (reason, promise) => { fastify.log.error({ reason, promise }, 'Unhandled rejection'); process.exit(1) })

start()
