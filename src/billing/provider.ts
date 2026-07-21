/**
 * Billing provider barrel — re-exports from the split modules for backward compatibility.
 *
 * The original provider.ts was split into three SRP-compliant modules:
 *   - factory.ts        — adapter instantiation
 *   - config-loader.ts  — DB config queries + decryption
 *   - singleton.ts      — instance lifecycle management (TTL cache)
 *
 * This file re-exports all public symbols so existing imports continue to work.
 * New code should import directly from the specific module.
 */

// Factory
export { createAdapterFromConfig, createAdapterFromEnv } from './factory.js'

// Config loading
export { loadProviderConfigs, loadAllProviderConfigs } from './config-loader.js'

// Singleton lifecycle
export {
  getGatewayRouter,
  refreshGatewayRouter,
  getSubscriptionService,
} from './singleton.js'

// Legacy alias
export { createAdapterFromEnv as getPaymentAdapter } from './factory.js'
