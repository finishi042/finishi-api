/**
 * Payment provider configuration loader.
 *
 * Single Responsibility: loading and decrypting provider configs from the database.
 * Does NOT handle adapter instantiation or singleton lifecycle.
 */
import type { ProviderConfig } from './gateway-router.js'
import { getSupabase } from '../shared/supabase.js'
import { decryptSecret, isEncrypted } from './encryption.js'

/**
 * Safely decrypt a secret field. If not encrypted (legacy plaintext), return as-is.
 */
function safeDecrypt(value: string | null): string | null {
  if (!value) return null
  try {
    return isEncrypted(value) ? decryptSecret(value) : value
  } catch {
    // If decryption fails, return null rather than crash
    console.warn('Failed to decrypt payment secret — returning null')
    return null
  }
}

/**
 * Load enabled provider configurations from the payment_provider_config table.
 * Secrets are decrypted for runtime use.
 */
export async function loadProviderConfigs(): Promise<ProviderConfig[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('payment_provider_config')
    .select('*')
    .eq('is_enabled', true)

  if (error) {
    throw new Error(`Failed to load payment provider configs: ${error.message}`)
  }

  // Decrypt secrets for runtime use
  return (data ?? []).map((config: any) => ({
    ...config,
    secret_key: safeDecrypt(config.secret_key),
    webhook_secret: safeDecrypt(config.webhook_secret),
  })) as ProviderConfig[]
}

/**
 * Load ALL provider configurations (including disabled), for admin management.
 * Secrets are NOT decrypted (admin UI only needs metadata).
 */
export async function loadAllProviderConfigs(): Promise<ProviderConfig[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('payment_provider_config')
    .select('*')
    .order('provider', { ascending: true })

  if (error) {
    throw new Error(`Failed to load payment provider configs: ${error.message}`)
  }

  return (data ?? []) as ProviderConfig[]
}
