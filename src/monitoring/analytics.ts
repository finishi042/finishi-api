/**
 * Monitoring domain — pure analytics computation helpers.
 *
 * No I/O, no Supabase, no Fastify — just math and param parsing.
 */

/**
 * Compute the "since" ISO timestamp from a number of hours ago.
 */
export function sinceTimestamp(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString()
}

/**
 * Calculate error rate as a percentage (2 decimal places).
 */
export function errorRate(errors: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((errors / total) * 10000) / 100
}

/**
 * Compute the average of an array of numbers.
 */
export function average(values: number[]): number {
  if (values.length === 0) return 0
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

/**
 * Compute a percentile value from an array of numbers.
 * @param values - Raw (unsorted) array of numbers
 * @param p - 0–1 (e.g., 0.95 for P95)
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.floor(sorted.length * p)
  return Math.round(sorted[Math.min(idx, sorted.length - 1)])
}

/**
 * Parse a time-range query param into a validated hoursAgo number.
 */
export function parseHours(raw?: string, fallback = 24): number {
  return parseInt(raw ?? '', 10) || fallback
}

/**
 * Parse and clamp a pagination page number.
 */
export function parsePage(raw?: string): number {
  return Math.max(1, parseInt(raw ?? '', 10) || 1)
}

/**
 * Parse and clamp a pagination limit.
 */
export function parseLimit(raw?: string, fallback = 25, max = 100): number {
  return Math.min(parseInt(raw ?? '', 10) || fallback, max)
}
