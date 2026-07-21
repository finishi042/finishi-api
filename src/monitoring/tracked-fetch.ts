/**
 * Monitoring domain — tracked fetch for external provider requests.
 *
 * Drop-in replacement for native fetch() that logs outbound requests
 * to the monitoring buffer.
 *
 * Usage:
 *   import { monitoredFetch } from '../monitoring/tracked-fetch.js'
 *   const res = await monitoredFetch('paystack', url, { method: 'POST', body: ... })
 */

import { pushEntry } from './buffer.js'
import { sanitizeFetchHeaders } from './sanitize.js'
import type { RequestLogEntry } from './types.js'

// ─── Helpers ───────────────────────────────────────────────────────────────

function extractPath(url: string | URL): string {
  try {
    const parsed = new URL(typeof url === 'string' ? url : url.toString())
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return String(url)
  }
}

function getBodySize(body: RequestInit['body'] | undefined): number {
  if (!body) return 0
  if (typeof body === 'string') return Buffer.byteLength(body, 'utf8')
  if (body instanceof ArrayBuffer) return body.byteLength
  if (body instanceof Uint8Array) return body.byteLength
  return 0
}

function buildEntry(
  provider: string,
  method: string,
  path: string,
  startedAt: number,
  overrides: Partial<Omit<RequestLogEntry, 'direction'>>
): RequestLogEntry {
  return {
    direction: 'outbound',
    provider,
    method,
    path,
    duration_ms: Date.now() - startedAt,
    started_at: new Date(startedAt).toISOString(),
    completed_at: new Date().toISOString(),
    is_error: false,
    ...overrides,
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface MonitoredFetchOptions extends RequestInit {
  /** Additional metadata to attach to the log entry */
  metadata?: Record<string, unknown>
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Tracked fetch — wraps native fetch and logs the outbound request/response.
 */
export async function monitoredFetch(
  provider: string,
  url: string | URL,
  options?: MonitoredFetchOptions
): Promise<Response> {
  const startedAt = Date.now()
  const method = (options?.method ?? 'GET').toUpperCase()
  const path = extractPath(url)

  let response: Response

  try {
    response = await fetch(url, options)
  } catch (err) {
    const error = err as Error
    pushEntry(buildEntry(provider, method, path, startedAt, {
      status_code: 0,
      is_error: true,
      error_message: error.message,
      error_code: 'NETWORK_ERROR',
      request_headers: sanitizeFetchHeaders(options?.headers),
      request_body_size: getBodySize(options?.body),
      response_body_size: 0,
      metadata: { provider, error_type: error.name, ...options?.metadata },
    }))
    throw err
  }

  const isError = response.status >= 400

  pushEntry(buildEntry(provider, method, path, startedAt, {
    status_code: response.status,
    is_error: isError,
    error_message: isError ? `HTTP ${response.status} ${response.statusText}` : undefined,
    error_code: isError ? `PROVIDER_${response.status}` : undefined,
    request_headers: sanitizeFetchHeaders(options?.headers),
    request_body_size: getBodySize(options?.body),
    response_body_size: parseInt(response.headers.get('content-length') ?? '0', 10),
    metadata: { provider, response_status_text: response.statusText, ...options?.metadata },
  }))

  return response
}

/**
 * Creates a provider-scoped fetch function.
 */
export function createProviderFetch(provider: string) {
  return (url: string | URL, options?: MonitoredFetchOptions): Promise<Response> =>
    monitoredFetch(provider, url, options)
}
