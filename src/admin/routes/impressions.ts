import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, wrapHandler } from '../../shared/handler.js'

const adminImpressionsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /impressions/stats
   * Returns impression counts and conversion metrics for the waitlist landing page.
   */
  fastify.get('/impressions/stats', wrapHandler('Failed to fetch impressions stats', async (request, reply) => {
    // Total impressions
    const { count: totalImpressions, error: impErr } = await request.supabase
      .from('impressions')
      .select('*', { count: 'exact', head: true })
    if (impErr) throw impErr

    // Impressions today
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const { count: todayImpressions, error: todayErr } = await request.supabase
      .from('impressions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today.toISOString())
    if (todayErr) throw todayErr

    // Impressions this week
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const { count: weekImpressions, error: weekErr } = await request.supabase
      .from('impressions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', weekAgo.toISOString())
    if (weekErr) throw weekErr

    // Total waitlist signups
    const { count: totalSignups, error: signupErr } = await request.supabase
      .from('waitlist')
      .select('*', { count: 'exact', head: true })
    if (signupErr) throw signupErr

    // Signups today
    const { count: todaySignups, error: todaySignupErr } = await request.supabase
      .from('waitlist')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today.toISOString())
    if (todaySignupErr) throw todaySignupErr

    // Conversion rate
    const total = totalImpressions ?? 0
    const signups = totalSignups ?? 0
    const conversionRate = total > 0 ? Math.round((signups / total) * 10000) / 100 : 0

    return reply.send(formatResponse({
      impressions: {
        total: total,
        today: todayImpressions ?? 0,
        this_week: weekImpressions ?? 0,
      },
      signups: {
        total: signups,
        today: todaySignups ?? 0,
      },
      conversion_rate: conversionRate,
    }))
  }))

  /**
   * GET /impressions
   * Returns recent impression records (paginated).
   */
  fastify.get('/impressions', wrapHandler('Failed to fetch impressions', async (request, reply) => {
    const query = request.query as { page?: string; limit?: string }
    const page = parseInt(query.page ?? '1', 10)
    const limit = Math.min(parseInt(query.limit ?? '50', 10), 100)
    const offset = (page - 1) * limit

    const { data, error, count } = await request.supabase
      .from('impressions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    return reply.send({
      ...formatResponse(data),
      meta: { page, limit, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / limit) },
    })
  }))
}

export default adminImpressionsRoutes
