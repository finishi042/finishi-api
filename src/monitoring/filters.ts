/**
 * Monitoring domain — path filtering rules.
 *
 * Decides which requests to skip entirely or sample at reduced rate.
 */

/** Paths that should never be logged (health checks, static assets) */
const SKIP_PATHS = new Set([
  '/health',
  '/healthz',
  '/ready',
  '/favicon.ico',
])

/** Paths that are high-volume and low-value — only 1 in 10 are logged */
const SAMPLE_PATHS = new Set([
  '/api/v1/public',
])

export function shouldSkip(path: string): boolean {
  if (SKIP_PATHS.has(path)) return true
  for (const skip of SKIP_PATHS) {
    if (path.startsWith(skip)) return true
  }
  return false
}

export function shouldSample(path: string): boolean {
  for (const sample of SAMPLE_PATHS) {
    if (path.startsWith(sample)) return true
  }
  return false
}
