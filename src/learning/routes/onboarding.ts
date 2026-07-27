import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import { z } from 'zod'

const StartSkillSchema = z.object({
  skill_id: z.string().uuid(),
  experience_level: z.enum(['beginner', 'intermediate', 'advanced']),
})

/**
 * Onboarding — Experience level selection + skill path initialization.
 * Creates the user's learning_path, sets experience level, and
 * calculates estimated finish date.
 */
const onboardingRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /onboarding/start — Begin a skill path
   * Sets experience level & creates the personalized learning path.
   */
  fastify.post('/onboarding/start', async (request, reply) => {
    const parsed = StartSkillSchema.safeParse(request.body)
    if (!parsed.success)
      {return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))}

    return wrapHandler('Failed to start skill path', async (req, rep) => {
      const userId = req.user!.id
      const { skill_id, experience_level } = parsed.data

      // Verify skill exists
      const { data: skill, error: skillErr } = await req.supabase
        .from('skills')
        .select('*')
        .eq('id', skill_id)
        .single()

      if (skillErr || !skill) {
        return rep.code(404).send(formatError('Skill not found'))
      }

      // Check if user already has a path for this skill
      const { data: existing } = await req.supabase
        .from('learning_paths')
        .select('*')
        .eq('user_id', userId)
        .eq('skill_id', skill_id)
        .single()

      if (existing) {
        // Update experience level on existing path
        const { data: updated, error: updateErr } = await req.supabase
          .from('learning_paths')
          .update({
            experience_level,
            personalized: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single()

        if (updateErr) throw updateErr
        return rep.send(formatResponse({ path: updated, created: false }))
      }

      // Calculate estimated finish date based on skill's estimated_days
      const estimatedDays = skill.estimated_days || 28
      const startDate = new Date()
      const finishDate = new Date(startDate)
      finishDate.setDate(finishDate.getDate() + estimatedDays)

      // Create learning path
      const { data: path, error: pathErr } = await req.supabase
        .from('learning_paths')
        .insert({
          name: `${skill.name} — Personalized`,
          description: `Personalized learning path for ${skill.name} at ${experience_level} level`,
          skill_name: skill.name,
          skill_id,
          status: 'active',
          experience_level,
          personalized: true,
          started_at: startDate.toISOString(),
          estimated_finish_date: finishDate.toISOString().split('T')[0],
          user_id: userId,
        })
        .select()
        .single()

      if (pathErr) throw pathErr

      // Also create enrollment
      await req.supabase
        .from('enrollments')
        .insert({
          user_id: userId,
          learning_path_id: path.id,
          enrolled_at: new Date().toISOString(),
        })

      req.log.info({ userId, skill_id, experience_level }, 'Skill path started')
      return rep.send(formatResponse({ path, created: true }))
    })(request, reply)
  })

  /**
   * GET /onboarding/status — Check if user has completed onboarding for any skill
   */
  fastify.get('/onboarding/status', wrapHandler('Failed to fetch onboarding status', async (request, reply) => {
    const userId = request.user!.id

    const { data: paths } = await request.supabase
      .from('learning_paths')
      .select('id, skill_id, skill_name, experience_level, personalized, started_at, estimated_finish_date, completed_at')
      .eq('user_id', userId)
      .eq('personalized', true)

    const hasActivePath = (paths ?? []).some((p) => !p.completed_at)

    return reply.send(formatResponse({
      onboarded: (paths ?? []).length > 0,
      has_active_path: hasActivePath,
      paths: paths ?? [],
    }))
  }))

  /**
   * GET /onboarding/skills — List available skills for onboarding
   */
  fastify.get('/onboarding/skills', wrapHandler('Failed to fetch skills', async (request, reply) => {
    const { data: skills, error } = await request.supabase
      .from('skills')
      .select('id, name, description, color, category, is_flagship, estimated_days, lesson_count')
      .order('is_flagship', { ascending: false })

    if (error) throw error
    return reply.send(formatResponse(skills ?? []))
  }))
}

export default onboardingRoutes
