/**
 * Billing singleton lifecycle management.
 *
 * Single Responsibility: managing the runtime instances of gateway router
 * and subscription service, including TTL-based cache refresh.
 *
 * Does NOT handle adapter creation or config loading — delegates to
 * factory.ts and config-loader.ts respectively.
 */
import type { PaymentProviderAdapter } from './types.js'
import { PaymentGatewayRouter } from './gateway-router.js'
import { SubscriptionService } from './service.js'
import { getSupabase } from '../shared/supabase.js'
import { createAdapterFromConfig, createAdapterFromEnv } from './factory.js'
import { loadProviderConfigs } from './config-loader.js'

// ── Gateway Router (singleton, refreshable) ────────────────────────────────

let gatewayRouterInstance: PaymentGatewayRouter | null = null
let gatewayConfigLastLoaded = 0
const CONFIG_TTL_MS = 60_000 // Refresh config from DB every 60 seconds

/**
 * Returns the Payment Gateway Router instance.
 * Configs are loaded from the DB and cached for CONFIG_TTL_MS.
 * Call refreshGatewayRouter() to force a reload (e.g., after admin updates config).
 */
export async function getGatewayRouter(): Promise<PaymentGatewayRouter> {
  const now = Date.now()

  if (!gatewayRouterInstance || now - gatewayConfigLastLoaded > CONFIG_TTL_MS) {
    await refreshGatewayRouter()
  }

  return gatewayRouterInstance!
}

/**
 * Force-reload the gateway router with fresh config from the database.
 * Call this after admin updates provider settings.
 */
export async function refreshGatewayRouter(): Promise<void> {
  const configs = await loadProviderConfigs()
  const supabase = getSupabase()

  // Build adapter map from enabled configs
  const adapters = new Map<string, PaymentProviderAdapter>()
  for (const config of configs) {
    adapters.set(config.provider, createAdapterFromConfig(config))
  }

  gatewayRouterInstance = new PaymentGatewayRouter(adapters, supabase, configs)
  gatewayConfigLastLoaded = Date.now()
}

// ── Legacy: single-provider SubscriptionService ───────────────────────────

let subscriptionServiceInstance: SubscriptionService | null = null

/**
 * Returns a shared SubscriptionService instance (legacy single-provider mode).
 * Avoids re-creating the service + adapter on every request.
 * The instance is lazily created on first call (after Supabase has been initialised).
 */
export function getSubscriptionService(): SubscriptionService {
  if (!subscriptionServiceInstance) {
    subscriptionServiceInstance = new SubscriptionService(createAdapterFromEnv(), getSupabase())
  }
  return subscriptionServiceInstance
}
