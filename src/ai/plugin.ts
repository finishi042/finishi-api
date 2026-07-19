/**
 * Fastify plugin that registers the AI provider on the Fastify instance.
 * This makes `request.server.ai` available in all route handlers.
 */

import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { getAIProvider } from './index.js'
import type { AIProvider } from './types.js'

declare module 'fastify' {
  interface FastifyInstance {
    ai: AIProvider
  }
}

async function aiPlugin(fastify: FastifyInstance) {
  const provider = getAIProvider()
  fastify.decorate('ai', provider)
  fastify.log.info({ provider: provider.name }, 'AI provider initialized')
}

export default fp(aiPlugin, { name: 'ai-plugin' })
