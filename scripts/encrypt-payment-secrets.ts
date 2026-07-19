/**
 * One-time script: Encrypts any plaintext payment secrets in the database.
 * Run after adding PAYMENT_ENCRYPTION_KEY to your .env file.
 *
 * Usage: npx tsx scripts/encrypt-payment-secrets.ts
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { encryptSecret, isEncrypted } from '../src/billing/encryption.js'

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const encKey = process.env.PAYMENT_ENCRYPTION_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
    process.exit(1)
  }
  if (!encKey || encKey.length !== 64) {
    console.error('Missing or invalid PAYMENT_ENCRYPTION_KEY (must be 64 hex chars)')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('Loading payment provider configs...')
  const { data: configs, error } = await supabase
    .from('payment_provider_config')
    .select('id, provider, secret_key, webhook_secret')

  if (error) {
    console.error('Failed to load configs:', error.message)
    process.exit(1)
  }

  let updated = 0

  for (const config of configs ?? []) {
    const updates: Record<string, string> = {}

    if (config.secret_key && !isEncrypted(config.secret_key)) {
      updates.secret_key = encryptSecret(config.secret_key)
    }
    if (config.webhook_secret && !isEncrypted(config.webhook_secret)) {
      updates.webhook_secret = encryptSecret(config.webhook_secret)
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateErr } = await supabase
        .from('payment_provider_config')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', config.id)

      if (updateErr) {
        console.error(`  ✗ Failed to encrypt ${config.provider}:`, updateErr.message)
      } else {
        console.log(`  ✓ Encrypted secrets for: ${config.provider}`)
        updated++
      }
    } else {
      console.log(`  – ${config.provider}: already encrypted or no secrets`)
    }
  }

  console.log(`\nDone. ${updated} provider(s) encrypted.`)
}

main()
