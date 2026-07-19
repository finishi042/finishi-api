import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import { refreshPlansCache } from '../../billing/plans.js'

/**
 * Zod schemas for subscription plan management.
 */
const CreatePlanSchema = z.object({
  slug: z.string().min(2).max(50).regex(/^[a-z0-9_-]+$/, 'Slug must be lowercase alphanumeric with hyphens/underscores'),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  tier: z.number().int().min(0),
  is_active: z.boolean().optional().default(true),
  is_default: z.boolean().optional().default(false),
  price_monthly: z.number().int().min(0),
  price_yearly: z.number().int().min(0),
  currency: z.string().length(3).toUpperCase().optional().default('USD'),
  trial_days: z.number().int().min(0).optional().default(0),
  features: z.array(z.string()).optional().default([]),
  limits: z.record(z.unknown()).optional().default({}),
  badge_text: z.string().max(50).nullable().optional(),
  highlight: z.boolean().optional().default(false),
  sort_order: z.number().int().optional().default(0),
}).strict()

const UpdatePlanSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  tier: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
  price_monthly: z.number().int().min(0).optional(),
  price_yearly: z.number().int().min(0).optional(),
  currency: z.string().length(3).toUpperCase().optional(),
  trial_days: z.number().int().min(0).optional(),
  features: z.array(z.string()).optional(),
  limits: z.record(z.unknown()).optional(),
  badge_text: z.string().max(50).nullable().optional(),
  highlight: z.boolean().optional(),
  sort_order: z.number().int().optional(),
}).strict()

/**
 * Admin subscription plan management routes.
 * Full CRUD for subscription plans — pricing, features, trial days, limits.
 *
 * All routes protected by authenticate + requireAdmin in the parent aggregator.
 */
