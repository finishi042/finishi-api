import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, wrapHandler } from '../../shared/handler.js'

const learningPathRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /learning-path
   * Returns the user's active learning path with phases, lessons, and progress
   */
  fastify.get('/learning-path', wrapHandler('Failed to fetch learning path', async (request, reply) => {
    const userId = request.user!.id

    // Get user's active enrollment
    const { data: enrollment, error: enrollErr } = await request.supabase
      .from('enrollments')
      .select('*, learning_path:learning_paths(id, name, description, skill_name)')
      .eq('user_id', userId)
      .is('completed_at', null)
      .order('enrolled_at', { ascending: false })
      .limit(1)
      .single()

    if (enrollErr && enrollErr.code !== 'PGRST116') throw enrollErr

    if (!enrollment) {
      return reply.send(formatResponse({ enrollment: null, phases: [], overall_progress: 0 }))
    }

    // Get phases with lessons for this learning path
    const { data: phases, error: phasesErr } = await request.supabase
      .from('learning_path_phases')
      .select('*, lessons:learning_path_phase_lessons(*, lesson:lessons(id, title, duration_mins, description))')
      .eq('learning_path_id', enrollment.learning_path_id)
      .order('order_index', { ascending: true })

    if (phasesErr) throw phasesErr

    // Get user's completed lessons
    const { data: completedProgress } = await request.supabase
      .from('progress')
      .select('lesson_id, completed_at')
      .eq('user_id', userId)
      .not('completed_at', 'is', null)

    const completedLessonIds = new Set((completedProgress ?? []).map((p: any) => p.lesson_id))

    const totalLessons = (phases ?? []).reduce(
      (sum: number, p: any) => sum + (p.lessons?.length ?? 0),
      0
    )
    const completedCount = (phases ?? []).reduce(
      (sum: number, p: any) =>
        sum + (p.lessons ?? []).filter((l: any) => completedLessonIds.has(l.lesson_id)).length,
      0
    )

    return reply.send(
      formatResponse({
        enrollment,
        phases: phases ?? [],
        completed_lesson_ids: [...completedLessonIds],
        overall_progress: totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0,
        total_lessons: totalLessons,
        completed_lessons: completedCount,
      })
    )
  }))
}

export default learningPathRoutes
