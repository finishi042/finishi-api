import type { FastifyPluginAsync } from 'fastify'
import { formatError } from '../supabase.js'
import { getSubscriptionService } from '../../billing/provider.js'
import { getPaymentAdapter } from '../../billing/provider.js'

/**
 * Webhook routes — unauthenticated (called by payment providers).
 * The adapter verifies the webhook signature internally.
 */
const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  // Disable JSON body parsing for webhooks — we need the raw body for signature verification
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => { done(null, body) }
  )

  /**
   * POST /api/v1/webhooks/billing
   * Receives events from the payment provider
   */
  fastify.post('/webhooks/billing', async (request, reply) => {
    try {
      const service = getSubscriptionService()
      const headers = request.headers as Record<string, string>
      const body = request.body as string

      await service.processWebhook(headers, body)

      request.log.info({ provider: getPaymentAdapter().name }, 'Webhook processed successfully')

      return reply.code(200).send({ received: true })
    } catch (error: any) {
      request.log.error({ error }, 'Webhook processing failed')
      return reply.code(400).send(formatError(error.message ?? 'Webhook processing failed'))
    }
  })
}

export default webhookRoutes
