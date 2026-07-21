/**
 * Monitoring domain — public API.
 *
 * Other domains import from here (or from specific sub-modules).
 */

// Types
export type { RequestLogEntry } from './types.js'

// Plugin (Fastify integration)
export { default as monitorPlugin } from './plugin.js'
export { flushMonitorBuffer } from './plugin.js'

// Tracked fetch (for external provider calls)
export { monitoredFetch, createProviderFetch } from './tracked-fetch.js'
export type { MonitoredFetchOptions } from './tracked-fetch.js'

// Analytics helpers (for admin routes)
export {
  sinceTimestamp,
  errorRate,
  average,
  percentile,
  parseHours,
  parsePage,
  parseLimit,
} from './analytics.js'
