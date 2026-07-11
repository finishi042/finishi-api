import type { FastifyPluginAsync } from 'fastify'
import { authenticate } from '../shared/middleware/auth.js'
import { requireUser } from '../shared/middleware/rbac.js'
import { formatResponse, formatError, wrapHandler } from '../shared/handler.js'
import { getSubscriptionService } from './provider.js'
import { PLANS, type BillingInterval } from './types.js'
import { CheckoutSchema, CancelSubscriptionSchema } from './schemas.js'

const userSubscriptionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', authenticate)
  fastify.addHook('onRequest', requireUser)

  /** GET /subscription — Get current subscription and available plans */
  fastify.get('/subscription', wrapHandler('Failed to fetch subscription', async (request, reply) => {
    const userId = request.user!.id
    const service = getSubscriptionService()
    const subscription = await service.getSubscription(userId)

    return reply.send(
      formatResponse({
        subscription,
        plans: PLANS,
      })
    )
  }))

  /** POST /subscription/checkout — Create a checkout session to upgrade */
  fastify.post('/subscription/checkout', async (request, reply) => {
    const parsed = CheckoutSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))
    }

    const { plan, interval, success_url, cancel_url } = parsed.data

    return wrapHandler('Failed to create checkout', async (req, rep) => {
      const userId = req.user!.id
      const email = req.user!.email ?? ''
      const service = getSubscriptionService()

      const result = await service.createCheckout({
        userId,
        email,
        plan,
        interval: interval as BillingInterval,
        successUrl: success_url,
        cancelUrl: cancel_url,
      })

      req.log.info({ userId, plan, interval }, 'Checkout session created')
      return rep.send(formatResponse(result))
    })(request, reply)
  })

  /** POST /subscription/cancel — Cancel the current subscription */
  fastify.post('/subscription/cancel', async (request, reply) => {
    const parsed = CancelSubscriptionSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))
    }

    return wrapHandler('Failed to cancel subscription', async (req, rep) => {
      const userId = req.user!.id
      const service = getSubscriptionService()

      await service.cancelSubscription(userId, parsed.data.immediate)

      req.log.info({ userId, immediate: parsed.data.immediate }, 'Subscription cancelled')
      return rep.send(formatResponse({ cancelled: true }))
    })(request, reply)
  })
}

export default userSubscriptionRoutes
