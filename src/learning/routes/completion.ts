import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import { z } from 'zod'
import { randomBytes } from 'crypto'

const CompleteSkillSchema = z.object({
  skill_id: z.string().uuid(),
  capstone_id: z.string().uuid().optional(),
})

/**
 * F10: Skill Completion Summary
 *
 * A shareable proof-of-finish page — lighter-weight alternative to certificates.
 * Generates a public share URL with skill, time invested, concept mastery snapshot.
 */
const completionRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /completion/finalize — Generate a completion summary for a finished skill
   */
  fastify.post('/completion/finalize', async (request, reply) => {
    const parsed = CompleteSkillSchema.safeParse(request.body)
    if (!parsed.success)
      {return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))}

    return wrapHandler('Failed to finalize completion', async (req, rep) => {
      const userId = req.user!.id
      const { skill_id, capstone_id } = parsed.data

      // Check an existing summary doesn't already exist
      const { data: existing } = await req.supabase
        .from('completion_summaries')
        .select('*')
        .eq('user_id', userId)
        .eq('skill_id', skill_id)
        .single()

      if (existing) {
        return rep.send(formatResponse(existing))
      }

      // Gather stats
      const { data: attempts } = await req.supabase
        .from('lesson_attempts')
        .select('time_spent_secs, completed, lesson_id')
        .eq('user_id', userId)

      // Filter to lessons for this skill
      const { data: skillLessons } = await req.supabase
        .from('lessons')
        .select('id')
        .eq('skill_id', skill_id)

      const skillLessonIds = new Set((skillLessons ?? []).map((l) => l.id))
      const relevantAttempts = (attempts ?? []).filter((a) => skillLessonIds.has(a.lesson_id))
      const totalTimeMins = Math.round(relevantAttempts.reduce((sum, a) => sum + (a.time_spent_secs || 0), 0) / 60)
      const completedLessons = relevantAttempts.filter((a) => a.completed).length

      // Get concept mastery snapshot
      const { data: nodes } = await req.supabase
        .from('skill_graph_nodes')
        .select('id, concept')
        .eq('skill_id', skill_id)

      const nodeIds = (nodes ?? []).map((n) => n.id)
      const { data: masteryRecords } = await req.supabase
        .from('mastery')
        .select('node_id, status')
        .eq('user_id', userId)
        .in('node_id', nodeIds)

      const masteryMap = new Map((masteryRecords ?? []).map((m) => [m.node_id, m.status]))
      const conceptMastery: Record<string, string> = {}
      for (const node of (nodes ?? [])) {
        conceptMastery[node.concept] = masteryMap.get(node.id) || 'not_started'
      }

      // Calculate total days (from first attempt to now)
      const { data: firstAttempt } = await req.supabase
        .from('lesson_attempts')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

      const startDate = firstAttempt ? new Date(firstAttempt.created_at) : new Date()
      const totalDays = Math.max(1, Math.ceil((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24)))

      // Generate unique share slug
      const shareSlug = randomBytes(8).toString('hex')

      // Mark the learning path as completed
      await req.supabase
        .from('learning_paths')
        .update({ completed_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('skill_id', skill_id)

      // Create completion summary
      const { data: summary, error: sumErr } = await req.supabase
        .from('completion_summaries')
        .insert({
          user_id: userId,
          skill_id,
          capstone_id: capstone_id ?? null,
          time_invested_mins: totalTimeMins,
          total_lessons: completedLessons,
          total_days: totalDays,
          concept_mastery: conceptMastery,
          share_url: shareSlug,
        })
        .select()
        .single()

      if (sumErr) throw sumErr

      req.log.info({ userId, skill_id, shareSlug }, 'Skill completion summary generated')
      return rep.send(formatResponse(summary))
    })(request, reply)
  })

  /**
   * GET /completion/summary?skill_id=<uuid>
   * Returns the user's completion summary for a skill (if exists).
   */
  fastify.get('/completion/summary', wrapHandler('Failed to fetch completion summary', async (request, reply) => {
    const userId = request.user!.id
    const { skill_id } = request.query as { skill_id?: string }

    if (!skill_id) {
      return reply.code(400).send(formatError('skill_id query parameter is required', 'VALIDATION_ERROR'))
    }

    const { data, error } = await request.supabase
      .from('completion_summaries')
      .select('*')
      .eq('user_id', userId)
      .eq('skill_id', skill_id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return reply.code(404).send(formatError('No completion summary found'))
      throw error
    }

    return reply.send(formatResponse(data))
  }))

  /**
   * GET /completion/share/:slug — Public endpoint to view a shared completion summary
   * NOTE: This route doesn't require authentication — it's a public shareable page.
   */
  fastify.get<{ Params: { slug: string } }>('/completion/share/:slug', wrapHandler('Failed to fetch shared summary', async (request, reply) => {
    const { slug } = request.params

    const { data, error } = await request.supabase
      .from('completion_summaries')
      .select('*, skill:skills(name, description, category)')
      .eq('share_url', slug)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return reply.code(404).send(formatError('Summary not found'))
      throw error
    }

    // Get user's display name (no sensitive data)
    const { data: user } = await request.supabase
      .from('users')
      .select('full_name, avatar_url')
      .eq('id', data.user_id)
      .single()

    return reply.send(formatResponse({
      ...data,
      user_name: user?.full_name || 'A Finishi Learner',
      user_avatar: user?.avatar_url || null,
    }))
  }))
}

export default completionRoutes
