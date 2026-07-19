import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import { z } from 'zod'

const SubmitCapstoneSchema = z.object({
  skill_id: z.string().uuid(),
  submission: z.string().min(50, 'Submission must be at least 50 characters').max(10000),
})

/**
 * F9: Capstone Project & AI-Assisted Rubric Grading
 *
 * Every skill path ends with an applied artifact graded against an expert-authored rubric.
 */
const capstoneRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /capstone/rubric?skill_id=<uuid>
   * Returns the capstone project prompt and rubric for a skill.
   */
  fastify.get('/capstone/rubric', wrapHandler('Failed to fetch rubric', async (request, reply) => {
    const { skill_id } = request.query as { skill_id?: string }
    if (!skill_id) {
      return reply.code(400).send(formatError('skill_id query parameter is required', 'VALIDATION_ERROR'))
    }

    const { data, error } = await request.supabase
      .from('capstone_rubrics')
      .select('*')
      .eq('skill_id', skill_id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return reply.code(404).send(formatError('No capstone rubric found for this skill'))
      throw error
    }

    return reply.send(formatResponse(data))
  }))

  /**
   * POST /capstone/submit — Submit capstone project for AI grading
   */
  fastify.post('/capstone/submit', async (request, reply) => {
    const parsed = SubmitCapstoneSchema.safeParse(request.body)
    if (!parsed.success)
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

    return wrapHandler('Failed to submit capstone', async (req, rep) => {
      const userId = req.user!.id
      const { skill_id, submission } = parsed.data

      // Fetch rubric
      const { data: rubric, error: rubricErr } = await req.supabase
        .from('capstone_rubrics')
        .select('*')
        .eq('skill_id', skill_id)
        .single()

      if (rubricErr || !rubric) {
        return rep.code(404).send(formatError('No capstone rubric found for this skill'))
      }

      // Get skill name for context
      const { data: skill } = await req.supabase
        .from('skills')
        .select('name')
        .eq('id', skill_id)
        .single()

      // Grade via AI
      const ai = req.server.ai
      const grading = await ai.gradeCapstone({
        submission,
        projectPrompt: rubric.project_prompt,
        rubricCriteria: rubric.criteria as any,
        skillName: skill?.name || 'Unknown Skill',
      })

      // Save submission with grading
      const { data: record, error: insertErr } = await req.supabase
        .from('capstone_submissions')
        .insert({
          user_id: userId,
          skill_id,
          submission,
          rubric_scores: grading.scores,
          ai_feedback: grading.overallFeedback,
          ai_provider: ai.name,
          overall_status: 'graded',
          graded_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (insertErr) throw insertErr

      req.log.info({ userId, skill_id, status: grading.overallStatus }, 'Capstone graded')

      return rep.send(formatResponse({
        submission_id: record.id,
        scores: grading.scores,
        overall_feedback: grading.overallFeedback,
        overall_status: grading.overallStatus,
        graded_at: record.graded_at,
      }))
    })(request, reply)
  })

  /**
   * GET /capstone/submissions?skill_id=<uuid>
   * Returns user's past capstone submissions for a skill.
   */
  fastify.get('/capstone/submissions', wrapHandler('Failed to fetch submissions', async (request, reply) => {
    const userId = request.user!.id
    const { skill_id } = request.query as { skill_id?: string }

    let query = request.supabase
      .from('capstone_submissions')
      .select('*')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false })

    if (skill_id) query = query.eq('skill_id', skill_id)

    const { data, error } = await query
    if (error) throw error
    return reply.send(formatResponse(data ?? []))
  }))
}

export default capstoneRoutes
