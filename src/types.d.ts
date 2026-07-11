import type { AuthUser } from './lib/types.js'

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null
  }
}
