import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import { z } from 'zod'

// ── Schemas ─────────────────────────────────────────────────────────────

const CreatePhaseSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional().default(''),
  order_index: z.number().int().min(0).optional(),
})

const UpdatePhaseSchema = CreatePhaseSchema.partial()

const AddLessonToPhaseSchema = z.object({
  lesson_id: z.string().uuid(),
  order_index: z.number().int().min(0).optional(),
})

const ReorderLessonsSchema = z.object({
  lesson_ids: z.array(z.string().uuid()).min(1),
})

// ── Routes ──────────────────────────────────────────────────────────────

const adminLearningPathPhasesRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /learning-paths/:pathId/phases
   * Returns all phases for a learning path with their lessons.
   */
  fastify.get<{ Params: { pathId: string } }>(
    '/learning-paths/:pathId/phases',
    wrapHandler('Failed to fetch phases', async (request, reply) => {
      const { pathId } = request.params as { pathId: string }

      const { data: phases, error } = await request.supabase
        .from('learning_path_phases')
        .select(`
          id, learning_path_id, title, description, order_index,
          learning_path_phase_lessons (
            id, phase_id, lesson_id, order_index,
            lessons:lesson_id ( id, title, skill_name, duration_mins, status )
          )
        `)
        .eq('learning_path_id', pathId)
        .order('order_index', { ascending: true })

      if (error) throw error

      // Rename nested join and sort lessons
      const result = (phases ?? []).map((phase: any) => ({
        ...phase,
        lessons: (phase.learning_path_phase_lessons ?? [])
          .sort((a: any, b: any) => a.order_index - b.order_index)
          .map((pl: any) => ({
            id: pl.id,
            lesson_id: pl.lesson_id,
            order_index: pl.order_index,
            lesson: pl.lessons,
          })),
        learning_path_phase_lessons: undefined,
      }))

      return reply.send(formatResponse(result))
    })
  )

  /**
   * POST /learning-paths/:pathId/phases
   * Create a new phase within a learning path.
   */
  fastify.post<{ Params: { pathId: string } }>(
    '/learning-paths/:pathId/phases',
    async (request, reply) => {
      const parsed = CreatePhaseSchema.safeParse(request.body)
      if (!parsed.success)
        return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

      return wrapHandler('Failed to create phase', async (req, rep) => {
        const { pathId } = req.params as { pathId: string }

        // If no order_index provided, append to end
        let orderIndex = parsed.data.order_index
        if (orderIndex === undefined) {
          const { data: existing } = await req.supabase
            .from('learning_path_phases')
            .select('order_index')
            .eq('learning_path_id', pathId)
            .order('order_index', { ascending: false })
            .limit(1)
          orderIndex = existing && existing.length > 0 ? existing[0].order_index + 1 : 0
        }

        const { data, error } = await req.supabase
          .from('learning_path_phases')
          .insert({
            learning_path_id: pathId,
            title: parsed.data.title,
            description: parsed.data.description,
            order_index: orderIndex,
          })
          .select()
          .single()

        if (error) throw error
        return rep.code(201).send(formatResponse(data))
      })(request, reply)
    }
  )

  /**
   * PUT /learning-paths/:pathId/phases/:phaseId
   * Update a phase's title/description/order.
   */
  fastify.put<{ Params: { pathId: string; phaseId: string } }>(
    '/learning-paths/:pathId/phases/:phaseId',
    async (request, reply) => {
      const parsed = UpdatePhaseSchema.safeParse(request.body)
      if (!parsed.success)
        return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

      return wrapHandler('Failed to update phase', async (req, rep) => {
        const { phaseId } = req.params as { pathId: string; phaseId: string }

        const { data, error } = await req.supabase
          .from('learning_path_phases')
          .update(parsed.data)
          .eq('id', phaseId)
          .select()
          .single()

        if (error) {
          if (error.code === 'PGRST116') return rep.code(404).send(formatError('Phase not found'))
          throw error
        }
        return rep.send(formatResponse(data))
      })(request, reply)
    }
  )

  /**
   * DELETE /learning-paths/:pathId/phases/:phaseId
   * Delete a phase (cascades to phase-lessons).
   */
  fastify.delete<{ Params: { pathId: string; phaseId: string } }>(
    '/learning-paths/:pathId/phases/:phaseId',
    wrapHandler('Failed to delete phase', async (request, reply) => {
      const { phaseId } = request.params as { pathId: string; phaseId: string }
      const { error } = await request.supabase
        .from('learning_path_phases')
        .delete()
        .eq('id', phaseId)
      if (error) throw error
      return reply.send(formatResponse({ deleted: true }))
    })
  )

  /**
   * POST /learning-paths/:pathId/phases/:phaseId/lessons
   * Add a lesson to a phase.
   */
  fastify.post<{ Params: { pathId: string; phaseId: string } }>(
    '/learning-paths/:pathId/phases/:phaseId/lessons',
    async (request, reply) => {
      const parsed = AddLessonToPhaseSchema.safeParse(request.body)
      if (!parsed.success)
        return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

      return wrapHandler('Failed to add lesson to phase', async (req, rep) => {
        const { phaseId } = req.params as { pathId: string; phaseId: string }

        // Auto-calculate order_index if not provided
        let orderIndex = parsed.data.order_index
        if (orderIndex === undefined) {
          const { data: existing } = await req.supabase
            .from('learning_path_phase_lessons')
            .select('order_index')
            .eq('phase_id', phaseId)
            .order('order_index', { ascending: false })
            .limit(1)
          orderIndex = existing && existing.length > 0 ? existing[0].order_index + 1 : 0
        }

        const { data, error } = await req.supabase
          .from('learning_path_phase_lessons')
          .insert({
            phase_id: phaseId,
            lesson_id: parsed.data.lesson_id,
            order_index: orderIndex,
          })
          .select(`
            id, phase_id, lesson_id, order_index,
            lessons:lesson_id ( id, title, skill_name, duration_mins, status )
          `)
          .single()

        if (error) {
          if (error.code === '23503') return rep.code(400).send(formatError('Lesson or phase not found'))
          throw error
        }

        const result = {
          id: data.id,
          phase_id: data.phase_id,
          lesson_id: data.lesson_id,
          order_index: data.order_index,
          lesson: (data as any).lessons,
        }

        return rep.code(201).send(formatResponse(result))
      })(request, reply)
    }
  )

  /**
   * DELETE /learning-paths/:pathId/phases/:phaseId/lessons/:phaseLessonId
   * Remove a lesson from a phase.
   */
  fastify.delete<{ Params: { pathId: string; phaseId: string; phaseLessonId: string } }>(
    '/learning-paths/:pathId/phases/:phaseId/lessons/:phaseLessonId',
    wrapHandler('Failed to remove lesson from phase', async (request, reply) => {
      const { phaseLessonId } = request.params as { pathId: string; phaseId: string; phaseLessonId: string }
      const { error } = await request.supabase
        .from('learning_path_phase_lessons')
        .delete()
        .eq('id', phaseLessonId)
      if (error) throw error
      return reply.send(formatResponse({ deleted: true }))
    })
  )

  /**
   * PUT /learning-paths/:pathId/phases/:phaseId/lessons/reorder
   * Reorder lessons within a phase by providing an ordered array of lesson IDs.
   */
  fastify.put<{ Params: { pathId: string; phaseId: string } }>(
    '/learning-paths/:pathId/phases/:phaseId/lessons/reorder',
    async (request, reply) => {
      const parsed = ReorderLessonsSchema.safeParse(request.body)
      if (!parsed.success)
        return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

      return wrapHandler('Failed to reorder lessons', async (req, rep) => {
        const { phaseId } = req.params as { pathId: string; phaseId: string }

        // Update each lesson's order_index
        const updates = parsed.data.lesson_ids.map((lessonId, idx) =>
          req.supabase
            .from('learning_path_phase_lessons')
            .update({ order_index: idx })
            .eq('phase_id', phaseId)
            .eq('lesson_id', lessonId)
        )

        await Promise.all(updates)
        return rep.send(formatResponse({ reordered: true }))
      })(request, reply)
    }
  )
}

export default adminLearningPathPhasesRoutes
