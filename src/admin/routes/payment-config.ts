import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import { loadAllProviderConfigs, refreshGatewayRouter } from '../../billing/provider.js'
import { encryptSecret } from '../../billing/encryption.js'

/**
 * Zod schemas for payment provider config management.
 */
const UpdateProviderConfigSchema = z.object({
  is_enabled: z.boolean().optional(),
  is_primary_local: z.boolean().optional(),
  is_failover_local: z.boolean().optional(),
  is_international: z.boolean().optional(),
  public_key: z.string().nullable().optional(),
  secret_key: z.string().nullable().optional(),
  webhook_secret: z.string().nullable().optional(),
  extra_config: z.record(z.unknown()).optional(),
  supported_countries: z.array(z.string()).optional(),
}).strict()

const TestProviderSchema = z.object({
  provider: z.enum(['paddle', 'paystack', 'flutterwave']),
}).strict()

const SetRoleSchema = z.object({
  role: z.enum(['international', 'primary_local', 'failover_local', 'none']),
}).strict()

const TransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  status: z.enum(['pending', 'processing', 'success', 'failed', 'refunded']).optional(),
  provider: z.enum(['paddle', 'paystack', 'flutterwave']).optional(),
  user_id: z.string().uuid().optional(),
  date_from: z.string().datetime({ offset: true }).optional(),
  date_to: z.string().datetime({ offset: true }).optional(),
  plan: z.enum(['free', 'pro', 'enterprise']).optional(),
}).partial()

/**
 * Admin payment provider configuration routes.
 * Allows admins to view, update, toggle, assign roles to payment providers,
 * view payment stats, and manage transactions from the dashboard.
 *
 * All routes are protected by authenticate + requireAdmin hooks in the parent aggregator.
 */
