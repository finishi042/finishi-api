import type { FastifyPluginAsync } from 'fastify'
import { authenticate } from '../shared/middleware/auth.js'
import { requireUser } from '../shared/middleware/rbac.js'
import { formatResponse, formatError, wrapHandler } from '../shared/handler.js'
import type { UserProfile, UserSettings } from './types.js'
import { UpdateProfileSchema, UpdateSettingsSchema } from './schemas.js'

const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', authenticate)
  fastify.addHook('onRequest', requireUser)

  // ── Profile ─────────────────────────────────────────────────────────

  fastify.get('/profile', wrapHandler('Failed to fetch profile', async (request, reply) => {
    const userId = request.user!.id
    const { data, error } = await request.supabase
      .from('users').select('*').eq('id', userId).single()
    if (error) {
      if (error.code === 'PGRST116') return reply.code(404).send(formatError('Profile not found'))
      throw error
    }
    return reply.send(formatResponse(data as UserProfile))
  }))

  fastify.put('/profile', async (request, reply) => {
    const parsed = UpdateProfileSchema.safeParse(request.body)
    if (!parsed.success)
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

    return wrapHandler('Failed to update profile', async (req, rep) => {
      const userId = req.user!.id
      const { data, error } = await req.supabase
        .from('users')
        .update({ ...parsed.data, updated_at: new Date().toISOString() })
        .eq('id', userId).select().single()
      if (error) throw error
      return rep.send(formatResponse(data as UserProfile))
    })(request, reply)
  })

  // ── Settings ────────────────────────────────────────────────────────

  fastify.get('/settings', wrapHandler('Failed to fetch settings', async (request, reply) => {
    const userId = request.user!.id
    const { data, error } = await request.supabase
      .from('user_settings').select('*').eq('user_id', userId).single()
    if (error && error.code !== 'PGRST116') throw error
    return reply.send(formatResponse((data ?? { user_id: userId }) as UserSettings))
  }))

  fastify.put('/settings', async (request, reply) => {
    const parsed = UpdateSettingsSchema.safeParse(request.body)
    if (!parsed.success)
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

    return wrapHandler('Failed to update settings', async (req, rep) => {
      const userId = req.user!.id
      const payload = { ...parsed.data, user_id: userId, updated_at: new Date().toISOString() }
      const { data, error } = await req.supabase
        .from('user_settings').upsert(payload, { onConflict: 'user_id' }).select().single()
      if (error) throw error
      return rep.send(formatResponse(data as UserSettings))
    })(request, reply)
  })

  // ── Home ────────────────────────────────────────────────────────────

  fastify.get('/home', wrapHandler('Failed to fetch home data', async (request, reply) => {
    const userId = request.user!.id
    const [
      { data: userProgress },
      { data: todayLesson },
      { data: recentLessons },
      { data: streakData },
    ] = await Promise.all([
      request.supabase
        .from('progress')
        .select('*, lesson:lessons(title, skill_name, duration_mins)')
        .eq('user_id', userId).order('last_accessed', { ascending: false }).limit(1).single(),
      request.supabase
        .from('lessons')
        .select('id, title, skill_name, duration_mins, description')
        .eq('status', 'published').order('created_at', { ascending: false }).limit(1).single(),
      request.supabase
        .from('progress')
        .select('*, lesson:lessons(id, title, skill_name, duration_mins, status)')
        .eq('user_id', userId).order('last_accessed', { ascending: false }).limit(5),
      request.supabase
        .from('user_streaks')
        .select('current_streak, longest_streak, last_active_date')
        .eq('user_id', userId).single(),
    ])
    return reply.send(formatResponse({
      today_lesson: todayLesson,
      current_progress: userProgress,
      recent_lessons: recentLessons ?? [],
      streak: streakData ?? { current_streak: 0, longest_streak: 0, last_active_date: null },
    }))
  }))
}

export default userRoutes
