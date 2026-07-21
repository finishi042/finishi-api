/**
 * Webhook processing helpers — decomposed from the monolithic handleProviderWebhook.
 *
 * Each function has a single responsibility:
 *   - checkIpWhitelist: IP-based access control
 *   - deduplicateEvent: idempotency check against payment_transactions
 *   - extractEventId: provider-specific event ID extraction
 *
 * This makes each concern independently testable and replaceable.
 */
import type { FastifyRequest } from 'fastify'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Known webhook source IPs for payment providers.
 * These are published by the providers and should be updated periodically.
 */
const PROVIDER_IPS: Record<string, string[]> = {
  paystack: [
    '52.31.139.75', '52.49.173.169', '52.214.14.220', // Paystack webhook IPs
  ],
  flutterwave: [], // Flutterwave doesn't publish fixed IPs — rely on verif-hash only
  paddle: [], // Paddle uses signature verification
}

/**
 * Check if the incoming request IP is in the provider's whitelist.
 * Returns true if the request is allowed, false if it should be rejected.
 *
 * Only enforced when WEBHOOK_IP_WHITELIST_ENABLED=true in .env.
 * If the provider has no published IPs, always allows (falls back to signature verification).
 */
export function checkIpWhitelist(
  provider: string,
  request: FastifyRequest
): { allowed: boolean; clientIp?: string } {
  if (process.env.WEBHOOK_IP_WHITELIST_ENABLED !== 'true') {
    return { allowed: true }
  }

  const allowedIps = PROVIDER_IPS[provider]
  if (!allowedIps || allowedIps.length === 0) {
    return { allowed: true }
  }

  const forwarded = request.headers['x-forwarded-for']
  const clientIp = request.ip ?? (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined)

  if (!clientIp || !allowedIps.includes(clientIp)) {
    return { allowed: false, clientIp }
  }

  return { allowed: true, clientIp }
}

/**
 * Check if an event has already been processed (deduplication).
 * Returns true if the event is a duplicate and should be skipped.
 *
 * Uses the payment_transactions table with provider_reference + provider as the unique key.
 */
export async function deduplicateEvent(
  supabase: SupabaseClient,
  provider: string,
  eventId: string | null
): Promise<boolean> {
  if (!eventId) return false

  const { data: existing } = await supabase
    .from('payment_transactions')
    .select('id')
    .eq('provider_reference', eventId)
    .eq('provider', provider)
    .limit(1)
    .single()

  return !!existing
}

/**
 * Extract a unique event ID from the webhook payload for deduplication.
 * Each provider stores its event identifier in a different location.
 */
export function extractEventId(provider: string, body: string): string | null {
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

/**
 * Detect the payment provider from webhook request headers.
 * Used by the legacy /webhooks/billing endpoint that accepts any provider.
 */
export function detectProviderFromHeaders(headers: Record<string, string | string[] | undefined>): string {
  if (headers['verif-hash']) return 'flutterwave'
  if (headers['paddle-signature']) return 'paddle'
  if (headers['x-paystack-signature']) return 'paystack'
  return 'paystack' // default fallback
}
