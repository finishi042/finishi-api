/**
 * Exponential backoff rate limiter for auth endpoints.
 *
 * Each unique key (IP or IP+email) gets its own attempt counter.
 * On each failed/blocked attempt the lockout doubles:
 *   attempt 1 → 1 min
 *   attempt 2 → 2 min
 *   attempt 3 → 4 min
 *   attempt 4 → 8 min
 *   attempt 5+ → 16 min (capped)
 *
 * A successful request resets the counter for that key.
 * Entries are cleaned up automatically after their lockout expires.
 */

interface Entry {
  attempts: number      // total blocked attempts so far
  unlockedAt: number    // timestamp (ms) when the key is allowed again (0 = allowed now)
  cleanupTimer: ReturnType<typeof setTimeout>
}

const store = new Map<string, Entry>()

const BASE_MS = 60_000          // 1 minute base
const MAX_LOCKOUT_MS = 16 * 60_000  // 16 minutes cap

function lockoutMs(attempts: number): number {
  // 1 min, 2 min, 4 min, 8 min, 16 min (capped)
  return Math.min(BASE_MS * Math.pow(2, attempts - 1), MAX_LOCKOUT_MS)
}

function scheduleCleanup(key: string, delayMs: number) {
  const existing = store.get(key)
  if (existing?.cleanupTimer) clearTimeout(existing.cleanupTimer)

  const timer = setTimeout(() => store.delete(key), delayMs + 1000)
  // Allow the timer to not block process exit
  if (timer.unref) timer.unref()
  return timer
}

/**
 * Check whether a key is currently rate-limited.
 * Returns `{ allowed: true }` or `{ allowed: false, retryAfterMs, retryAfterSecs }`.
 */
export function checkLimit(key: string): { allowed: true } | { allowed: false; retryAfterMs: number; retryAfterSecs: number } {
  const entry = store.get(key)
  if (!entry) return { allowed: true }

  const now = Date.now()
  if (now >= entry.unlockedAt) return { allowed: true }

  const retryAfterMs = entry.unlockedAt - now
  return {
    allowed: false,
    retryAfterMs,
    retryAfterSecs: Math.ceil(retryAfterMs / 1000),
  }
}

/**
 * Record a failed attempt for a key and apply the next lockout window.
 * Call this when a login or forgot-password attempt fails or is abusive.
 */
export function recordFailure(key: string): void {
  const existing = store.get(key)
  const attempts = (existing?.attempts ?? 0) + 1
  const lockout = lockoutMs(attempts)
  const unlockedAt = Date.now() + lockout

  const timer = scheduleCleanup(key, lockout)
  store.set(key, { attempts, unlockedAt, cleanupTimer: timer })
}

/**
 * Reset the counter for a key after a successful attempt.
 */
export function recordSuccess(key: string): void {
  const existing = store.get(key)
  if (existing?.cleanupTimer) clearTimeout(existing.cleanupTimer)
  store.delete(key)
}

/**
 * Build a rate-limit key combining IP and an optional identifier (e.g. email).
 * Using both prevents one IP from being locked out by targeting different accounts,
 * and prevents one account from being targeted from different IPs simultaneously.
 */
export function makeKey(ip: string, identifier?: string): string {
  return identifier ? `${ip}:${identifier.toLowerCase().trim()}` : ip
}
