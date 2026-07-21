/**
 * API response formatting utilities.
 *
 * Single source of truth for formatResponse and formatError.
 * All modules should import from here (or from handler.ts / supabase.ts
 * which re-export these for backward compatibility).
 */

/**
 * Format a successful API response.
 */
export function formatResponse<T>(data: T, success = true) {
  return { success, data }
}

/**
 * Format an error API response.
 */
export function formatError(message: string, code?: string) {
  return { success: false, error: { message, code } }
}
