import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import { z } from 'zod'

const AddCourseToPathSchema = z.object({
  course_id: z.string().uuid(),
  order_index: z.number().int().min(0).optional(),
})

const ReorderCoursesSchema = z.object({
  course_ids: z.array(z.string().uuid()).min(1),
})

const adminLearningPathCoursesRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /learning-paths/:pathId/courses
   * Returns all courses in this learning path with their lessons.
   */
  fastify.get<{ Params: { pathId: string } }>(
    '/learning-paths/:pathId/courses',
    wrapHandler('Failed to fetch path courses', async (request, reply) => {
      const { pathId } = request.params as { pathId: string }

      const { data, error } = await request.supabase
        .from('learning_path_courses')
        .select(`
          id, learning_path_id, course_id, order_index,
          courses:course_id ( id, title, description, skill_name, level, published, lesson_count, duration_minutes )
        `)
        .eq('learning_path_id', pathId)
        .order('order_index', { ascending: true })

      if (error) throw error

      const result = (data ?? []).map((lpc: any) => ({
        id: lpc.id,
        course_id: lpc.course_id,
        order_index: lpc.order_index,
        course: lpc.courses,
      }))

      return reply.send(formatResponse(result))
    })
  )

  /**
   * POST /learning-paths/:pathId/courses
   * Add a course to a learning path.
   */
  fastify.post<{ Params: { pathId: string } }>(
    '/learning-paths/:pathId/courses',
    async (request, reply) => {
      const parsed = AddCourseToPathSchema.safeParse(request.body)
      if (!parsed.success)
        return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

      return wrapHandler('Failed to add course to path', async (req, rep) => {
        const { pathId } = req.params as { pathId: string }

        // Auto-calculate order if not provided
        let orderIndex = parsed.data.order_index
        if (orderIndex === undefined) {
          const { data: existing } = await req.supabase
            .from('learning_path_courses')
            .select('order_index')
            .eq('learning_path_id', pathId)
            .order('order_index', { ascending: false })
            .limit(1)
          orderIndex = existing && existing.length > 0 ? existing[0].order_index + 1 : 0
        }

        const { data, error } = await req.supabase
          .from('learning_path_courses')
          .insert({
            learning_path_id: pathId,
            course_id: parsed.data.course_id,
            order_index: orderIndex,
          })
          .select(`
            id, learning_path_id, course_id, order_index,
            courses:course_id ( id, title, description, skill_name, level, published, lesson_count )
          `)
          .single()

        if (error) {
          if (error.code === '23505') return rep.code(409).send(formatError('Course already added to this path'))
          if (error.code === '23503') return rep.code(400).send(formatError('Course or learning path not found'))
          throw error
        }

        const result = {
          id: data.id,
          course_id: data.course_id,
          order_index: data.order_index,
          course: (data as any).courses,
        }

        return rep.code(201).send(formatResponse(result))
      })(request, reply)
    }
  )

  /**
   * DELETE /learning-paths/:pathId/courses/:pathCourseId
   * Remove a course from a learning path.
   */
  fastify.delete<{ Params: { pathId: string; pathCourseId: string } }>(
    '/learning-paths/:pathId/courses/:pathCourseId',
    wrapHandler('Failed to remove course from path', async (request, reply) => {
      const { pathCourseId } = request.params as { pathId: string; pathCourseId: string }
      const { error } = await request.supabase
        .from('learning_path_courses')
        .delete()
        .eq('id', pathCourseId)
      if (error) throw error
      return reply.send(formatResponse({ deleted: true }))
    })
  )

  /**
   * PUT /learning-paths/:pathId/courses/reorder
   * Reorder courses within a learning path.
   */
  fastify.put<{ Params: { pathId: string } }>(
    '/learning-paths/:pathId/courses/reorder',
    async (request, reply) => {
      const parsed = ReorderCoursesSchema.safeParse(request.body)
      if (!parsed.success)
        return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

      return wrapHandler('Failed to reorder courses', async (req, rep) => {
        const { pathId } = req.params as { pathId: string }

        const updates = parsed.data.course_ids.map((courseId, idx) =>
          req.supabase
            .from('learning_path_courses')
            .update({ order_index: idx })
            .eq('learning_path_id', pathId)
            .eq('course_id', courseId)
        )

        await Promise.all(updates)
        return rep.send(formatResponse({ reordered: true }))
      })(request, reply)
    }
  )
}

export default adminLearningPathCoursesRoutes
