import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, wrapHandler } from '../../shared/handler.js'

const learningPathRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /learning-path
   * Returns the user's active learning path with courses, their lessons, and progress.
   * New hierarchy: Learning Path → Courses → Lessons
   */
  fastify.get('/learning-path', wrapHandler('Failed to fetch learning path', async (request, reply) => {
    const userId = request.user!.id

    // Get user's active enrollment
    const { data: enrollment, error: enrollErr } = await request.supabase
      .from('enrollments')
      .select('*, learning_path:learning_paths(id, name, description, skill_name)')
      .eq('user_id', userId)
      .is('completed_at', null)
      .not('learning_path_id', 'is', null)
      .order('enrolled_at', { ascending: false })
      .limit(1)
      .single()

    if (enrollErr && enrollErr.code !== 'PGRST116') throw enrollErr

    if (!enrollment) {
      return reply.send(formatResponse({ enrollment: null, courses: [], overall_progress: 0, total_lessons: 0, completed_lessons: 0 }))
    }

    // Get courses in this learning path
    const { data: pathCourses, error: pcErr } = await request.supabase
      .from('learning_path_courses')
      .select(`
        id, course_id, order_index,
        courses:course_id ( id, title, description, skill_name, level, published )
      `)
      .eq('learning_path_id', enrollment.learning_path_id)
      .order('order_index', { ascending: true })

    if (pcErr) throw pcErr

    // Get lessons for each course
    const courseIds = (pathCourses ?? []).map((pc: any) => pc.course_id)
    const lessonsMap: Record<string, any[]> = {}
    if (courseIds.length > 0) {
      const { data: lessons } = await request.supabase
        .from('lessons')
        .select('id, title, duration_mins, description, status, course_id, order_index')
        .in('course_id', courseIds)
        .eq('status', 'published')
        .order('order_index', { ascending: true })

      for (const lesson of lessons ?? []) {
        if (!lessonsMap[lesson.course_id]) lessonsMap[lesson.course_id] = []
        lessonsMap[lesson.course_id].push(lesson)
      }
    }

    // Get user's completed lessons
    const { data: completedProgress } = await request.supabase
      .from('progress')
      .select('lesson_id, completed_at')
      .eq('user_id', userId)
      .not('completed_at', 'is', null)

    const completedLessonIds = new Set((completedProgress ?? []).map((p: any) => p.lesson_id))

    // Build response with courses and their lessons
    const courses = (pathCourses ?? []).map((pc: any) => {
      const courseLessons = lessonsMap[pc.course_id] ?? []
      const completedInCourse = courseLessons.filter((l: any) => completedLessonIds.has(l.id)).length
      return {
        id: pc.id,
        course_id: pc.course_id,
        order_index: pc.order_index,
        course: pc.courses,
        lessons: courseLessons,
        lesson_count: courseLessons.length,
        completed_count: completedInCourse,
      }
    })

    const totalLessons = courses.reduce((sum, c) => sum + c.lesson_count, 0)
    const completedCount = courses.reduce((sum, c) => sum + c.completed_count, 0)

    return reply.send(
      formatResponse({
        enrollment,
        courses,
        completed_lesson_ids: [...completedLessonIds],
        overall_progress: totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0,
        total_lessons: totalLessons,
        completed_lessons: completedCount,
      })
    )
  }))
}

export default learningPathRoutes
