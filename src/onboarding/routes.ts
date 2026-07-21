/**
 * Onboarding routes — authenticated.
 * Handles the multi-step onboarding wizard:
 *   GET  /onboarding/wizard/status    — check if onboarding is completed + current step
 *   POST /onboarding/wizard/progress  — save partial progress (auto-save between steps)
 *   POST /onboarding/wizard/complete  — finalize onboarding with all data
 */
import type { FastifyPluginAsync } from 'fastify'
import { authenticate } from '../shared/middleware/auth.js'
import { requireUser } from '../shared/middleware/rbac.js'
import { formatResponse, formatError, wrapHandler } from '../shared/handler.js'
import {
  SubmitOnboardingSchema,
  SaveOnboardingProgressSchema,
} from './schemas.js'

const onboardingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', authenticate)
  fastify.addHook('onRequest', requireUser)

  // ── GET /onboarding/status ──────────────────────────────────────────

  fastify.get('/onboarding/wizard/status', wrapHandler('Failed to fetch onboarding status', async (request, reply) => {
    const userId = request.user!.id

    const { data, error } = await request.supabase
      .from('user_onboarding')
      .select('*')
      .eq('user_id', userId)
      .single()

    // No row means user hasn't started onboarding
    if (error && error.code === 'PGRST116') {
      return reply.send(formatResponse({
        completed: false,
        current_step: 1,
        data: null,
      }))
    }

    if (error) throw error

    return reply.send(formatResponse({
      completed: data.completed,
      current_step: data.current_step,
      data: {
        selected_skills: data.selected_skills ?? [],
        learning_goal: data.learning_goal,
        skill_level: data.skill_level,
        learning_styles: data.learning_styles ?? [],
        challenges: data.challenges ?? [],
        daily_commitment_mins: data.daily_commitment_mins ?? 10,
        reminder_time: data.reminder_time,
        ai_voice: data.ai_voice ?? 'calm_female',
        voice_read_responses: data.voice_read_responses ?? true,
        voice_read_summaries: data.voice_read_summaries ?? true,
        voice_conversations: data.voice_conversations ?? true,
        voice_speed: data.voice_speed ?? 'normal',
        notif_daily_reminder: data.notif_daily_reminder ?? true,
        notif_streak: data.notif_streak ?? true,
        notif_achievements: data.notif_achievements ?? false,
        notif_suggestions: data.notif_suggestions ?? false,
        notif_weekly_report: data.notif_weekly_report ?? false,
        notifications_allowed: data.notifications_allowed ?? false,
        weekly_goal_mins: data.weekly_goal_mins ?? 70,
        estimated_completion_weeks: data.estimated_completion_weeks ?? 12,
      },
    }))
  }))

  // ── POST /onboarding/progress ───────────────────────────────────────

  fastify.post('/onboarding/wizard/progress', async (request, reply) => {
    const parsed = SaveOnboardingProgressSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))
    }

    return wrapHandler('Failed to save onboarding progress', async (req, rep) => {
      const userId = req.user!.id
      const payload = {
        ...parsed.data,
        user_id: userId,
        updated_at: new Date().toISOString(),
      }

      const { data, error } = await req.supabase
        .from('user_onboarding')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single()

      if (error) throw error

      return rep.send(formatResponse({ saved: true, current_step: data.current_step }))
    })(request, reply)
  })

  // ── POST /onboarding/complete ───────────────────────────────────────

  fastify.post('/onboarding/wizard/complete', async (request, reply) => {
    const parsed = SubmitOnboardingSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))
    }

    return wrapHandler('Failed to complete onboarding', async (req, rep) => {
      const userId = req.user!.id
      const input = parsed.data

      // Calculate weekly goal and estimated completion
      const weeklyGoalMins = input.daily_commitment_mins * 7
      const estimatedWeeks = Math.max(4, Math.ceil(120 / (input.daily_commitment_mins / 10)))

      const payload = {
        user_id: userId,
        selected_skills: input.selected_skills,
        learning_goal: input.learning_goal,
        skill_level: input.skill_level,
        learning_styles: input.learning_styles,
        challenges: input.challenges,
        daily_commitment_mins: input.daily_commitment_mins,
        reminder_time: input.reminder_time,
        ai_voice: input.ai_voice,
        voice_read_responses: input.voice_read_responses,
        voice_read_summaries: input.voice_read_summaries,
        voice_conversations: input.voice_conversations,
        voice_speed: input.voice_speed,
        notif_daily_reminder: input.notif_daily_reminder,
        notif_streak: input.notif_streak,
        notif_achievements: input.notif_achievements,
        notif_suggestions: input.notif_suggestions,
        notif_weekly_report: input.notif_weekly_report,
        notifications_allowed: input.notifications_allowed,
        weekly_goal_mins: weeklyGoalMins,
        estimated_completion_weeks: estimatedWeeks,
        current_step: 13,
        completed: true,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const { error: upsertError } = await req.supabase
        .from('user_onboarding')
        .upsert(payload, { onConflict: 'user_id' })

      if (upsertError) throw upsertError

      // Also update user_settings with relevant onboarding preferences
      await req.supabase
        .from('user_settings')
        .upsert({
          user_id: userId,
          daily_goal_mins: input.daily_commitment_mins,
          reminder_time: mapReminderToTime(input.reminder_time),
          notif_daily: input.notif_daily_reminder,
          notif_streak: input.notif_streak,
          notif_weekly: input.notif_weekly_report,
          notif_tips: input.notif_suggestions,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

      // Update user skills on the users table
      await req.supabase
        .from('users')
        .update({
          skills: input.selected_skills,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      req.log.info({ userId }, 'User completed onboarding')

      return rep.send(formatResponse({
        completed: true,
        learning_goal: input.learning_goal,
        daily_goal: input.daily_commitment_mins,
        weekly_goal: weeklyGoalMins,
        skill_level: input.skill_level,
        preferred_style: input.learning_styles[0],
        biggest_challenge: input.challenges[0],
        study_time: input.reminder_time,
        estimated_completion_weeks: estimatedWeeks,
        ai_voice: input.ai_voice,
      }))
    })(request, reply)
  })
}

/** Map reminder time labels to actual times for user_settings */
function mapReminderToTime(reminder: string): string {
  switch (reminder) {
    case 'Morning': return '08:00'
    case 'Afternoon': return '13:00'
    case 'Evening': return '18:00'
    case 'Night': return '21:00'
    default: return '09:00'
  }
}

export default onboardingRoutes