const adminPaymentConfigRoutes: FastifyPluginAsync = async (fastify) => {

  /**
   * GET /payment-config
   * List all payment providers and their configuration (credentials are masked).
   */
  fastify.get('/payment-config', wrapHandler('Failed to fetch payment config', async (_request, reply) => {
    const configs = await loadAllProviderConfigs()

    // Mask sensitive credentials for the response
    const masked = configs.map(config => ({
      ...config,
      secret_key: config.secret_key ? maskSecret(config.secret_key) : null,
      webhook_secret: config.webhook_secret ? maskSecret(config.webhook_secret) : null,
      public_key: config.public_key ?? null,
    }))

    return reply.send(formatResponse(masked))
  }))

  /**
   * GET /payment-config/stats
   * Payment analytics — totals, breakdowns by provider/status/plan, and recent trends.
   */
  fastify.get('/payment-config/stats', wrapHandler('Failed to fetch payment stats', async (request, reply) => {
    const query = request.query as { days?: string }
    const days = Math.min(parseInt(query.days ?? '30', 10), 365)
    const since = new Date(Date.now() - days * 86_400_000).toISOString()

    // Fetch all transaction statuses in the period in ONE query
    const { data: allTxns } = await request.supabase
      .from('payment_transactions')
      .select('status, provider, amount, currency, plan, billing_interval, failover_from')
      .gte('created_at', since)

    const txns = allTxns ?? []
    const totalCount = txns.length
    const successCount = txns.filter(t => t.status === 'success').length
    const failedCount = txns.filter(t => t.status === 'failed').length
    const failoverCount = txns.filter(t => t.failover_from !== null).length

    // Group revenue by provider (successful transactions only)
    const providerRevenue: Record<string, { total: number; count: number; currency: string }> = {}
    const planRevenue: Record<string, { total: number; count: number }> = {}

    for (const tx of txns) {
      if (tx.status === 'success') {
        // Provider revenue
        if (!providerRevenue[tx.provider]) {
          providerRevenue[tx.provider] = { total: 0, count: 0, currency: tx.currency }
        }
        providerRevenue[tx.provider].total += tx.amount
        providerRevenue[tx.provider].count += 1

        // Plan revenue
        const planKey = tx.plan ?? 'unknown'
        if (!planRevenue[planKey]) {
          planRevenue[planKey] = { total: 0, count: 0 }
        }
        planRevenue[planKey].total += tx.amount
        planRevenue[planKey].count += 1
      }
    }

    // Recent daily transaction counts (last 7 days for a mini chart)
    // Fetch all transactions in the last 7 days in ONE query, then group in memory
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const { data: recentTxns } = await request.supabase
      .from('payment_transactions')
      .select('status, created_at')
      .gte('created_at', sevenDaysAgo)

    const dailyMap: Record<string, { success: number; failed: number }> = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000)
      const key = d.toISOString().slice(0, 10)
      dailyMap[key] = { success: 0, failed: 0 }
    }
    for (const tx of recentTxns ?? []) {
      const key = tx.created_at.slice(0, 10)
      if (dailyMap[key]) {
        if (tx.status === 'success') dailyMap[key].success++
        else if (tx.status === 'failed') dailyMap[key].failed++
      }
    }
    const last7Days = Object.entries(dailyMap).map(([date, counts]) => ({ date, ...counts }))

    // Active subscriptions count
    const { count: activeSubscriptions } = await request.supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .in('status', ['active', 'trialing'])

    const successRate = totalCount > 0
      ? Math.round((successCount / totalCount) * 100)
      : 0

    return reply.send(formatResponse({
      period_days: days,
      overview: {
        total_transactions: totalCount,
        successful: successCount,
        failed: failedCount,
        failover_events: failoverCount,
        success_rate: successRate,
        active_subscriptions: activeSubscriptions ?? 0,
      },
      revenue_by_provider: providerRevenue,
      revenue_by_plan: planRevenue,
      daily_trend: last7Days,
    }))
  }))

  /**
   * GET /payment-config/:provider
   * Get a single provider's configuration (credentials masked).
   */
  fastify.get<{ Params: { provider: string } }>('/payment-config/:provider', wrapHandler('Failed to fetch provider config', async (request, reply) => {
    const { provider } = request.params

    const { data, error } = await request.supabase
      .from('payment_provider_config')
      .select('*')
      .eq('provider', provider)
      .single()

    if (error || !data) {
      return reply.code(404).send(formatError('Provider not found', 'NOT_FOUND'))
    }

    const masked = {
      ...data,
      secret_key: data.secret_key ? maskSecret(data.secret_key) : null,
      webhook_secret: data.webhook_secret ? maskSecret(data.webhook_secret) : null,
    }

    return reply.send(formatResponse(masked))
  }))

  /**
   * PUT /payment-config/:provider
   * Update a provider's configuration (credentials, toggles, extra config).
   * Triggers a gateway router refresh after successful update.
   */
  fastify.put<{ Params: { provider: string } }>('/payment-config/:provider', async (request, reply) => {
    const parsed = UpdateProviderConfigSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))
    }

    return wrapHandler('Failed to update provider config', async (req, rep) => {
      const { provider } = req.params as { provider: string }
      const updates = parsed.data

      // Verify the provider exists
      const { data: existing, error: lookupErr } = await req.supabase
        .from('payment_provider_config')
        .select('id')
        .eq('provider', provider)
        .single()

      if (lookupErr || !existing) {
        return rep.code(404).send(formatError('Provider not found', 'NOT_FOUND'))
      }

      // Build update payload — only include fields that were provided
      const updatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }

      if (updates.is_enabled !== undefined) updatePayload.is_enabled = updates.is_enabled
      if (updates.is_primary_local !== undefined) updatePayload.is_primary_local = updates.is_primary_local
      if (updates.is_failover_local !== undefined) updatePayload.is_failover_local = updates.is_failover_local
      if (updates.is_international !== undefined) updatePayload.is_international = updates.is_international
      if (updates.public_key !== undefined) updatePayload.public_key = updates.public_key
      if (updates.secret_key !== undefined) updatePayload.secret_key = updates.secret_key ? encryptSecret(updates.secret_key) : null
      if (updates.webhook_secret !== undefined) updatePayload.webhook_secret = updates.webhook_secret ? encryptSecret(updates.webhook_secret) : null
      if (updates.extra_config !== undefined) updatePayload.extra_config = updates.extra_config
      if (updates.supported_countries !== undefined) updatePayload.supported_countries = updates.supported_countries

      const { data, error } = await req.supabase
        .from('payment_provider_config')
        .update(updatePayload)
        .eq('provider', provider)
        .select()
        .single()

      if (error) throw error

      // Refresh the gateway router so changes take effect immediately
      try {
        await refreshGatewayRouter()
      } catch (refreshErr) {
        req.log.warn({ refreshErr }, 'Gateway router refresh failed after config update')
      }

      req.log.info({ provider, fields: Object.keys(updates) }, 'Payment provider config updated')

      // Mask secrets in response
      const masked = {
        ...data,
        secret_key: data.secret_key ? maskSecret(data.secret_key) : null,
        webhook_secret: data.webhook_secret ? maskSecret(data.webhook_secret) : null,
      }

      return rep.send(formatResponse(masked))
    })(request, reply)
  })

  /**
   * POST /payment-config/:provider/set-role
   * Assign a routing role to a provider (international, primary_local, failover_local, none).
   * When a role is assigned to a new provider, it is automatically removed from the previous holder.
   * This ensures only one provider holds each role at any time.
   */
  fastify.post<{ Params: { provider: string } }>('/payment-config/:provider/set-role', async (request, reply) => {
    const parsed = SetRoleSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))
    }

    return wrapHandler('Failed to set provider role', async (req, rep) => {
      const { provider } = req.params as { provider: string }
      const { role } = parsed.data

      // Verify the provider exists
      const { data: target, error: lookupErr } = await req.supabase
        .from('payment_provider_config')
        .select('id, provider, is_enabled')
        .eq('provider', provider)
        .single()

      if (lookupErr || !target) {
        return rep.code(404).send(formatError('Provider not found', 'NOT_FOUND'))
      }

      const now = new Date().toISOString()

      // Determine which boolean column maps to this role
      const roleColumnMap: Record<string, string> = {
        international: 'is_international',
        primary_local: 'is_primary_local',
        failover_local: 'is_failover_local',
      }

      if (role === 'none') {
        // Remove all roles from this provider
        await req.supabase
          .from('payment_provider_config')
          .update({
            is_international: false,
            is_primary_local: false,
            is_failover_local: false,
            updated_at: now,
          })
          .eq('provider', provider)
      } else {
        const column = roleColumnMap[role]

        // Step 1: Remove this role from whichever provider currently holds it
        await req.supabase
          .from('payment_provider_config')
          .update({ [column]: false, updated_at: now })
          .eq(column, true)

        // Step 2: Assign the role to the target provider (also auto-enable it)
        await req.supabase
          .from('payment_provider_config')
          .update({
            [column]: true,
            is_enabled: true,
            updated_at: now,
          })
          .eq('provider', provider)
      }

      // Refresh gateway router so routing changes take effect immediately
      try {
        await refreshGatewayRouter()
      } catch (refreshErr) {
        req.log.warn({ refreshErr }, 'Gateway router refresh failed after role change')
      }

      req.log.info({ provider, role }, 'Payment provider role updated')

      // Return updated config list so UI can refresh
      const configs = await loadAllProviderConfigs()
      const masked = configs.map(c => ({
        ...c,
        secret_key: c.secret_key ? maskSecret(c.secret_key) : null,
        webhook_secret: c.webhook_secret ? maskSecret(c.webhook_secret) : null,
      }))

      return rep.send(formatResponse(masked))
    })(request, reply)
  })

  /**
   * POST /payment-config/:provider/toggle
   * Quick toggle a provider on/off without changing other settings.
   */
  fastify.post<{ Params: { provider: string } }>('/payment-config/:provider/toggle', wrapHandler('Failed to toggle provider', async (request, reply) => {
    const { provider } = request.params

    // Get current state
    const { data: current, error: lookupErr } = await request.supabase
      .from('payment_provider_config')
      .select('is_enabled')
      .eq('provider', provider)
      .single()

    if (lookupErr || !current) {
      return reply.code(404).send(formatError('Provider not found', 'NOT_FOUND'))
    }

    const newState = !current.is_enabled

    const { error } = await request.supabase
      .from('payment_provider_config')
      .update({ is_enabled: newState, updated_at: new Date().toISOString() })
      .eq('provider', provider)
      .select()
      .single()

    if (error) throw error

    // Refresh gateway router
    try {
      await refreshGatewayRouter()
    } catch (refreshErr) {
      request.log.warn({ refreshErr }, 'Gateway router refresh failed after toggle')
    }

    request.log.info({ provider, is_enabled: newState }, 'Payment provider toggled')

    return reply.send(formatResponse({ provider, is_enabled: newState }))
  }))

  /**
   * POST /payment-config/test
   * Test connectivity to a payment provider (verifies credentials are valid).
   * Does not create any real transactions.
   */
  fastify.post('/payment-config/test', async (request, reply) => {
    const parsed = TestProviderSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))
    }

    return wrapHandler('Failed to test provider', async (req, rep) => {
      const { provider } = parsed.data

      const { data: config, error } = await req.supabase
        .from('payment_provider_config')
        .select('*')
        .eq('provider', provider)
        .single()

      if (error || !config) {
        return rep.code(404).send(formatError('Provider not found', 'NOT_FOUND'))
      }

      if (!config.secret_key) {
        return rep.code(400).send(formatError('Provider has no secret key configured', 'MISSING_CREDENTIALS'))
      }

      // Attempt a lightweight API call to verify credentials
      let testResult: { success: boolean; message: string }
      try {
        testResult = await testProviderConnectivity(provider, config)
      } catch (testErr) {
        testResult = { success: false, message: (testErr as Error).message }
      }

      return rep.send(formatResponse(testResult))
    })(request, reply)
  })

  /**
   * GET /payment-config/transactions
   * List payment transactions with advanced filtering: status, provider, user, date range, plan.
   * Supports pagination and returns enriched data with user email.
   */
  fastify.get('/payment-config/transactions', wrapHandler('Failed to fetch transactions', async (request, reply) => {
    const raw = request.query as Record<string, string | undefined>
    const parsed = TransactionsQuerySchema.safeParse(raw)
    const params = parsed.success ? parsed.data : {}

    const page = params.page ?? 1
    const limit = params.limit ?? 50
    const offset = (page - 1) * limit

    let dbQuery = request.supabase
      .from('payment_transactions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (params.status) dbQuery = dbQuery.eq('status', params.status)
    if (params.provider) dbQuery = dbQuery.eq('provider', params.provider)
    if (params.user_id) dbQuery = dbQuery.eq('user_id', params.user_id)
    if (params.plan) dbQuery = dbQuery.eq('plan', params.plan)
    if (params.date_from) dbQuery = dbQuery.gte('created_at', params.date_from)
    if (params.date_to) dbQuery = dbQuery.lte('created_at', params.date_to)

    const { data, error, count } = await dbQuery
    if (error) throw error

    // Enrich with user emails where possible
    const userIds = [...new Set((data ?? []).map((t: any) => t.user_id))]
    let userMap: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: users } = await request.supabase
        .from('users')
        .select('id, email')
        .in('id', userIds)
      if (users) {
        userMap = Object.fromEntries(users.map((u: any) => [u.id, u.email]))
      }
    }

    const enriched = (data ?? []).map((tx: any) => ({
      ...tx,
      user_email: userMap[tx.user_id] ?? null,
    }))

    return reply.send({
      ...formatResponse(enriched),
      meta: { total: count ?? 0, page, limit },
    })
  }))
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Mask a secret string, showing only the first 4 and last 4 characters.
 */
