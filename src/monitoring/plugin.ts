/**
 * Monitoring domain — Fastify plugin.
 *
 * Hooks into the request lifecycle to log inbound HTTP traffic.
 * Delegates all concerns (filtering, sanitization, buffering, persistence)
 * to other modules within this domain.
 */

import fp from 'fastify-plugin'
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import type { RequestLogEntry } from './types.js'
import { pushEntry, startFlushTimer, stopFlushTimer, flush } from './buffer.js'
import { sanitizeHeaders } from './sanitize.js'
import { shouldSkip, shouldSample } from './filters.js'

// ─── Public helpers for server.ts shutdown ─────────────────────────────────

/**
 * Force-flush any buffered entries (call on graceful shutdown).
 */
export async function flushMonitorBuffer(): Promise<void> {
  await flush()
}

// ─── Plugin ────────────────────────────────────────────────────────────────

const monitorPlugin: FastifyPluginAsync = async (fastify) => {
  startFlushTimer()

  fastify.addHook('onClose', async () => {
    await stopFlushTimer()
  })

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    ;(request as any).__monitorStart = Date.now()
  })

  // Capture error response payload before it's sent (onSend fires before onResponse)
  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload) => {
    if (reply.statusCode >= 400 && payload) {
      try {
        const body = typeof payload === 'string' ? payload : undefined
        if (body) {
          const parsed = JSON.parse(body)
          const errorMsg = parsed?.error?.message ?? parsed?.message ?? undefined
          const errorCode = parsed?.error?.code ?? parsed?.code ?? undefined
          if (errorMsg || errorCode) {
            ;(request as any).__monitorError = { message: errorMsg, code: errorCode }
          }
        }
      } catch {
        // Not JSON or parse failed — skip
      }
    }
    return payload
  })

  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url
    if (shouldSkip(path)) return
    if (shouldSample(path) && Math.random() > 0.1) return

    const startTime = (request as any).__monitorStart as number | undefined
    const duration = startTime ? Date.now() - startTime : 0
    const statusCode = reply.statusCode
    const isError = statusCode >= 400

    const entry: RequestLogEntry = {
      direction: 'inbound',
      method: request.method,
      path,
      status_code: statusCode,
      request_headers: sanitizeHeaders(request.headers as Record<string, unknown>),
      request_body_size: request.headers['content-length']
        ? parseInt(request.headers['content-length'] as string, 10)
        : 0,
      response_body_size: reply.getHeader('content-length')
        ? parseInt(reply.getHeader('content-length') as string, 10)
        : 0,
      duration_ms: duration,
      started_at: new Date(startTime ?? Date.now()).toISOString(),
      completed_at: new Date().toISOString(),
      user_id: request.user?.id ?? undefined,
      request_id: request.id,
      ip_address: request.ip,
      user_agent: request.headers['user-agent'] as string | undefined,
      is_error: isError,
      error_message: isError
        ? (request as any).__monitorError?.message ?? `HTTP ${statusCode}`
        : undefined,
      error_code: isError
        ? (request as any).__monitorError?.code ?? undefined
        : undefined,
      metadata: {
        route: request.routeOptions?.url ?? path,
      },
    }

    pushEntry(entry)
  })

  fastify.log.info('[monitoring] Request monitoring plugin registered')
}

export default fp(monitorPlugin, {
  name: 'monitor',
  dependencies: ['supabase'],
})
