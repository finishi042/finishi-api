import type { FastifyPluginAsync } from 'fastify'
import { formatError } from '../supabase.js'
import { getGatewayRouter } from '../../billing/provider.js'

/**
 * Known webhook source IPs for payment providers.
 * These are published by the providers and should be updated periodically.
 * Set WEBHOOK_IP_WHITELIST_ENABLED=true in .env to enforce.
 */
const PROVIDER_IPS: Record<string, string[]> = {
  paystack: [
    '52.31.139.75', '52.49.173.169', '52.214.14.220', // Paystack webhook IPs
  ],
  flutterwave: [], // Flutterwave doesn't publish fixed IPs — rely on verif-hash only
  paddle: [], // Paddle uses signature verification
}

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
   * Receives events from Paystack
   */
  fastify.post('/webhooks/paystack', async (request, reply) => {
    return handleProviderWebhook('paystack', request, reply)
  })

  /**
   * POST /webhooks/flutterwave
   * Receives events from Flutterwave
   */
  fastify.post('/webhooks/flutterwave', async (request, reply) => {
    return handleProviderWebhook('flutterwave', request, reply)
  })

  /**
   * POST /webhooks/paddle
   * Receives events from Paddle
   */
  fastify.post('/webhooks/paddle', async (request, reply) => {
    return handleProviderWebhook('paddle', request, reply)
  })

  /**
   * POST /webhooks/billing (legacy — routes to whichever provider is primary)
   */
  fastify.post('/webhooks/billing', async (request, reply) => {
    // Try to detect provider from headers
    const headers = request.headers as Record<string, string>
    let provider = 'paystack' // default

    if (headers['verif-hash']) provider = 'flutterwave'
    else if (headers['paddle-signature']) provider = 'paddle'
    else if (headers['x-paystack-signature']) provider = 'paystack'

    return handleProviderWebhook(provider, request, reply)
  })

  /**
   * Shared handler for all provider webhooks.
   * Applies: IP whitelist check → signature verification → deduplication → processing
   */
  async function handleProviderWebhook(provider: string, request: any, reply: any) {
    try {
      // 1. IP whitelist check (optional)
      if (process.env.WEBHOOK_IP_WHITELIST_ENABLED === 'true') {
        const allowedIps = PROVIDER_IPS[provider]
        if (allowedIps && allowedIps.length > 0) {
          const clientIp = request.ip ?? request.headers['x-forwarded-for']?.split(',')[0]?.trim()
          if (!allowedIps.includes(clientIp)) {
            request.log.warn({ provider, clientIp }, 'Webhook rejected: IP not in whitelist')
            return reply.code(403).send(formatError('Forbidden'))
          }
        }
      }

      // 2. Get adapter and verify signature
      const router = await getGatewayRouter()
      const headers = request.headers as Record<string, string>
      const body = request.body as string

      const adapter = (router as any).adapters?.get(provider)
      if (!adapter) {
        request.log.warn({ provider }, 'No adapter found for webhook provider')
        return reply.code(200).send({ received: true })
      }

      // Parse and verify (signature check happens inside adapter)
      const event = await adapter.parseWebhook(headers, body)

      // 3. Deduplication — skip if we've already processed this event
      const eventId = extractEventId(provider, body)
      if (eventId) {
        const { getSupabase } = await import('../supabase.js')
        const supabase = getSupabase()
        const { data: existing } = await supabase
          .from('payment_transactions')
          .select('id')
          .eq('provider_reference', eventId)
          .eq('provider', provider)
          .limit(1)
          .single()

        if (existing) {
          request.log.info({ provider, eventId }, 'Webhook duplicate — already processed')
          return reply.code(200).send({ received: true })
        }
      }

      // 4. Process the event
      const { getSubscriptionService } = await import('../../billing/provider.js')
      const service = getSubscriptionService()
      await service.handleWebhookEvent(event)

      request.log.info({ provider, action: event.action, eventId }, 'Webhook processed')
      return reply.code(200).send({ received: true })
    } catch (error: any) {
      request.log.error({ error, provider }, 'Webhook processing failed')
      return reply.code(400).send(formatError(error.message ?? 'Webhook processing failed'))
    }
  }

  /**
   * Extract a unique event ID from the webhook payload for deduplication.
   */
  function extractEventId(provider: string, body: string): string | null {
    try {
      const payload = JSON.parse(body)
      switch (provider) {
        case 'paystack':
          return payload.data?.id?.toString() ?? payload.data?.reference ?? null
        case 'flutterwave':
          return payload.data?.id?.toString() ?? payload.data?.tx_ref ?? null
        case 'paddle':
          return payload.event_id ?? null
        default:
          return null
      }
    } catch {
      return null
    }
  }
}

export default webhookRoutes
