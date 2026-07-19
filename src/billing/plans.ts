import { getSupabase } from '../shared/supabase.js'
import type { Plan, PlanConfig } from './types.js'
import { PLANS as FALLBACK_PLANS } from './types.js'

/**
 * Database plan record (matches subscription_plans table).
 */
export interface SubscriptionPlanRecord {
  id: string
  slug: string
  name: string
  description: string | null
  tier: number
  is_active: boolean
  is_default: boolean
  price_monthly: number
  price_yearly: number
  currency: string
  trial_days: number
  features: string[]
  limits: Record<string, unknown>
  badge_text: string | null
  highlight: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// ── Plans Cache ─────────────────────────────────────────────────────────────

let plansCache: SubscriptionPlanRecord[] | null = null
let plansCacheTime = 0
const PLANS_CACHE_TTL = 60_000 // 60 seconds

/**
 * Load all active subscription plans from the database.
 * Results are cached for PLANS_CACHE_TTL. Call refreshPlansCache() to force reload.
 */
export async function getPlans(): Promise<SubscriptionPlanRecord[]> {
  const now = Date.now()
  if (plansCache && now - plansCacheTime < PLANS_CACHE_TTL) {
    return plansCache
  }

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (error) throw error
    plansCache = (data ?? []) as SubscriptionPlanRecord[]
    plansCacheTime = now
    return plansCache
  } catch (err) {
    // If DB is unavailable, fall back to hardcoded plans
    console.warn('Failed to load plans from DB, using fallback:', err)
    return fallbackPlans()
  }
}

/**
 * Load ALL plans including inactive (for admin usage).
 */
export async function getAllPlans(): Promise<SubscriptionPlanRecord[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []) as SubscriptionPlanRecord[]
}

/**
 * Get a single plan by slug.
 */
export async function getPlanBySlug(slug: string): Promise<SubscriptionPlanRecord | null> {
  const plans = await getPlans()
  return plans.find(p => p.slug === slug) ?? null
}

/**
 * Get the default plan (for new users).
 */
export async function getDefaultPlan(): Promise<SubscriptionPlanRecord | null> {
  const plans = await getPlans()
  return plans.find(p => p.is_default) ?? plans[0] ?? null
}

/**
 * Force refresh the plans cache.
 * Call after admin creates/updates/deletes a plan.
 */
export function refreshPlansCache(): void {
  plansCache = null
  plansCacheTime = 0
}

/**
 * Convert DB plans to the legacy PlanConfig format for backward compatibility.
 * Used by existing billing routes that reference the old PLANS constant.
 */
export async function getPlansAsLegacyConfig(): Promise<Record<string, PlanConfig>> {
  const plans = await getPlans()
  const result: Record<string, PlanConfig> = {}

  for (const plan of plans) {
    result[plan.slug] = {
      id: plan.slug as Plan,
      name: plan.name,
      price_monthly: plan.price_monthly,
      price_yearly: plan.price_yearly,
      currency: plan.currency.toLowerCase(),
      features: plan.features,
    }
  }

  return result
}

/**
 * Check if a user's current plan has access to the given tier level.
 */
export async function hasPlanAccess(userPlanSlug: string, requiredPlanSlug: string): Promise<boolean> {
  const plans = await getPlans()
  const userPlan = plans.find(p => p.slug === userPlanSlug)
  const required = plans.find(p => p.slug === requiredPlanSlug)

  if (!userPlan || !required) return false
  return userPlan.tier >= required.tier
}

// ── Fallback ────────────────────────────────────────────────────────────────

function fallbackPlans(): SubscriptionPlanRecord[] {
  return Object.values(FALLBACK_PLANS).map((plan, index) => ({
    id: `fallback-${plan.id}`,
    slug: plan.id,
    name: plan.name,
    description: null,
    tier: index,
    is_active: true,
    is_default: plan.id === 'free',
    price_monthly: plan.price_monthly,
    price_yearly: plan.price_yearly,
    currency: plan.currency.toUpperCase(),
    trial_days: 0,
    features: plan.features,
    limits: {},
    badge_text: null,
    highlight: plan.id === 'pro',
    sort_order: index,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))
}
