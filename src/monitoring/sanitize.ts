/**
 * Monitoring domain — header sanitization.
 *
 * Decides which HTTP headers are safe to persist and redacts sensitive ones.
 */

const REDACTED_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'x-goog-api-key',
  'x-paystack-signature',
])

/**
 * Sanitize a plain key-value header object (e.g., Fastify's request.headers).
 */
export function sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(headers)) {
    sanitized[key] = REDACTED_HEADERS.has(key.toLowerCase()) ? '[REDACTED]' : value
  }
  return sanitized
}

/**
 * Sanitize headers from a fetch-style HeadersInit (Headers object, array, or plain object).
 */
export function sanitizeFetchHeaders(headers: RequestInit['headers'] | undefined | null): Record<string, unknown> | undefined {
  if (!headers) return undefined

  const sanitized: Record<string, unknown> = {}

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      sanitized[key] = REDACTED_HEADERS.has(key.toLowerCase()) ? '[REDACTED]' : value
    })
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      sanitized[key] = REDACTED_HEADERS.has(key.toLowerCase()) ? '[REDACTED]' : value
    }
  } else {
    for (const [key, value] of Object.entries(headers)) {
      sanitized[key] = REDACTED_HEADERS.has(key.toLowerCase()) ? '[REDACTED]' : value
    }
  }

  return sanitized
}