const adminSubscriptionPlansRoutes: FastifyPluginAsync = async (fastify) => {

  /**
   * GET /subscription-plans
   * List all plans (including inactive) for admin management.
   */
  fastify.get('/subscription-plans', wrapHandler('Failed to fetch plans', async (request, reply) => {
    const { data, error } = await request.supabase
      .from('subscription_plans')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) throw error
    return reply.send(formatResponse(data))
  }))

  /**
   * GET /subscription-plans/:id
   * Get a single plan by ID.
   */
  fastify.get<{ Params: { id: string } }>('/subscription-plans/:id', wrapHandler('Failed to fetch plan', async (request, reply) => {
    const { id } = request.params

    const { data, error } = await request.supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      return reply.code(404).send(formatError('Plan not found', 'NOT_FOUND'))
    }

    return reply.send(formatResponse(data))
  }))

  /**
   * POST /subscription-plans
   * Create a new subscription plan.
   */
  fastify.post('/subscription-plans', async (request, reply) => {
    const parsed = CreatePlanSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))
    }

    return wrapHandler('Failed to create plan', async (req, rep) => {
      const planData = parsed.data

      // If setting as default, unset any existing default first
      if (planData.is_default) {
        await req.supabase
          .from('subscription_plans')
          .update({ is_default: false, updated_at: new Date().toISOString() })
          .eq('is_default', true)
      }

      const { data, error } = await req.supabase
        .from('subscription_plans')
        .insert({
          ...planData,
          features: JSON.stringify(planData.features),
          limits: JSON.stringify(planData.limits),
        })
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          return rep.code(409).send(formatError(`Plan with slug "${planData.slug}" already exists`, 'DUPLICATE'))
        }
        throw error
      }

      refreshPlansCache()
      req.log.info({ slug: planData.slug }, 'Subscription plan created')
      return rep.code(201).send(formatResponse(data))
    })(request, reply)
  })

  /**
   * PUT /subscription-plans/:id
   * Update an existing subscription plan.
   */
  fastify.put<{ Params: { id: string } }>('/subscription-plans/:id', async (request, reply) => {
    const parsed = UpdatePlanSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))
    }

    return wrapHandler('Failed to update plan', async (req, rep) => {
      const { id } = req.params as { id: string }
      const updates = parsed.data

      // Verify the plan exists
      const { data: existing, error: lookupErr } = await req.supabase
        .from('subscription_plans')
        .select('id, slug')
        .eq('id', id)
        .single()

      if (lookupErr || !existing) {
        return rep.code(404).send(formatError('Plan not found', 'NOT_FOUND'))
      }

      // If setting as default, unset any existing default first
      if (updates.is_default === true) {
        await req.supabase
          .from('subscription_plans')
          .update({ is_default: false, updated_at: new Date().toISOString() })
          .eq('is_default', true)
          .neq('id', id)
      }

      // Build update payload
      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (updates.name !== undefined) payload.name = updates.name
      if (updates.description !== undefined) payload.description = updates.description
      if (updates.tier !== undefined) payload.tier = updates.tier
      if (updates.is_active !== undefined) payload.is_active = updates.is_active
      if (updates.is_default !== undefined) payload.is_default = updates.is_default
      if (updates.price_monthly !== undefined) payload.price_monthly = updates.price_monthly
      if (updates.price_yearly !== undefined) payload.price_yearly = updates.price_yearly
      if (updates.currency !== undefined) payload.currency = updates.currency
      if (updates.trial_days !== undefined) payload.trial_days = updates.trial_days
      if (updates.features !== undefined) payload.features = JSON.stringify(updates.features)
      if (updates.limits !== undefined) payload.limits = JSON.stringify(updates.limits)
      if (updates.badge_text !== undefined) payload.badge_text = updates.badge_text
      if (updates.highlight !== undefined) payload.highlight = updates.highlight
      if (updates.sort_order !== undefined) payload.sort_order = updates.sort_order

      const { data, error } = await req.supabase
        .from('subscription_plans')
        .update(payload)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      refreshPlansCache()
      req.log.info({ id, slug: existing.slug, fields: Object.keys(updates) }, 'Subscription plan updated')
      return rep.send(formatResponse(data))
    })(request, reply)
  })

  /**
   * DELETE /subscription-plans/:id
   * Soft-delete a plan by marking it inactive.
   * Plans with active subscribers cannot be hard-deleted.
   */
  fastify.delete<{ Params: { id: string } }>('/subscription-plans/:id', wrapHandler('Failed to delete plan', async (request, reply) => {
    const { id } = request.params

    // Check if the plan exists
    const { data: plan, error: lookupErr } = await request.supabase
      .from('subscription_plans')
      .select('id, slug, is_default')
      .eq('id', id)
      .single()

    if (lookupErr || !plan) {
      return reply.code(404).send(formatError('Plan not found', 'NOT_FOUND'))
    }

    // Don't allow deleting the default plan
    if (plan.is_default) {
      return reply.code(400).send(formatError('Cannot delete the default plan. Assign another plan as default first.', 'DEFAULT_PLAN'))
    }

    // Check for active subscribers on this plan
    const { count } = await request.supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('plan', plan.slug)
      .in('status', ['active', 'trialing', 'past_due'])

    if (count && count > 0) {
      // Soft-delete: mark inactive but keep the record
      await request.supabase
        .from('subscription_plans')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)

      refreshPlansCache()
      return reply.send(formatResponse({
        deleted: false,
        deactivated: true,
        reason: `Plan has ${count} active subscriber(s). Deactivated instead of deleted.`,
      }))
    }

    // Hard-delete if no subscribers
    const { error } = await request.supabase
      .from('subscription_plans')
      .delete()
      .eq('id', id)

    if (error) throw error

    refreshPlansCache()
    request.log.info({ id, slug: plan.slug }, 'Subscription plan deleted')
    return reply.send(formatResponse({ deleted: true }))
  }))

  /**
   * POST /subscription-plans/reorder
   * Update the sort_order of all plans in one batch.
   */
  fastify.post('/subscription-plans/reorder', async (request, reply) => {
    const schema = z.object({
      order: z.array(z.object({
        id: z.string().uuid(),
        sort_order: z.number().int().min(0),
      })),
    }).strict()

    const parsed = schema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))
    }

    return wrapHandler('Failed to reorder plans', async (req, rep) => {
      const now = new Date().toISOString()

      for (const item of parsed.data.order) {
        await req.supabase
          .from('subscription_plans')
          .update({ sort_order: item.sort_order, updated_at: now })
          .eq('id', item.id)
      }

      refreshPlansCache()
      req.log.info({ count: parsed.data.order.length }, 'Subscription plans reordered')
      return rep.send(formatResponse({ reordered: true }))
    })(request, reply)
  })
}

export default adminSubscriptionPlansRoutes
