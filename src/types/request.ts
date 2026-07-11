import type { AuthUser } from '../shared/types.js'

/**
 * Override @fastify/jwt's user type so `request.user` is typed as AuthUser
 * throughout the app. The authenticate middleware assigns this after JWT verification.
 */
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: AuthUser
  }
}
