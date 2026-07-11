import type { FastifyRequest, FastifyReply } from 'fastify'
import { verifyToken } from '../auth.js'

const COOKIE_NAME = 'finishi_session'

/**
 * Authentication middleware.
 * Reads the token from:
 *   1. httpOnly cookie (preferred — secure against XSS)
 *   2. Authorization: Bearer header (fallback for programmatic API clients)
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    // 1. Try httpOnly cookie first
    let token: string | undefined = (request.cookies as Record<string, string | undefined>)?.[COOKIE_NAME]

    // 2. Fallback to Authorization header
    if (!token) {
      const authHeader = request.headers.authorization
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7)
      }
    }

    if (!token) {
      return reply.code(401).send({
        success: false,
        error: { message: 'Missing authentication credentials', code: 'UNAUTHORIZED' },
      })
    }

    const user = await verifyToken(token)
    request.user = user
  } catch (error) {
    request.log.error({ error }, 'Authentication failed')
    return reply.code(401).send({
      success: false,
      error: { message: 'Invalid or expired token', code: 'UNAUTHORIZED' },
    })
  }
}
