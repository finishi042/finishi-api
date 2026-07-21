/**
 * Monitoring domain — log buffer and database persistence.
 *
 * Batches RequestLogEntry records in memory and flushes them to the
 * `request_logs` table periodically or when the buffer fills up.
 */

import { getSupabase } from '../shared/supabase.js'
import type { RequestLogEntry } from './types.js'

const BUFFER_SIZE = 50
const FLUSH_INTERVAL_MS = 5000

let buffer: RequestLogEntry[] = []
let flushTimer: ReturnType<typeof setInterval> | null = null

// ─── Flush ─────────────────────────────────────────────────────────────────

async function flushBuffer(): Promise<void> {
  if (buffer.length === 0) return

  const entries = [...buffer]
  buffer = []

  try {
    const supabase = getSupabase()
    const { error } = await supabase.from('request_logs').insert(entries)

    if (error) {
      console.error('[monitoring] Failed to flush request logs:', error.message)
      if (buffer.length < BUFFER_SIZE * 3) {
        buffer.unshift(...entries)
      }
    }
  } catch (err) {
    console.error('[monitoring] Unexpected flush error:', (err as Error).message)
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Push a log entry into the buffer. Auto-flushes when buffer is full.
 */
export function pushEntry(entry: RequestLogEntry): void {
  buffer.push(entry)
  if (buffer.length >= BUFFER_SIZE) {
    flushBuffer()
  }
}

/**
 * Force-flush all buffered entries immediately.
 */
export async function flush(): Promise<void> {
  await flushBuffer()
}

/**
 * Start the periodic flush timer.
 */
export function startFlushTimer(): void {
  if (!flushTimer) {
    flushTimer = setInterval(flushBuffer, FLUSH_INTERVAL_MS)
  }
}

/**
 * Stop the periodic flush timer and perform a final flush.
 */
export async function stopFlushTimer(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  await flushBuffer()
}
