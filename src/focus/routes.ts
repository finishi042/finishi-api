import type { FastifyPluginAsync } from 'fastify'
import { authenticate } from '../shared/middleware/auth.js'
import { requireUser } from '../shared/middleware/rbac.js'
import { requirePlan } from '../shared/middleware/require-plan.js'
import { formatResponse, formatError, wrapHandler } from '../shared/handler.js'
import { CreateFocusSessionSchema } from './schemas.js'
import { parsePagination } from '../shared/schemas.js'

const userFocusSessionsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', authenticate)
  fastify.addHook('onRequest', requireUser)

  /** POST /focus-sessions — Save a completed focus session */
  fastify.post('/focus-sessions', async (request, reply) => {
    const parsed = CreateFocusSessionSchema.safeParse(request.body)
    if (!parsed.success)
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

    return wrapHandler('Failed to save focus session', async (req, rep) => {
      const userId = req.user!.id
      const { duration_mins, type, lesson_id, completed } = parsed.data

      const { data, error } = await req.supabase
        .from('focus_sessions')
        .insert({
          user_id: userId,
          duration_mins,
          type: type ?? 'pomodoro',
          lesson_id: lesson_id ?? null,
          completed: completed ?? true,
          started_at: new Date(Date.now() - duration_mins * 60000).toISOString(),
          ended_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) throw error

      req.log.info({ userId, duration_mins, type }, 'Focus session saved')
      return rep.code(201).send(formatResponse(data))
    })(request, reply)
  })

  /** GET /focus-sessions/stats — Get focus session statistics (Pro plan required) */
  fastify.get('/focus-sessions/stats', { onRequest: [requirePlan('pro')] }, wrapHandler('Failed to fetch focus session stats', async (request, reply) => {
    const userId = request.user!.id

    const { data: sessions, error } = await request.supabase
      .from('focus_sessions')
      .select('duration_mins, completed, started_at, type')
      .eq('user_id', userId)
      .eq('completed', true)
      .order('started_at', { ascending: false })

    if (error) throw error

    const allSessions = sessions ?? []
    const totalMins = allSessions.reduce((sum, s) => sum + (s.duration_mins ?? 0), 0)
    const totalSessions = allSessions.length

    // Sessions this week
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const thisWeek = allSessions.filter((s) => new Date(s.started_at) >= weekAgo)
    const weekMins = thisWeek.reduce((sum, s) => sum + (s.duration_mins ?? 0), 0)

    // Sessions today
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todaySessions = allSessions.filter((s) => new Date(s.started_at) >= today)
    const todayMins = todaySessions.reduce((sum, s) => sum + (s.duration_mins ?? 0), 0)

    return reply.send(
      formatResponse({
        total_sessions: totalSessions,
        total_minutes: totalMins,
        this_week_sessions: thisWeek.length,
        this_week_minutes: weekMins,
        today_sessions: todaySessions.length,
        today_minutes: todayMins,
        average_session_mins: totalSessions > 0 ? Math.round(totalMins / totalSessions) : 0,
      })
    )
  }))

  /** GET /focus-sessions — Get recent focus sessions */
  fastify.get<{
    Querystring: { page?: string; limit?: string }
  }>('/focus-sessions', wrapHandler('Failed to fetch focus sessions', async (request, reply) => {
    const userId = request.user!.id
    const { page, limit, offset } = parsePagination(request.query as { page?: string; limit?: string })

    const { data, error, count } = await request.supabase
      .from('focus_sessions')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    return reply.send({
      ...formatResponse(data),
      meta: { page, limit, total: count ?? 0 },
    })
  }))
}

export default userFocusSessionsRoutes
