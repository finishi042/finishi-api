/**
 * Supabase client initialisation and API response formatting utilities.
 * Auth logic lives in ./auth.ts (SRP).
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'

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
