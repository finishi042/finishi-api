import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { initSupabase, getSupabase } from '../supabase.js'

/**
 * Supabase plugin
 * Initializes Supabase client and makes it available throughout the app
 */
const supabasePlugin: FastifyPluginAsync = async (fastify) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = fastify.config

  // Initialize Supabase client
  const supabase = initSupabase(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  fastify.log.info('Supabase client initialized')

  // Decorate fastify instance with supabase client
  fastify.decorate('supabase', supabase)

  // Add hook to make supabase available in request context
  fastify.addHook('onRequest', async (request) => {
    request.supabase = getSupabase()
  })
}

export default fp(supabasePlugin, {
  name: 'supabase',
})

// Type declarations for TypeScript
declare module 'fastify' {
  interface FastifyInstance {
    supabase: ReturnType<typeof getSupabase>
  }

  interface FastifyRequest {
    supabase: ReturnType<typeof getSupabase>
  }
}