function maskSecret(secret: string): string {
  if (secret.length <= 10) return '••••••••'
  return `${secret.slice(0, 4)}${'•'.repeat(Math.min(secret.length - 8, 20))}${secret.slice(-4)}`
}

/**
 * Test provider connectivity with a lightweight API call.
 */
async function testProviderConnectivity(
  provider: string,
  config: any
): Promise<{ success: boolean; message: string }> {
  switch (provider) {
    case 'paystack': {
      const res = await fetch('https://api.paystack.co/balance', {
        headers: { Authorization: `Bearer ${config.secret_key}` },
      })
      if (res.ok) return { success: true, message: 'Paystack credentials verified' }
      const body: any = await res.json().catch(() => ({}))
      return { success: false, message: body?.message ?? `HTTP ${res.status}` }
    }

    case 'flutterwave': {
      const res = await fetch('https://api.flutterwave.com/v3/balances', {
        headers: { Authorization: `Bearer ${config.secret_key}` },
      })
      if (res.ok) return { success: true, message: 'Flutterwave credentials verified' }
      const body: any = await res.json().catch(() => ({}))
      return { success: false, message: body?.message ?? `HTTP ${res.status}` }
    }

    case 'paddle': {
      const env = config.extra_config?.environment ?? 'sandbox'
      const base = env === 'production' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com'
      const res = await fetch(`${base}/prices?per_page=1`, {
        headers: { Authorization: `Bearer ${config.secret_key}` },
      })
      if (res.ok) return { success: true, message: 'Paddle credentials verified' }
      const body: any = await res.json().catch(() => ({}))
      return { success: false, message: body?.error?.detail ?? `HTTP ${res.status}` }
    }

    default:
      return { success: false, message: `Unknown provider: ${provider}` }
  }
}

export default adminPaymentConfigRoutes
