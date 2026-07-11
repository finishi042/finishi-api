import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Plan } from '../../billing/types.js'
import { getSubscriptionService } from '../../billing/provider.js'

/**
 * Middleware factory that gates a route behind a minimum subscription plan.
 * Uses the shared SubscriptionService singleton — no per-request instantiation.
 */
export function requirePlan(minimumPlan: Plan) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user
    if (!user) {
      return reply.code(401).send({
        success: false,
        error: { message: 'Authentication required', code: 'UNAUTHORIZED' },
      })
    }

    const service = getSubscriptionService()
    const hasAccess = await service.hasAccess(user.id, minimumPlan)

    if (!hasAccess) {
      return reply.code(403).send({
        success: false,
        error: {
          message: `This feature requires a ${minimumPlan} plan or higher.`,
          code: 'PLAN_REQUIRED',
          required_plan: minimumPlan,
        },
      })
    }
  }
}
