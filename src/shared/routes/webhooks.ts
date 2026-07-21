import type { FastifyPluginAsync } from 'fastify'
import { formatError } from '../response.js'
import { getSupabase } from '../supabase.js'
import { getGatewayRouter, getSubscriptionService } from '../../billing/provider.js'
import {
  checkIpWhitelist,
  deduplicateEvent,
  extractEventId,
  detectProviderFromHeaders,
} from './webhook-helpers.js'

/**
 * Webhook routes — unauthenticated (called by payment providers).
 * Each provider has its own endpoint for signature verification.
 *
 * Security layers:
 * 1. IP whitelisting (optional, via WEBHOOK_IP_WHITELIST_ENABLED env)
 * 2. Signature/hash verification (per adapter)
 * 3. Timing-safe comparisons (prevents timing attacks)
 * 4. Event deduplication (prevents replay attacks)
 * 5. Body size limit (prevents memory exhaustion)
 *
 * Configure these URLs in each provider's dashboard:
 *   - Paystack:     https://your-domain.com/api/v1/webhooks/paystack
 *   - Flutterwave:  https://your-domain.com/api/v1/webhooks/flutterwave
 *   - Paddle:       https://your-domain.com/api/v1/webhooks/paddle
 */
const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  // Disable JSON body parsing for webhooks — we need the raw body for signature verification
  // Body size limit: 64KB max (webhooks are small)
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string', bodyLimit: 65536 },
    (_req, body, done) => { done(null, body) }
  )

  /**
   * POST /webhooks/paystack
   */
  fastify.post('/webhooks/paystack', async (request, reply) => {
    return handleProviderWebhook('paystack', request, reply)
  })

  /**
   * POST /webhooks/flutterwave
   */
  fastify.post('/webhooks/flutterwave', async (request, reply) => {
    return handleProviderWebhook('flutterwave', request, reply)
  })

  /**
   * POST /webhooks/paddle
   */
  fastify.post('/webhooks/paddle', async (request, reply) => {
    return handleProviderWebhook('paddle', request, reply)
  })

  /**
   * POST /webhooks/billing (legacy — auto-detects provider from headers)
   */
  fastify.post('/webhooks/billing', async (request, reply) => {
    const provider = detectProviderFromHeaders(request.headers as Record<string, string>)
    return handleProviderWebhook(provider, request, reply)
  })

  /**
   * Orchestrator for webhook processing.
   * Delegates each concern to a focused helper function.
   */
  async function handleProviderWebhook(provider: string, request: any, reply: any) {
    try {
      // 1. IP whitelist check
      const ipCheck = checkIpWhitelist(provider, request)
      if (!ipCheck.allowed) {
        request.log.warn({ provider, clientIp: ipCheck.clientIp }, 'Webhook rejected: IP not in whitelist')
        return reply.code(403).send(formatError('Forbidden'))
      }

      // 2. Get adapter and verify signature (signature check happens inside adapter)
      const router = await getGatewayRouter()
      const headers = request.headers as Record<string, string>
      const body = request.body as string

      const adapter = (router as any).adapters?.get(provider)
      if (!adapter) {
        request.log.warn({ provider }, 'No adapter found for webhook provider')
        return reply.code(200).send({ received: true })
      }

      // Parse and verify (signature verification is internal to adapter)
      const event = await adapter.parseWebhook(headers, body)

      // 3. Deduplication check
      const eventId = extractEventId(provider, body)
      const supabase = getSupabase()
      const isDuplicate = await deduplicateEvent(supabase, provider, eventId)

      if (isDuplicate) {
        request.log.info({ provider, eventId }, 'Webhook duplicate — already processed')
        return reply.code(200).send({ received: true })
      }

      // 4. Process the event
      const service = getSubscriptionService()
      await service.handleWebhookEvent(event)

      request.log.info({ provider, action: event.action, eventId }, 'Webhook processed')
      return reply.code(200).send({ received: true })
    } catch (error: any) {
      request.log.error({ error, provider }, 'Webhook processing failed')
      return reply.code(400).send(formatError(error.message ?? 'Webhook processing failed'))
    }
  }
}

export default webhookRoutes
