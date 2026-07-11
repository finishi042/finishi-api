import type { FastifyRequest, FastifyReply } from 'fastify'
import { getUserRole, hasRole } from '../auth.js'
import { UserRole } from '../types.js'

export function requireRole(requiredRole: UserRole) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user
    if (!user) {
      return reply.code(401).send({
        success: false,
        error: { message: 'Authentication required', code: 'UNAUTHORIZED' },
      })
    }
    const userRole = getUserRole(user)
    if (!hasRole(user, requiredRole)) {
      request.log.warn({ userId: user.id, userRole, requiredRole }, 'Access denied - insufficient permissions')
      return reply.code(403).send({
        success: false,
        error: { message: 'Insufficient permissions', code: 'FORBIDDEN' },
      })
    }
    request.log.info({ userId: user.id, userRole }, 'Access granted')
  }
}

export const requireSuperAdmin = requireRole(UserRole.SUPER_ADMIN)
export const requireAdmin = requireRole(UserRole.ADMIN)
export const requireUser = requireRole(UserRole.USER)
