/**
 * Supabase client initialisation.
 * Auth logic lives in ./auth.ts (SRP).
 * Response formatting lives in ./response.ts (SRP).
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Re-export response utilities for backward compatibility
export { formatResponse, formatError } from './response.js'

let supabaseInstance: SupabaseClient | null = null

/**
 * Initialize Supabase client (call once at startup).
 */
export function initSupabase(url: string, serviceRoleKey: string): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }
  return supabaseInstance
}

/**
 * Get the singleton Supabase client instance.
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    throw new Error('Supabase client not initialized. Call initSupabase first.')
  }
  return supabaseInstance
}
